/* Pedaços de interface usados por mais de uma tela. */

import { h, icon, clear } from './dom.js';
import { money, num, pct, dateTime, dateTimeSec, relative, fromIsoDate, isoDate, plural } from './format.js';
import * as db from './db.js';
import { modal, statusChip, notice, confirmDialog, toast, copyBtn, handoff } from './ui.js';
import { options } from './form.js';

export const guidLink = (m) => h('a', { class: 'row-link code', href: `movimento.html?guid=${m.guid}`, text: m.guid });

export const erroTag = (cod) => h('span', { class: 'tag', title: db.ERROS[cod]?.titulo, text: cod });

export const ciaCell = (cod) => h('span', { title: db.cia(cod)?.nome }, h('span', { class: 'code', text: cod }), h('span', { class: 'visually-hidden', text: ` ${db.cia(cod)?.nome}` }));

export function previsaoChip(m) {
  const p = db.previsao(m);
  return p.integra
    ? h('span', { class: 'status status-ok' }, icon('ok'), 'Deve integrar')
    : h('span', { class: 'status status-bad', title: p.texto }, icon('erros'), 'Deve voltar rejeitado');
}

export function tipoChip(cod) {
  const tipo = db.ERROS[cod].tipo;
  const tone = { campo: 'info', reenvio: 'ok', origem: 'warn', descartar: 'neutral' }[tipo];
  const ic = { campo: 'corrigir', reenvio: 'reenviar', origem: 'arquivo', descartar: 'proibido' }[tipo];
  return h('span', { class: `status status-${tone}` }, icon(ic), db.TIPO_ERRO[tipo]);
}

export function ciaOptions(select, placeholder = 'Todas as companhias') {
  options(select, db.CIAS.map((c) => ({ value: c.cod, label: `${c.cod} · ${c.nome}` })), { placeholder });
}

export function erroOptions(select, placeholder = 'Todos os erros') {
  options(select, Object.entries(db.ERROS).map(([cod, e]) => ({ value: cod, label: `${cod} · ${e.titulo}` })), { placeholder });
}

/** Regra de período: fim depois do início, nada no futuro, até 31 dias. */
export function periodoRule(iniEl, fimEl, maxDias = 31) {
  const out = [];
  const hoje = isoDate(new Date());
  if (iniEl.value && iniEl.value > hoje) out.push({ el: iniEl, msg: 'A data de início não pode ser depois de hoje.' });
  if (fimEl.value && fimEl.value > hoje) out.push({ el: fimEl, msg: 'A data de fim não pode ser depois de hoje.' });
  if (iniEl.value && fimEl.value && fimEl.value < iniEl.value) out.push({ el: fimEl, msg: 'A data de fim precisa ser igual ou depois da data de início.' });
  else if (iniEl.value && fimEl.value) {
    const dias = Math.round((fromIsoDate(fimEl.value) - fromIsoDate(iniEl.value)) / 86400000) + 1;
    if (dias > maxDias) out.push({ el: fimEl, msg: `O período pode ter até ${maxDias} dias. Este tem ${dias}.` });
  }
  return out;
}

export const noPeriodo = (iso, ini, fim) => {
  const d = isoDate(new Date(iso));
  return (!ini || d >= ini) && (!fim || d <= fim);
};

/* ------------------------------------------------------- Gaveta da remessa */

