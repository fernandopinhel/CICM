/*
 * Estrutura e componentes compartilhados: topo, navegação em fluxo,
 * rodapé, menus, avisos (toasts), diálogos, gaveta lateral, paleta de
 * comandos e o relógio que avança remessas e reenvios em processamento.
 */

import { h, icon, $, $$, clear, nextId } from './dom.js';
import { relative, num, norm, plural } from './format.js';
import * as db from './db.js';

export const NAV = [
  { id: 'painel', href: 'painel.html', label: 'Painel', icon: 'painel', words: 'inicio home resumo indicadores' },
  { id: 'remessas', href: 'remessas.html', label: 'Remessas', long: 'Resumo de processamento', icon: 'remessas', step: 1, words: 'resumo processamento arquivos lote' },
  { id: 'movimentos', href: 'movimentos.html', label: 'Movimentos', long: 'Consultar movimentos', icon: 'movimentos', step: 2, words: 'cs movimento apolice endosso parcela caso comissao' },
  { id: 'erros', href: 'erros.html', label: 'Erros', long: 'Consulta detalhada por erro', icon: 'erros', step: 3, words: 'detalhe erro rejeicao rejeitados' },
  { id: 'reenvio', href: 'reenvio.html', label: 'Reenviar', long: 'Reenviar movimentos', icon: 'reenviar', step: 4, words: 'reenvio enviar novamente' },
  { id: 'reenviados', href: 'reenviados.html', label: 'Reenviados', long: 'Consultar reenviados', icon: 'reenviados', step: 5, words: 'protocolos reenvios historico' },
  { id: 'relatorio', href: 'relatorio.html', label: 'Relatório', long: 'Relatório de rejeições', icon: 'relatorio', words: 'relatorio rejeicoes estatistica grafico' },
];

/* ---------------------------------------------------------- Inicialização */

/**
 * Monta a estrutura da página. Sem sessão, volta para o login.
 * Devolve a sessão atual.
 */
export function boot(pageId) {
  const sessao = db.session();
  if (!sessao) {
    location.replace(`login.html?volta=${encodeURIComponent(location.pathname.split('/').pop() + location.search)}`);
    throw new Error('Sem sessão');
  }
  db.getDb();
  renderTopbar(pageId, sessao);
  renderFooter();
  ensureLive();
  bindShortcuts();
  startClock();
  window.addEventListener('cicm:dados', () => updateCounts());
  return sessao;
}

/* ----------------------------------------------------------------- Topo */

function renderTopbar(pageId, sessao) {
  const top = $('#topo');
  clear(top);

  const menuBtn = h('button', {
    type: 'button', class: 'topbar-btn menu-btn', 'aria-label': 'Abrir menu', 'aria-haspopup': 'dialog',
    on: { click: () => openNavSheet(pageId, menuBtn) },
  }, icon('menu'));

  const brand = h('a', { class: 'brand', href: 'painel.html' },
    h('img', { src: 'img/favicon.svg', alt: '', width: 36, height: 36 }),
    h('span', { class: 'brand-name' }, h('strong', { text: 'CICM' }), h('span', { text: 'Central de Comissões · Prumo Seguros' })),
  );
  brand.setAttribute('aria-label', 'CICM, Central de Comissões. Ir para o painel');

  const cmd = h('button', {
    type: 'button', class: 'topbar-btn cmd-trigger', 'aria-haspopup': 'dialog', 'aria-keyshortcuts': 'Control+K',
    on: { click: () => openPalette(cmd) },
  }, icon('busca'), h('span', { text: 'Buscar GUID, apólice, remessa…' }), h('kbd', { text: 'Ctrl K' }));
  cmd.setAttribute('aria-label', 'Buscar no CICM (Ctrl+K)');

  top.append(
    h('div', { class: 'topbar-main' }, menuBtn, brand, cmd, themeMenu(), userMenu(sessao)),
    h('nav', { class: 'flow-nav', 'aria-label': 'Principal' }, flowList(pageId)),
  );
  updateCounts();
}

function flowList(pageId) {
  const ol = h('ol');
  NAV.forEach((item, i) => {
    const prev = NAV[i - 1];
    if (prev && prev.step && item.step) {
      ol.append(h('li', { class: 'sep', 'aria-hidden': 'true' }, icon('direita', 'icon-sm')));
    }
    const link = navLink(item, pageId);
    ol.append(h('li', { class: item.id === 'relatorio' ? 'push' : null }, link));
  });
  return ol;
}

