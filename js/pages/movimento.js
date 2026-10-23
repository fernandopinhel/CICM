import { h, icon, $, clear, param } from '../dom.js';
import * as f from '../format.js';
import * as db from '../db.js';
import { boot, statusChip, notice, toast, announce, confirmDialog, modal, setTitle, copyBtn, emptyState } from '../ui.js';
import { enhance, validateForm, setFieldError, GUID_RE } from '../form.js';
import { erroTag, tipoChip } from '../views.js';

boot('movimentos');

const guid = (param('guid') || '').trim().toUpperCase();
const root = $('#caso');
let assinatura = '';

const assinar = (m) => JSON.stringify([m.status, m.erros, m.hist.length, m.rv]);

function render(focusSel) {
  const m = db.mov(guid);
  if (!m) { naoEncontrado(); return; }
  assinatura = assinar(m);
  setTitle(m.guid);
  const trilha = $('#trilha-atual');
  trilha.textContent = m.guid;
  trilha.href = `movimento.html?guid=${m.guid}`;
  trilha.classList.add('code');

  clear(root).append(
    cabecalho(m),
    h('div', { class: 'stack' },
      etapas(m),
      h('div', { class: 'grid grid-main' },
        h('div', { class: 'stack' }, painelErros(m), painelDados(m)),
        painelHistorico(m))));
  if (focusSel) $(focusSel)?.focus();
}

/* ------------------------------------------------------------ Cabeçalho */

function cabecalho(m) {
  const acoes = h('div', { class: 'page-actions' });
  acoes.append(h('a', { class: 'btn', href: `remessas.html?remessa=${m.remessa}` }, icon('remessas'), `Remessa ${m.remessa}`));
  if (m.status === 'processando') {
    acoes.append(h('a', { class: 'btn btn-primary', href: `reenviados.html?protocolo=${m.rv}` }, icon('reenviados'), `Acompanhar ${m.rv}`));
  }
  if (m.status === 'rejeitado') {
    if (m.erros.some((e) => !e.ok && e.cod === 'E407')) acoes.append(botaoDescartar(m));
    acoes.append(botaoReenviar(m, 'Reenviar este movimento'));
  }
  return h('div', { class: 'page-head' },
    h('div', {},
      h('p', { class: 'eyebrow', text: 'Caso de comissão' }),
      h('div', { class: 'page-actions' }, h('h1', { class: 'mono', text: m.guid }), copyBtn(m.guid, 'GUID')),
      h('p', {}, `Apólice ${m.apolice} · parcela ${m.parcela}${m.endosso ? ` · endosso ${m.endosso}` : ''} · ${db.ciaLabel(m.cia)} · `, statusChip(db.STATUS_MOV, m.status))),
    acoes);
}

function botaoReenviar(m, texto) {
  const b = h('button', { type: 'button', class: 'btn btn-primary' }, icon('reenviar'), texto);
  b.addEventListener('click', async () => {
    const p = db.previsao(m);
    const ok = await confirmDialog({
      title: `Reenviar ${m.guid}?`,
      text: p.integra
        ? 'O movimento passa pela validação de novo. Pelos dados de agora, deve integrar.'
        : `Pelos dados de agora, ele deve voltar rejeitado (${p.restantes.join(', ')}). Reenvie só se a companhia já acertou o que falta.`,
      confirm: p.integra ? 'Reenviar' : 'Reenviar mesmo assim',
      opener: b,
    });
    if (!ok) return;
    const rv = db.reenviar([m.guid], 'guid');
    toast({ title: `Reenvio ${rv.protocolo} criado`, text: 'A revalidação leva alguns segundos.', tone: 'info', action: { label: 'Acompanhar', href: `reenviados.html?protocolo=${rv.protocolo}` } });
    render('#conteudo');
  });
  return b;
}