export function remessaDrawer(num_, opener) {
  const rem = db.remessa(num_);
  if (!rem) return;
  const m = modal({ title: `Remessa ${rem.num}`, desc: `${db.ciaLabel(rem.cia)} · ${rem.arquivo}`, drawer: true, opener, body: h('div') });
  const draw = () => {
    const r = db.remessa(num_);
    const st = db.statusRemessa(r);
    const s = db.remessaStats(r);
    const body = clear(m.body);
    body.append(h('p', {}, statusChip(db.STATUS_REMESSA, st)));

    if (st === 'rejeitada') {
      const btn = h('button', { type: 'button', class: 'btn btn-primary btn-sm' }, icon('atualizar'), 'Reprocessar remessa');
      btn.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: `Reprocessar a remessa ${r.num}?`,
          text: 'Use quando a companhia já mandou o arquivo corrigido. O processamento leva alguns segundos e você recebe um aviso quando terminar.',
          confirm: 'Reprocessar', opener: btn,
        });
        if (!ok) return;
        db.reprocessarRemessa(r.num);
        toast({ title: `Remessa ${r.num} em reprocessamento`, tone: 'info' });
      });
      body.append(notice('bad', h('strong', { text: 'O arquivo foi rejeitado inteiro. ' }), r.motivo, h('p', { class: 'small' }, 'Peça o arquivo corrigido à companhia e reprocesse.'), btn));
    }
    if (st === 'processando') {
      body.append(notice('info', h('strong', { text: 'Em processamento. ' }), 'Os movimentos aparecem aqui assim que a validação terminar.',
        h('div', { class: 'progress' }, h('div', { class: 'progress-track' }, h('div', { class: 'progress-fill indeterminate' })))));
    }

    body.append(
      h('h3', { class: 'section-title', text: 'Arquivo' }),
      h('dl', { class: 'desc-list' },
        h('dt', { text: 'Companhia' }), h('dd', { text: db.ciaLabel(r.cia) }),
        h('dt', { text: 'Arquivo' }), h('dd', { class: 'code', text: r.arquivo }),
        h('dt', { text: 'Recebida em' }), h('dd', { text: dateTimeSec(r.recebida) }),
        h('dt', { text: 'Processada em' }), h('dd', { text: r.processada ? dateTimeSec(r.processada) : '—' })),
    );

    if (s.total) {
      body.append(
        h('h3', { class: 'section-title', text: 'Movimentos' }),
        h('dl', { class: 'desc-grid' },
          stat('Recebidos', num(s.total)),
          stat('Rejeitados na carga', `${num(s.rejCarga)} (${pct(s.taxa)})`),
          stat('Pendentes agora', num(s.pendentes)),
          stat('Em reenvio', num(s.emReenvio)),
          stat('Comissão total', money(s.valor)),
          stat('Comissão retida', money(s.retido))),
      );
      const porErro = new Map();
      for (const mv of db.idx().byRemessa.get(r.num) || []) {
        if (!mv.rej0) continue;
        for (const e of mv.erros) {
          const cur = porErro.get(e.cod) || { total: 0, pend: 0 };
          cur.total++;
          if (!e.ok) cur.pend++;
          porErro.set(e.cod, cur);
        }
      }
      if (porErro.size) {
        body.append(h('h3', { class: 'section-title', text: 'Rejeições por erro' }),
          h('div', { class: 'table-scroll', role: 'region', 'aria-label': 'Rejeições por erro', tabindex: '0' },
            h('table', { class: 'data' },
              h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'Erro' }), h('th', { scope: 'col', class: 'col-num', text: 'Ocorrências' }), h('th', { scope: 'col', class: 'col-num', text: 'Pendentes' }))),
              h('tbody', {}, [...porErro.entries()].sort((a, b) => b[1].total - a[1].total).map(([cod, v]) => h('tr', {},
                h('th', { scope: 'row' }, erroTag(cod), ' ', db.ERROS[cod].titulo),
                h('td', { class: 'col-num', text: num(v.total) }),
                h('td', { class: 'col-num', text: num(v.pend) })))))));
      }
    }

    body.append(h('h3', { class: 'section-title', text: 'Linha do tempo' }),
      h('ol', { class: 'timeline' }, [...r.eventos].reverse().map((ev) => h('li', { class: 'ev-info' },
        h('span', { class: 'dot' }, icon('relogio')), h('strong', { text: ev.txt }), h('span', { class: 'when', text: dateTime(ev.dt) })))));
  };
  draw();
  if (!m.foot) {
    const foot = h('div', { class: 'modal-foot' },
      h('a', { class: 'btn', href: `movimentos.html?remessa=${rem.num}` }, icon('movimentos'), 'Ver movimentos'),
      h('a', { class: 'btn btn-primary', href: `erros.html?remessa=${rem.num}` }, icon('erros'), 'Ver erros'));
    m.dlg.append(foot);
  }
  const onData = () => { if (m.dlg.open) draw(); };
  window.addEventListener('cicm:dados', onData);
  m.dlg.addEventListener('close', () => window.removeEventListener('cicm:dados', onData));
}

function stat(label, value) {
  return h('div', {}, h('dt', { text: label }), h('dd', { class: 'num', text: value }));
}

/* ------------------------------------------------------- Gaveta do reenvio */

export function progressBar(rv) {
  const p = db.progressoReenvio(rv);
  const fill = h('div', { class: 'progress-fill' });
  fill.style.width = `${Math.round(p * 100)}%`;
  return h('div', { class: 'progress' },
    h('div', { class: 'progress-track', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(p * 100)), 'aria-label': `Progresso do reenvio ${rv.protocolo}` }, fill),
    h('span', { class: 'small num', text: `${Math.round(p * 100)}%` }));
}