function navLink(item, pageId) {
  const content = [];
  if (item.step) content.push(h('span', { class: 'step-n', 'aria-hidden': 'true', text: item.step }));
  else content.push(icon(item.icon));
  if (item.id === 'relatorio') content.push(h('span', {}, 'Relatório', h('span', { class: 'label-long', text: ' de rejeições' })));
  else content.push(h('span', { text: item.label }));
  if (item.id === 'erros' || item.id === 'reenviados') content.push(h('span', { class: 'nav-count', dataset: { count: item.id }, hidden: true }));
  return h('a', { href: item.href, 'aria-current': item.id === pageId ? 'page' : null }, content);
}

function updateCounts() {
  const d = db.getDb();
  const pend = d.movs.filter((m) => m.status === 'rejeitado').length;
  const proc = d.reenvios.filter((r) => r.status === 'processando').length;
  $$('[data-count="erros"]').forEach((el) => setCount(el, pend, 'pendentes'));
  $$('[data-count="reenviados"]').forEach((el) => setCount(el, proc, 'em processamento'));
}

function setCount(el, n, sufixo) {
  el.hidden = !n;
  clear(el);
  if (n) el.append(num(n), h('span', { class: 'visually-hidden', text: ` ${sufixo}` }));
}

function openNavSheet(pageId, opener) {
  const ol = h('ol');
  for (const item of NAV) {
    const a = h('a', { href: item.href, 'aria-current': item.id === pageId ? 'page' : null },
      icon(item.icon), h('span', { text: item.long || item.label }));
    if (item.id === 'erros' || item.id === 'reenviados') a.append(h('span', { class: 'nav-count', dataset: { count: item.id }, hidden: true }));
    ol.append(h('li', {}, a));
  }
  const close = h('button', { type: 'button', class: 'topbar-btn', 'aria-label': 'Fechar menu' }, icon('fechar'));
  const dlg = h('dialog', { class: 'nav-sheet', 'aria-label': 'Menu' },
    h('div', { class: 'sheet-head' },
      h('span', { class: 'brand' }, h('img', { src: 'img/favicon.svg', alt: '', width: 32, height: 32 }),
        h('span', { class: 'brand-name' }, h('strong', { text: 'CICM' }))),
      close),
    h('nav', { 'aria-label': 'Principal' }, ol));
  close.addEventListener('click', () => dlg.close());
  showDialog(dlg, opener);
  updateCounts();
}

/* Menus suspensos no padrão de "disclosure": botão com aria-expanded. */
function dropdown(button, panel) {
  const wrap = h('div', { class: 'menu-wrap' }, button, panel);
  panel.hidden = true;
  const set = (open) => {
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) $('button, a', panel)?.focus();
  };
  button.addEventListener('click', () => set(panel.hidden));
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) { e.stopPropagation(); set(false); button.focus(); }
  });
  wrap.addEventListener('focusout', (e) => { if (!wrap.contains(e.relatedTarget)) set(false); });
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) set(false); });
  return { wrap, close: () => set(false) };
}

const TEMAS = [
  { id: 'sistema', label: 'Igual ao sistema', icon: 'sistema' },
  { id: 'claro', label: 'Claro', icon: 'sol' },
  { id: 'escuro', label: 'Escuro', icon: 'lua' },
];

const lerPref = (k, def) => { try { return localStorage.getItem(k) ?? def; } catch { return def; } };
const gravarPref = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };

function aplicarTema(id) {
  const root = document.documentElement;
  if (id === 'claro') root.dataset.theme = 'light';
  else if (id === 'escuro') root.dataset.theme = 'dark';
  else delete root.dataset.theme;
  gravarPref('cicm:tema', id);
}

function themeMenu() {
  const atual = () => lerPref('cicm:tema', 'sistema');
  const btnIcon = () => icon(TEMAS.find((t) => t.id === atual())?.icon || 'sistema');
  const button = h('button', { type: 'button', class: 'topbar-btn', 'aria-expanded': 'false', 'aria-label': 'Tema da interface' }, btnIcon());
  const panel = h('div', { class: 'popover', id: nextId('tema') }, h('p', { class: 'popover-label', text: 'Tema' }));
  button.setAttribute('aria-controls', panel.id);
  const items = TEMAS.map((t) => h('button', {
    type: 'button', class: 'popover-item', 'aria-pressed': String(atual() === t.id),
    on: {
      click: () => {
        aplicarTema(t.id);
        items.forEach((b, i) => b.setAttribute('aria-pressed', String(TEMAS[i].id === t.id)));
        button.replaceChildren(btnIcon());
        dd.close();
        button.focus();
        announce(`Tema ${t.label.toLowerCase()} aplicado`);
      },
    },
  }, icon(t.icon), t.label, icon('ok', 'tick')));
  panel.append(...items);
  const dd = dropdown(button, panel);
  return dd.wrap;
}