function botaoDescartar(m) {
  const b = h('button', { type: 'button', class: 'btn btn-danger' }, icon('lixeira'), 'Descartar');
  b.addEventListener('click', () => {
    const area = h('textarea', { class: 'textarea', id: 'motivo-descarte', name: 'motivo', required: true, 'data-label': 'Motivo', 'aria-describedby': 'motivo-dica' });
    area.dataset.msgRequired = 'Conte por que o movimento está sendo descartado. Fica registrado no histórico.';
    const form = h('form', { id: 'form-descarte', action: 'movimento.html', method: 'get' },
      h('div', { class: 'field' },
        h('label', { for: 'motivo-descarte', text: 'Motivo' }),
        area,
        h('p', { class: 'hint', id: 'motivo-dica', text: 'Exemplo: duplicidade confirmada com a companhia em contato por e-mail.' })));
    enhance(form);
    const confirmar = h('button', { type: 'submit', class: 'btn btn-danger', form: 'form-descarte', text: 'Descartar movimento' });
    const cancelar = h('button', { type: 'button', class: 'btn', text: 'Cancelar' });
    const dlg = modal({
      title: 'Descartar este movimento?',
      desc: 'A comissão desta parcela não será paga por este movimento. Use quando a duplicidade estiver confirmada.',
      body: form, foot: [cancelar, confirmar], tone: 'danger', opener: b,
    });
    cancelar.addEventListener('click', () => dlg.close());
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!validateForm(form)) return;
      db.descartar(m.guid, area.value.trim());
      dlg.close();
      toast({ title: 'Movimento descartado', text: m.guid, tone: 'ok' });
      render('#conteudo');
    });
    area.focus();
  });
  return b;
}

/* --------------------------------------------------------------- Etapas */

function etapas(m) {
  const pend = db.errosPendentes(m);
  const pendCampo = pend.filter((e) => db.ERROS[e.cod].tipo === 'campo');
  const corrigido = m.hist.some((x) => x.ev === 'corrigido');
  const integrado = m.hist.find((x) => x.ev === 'integrado');
  const etapa = (nome, estado, texto) => {
    const estados = { done: 'concluída', fail: 'com problema', now: 'etapa atual', todo: 'a fazer' };
    return h('li', { class: estado, 'aria-current': estado === 'now' ? 'step' : null },
      h('strong', {}, icon({ done: 'ok-circulo', fail: 'x-circulo', now: 'relogio', todo: 'relogio' }[estado], 'icon-sm'), nome,
        h('span', { class: 'visually-hidden', text: `, ${estados[estado]}` })),
      h('span', { text: texto }));
  };
  const recebido = m.hist[0];
  const lista = [
    etapa('Recebido', 'done', `Remessa ${m.remessa} · ${f.dateTime(recebido.dt)}`),
    m.rej0 ? etapa('Validação', 'fail', `Rejeitado na carga · ${f.plural(m.erros.length, 'erro', 'erros')}`) : etapa('Validação', 'done', 'Sem erros na carga'),
  ];
  if (!m.rej0) lista.push(etapa('Correção', 'done', 'Não precisou'));
  else if (m.status === 'rejeitado' && pendCampo.length) lista.push(etapa('Correção', 'now', `Falta corrigir ${f.plural(pendCampo.length, 'campo', 'campos')}`));
  else lista.push(etapa('Correção', 'done', corrigido ? 'Dados corrigidos' : 'Nada a corrigir no CICM'));

  if (m.status === 'integrado') lista.push(etapa('Integração', 'done', `Integrado em ${f.dateTime(integrado?.dt || m.dt)}`));
  else if (m.status === 'processando') lista.push(etapa('Integração', 'now', `Em reenvio · ${m.rv}`));
  else if (m.status === 'descartado') lista.push(etapa('Integração', 'done', 'Descartado, não será integrado'));
  else lista.push(etapa('Integração', pendCampo.length ? 'todo' : 'now', m.tentativas ? `Rejeitado de novo · ${f.plural(m.tentativas, 'tentativa', 'tentativas')}` : 'Aguardando reenvio'));

  return h('section', { 'aria-labelledby': 'etapas-titulo' },
    h('h2', { class: 'visually-hidden', id: 'etapas-titulo', text: 'Etapas do movimento' }),
    h('ol', { class: 'pipeline' }, lista));
}

/* ---------------------------------------------------------------- Erros */

