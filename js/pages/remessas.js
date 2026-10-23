import { h, $, clear, param } from '../dom.js';
import * as f from '../format.js';
import * as db from '../db.js';
import { boot, statusChip, filtros, announce } from '../ui.js';
import { enhance, validateForm, values, fill, clearErrors } from '../form.js';
import { dataTable } from '../table.js';
import { ciaOptions, periodoRule, noPeriodo, remessaDrawer } from '../views.js';

boot('remessas');

const form = $('#filtros');
enhance(form);
ciaOptions($('#f-cia'));

const padrao = () => ({ ini: f.isoDate(f.addDays(new Date(), -6)), fim: f.isoDate(new Date()), cia: '', num: '', sit: '' });

let criterio = null;

const table = dataTable({
  caption: 'Remessas do período',
  rowKey: (r) => r.num,
  exportName: 'cicm-remessas',
  sort: { key: 'recebida', dir: 'desc' },
  emptyTitle: 'Nenhuma remessa no período',
  emptyText: 'Amplie o período ou tire o filtro de companhia ou de situação.',
  columns: [
    {
      key: 'num', label: 'Remessa', rowHeader: true, value: (r) => r.num,
      render: (r) => {
        const b = h('button', { type: 'button', class: 'btn btn-ghost btn-sm code', 'aria-label': `Remessa ${r.num}, abrir detalhes` }, r.num);
        b.addEventListener('click', () => remessaDrawer(r.num, b));
        return b;
      },
    },
    { key: 'cia', label: 'Companhia', value: (r) => db.ciaLabel(r.cia) },
    { key: 'recebida', label: 'Recebida em', value: (r) => r.recebida, render: (r) => f.dateTime(r.recebida), csv: (r) => f.dateTimeSec(r.recebida) },
    { key: 'arquivo', label: 'Arquivo', render: (r) => h('span', { class: 'code', text: r.arquivo }) },
    { key: 'total', label: 'Movimentos', num: true, value: (r) => r.s.total, render: (r) => f.num(r.s.total) },
    { key: 'rej', label: 'Rejeitados', num: true, value: (r) => r.s.rejCarga, render: (r) => (r.s.total ? `${f.num(r.s.rejCarga)} (${f.pct(r.s.taxa)})` : '—'), csv: (r) => r.s.rejCarga },
    { key: 'pend', label: 'Pendentes', num: true, value: (r) => r.s.pendentes + r.s.emReenvio, render: (r) => f.num(r.s.pendentes + r.s.emReenvio) },
    { key: 'valor', label: 'Comissão', num: true, value: (r) => r.s.valor, render: (r) => f.money(r.s.valor), csv: (r) => r.s.valor.toFixed(2).replace('.', ',') },
    { key: 'sit', label: 'Situação', value: (r) => db.STATUS_REMESSA[r.st].label, render: (r) => statusChip(db.STATUS_REMESSA, r.st) },
  ],
});
$('#tabela').append(table.el);

function consultar(c, opts = {}) {
  criterio = c;
  const rows = db.getDb().remessas
    .filter((r) => noPeriodo(r.recebida, c.ini, c.fim))
    .filter((r) => !c.cia || r.cia === c.cia)
    .filter((r) => !c.num || r.num.includes(c.num))
    .map((r) => ({ ...r, s: db.remessaStats(r), st: db.statusRemessa(r) }))
    .filter((r) => !c.sit || r.st === c.sit);
  table.update(rows, { resetPage: !opts.keepPage, highlight: opts.highlight });
  totais(rows);
  $('#lista-desc').textContent = `${f.date(c.ini)} a ${f.date(c.fim)}${c.cia ? ` · ${db.ciaLabel(c.cia)}` : ''}. Abra uma remessa para ver as rejeições por erro e a linha do tempo.`;
  return rows;
}

function totais(rows) {
  const t = rows.reduce((a, r) => {
    a.total += r.s.total; a.rej += r.s.rejCarga; a.pend += r.s.pendentes + r.s.emReenvio; a.valor += r.s.valor; a.retido += r.s.retido;
    return a;
  }, { total: 0, rej: 0, pend: 0, valor: 0, retido: 0 });
  const item = (label, value) => h('div', {}, h('dt', { text: label }), h('dd', { text: value }));
  const dl = clear($('#totais'));
  dl.append(
    item('Remessas', f.num(rows.length)),
    item('Movimentos', f.num(t.total)),
    item('Rejeitados na carga', `${f.num(t.rej)} (${f.pct(t.total ? (t.rej / t.total) * 100 : 0)})`),
    item('Ainda pendentes', f.num(t.pend)),
    item('Comissão do período', f.money(t.valor)),
    item('Comissão retida', f.money(t.retido)));
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validateForm(form, () => periodoRule($('#f-ini'), $('#f-fim')))) return;
  const c = values(form);
  filtros.set('remessas', c);
  const rows = consultar(c);
  announce(`${f.plural(rows.length, 'remessa encontrada', 'remessas encontradas')}`);
});

form.addEventListener('reset', (e) => {
  e.preventDefault();
  clearErrors(form);
  fill(form, padrao());
  filtros.set('remessas', null);
  consultar(padrao());
  announce('Filtros limpos');
});

/* Início: filtros salvos, ou a remessa pedida na URL */
const pedida = param('remessa') && db.remessa(param('remessa'));
let inicial = filtros.get('remessas') || padrao();
if (pedida) {
  const dia = f.isoDate(new Date(pedida.recebida));
  if (!noPeriodo(pedida.recebida, inicial.ini, inicial.fim)) inicial = { ...padrao(), ini: dia < padrao().ini ? dia : padrao().ini };
  inicial = { ...inicial, cia: '', num: '', sit: '' };
}
fill(form, inicial);
consultar(inicial, { highlight: pedida ? pedida.num : null });
if (pedida) remessaDrawer(pedida.num, $('#conteudo'));

window.addEventListener('cicm:dados', () => { if (criterio) consultar(criterio, { keepPage: true }); });