function userMenu(sessao) {
  const iniciais = sessao.nome.split(' ').map((p) => p[0]).slice(0, 2).join('');
  const button = h('button', { type: 'button', class: 'topbar-btn user-btn', 'aria-expanded': 'false' },
    h('span', { class: 'avatar', 'aria-hidden': 'true', text: iniciais }),
    h('span', { class: 'user-label' }, h('span', { text: sessao.nome.split(' ')[0] }), h('small', { text: sessao.cargo })),
    icon('baixo', 'icon-sm'));
  button.setAttribute('aria-label', `Conta de ${sessao.nome}`);
  const compacta = () => document.documentElement.dataset.density === 'compact';
  const dens = h('button', {
    type: 'button', class: 'popover-item', 'aria-pressed': String(compacta()),
    on: {
      click: () => {
        const nova = !compacta();
        if (nova) document.documentElement.dataset.density = 'compact';
        else delete document.documentElement.dataset.density;
        gravarPref('cicm:densidade', nova ? 'compacta' : 'confortavel');
        dens.setAttribute('aria-pressed', String(nova));
        announce(nova ? 'Tabelas compactas' : 'Tabelas confortáveis');
      },
    },
  }, icon('densidade'), 'Tabelas compactas', icon('ok', 'tick'));

  const panel = h('div', { class: 'popover', id: nextId('conta') },
    h('div', { class: 'popover-head' }, h('strong', { text: sessao.nome }), h('span', { text: `${sessao.cargo} · matrícula ${sessao.matricula}` })),
    dens,
    h('button', {
      type: 'button', class: 'popover-item',
      on: {
        click: async () => {
          dd.close();
          const ok = await confirmDialog({
            title: 'Restaurar dados de exemplo?',
            text: 'Correções, reenvios e descartes feitos nesta sessão serão desfeitos. A lista volta ao estado original.',
            confirm: 'Restaurar dados', tone: 'danger',
          });
          if (ok) { db.resetDb(); toast({ title: 'Dados de exemplo restaurados', tone: 'ok' }); }
        },
      },
    }, icon('atualizar'), 'Restaurar dados de exemplo'),
    h('hr'),
    h('button', {
      type: 'button', class: 'popover-item',
      on: { click: () => { db.endSession(); location.href = 'login.html?saiu=1'; } },
    }, icon('sair'), 'Sair'),
  );
  button.setAttribute('aria-controls', panel.id);
  const dd = dropdown(button, panel);
  return dd.wrap;
}

/* --------------------------------------------------------------- Rodapé */

function renderFooter() {
  const f = $('#rodape');
  if (!f) return;
  clear(f);
  f.append(h('div', { class: 'footer-inner' },
    h('span', {}, h('strong', { text: 'CICM' }), ' · Central de Comissões · versão 3.0 do protótipo'),
    h('span', { text: 'Prumo Seguros é uma marca fictícia. Todos os dados são de exemplo e ficam só neste navegador.' }),
  ));
}

/* ---------------------------------------------------- Anúncios e toasts */