function painelErros(m) {
  if (!m.erros.length) {
    return h('section', { class: 'panel', 'aria-labelledby': 'erros-titulo' },
      h('div', { class: 'panel-head' }, h('h2', { id: 'erros-titulo', text: 'Validação' })),
      h('div', { class: 'panel-body' }, notice('ok', 'Este movimento passou na validação da carga sem nenhum erro.')));
  }
  const pend = db.errosPendentes(m);
  const editaveis = m.status === 'rejeitado' ? pend.filter((e) => db.ERROS[e.cod].tipo === 'campo') : [];
  const form = h('form', { id: 'corrigir', action: 'movimento.html', method: 'get' });
  const cards = m.erros.map((e) => cartaoErro(m, e, editaveis.includes(e)));

  const corpo = h('div', { class: 'panel-body' }, cards);
  form.append(corpo);
  if (editaveis.length) {
    form.append(h('div', { class: 'panel-foot' },
      h('p', { class: 'hint', text: 'As correções ficam no histórico do movimento, com seu nome.' }),
      h('button', { type: 'submit', class: 'btn btn-primary' }, icon('ok'), 'Salvar correções')));
    enhance(form);
    form.addEventListener('submit', (ev) => salvar(ev, m, form, editaveis));
  }

  return h('section', { class: 'panel', 'aria-labelledby': 'erros-titulo' },
    h('div', { class: 'panel-head' },
      h('div', {},
        h('h2', { id: 'erros-titulo', text: 'Erros da validação' }),
        h('p', { text: pend.length ? `${f.plural(pend.length, 'pendente', 'pendentes')} · ${f.plural(m.erros.length - pend.length, 'resolvido', 'resolvidos')}` : 'Todos resolvidos' }))),
    m.status === 'rejeitado' ? h('div', { class: 'panel-body', id: 'previsao', tabindex: '-1' }, previsaoBox(m)) : null,
    editaveis.length ? form : corpo);
}

function previsaoBox(m) {
  const p = db.previsao(m);
  if (p.integra) {
    return notice('ok', h('strong', { text: 'Pronto para reenviar. ' }), 'Com os dados de agora, o movimento deve integrar.',
      h('div', { class: 'page-actions' }, botaoReenviar(m, 'Reenviar agora')));
  }
  const soCampo = p.restantes.every((c) => db.ERROS[c].tipo === 'campo');
  return notice('warn', h('strong', { text: 'Se reenviar agora, ele volta rejeitado. ' }),
    soCampo ? 'Corrija os campos abaixo e salve.' : `Ainda falta: ${p.restantes.map((c) => `${c} ${db.ERROS[c].titulo.toLowerCase()}`).join('; ')}.`);
}

function cartaoErro(m, e, editavel) {
  const def = db.ERROS[e.cod];
  const r = db.ramo(m.ramo);
  const extra = [];
  if (e.cod === 'E101') extra.push(`Corretor no movimento: ${db.corretor(m.corretor).nome}${db.corretor(m.corretor).ativo ? '' : ' (inativo)'}.`);
  if (e.cod === 'E205') extra.push(`Limite do ramo ${r.cod} ${r.nome}: ${f.perc(r.max)}. No movimento: ${f.perc(m.perc)}.`);
  if (e.cod === 'E210') extra.push(`Prêmio ${f.money(m.premio)} × ${f.perc(m.perc)} = ${f.money(Math.round(m.premio * m.perc) / 100)}. No movimento: ${f.money(m.comissao)}.`);
  if (e.cod === 'E318') extra.push(`Emissão em ${f.date(m.emissao)}, vencimento em ${f.date(m.venc)}.`);

  return h('article', { class: ['error-card', e.ok ? 'is-ok' : ''], 'aria-labelledby': `erro-${e.cod}` },
    h('header', {},
      erroTag(e.cod),
      h('h3', { id: `erro-${e.cod}`, text: def.titulo }),
      e.ok ? h('span', { class: 'status status-ok' }, icon('ok'), 'Resolvido') : h('span', { class: 'status status-bad' }, icon('x-circulo'), 'Pendente'),
      e.ok ? null : tipoChip(e.cod)),
    h('p', { text: def.desc }),
    h('p', { class: 'small muted' }, 'Campo ', h('span', { class: 'code', text: def.campo }), ' · tabela ', h('span', { class: 'code', text: def.tabela })),
    extra.length ? h('p', { class: 'small', text: extra.join(' ') }) : null,
    e.ok ? null : h('div', { class: 'how' }, icon('info'), h('span', {}, h('strong', { text: 'Como resolver: ' }), def.como)),
    editavel ? h('div', { class: 'fix' }, editor(m, e.cod)) : null);
}