export function reenvioDrawer(prot, opener) {
  const rv0 = db.reenvio(prot);
  if (!rv0) return;
  const m = modal({ title: `Reenvio ${rv0.protocolo}`, desc: `${db.MODOS_REENVIO[rv0.modo]} · ${plural(rv0.guids.length, 'movimento', 'movimentos')}`, drawer: true, opener, body: h('div') });
  const foot = h('div', { class: 'modal-foot' });
  m.dlg.append(foot);
  let lastStatus = null;

  const draw = (soProgresso) => {
    const rv = db.reenvio(prot);
    if (soProgresso && rv.status === 'processando' && lastStatus === 'processando') {
      const bar = m.body.querySelector('.progress');
      bar?.replaceWith(progressBar(rv));
      return;
    }
    lastStatus = rv.status;
    const r = db.resumoReenvio(rv);
    const body = clear(m.body);
    body.append(h('p', {}, statusChip(db.STATUS_REENVIO, rv.status)));
    if (rv.status === 'processando') {
      body.append(notice('info', h('strong', { text: 'Revalidando os movimentos. ' }), 'Pode continuar trabalhando: você recebe um aviso quando terminar.', progressBar(rv)));
    }
    body.append(
      h('dl', { class: 'desc-list' },
        h('dt', { text: 'Pedido em' }), h('dd', { text: dateTimeSec(rv.criado) }),
        h('dt', { text: 'Concluído em' }), h('dd', { text: rv.concluido ? dateTimeSec(rv.concluido) : '—' }),
        h('dt', { text: 'Por' }), h('dd', { text: rv.por }),
        h('dt', { text: 'Tipo' }), h('dd', { text: db.MODOS_REENVIO[rv.modo] }),
        rv.filtro ? [h('dt', { text: 'Filtro' }), h('dd', { text: rv.filtro })] : null),
      h('h3', { class: 'section-title', text: 'Resultado' }),
      h('dl', { class: 'desc-grid' },
        stat('Movimentos', num(r.total)), stat('Integrados', num(r.integrados)), stat('Rejeitados de novo', num(r.rejeitados))),
      h('h3', { class: 'section-title', text: 'Movimentos' }),
      h('div', { class: 'table-scroll', role: 'region', 'aria-label': 'Movimentos do reenvio', tabindex: '0' },
        h('table', { class: 'data' },
          h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'GUID' }), h('th', { scope: 'col', text: 'Resultado' }), h('th', { scope: 'col', text: 'Situação hoje' }))),
          h('tbody', {}, rv.guids.map((g) => {
            const mv = db.mov(g);
            const res = rv.res[g];
            return h('tr', {},
              h('th', { scope: 'row' }, mv ? guidLink(mv) : h('span', { class: 'code', text: g })),
              h('td', {}, res === 'integrado' ? h('span', { class: 'status status-ok' }, icon('ok'), 'Integrado')
                : res === 'rejeitado' ? h('span', { class: 'status status-bad' }, icon('x-circulo'), 'Rejeitado')
                  : h('span', { class: 'status status-info status-progress' }, icon('atualizar'), 'Aguardando')),
              h('td', {}, mv ? statusChip(db.STATUS_MOV, mv.status) : '—'));
          })))));

    clear(foot);
    const aindaRej = rv.guids.map(db.mov).filter((mv) => mv && mv.status === 'rejeitado');
    if (rv.status !== 'processando' && aindaRej.length) {
      const b = h('button', { type: 'button', class: 'btn btn-primary' }, icon('reenviar'), `Conferir os ${num(aindaRej.length)} rejeitados`);
      b.addEventListener('click', () => {
        handoff.put('reenvio', { modo: 'lista', guids: aindaRej.map((x) => x.guid) });
        location.href = 'reenvio.html';
      });
      foot.append(h('a', { class: 'btn', href: `erros.html?protocolo=${rv.protocolo}` }, icon('erros'), 'Ver os erros'), b);
    } else {
      foot.append(h('button', { type: 'button', class: 'btn', text: 'Fechar', on: { click: () => m.close() } }));
    }
  };
  draw();
  const onTick = () => { if (m.dlg.open) draw(true); };
  const onData = () => { if (m.dlg.open) draw(); };
  window.addEventListener('cicm:tick', onTick);
  window.addEventListener('cicm:dados', onData);
  m.dlg.addEventListener('close', () => {
    window.removeEventListener('cicm:tick', onTick);
    window.removeEventListener('cicm:dados', onData);
  });
}

export const quando = (iso) => h('span', { title: dateTimeSec(iso) }, relative(iso));

export { copyBtn };