let live;
function ensureLive() {
  if (live) return;
  live = h('div', { class: 'visually-hidden', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const toasts = h('div', { class: 'toasts', id: 'toasts', 'aria-live': 'polite', 'aria-relevant': 'additions' });
  document.body.append(live, toasts);
}

/** Anuncia uma mensagem para leitores de tela. */
export function announce(msg) {
  ensureLive();
  live.textContent = '';
  setTimeout(() => { live.textContent = msg; }, 60);
}

/**
 * Aviso temporário. tone: ok | bad | warn | info.
 * Fica 7 s na tela, pausa com o mouse ou o foco em cima, e pode ser fechado.
 */
export function toast({ title, text = '', tone = 'info', action }) {
  ensureLive();
  const box = $('#toasts');
  const icons = { ok: 'ok-circulo', bad: 'x-circulo', warn: 'erros', info: 'info' };
  const close = h('button', { type: 'button', class: 'btn btn-ghost btn-sm btn-icon', 'aria-label': 'Fechar aviso' }, icon('fechar'));
  const el = h('div', { class: `toast toast-${tone}` },
    icon(icons[tone] || 'info'),
    h('div', { class: 'toast-text' },
      h('strong', { text: title }),
      text ? h('span', { text }) : null,
      action ? h('div', {}, h('a', { href: action.href, text: action.label })) : null),
    close);
  box.append(el);
  let t;
  const arm = () => { t = setTimeout(() => el.remove(), 7000); };
  el.addEventListener('mouseenter', () => clearTimeout(t));
  el.addEventListener('mouseleave', arm);
  el.addEventListener('focusin', () => clearTimeout(t));
  el.addEventListener('focusout', arm);
  close.addEventListener('click', () => el.remove());
  arm();
}

/* -------------------------------------------------------------- Diálogos */

function showDialog(dlg, opener) {
  const back = opener || document.activeElement;
  document.body.append(dlg);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => {
    dlg.remove();
    if (back && back.isConnected) back.focus();
  });
  dlg.showModal();
}

/**
 * Diálogo modal ou gaveta lateral (drawer: true).
 * Devolve { dlg, body, foot, close }.
 */
export function modal({ title, desc, body, foot, wide = false, drawer = false, tone, opener, onClose }) {
  const titleId = nextId('dlg-t');
  const descId = desc ? nextId('dlg-d') : null;
  const closeBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-icon', 'aria-label': 'Fechar' }, icon('fechar'));
  const bodyEl = h('div', { class: 'modal-body' }, body);
  const footEl = foot ? h('div', { class: 'modal-foot' }, foot) : null;
  const dlg = h('dialog', {
    class: [drawer ? 'drawer' : 'modal', wide && !drawer ? 'modal-wide' : '', tone ? `modal-tone-${tone}` : ''],
    'aria-labelledby': titleId, 'aria-describedby': descId,
  },
  h('div', { class: 'modal-head' },
    h('div', {}, h('h2', { id: titleId, text: title }), desc ? h('p', { id: descId, text: desc }) : null),
    closeBtn),
  bodyEl, footEl);
  closeBtn.addEventListener('click', () => dlg.close());
  if (onClose) dlg.addEventListener('close', onClose);
  showDialog(dlg, opener);
  return { dlg, body: bodyEl, foot: footEl, close: () => dlg.close() };
}

/** Confirmação. Resolve true se a pessoa confirmar. */
export function confirmDialog({ title, text, body, confirm = 'Confirmar', cancel = 'Cancelar', tone = 'primary', opener }) {
  return new Promise((resolve) => {
    let ok = false;
    const btnOk = h('button', { type: 'button', class: `btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`, text: confirm });
    const btnCancel = h('button', { type: 'button', class: 'btn', text: cancel });
    const m = modal({
      title, desc: text, body: body || null, foot: [btnCancel, btnOk], tone: tone === 'danger' ? 'danger' : null, opener,
      onClose: () => resolve(ok),
    });
    btnCancel.addEventListener('click', () => m.close());
    btnOk.addEventListener('click', () => { ok = true; m.close(); });
    (tone === 'danger' ? btnCancel : btnOk).focus();
  });
}

/* ------------------------------------------------------------ Status */

export function statusChip(map, key) {
  const s = map[key] || { label: key, tone: 'neutral', icon: 'info' };
  const tones = s.tone.split(' ').map((t) => `status-${t}`);
  return h('span', { class: ['status', ...tones] }, icon(s.icon), s.label);
}

export function emptyState(title, text, iconName = 'busca', extra) {
  return h('div', { class: 'empty' }, icon(iconName), h('strong', { text: title }), text ? h('p', { text }) : null, extra || null);
}

export function notice(tone, ...content) {
  const icons = { info: 'info', warn: 'erros', bad: 'x-circulo', ok: 'ok-circulo' };
  return h('div', { class: `notice notice-${tone}` }, icon(icons[tone]), h('div', {}, content));
}

/* -------------------------------------------------- Paleta de comandos */

function bindShortcuts() {
  document.addEventListener('keydown', (e) => {
    const typing = e.target.closest('input, textarea, select, [contenteditable="true"]');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openPalette($('.cmd-trigger'));
    } else if (e.key === '/' && !typing && !document.querySelector('dialog[open]')) {
      e.preventDefault();
      openPalette($('.cmd-trigger'));
    }
  });
}