function editor(m, cod) {
  const r = db.ramo(m.ramo);
  if (cod === 'E101') {
    const sel = h('select', { class: 'select', id: 'fix-corretor', name: 'corretor', required: true, 'data-label': 'Novo corretor', 'aria-describedby': 'fix-corretor-dica' },
      h('option', { value: '', text: 'Escolha o corretor' }),
      db.CORRETORES.filter((c) => c.ativo).map((c) => h('option', { value: c.id, text: `${c.nome} · SUSEP ${c.susep}` })));
    sel.dataset.msgRequired = 'Escolha o corretor que vai receber a comissão.';
    return h('div', { class: 'field' }, h('label', { for: 'fix-corretor', text: 'Novo corretor' }), sel,
      h('p', { class: 'hint', id: 'fix-corretor-dica', text: 'Só aparecem corretores ativos.' }));
  }
  if (cod === 'E205') {
    const dica = h('p', { class: 'hint', id: 'fix-perc-dica', text: `Até ${f.perc(r.max)}. Use vírgula para os centavos, por exemplo 22,5.` });
    const inp = h('input', { class: 'input', id: 'fix-perc', name: 'perc', inputmode: 'decimal', required: true, autocomplete: 'off', 'data-label': 'Novo percentual de comissão', 'aria-describedby': 'fix-perc-dica' });
    inp.dataset.msgRequired = `Informe o novo percentual, até ${f.perc(r.max)}.`;
    inp.addEventListener('input', () => {
      const v = parseDec(inp.value);
      dica.textContent = Number.isFinite(v) && v > 0
        ? `Até ${f.perc(r.max)}. Com ${f.perc(v)}, a comissão fica em ${f.money(Math.round(m.premio * v) / 100)}.`
        : `Até ${f.perc(r.max)}. Use vírgula para os centavos, por exemplo 22,5.`;
    });
    return h('div', { class: 'field' }, h('label', { for: 'fix-perc', text: 'Novo percentual de comissão (%)' }), inp, dica);
  }
  if (cod === 'E210') {
    const novo = Math.round(m.premio * m.perc) / 100;
    return h('div', { class: 'field' },
      h('label', { class: 'check', for: 'fix-recalc' },
        h('input', { type: 'checkbox', id: 'fix-recalc', name: 'recalc', value: '1', checked: true, 'data-label': 'Recalcular a comissão' }),
        `Recalcular a comissão para ${f.money(novo)}`));
  }
  if (cod === 'E233') {
    const sel = h('select', { class: 'select', id: 'fix-opcao', name: 'opcao', required: true, 'data-label': 'Opção comercial' },
      h('option', { value: '', text: 'Escolha a opção comercial' }),
      db.OPCOES.map((o) => h('option', { value: o.cod, text: `${o.cod} · ${o.nome}` })));
    return h('div', { class: 'field' }, h('label', { for: 'fix-opcao', text: 'Opção comercial' }), sel);
  }
  if (cod === 'E318') {
    const inp = h('input', { class: 'input', type: 'date', id: 'fix-venc', name: 'venc', required: true, min: m.emissao, 'data-label': 'Novo vencimento', 'aria-describedby': 'fix-venc-dica' });
    inp.dataset.msgRequired = 'Informe o novo vencimento da parcela.';
    return h('div', { class: 'field' }, h('label', { for: 'fix-venc', text: 'Novo vencimento' }), inp,
      h('p', { class: 'hint', id: 'fix-venc-dica', text: `Igual ou depois da emissão, ${f.date(m.emissao)}.` }));
  }
  return null;
}

