import { h, $, clear } from '../dom.js';
import * as f from '../format.js';
import * as db from '../db.js';
import { boot, filtros, announce, emptyState } from '../ui.js';
import { enhance, validateForm, values, fill, clearErrors } from '../form.js';
import { dataTable } from '../table.js';
import { ciaOptions, periodoRule, noPeriodo, erroTag, tipoChip } from '../views.js';

boot('relatorio');

const form = $('#filtros');
enhance(form);
ciaOptions($('#f-cia'));

const padrao = () => ({ ini: f.isoDate(f.addDays(new Date(), -13)), fim: f.isoDate(new Date()), cia: '', remessa: '' });
let criterio = null;

const bar = (valor, max, ok = false) => {
  const fill_ = h('div', { class: ['bar-fill', ok ? 'ok' : ''] });
  fill_.style.width = `${max ? Math.max(2, (valor / max) * 100) : 0}%`;
  return h('div', { class: 'bar-track', 'aria-hidden': 'true' }, fill_);
};

const table = dataTable({
  caption: 'Rejeições por código de erro',
  rowKey: (r) => r.cod,
  exportName: 'cicm-relatorio-rejeicoes',
  pageSize: 25,
  sort: { key: 'n', dir: 'desc' },
  emptyTitle: 'Nenhuma rejeição no período',
  emptyText: 'Todos os movimentos do período passaram na validação.',
  columns: [
    { key: 'cod', label: 'Código', rowHeader: true, render: (r) => erroTag(r.cod) },
    { key: 'titulo', label: 'Erro', cls: 'wrap', value: (r) => db.ERROS[r.cod].titulo, render: (r) => h('span', {}, db.ERROS[r.cod].titulo, h('br'), h('span', { class: 'code small muted', text: db.ERROS[r.cod].campo })) },
    { key: 'tipo', label: 'Como resolver', value: (r) => db.TIPO_ERRO[db.ERROS[r.cod].tipo], render: (r) => tipoChip(r.cod) },
    {
      key: 'n', label: 'Ocorrências', value: (r) => r.n, csv: (r) => r.n,
      render: (r) => h('div', { class: 'bar-cell' }, bar(r.n, r.max), h('span', { class: 'num', text: f.num(r.n) }), h('span', { class: 'muted small num', text: f.pct(r.share) })),
    },
    { key: 'resolvidos', label: 'Resolvidos', num: true, render: (r) => f.num(r.resolvidos) },
    { key: 'pendentes', label: 'Pendentes', num: true, render: (r) => f.num(r.pendentes) },
    { key: 'retido', label: 'Comissão retida', num: true, render: (r) => f.money(r.retido), csv: (r) => r.retido.toFixed(2).replace('.', ',') },
  ],
});
$('#tabela').append(table.el);