function buscar(q) {
  const d = db.getDb();
  const out = [];
  const nq = norm(q);
  const up = q.trim().toUpperCase();

  for (const item of NAV) {
    if (!nq || norm(`${item.label} ${item.long || ''} ${item.words}`).includes(nq)) {
      out.push({ icon: item.icon, text: item.long || item.label, sub: '', meta: 'Página', href: item.href });
    }
  }
  if (up.length >= 2) {
    if (/^F\d*[A-Z]?$/.test(up)) {
      d.movs.filter((m) => m.guid.startsWith(up)).slice(0, 6).forEach((m) => out.push({
        icon: 'movimentos', text: m.guid, mono: true, sub: `Apólice ${m.apolice} · ${db.STATUS_MOV[m.status].label}`, meta: 'Movimento', href: `movimento.html?guid=${m.guid}`,
      }));
    }
    if (/^RV/.test(up)) {
      d.reenvios.filter((r) => r.protocolo.includes(up)).slice(-6).reverse().forEach((r) => out.push({
        icon: 'reenviados', text: r.protocolo, mono: true, sub: `${plural(r.guids.length, 'movimento', 'movimentos')} · ${db.STATUS_REENVIO[r.status].label}`, meta: 'Reenvio', href: `reenviados.html?protocolo=${r.protocolo}`,
      }));
    }
    if (/^\d+$/.test(up)) {
      d.remessas.filter((r) => r.num.startsWith(up)).slice(0, 4).forEach((r) => out.push({
        icon: 'remessas', text: `Remessa ${r.num}`, sub: `${db.ciaLabel(r.cia)} · ${relative(r.recebida)}`, meta: 'Remessa', href: `remessas.html?remessa=${r.num}`,
      }));
      if (up.length >= 4) {
        d.movs.filter((m) => m.apolice.includes(up)).slice(0, 5).forEach((m) => out.push({
          icon: 'movimentos', text: `Apólice ${m.apolice}`, sub: `${m.guid} · parcela ${m.parcela} · ${db.STATUS_MOV[m.status].label}`, meta: 'Movimento', href: `movimento.html?guid=${m.guid}`,
        }));
      }
    }
    const cod = up.match(/^E\d{1,3}$/) ? up : null;
    if (cod) Object.keys(db.ERROS).filter((c) => c.startsWith(cod)).forEach((c) => out.push({
      icon: 'erros', text: `${c} · ${db.ERROS[c].titulo}`, sub: db.ERROS[c].campo, meta: 'Erro', href: `erros.html?codigo=${c}`,
    }));
  }
  return out.slice(0, 12);
}

export function openPalette(opener) {
  if (document.querySelector('dialog.palette[open]')) return;
  const listId = nextId('pal-list');
  const input = h('input', {
    type: 'text', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': listId, 'aria-autocomplete': 'list',
    'aria-label': 'Buscar páginas, GUIDs, apólices, remessas ou protocolos', placeholder: 'Página, GUID, apólice, remessa, protocolo RV…',
    autocomplete: 'off', spellcheck: 'false',
  });
  const list = h('ul', { class: 'palette-list', role: 'listbox', id: listId, 'aria-label': 'Resultados' });
  const status = h('p', { class: 'visually-hidden', 'aria-live': 'polite' });
  const vazio = h('p', { class: 'palette-empty', hidden: true, text: 'Nada encontrado. Confira o GUID, a apólice ou o protocolo.' });
  const dlg = h('dialog', { class: 'palette', 'aria-label': 'Buscar no CICM' },
    h('div', { class: 'palette-input' }, icon('busca'), input, h('kbd', { text: 'Esc' })),
    list, vazio, status,
    h('div', { class: 'palette-foot', 'aria-hidden': 'true' },
      h('span', {}, h('kbd', { text: '↑' }), ' ', h('kbd', { text: '↓' }), ' navegar'),
      h('span', {}, h('kbd', { text: 'Enter' }), ' abrir'),
      h('span', {}, 'Dica: comece com F para GUIDs, RV para protocolos, E para códigos de erro')));

  let items = [];
  let active = 0;
  const render = () => {
    items = buscar(input.value);
    active = Math.min(active, Math.max(0, items.length - 1));
    clear(list);
    list.hidden = !items.length;
    vazio.hidden = !!items.length;
    input.setAttribute('aria-expanded', String(!!items.length));
    if (!items.length) input.removeAttribute('aria-activedescendant');
    items.forEach((it, i) => {
      const li = h('li', {
        class: 'palette-option', role: 'option', id: `${listId}-${i}`, 'aria-selected': String(i === active),
        on: { click: () => go(i), mousemove: () => { if (active !== i) { active = i; mark(); } } },
      }, icon(it.icon), h('span', { class: 'opt-text' }, h('span', { class: it.mono ? 'code' : '', text: it.text }), it.sub ? h('small', { text: it.sub }) : null), h('span', { class: 'meta', text: it.meta }));
      list.append(li);
    });
    mark();
    status.textContent = items.length ? plural(items.length, 'resultado', 'resultados') : 'Nenhum resultado';
  };
  const mark = () => {
    $$('.palette-option', list).forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
    const cur = $(`#${listId}-${active}`);
    if (cur) { input.setAttribute('aria-activedescendant', cur.id); cur.scrollIntoView({ block: 'nearest' }); }
  };
  const go = (i) => { const it = items[i]; if (it) location.href = it.href; };

  input.addEventListener('input', () => { active = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % Math.max(1, items.length); mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + items.length) % Math.max(1, items.length); mark(); }
    else if (e.key === 'Enter') { e.preventDefault(); go(active); }
  });
  showDialog(dlg, opener);
  render();
  input.focus();
}