/* Aceita "22,5" e "22.5"; com vírgula, pontos são separador de milhar. */
const parseDec = (s) => {
  const t = String(s).trim().replace('%', '');
  return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
};

function salvar(ev, m, form, editaveis) {
  ev.preventDefault();
  const r = db.ramo(m.ramo);
  const ok = validateForm(form, () => {
    const out = [];
    const perc = $('#fix-perc', form);
    if (perc && perc.value) {
      const v = parseDec(perc.value);
      if (!Number.isFinite(v) || v <= 0) out.push({ el: perc, msg: 'Use só números, com vírgula para os centavos. Exemplo: 22,5.' });
      else if (v > r.max) out.push({ el: perc, msg: `O limite do ramo ${r.nome} é ${f.perc(r.max)}. Informe até esse valor.` });
    }
    const venc = $('#fix-venc', form);
    if (venc && venc.value && venc.value < m.emissao) out.push({ el: venc, msg: `O vencimento precisa ser em ${f.date(m.emissao)} ou depois.` });
    const rec = $('#fix-recalc', form);
    if (rec && !rec.checked && !perc) out.push({ el: rec, msg: 'Marque para recalcular. Sem isso, a rejeição continua.' });
    return out;
  });
  if (!ok) return;
  const mud = {};
  for (const e of editaveis) {
    if (e.cod === 'E101') mud.corretor = $('#fix-corretor', form).value;
    if (e.cod === 'E205') mud.perc = parseDec($('#fix-perc', form).value);
    if (e.cod === 'E210') mud.recalc = $('#fix-recalc', form).checked;
    if (e.cod === 'E233') mud.opcao = $('#fix-opcao', form).value;
    if (e.cod === 'E318') mud.venc = $('#fix-venc', form).value;
  }
  const res = db.corrigir(m.guid, mud);
  if (!res.mudou) {
    const alvo = $('select, input', form);
    setFieldError(alvo, 'Nada mudou. Altere o valor antes de salvar.');
    alvo.focus();
    return;
  }
  const p = db.previsao(db.mov(m.guid));
  toast({ title: 'Correções salvas', text: p.integra ? 'Agora o movimento pode ser reenviado.' : 'Ainda falta resolver o que só a companhia corrige.', tone: 'ok' });
  render('#previsao');
  announce(p.integra ? 'Correções salvas. Pronto para reenviar.' : 'Correções salvas.');
}

/* ---------------------------------------------------------------- Dados */

function painelDados(m) {
  const c = db.corretor(m.corretor);
  const r = db.ramo(m.ramo);
  const item = (dt, dd) => h('div', {}, h('dt', { text: dt }), h('dd', {}, dd));
  return h('section', { class: 'panel', 'aria-labelledby': 'dados-titulo' },
    h('div', { class: 'panel-head' }, h('h2', { id: 'dados-titulo', text: 'Dados do movimento' })),
    h('div', { class: 'panel-body' },
      h('dl', { class: 'desc-grid' },
        item('Companhia', db.ciaLabel(m.cia)),
        item('Sucursal', `${m.suc} · ${db.sucursal(m.suc).nome}`),
        item('Ramo', `${r.cod} · ${r.nome}`),
        item('Apólice', h('span', { class: 'code', text: m.apolice })),
        item('Endosso', String(m.endosso)),
        item('Parcela', String(m.parcela)),
        item('Natureza / complemento', `${m.nat} · ${db.natureza(m.nat)}`),
        item('Corretor', [c.nome, h('br'), h('span', { class: c.ativo ? 'muted small' : 'text-bad small', text: `SUSEP ${c.susep}${c.ativo ? '' : ' · inativo'}` })]),
        item('Opção comercial', m.opcao ? `${m.opcao} · ${db.opcao(m.opcao).nome}` : h('span', { class: 'text-bad', text: 'Em branco' })),
        item('Emissão', f.date(m.emissao)),
        item('Vencimento', h('span', { class: m.venc < m.emissao ? 'text-bad' : '', text: f.date(m.venc) })),
        item('Prêmio', f.money(m.premio)),
        item('Percentual de comissão', h('span', { class: m.perc > r.max ? 'text-bad' : '', text: `${f.perc(m.perc)} (limite ${f.perc(r.max)})` })),
        item('Comissão', h('strong', { text: f.money(m.comissao) })),
        item('Remessa', h('a', { href: `remessas.html?remessa=${m.remessa}`, text: m.remessa })),
        item('Data do movimento', f.dateTimeSec(m.dt)))));
}