function gerar(c) {
  criterio = c;
  const movs = db.getDb().movs.filter((m) => noPeriodo(m.dt, c.ini, c.fim) && (!c.cia || m.cia === c.cia) && (!c.remessa || m.remessa === c.remessa));
  const rej = movs.filter((m) => m.rej0);
  const pend = rej.filter((m) => m.status === 'rejeitado' || m.status === 'processando');
  const resolvidos = rej.filter((m) => m.status === 'integrado').length;
  const retido = pend.reduce((s, m) => s + m.comissao, 0);

  $('#periodo').textContent = `${f.date(c.ini)} a ${f.date(c.fim)}${c.cia ? ` · ${db.ciaLabel(c.cia)}` : ' · todas as companhias'}${c.remessa ? ` · remessa ${c.remessa}` : ''}`;
  const item = (label, value) => h('div', {}, h('dt', { text: label }), h('dd', { text: value }));
  clear($('#totais')).append(
    item('Movimentos recebidos', f.num(movs.length)),
    item('Rejeitados na carga', f.num(rej.length)),
    item('Taxa de rejeição', f.pct(movs.length ? (rej.length / movs.length) * 100 : 0)),
    item('Integrados depois', f.num(resolvidos)),
    item('Ainda pendentes', f.num(pend.length)),
    item('Comissão retida', f.money(retido)));

  /* Por código de erro */
  const porErro = new Map();
  let totalErros = 0;
  for (const m of rej) {
    for (const e of m.erros) {
      const r = porErro.get(e.cod) || { cod: e.cod, n: 0, resolvidos: 0, pendentes: 0, retido: 0 };
      r.n++;
      totalErros++;
      if (e.ok) r.resolvidos++; else { r.pendentes++; r.retido += m.comissao; }
      porErro.set(e.cod, r);
    }
  }
  const linhas = [...porErro.values()];
  const max = Math.max(0, ...linhas.map((r) => r.n));
  linhas.forEach((r) => { r.max = max; r.share = totalErros ? (r.n / totalErros) * 100 : 0; });
  table.update(linhas, { resetPage: true });

  /* Por companhia */
  const porCia = db.CIAS.filter((x) => !c.cia || x.cod === c.cia).map((x) => {
    const l = movs.filter((m) => m.cia === x.cod);
    const rj = l.filter((m) => m.rej0).length;
    return { cia: x, total: l.length, rej: rj, taxa: l.length ? (rj / l.length) * 100 : 0, pend: l.filter((m) => m.status === 'rejeitado').length };
  });
  const maxTaxa = Math.max(0, ...porCia.map((x) => x.taxa));
  clear($('#por-cia')).append(movs.length ? miniTabela('Rejeição por companhia', [['Companhia'], ['Recebidos', true], ['Taxa de rejeição'], ['Pendentes', true]],
    porCia.map((x) => [
      h('th', { scope: 'row', text: db.ciaLabel(x.cia.cod) }),
      h('td', { class: 'col-num', text: f.num(x.total) }),
      h('td', {}, h('div', { class: 'bar-cell' }, bar(x.taxa, maxTaxa), h('span', { class: 'num', text: f.pct(x.taxa) }))),
      h('td', { class: 'col-num', text: f.num(x.pend) }),
    ])) : emptyState('Sem movimentos no período', ''));

  /* Por corretor */
  const porCorretor = new Map();
  for (const m of rej) porCorretor.set(m.corretor0, (porCorretor.get(m.corretor0) || 0) + 1);
  const top = [...porCorretor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxC = top[0]?.[1] || 0;
  clear($('#por-corretor')).append(top.length ? miniTabela('Corretores com mais rejeições', [['Corretor'], ['Rejeitados'], ['Situação do corretor']],
    top.map(([id, n]) => {
      const cor = db.corretor(id);
      return [
        h('th', { scope: 'row', text: cor.nome }),
        h('td', {}, h('div', { class: 'bar-cell' }, bar(n, maxC), h('span', { class: 'num', text: f.num(n) }))),
        h('td', {}, cor.ativo ? h('span', { class: 'status status-ok', text: 'Ativo' }) : h('span', { class: 'status status-bad', text: 'Inativo' })),
      ];
    })) : emptyState('Nenhuma rejeição no período', ''));

  return linhas;
}

/* cabecalhos: [texto, numérico?] */
function miniTabela(caption, cabecalhos, linhas) {
  return h('div', { class: 'table-scroll', role: 'region', 'aria-label': `${caption}, tabela`, tabindex: '0' },
    h('table', { class: 'data' },
      h('caption', { class: 'visually-hidden', text: caption }),
      h('thead', {}, h('tr', {}, cabecalhos.map(([t, numerico]) => h('th', { scope: 'col', class: numerico ? 'col-num' : '', text: t })))),
      h('tbody', {}, linhas.map((cells) => h('tr', {}, cells)))));
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validateForm(form, () => periodoRule($('#f-ini'), $('#f-fim'), 62))) return;
  const c = values(form);
  filtros.set('relatorio', c);
  const l = gerar(c);
  announce(`Relatório gerado: ${f.plural(l.length, 'código de erro', 'códigos de erro')}`);
});

form.addEventListener('reset', (e) => {
  e.preventDefault();
  clearErrors(form);
  fill(form, padrao());
  filtros.set('relatorio', null);
  gerar(padrao());
  announce('Filtros limpos');
});

const inicial = filtros.get('relatorio') || padrao();
fill(form, inicial);
gerar(inicial);
window.addEventListener('cicm:dados', () => { if (criterio) gerar(criterio); });