/* -------------------------------------------------- Relógio de processamento */

let clockStarted = false;
function startClock() {
  if (clockStarted) return;
  clockStarted = true;
  const step = () => {
    if (!db.temProcessamento()) return;
    const eventos = db.tick();
    for (const ev of eventos) {
      if (ev.tipo === 'reenvio') {
        const tone = ev.rejeitados === 0 ? 'ok' : ev.integrados === 0 ? 'bad' : 'warn';
        toast({
          tone,
          title: `Reenvio ${ev.rv.protocolo} concluído`,
          text: `${plural(ev.integrados, 'integrado', 'integrados')}, ${plural(ev.rejeitados, 'rejeitado de novo', 'rejeitados de novo')}.`,
          action: { label: 'Ver resultado', href: `reenviados.html?protocolo=${ev.rv.protocolo}` },
        });
      } else if (ev.tipo === 'remessa') {
        toast({
          tone: ev.rejeitados ? 'warn' : 'ok',
          title: `Remessa ${ev.rem.num} processada`,
          text: `${plural(ev.total, 'movimento', 'movimentos')}, ${plural(ev.rejeitados, 'rejeitado', 'rejeitados')}.`,
          action: { label: 'Ver remessa', href: `remessas.html?remessa=${ev.rem.num}` },
        });
      }
    }
    window.dispatchEvent(new CustomEvent('cicm:tick'));
  };
  setInterval(step, 1000);
  step();
}

/* ------------------------------------------------------------ Diversos */

/** Copia um texto e avisa. */
export async function copy(text, label = 'Copiado') {
  try {
    await navigator.clipboard.writeText(text);
    announce(`${label}: ${text}`);
    toast({ title: label, text, tone: 'ok' });
  } catch {
    toast({ title: 'Não foi possível copiar', text: 'Selecione o texto e use Ctrl+C.', tone: 'warn' });
  }
}

/** Botão de copiar ao lado de um código. */
export function copyBtn(text, label) {
  return h('button', {
    type: 'button', class: 'btn btn-ghost btn-sm btn-icon', 'aria-label': `Copiar ${label}`,
    on: { click: () => copy(text, `${label} copiado`) },
  }, icon('copiar'));
}

/** Atualiza o título da aba. */
export function setTitle(t) {
  document.title = `${t} · CICM`;
}

/** Guarda filtros durante a sessão (por página). */
export const filtros = {
  get(page) { try { return JSON.parse(sessionStorage.getItem(`cicm:filtro:${page}`)) || null; } catch { return null; } },
  set(page, v) { try { sessionStorage.setItem(`cicm:filtro:${page}`, JSON.stringify(v)); } catch { /* ok */ } },
};

/** Passa dados para a próxima página (ex.: GUIDs a reenviar). */
export const handoff = {
  put(key, v) { sessionStorage.setItem(`cicm:passa:${key}`, JSON.stringify(v)); },
  take(key) {
    const k = `cicm:passa:${key}`;
    try { const v = JSON.parse(sessionStorage.getItem(k)); sessionStorage.removeItem(k); return v; } catch { return null; }
  },
};