/* ------------------------------------------------------------ Histórico */

const EVENTOS = {
  recebido: { label: 'Recebido', cls: 'ev-info', icon: 'remessas' },
  rejeitado: { label: 'Rejeitado na validação', cls: 'ev-bad', icon: 'x-circulo' },
  corrigido: { label: 'Dados corrigidos', cls: 'ev-warn', icon: 'corrigir' },
  reenviado: { label: 'Reenviado', cls: 'ev-info', icon: 'reenviar' },
  integrado: { label: 'Integrado', cls: 'ev-ok', icon: 'ok' },
  descartado: { label: 'Descartado', cls: 'ev-neutral', icon: 'proibido' },
};

function painelHistorico(m) {
  const itens = [...m.hist].reverse().map((ev, i, arr) => {
    const def = EVENTOS[ev.ev];
    let label = def.label;
    if (ev.ev === 'rejeitado' && arr.slice(i + 1).some((x) => x.ev === 'reenviado')) label = 'Rejeitado de novo';
    const txt = ev.ev === 'rejeitado' && /^E\d{3}/.test(ev.txt)
      ? ev.txt.split(', ').map((c) => `${c} ${db.ERROS[c]?.titulo.toLowerCase() ?? ''}`).join('; ')
      : ev.txt;
    return h('li', { class: def.cls },
      h('span', { class: 'dot' }, icon(def.icon)),
      h('strong', { text: label }),
      txt ? h('span', { class: 'small', text: txt }) : null,
      h('span', { class: 'when', text: ` ${f.dateTime(ev.dt)} · ${ev.por}` }));
  });
  return h('section', { class: 'panel', 'aria-labelledby': 'hist-titulo' },
    h('div', { class: 'panel-head' }, h('div', {}, h('h2', { id: 'hist-titulo', text: 'Histórico' }), h('p', { text: 'Do mais recente para o mais antigo.' }))),
    h('div', { class: 'panel-body' }, h('ol', { class: 'timeline' }, itens)));
}

/* -------------------------------------------------------- Não encontrado */

function naoEncontrado() {
  setTitle('Caso não encontrado');
  const inp = h('input', { class: 'input mono', id: 'busca-guid', name: 'guid', required: true, 'data-rules': 'guid', 'data-mask': 'guid', maxlength: '17', autocomplete: 'off', spellcheck: 'false', value: guid });
  const form = h('form', { id: 'buscar', action: 'movimento.html', method: 'get', class: 'panel' },
    h('div', { class: 'panel-body' },
      h('div', { class: 'field' }, h('label', { for: 'busca-guid', text: 'GUID' }), inp)),
    h('div', { class: 'panel-foot' }, h('button', { type: 'submit', class: 'btn btn-primary' }, icon('busca'), 'Abrir caso')));
  enhance(form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validateForm(form, () => (GUID_RE.test(inp.value) && !db.mov(inp.value) ? [{ el: inp, msg: 'Não há movimento com esse GUID. Confira se copiou todos os 17 caracteres.' }] : []))) return;
    location.href = `movimento.html?guid=${inp.value}`;
  });
  clear(root).append(
    h('div', { class: 'page-head' }, h('div', {}, h('p', { class: 'eyebrow', text: 'Caso de comissão' }), h('h1', { text: guid ? 'Caso não encontrado' : 'Abrir um caso' }),
      h('p', { text: guid ? `Não há movimento com o GUID ${guid}. Confira e tente de novo.` : 'Informe o GUID do movimento.' }))),
    h('div', { class: 'stack' }, form, emptyState('Dica', 'Use a busca no topo (Ctrl+K) para achar um movimento pela apólice.', 'info')));
}

render();
window.addEventListener('cicm:dados', () => {
  const m = db.mov(guid);
  if (m && assinar(m) !== assinatura) render();
});
