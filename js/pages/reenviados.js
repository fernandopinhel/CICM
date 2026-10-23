import { h, $, param } from '../dom.js';
import * as f from '../format.js';
import * as db from '../db.js';
import { boot, statusChip, filtros, announce, notice } from '../ui.js';
import { enhance, validateForm, values, fill, clearErrors } from '../form.js';
import { dataTable } from '../table.js';
import { reenvioDrawer, progressBar } from '../views.js';

boot('reenviados');

const form = $('#filtros');
enhance(form);

const padrao = () => ({ data: '', status: '', busca: '' });
let criterio = padrao();

const table = dataTable({
  caption: 'Reenvios',
  rowKey: (r) => r.protocolo,
  exportName: 'cicm-reenviados',
  sort: { key: 'criado', dir: 'desc' },
  emptyTitle: 'Nenhum reenvio encontrado',
  emptyText: 'Tire o filtro de data ou de situação, ou confira o protocolo.',
  columns: [
    {
      key: 'protocolo', label: 'Protocolo', rowHeader: true,
      render: (r) => {
        const b = h('button', { type: 'button', class: 'btn btn-ghost btn-sm code', 'aria-label': `Protocolo ${r.protocolo}, abrir resultado` }, r.protocolo);
        b.addEventListener('click', () => reenvioDrawer(r.protocolo, b));
        return b;
      },
    },
    { key: 'criado', label: 'Pedido em', render: (r) => f.dateTime(r.criado), csv: (r) => f.dateTimeSec(r.criado) },
    { key: 'por', label: 'Por' },
    { key: 'modo', label: 'Tipo', value: (r) => db.MODOS_REENVIO[r.modo] },
    { key: 'total', label: 'Movimentos', num: true, value: (r) => r.guids.length, render: (r) => f.num(r.guids.length) },
    { key: 'integ', label: 'Integrados', num: true, value: (r) => db.resumoReenvio(r).integrados, render: (r) => (r.status === 'processando' ? '—' : f.num(db.resumoReenvio(r).integrados)) },
    { key: 'rej', label: 'Rejeitados', num: true, value: (r) => db.resumoReenvio(r).rejeitados, render: (r) => (r.status === 'processando' ? '—' : f.num(db.resumoReenvio(r).rejeitados)) },
    {
      key: 'status', label: 'Situação', value: (r) => db.STATUS_REENVIO[r.status].label,
      render: (r) => (r.status === 'processando' ? progressBar(r) : statusChip(db.STATUS_REENVIO, r.status)),
    },
  ],
});
$('#tabela').append(table.el);

function consultar(c, opts = {}) {
  criterio = c;
  const q = (c.busca || '').trim().toUpperCase();
  const rows = db.getDb().reenvios.filter((r) => (!c.data || f.isoDate(new Date(r.criado)) === c.data)
    && (!c.status || r.status === c.status)
    && (!q || r.protocolo.includes(q) || r.guids.includes(q)));
  table.update(rows, { resetPage: !opts.keepPage, highlight: opts.highlight });
  $('#lista-desc').textContent = q && /^F/.test(q) ? `Reenvios em que o movimento ${q} entrou.` : 'Do mais recente para o mais antigo. Abra um protocolo para ver o resultado de cada movimento.';
  return rows;
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const extra = () => {
    const d = $('#f-data');
    return d.value && d.value > f.isoDate(new Date()) ? [{ el: d, msg: 'A data do reenvio não pode ser depois de hoje.' }] : [];
  };
  if (!validateForm(form, extra)) return;
  const c = values(form);
  filtros.set('reenviados', c);
  const rows = consultar(c);
  announce(f.plural(rows.length, 'reenvio encontrado', 'reenvios encontrados'));
});

form.addEventListener('reset', (e) => {
  e.preventDefault();
  clearErrors(form);
  fill(form, padrao());
  filtros.set('reenviados', null);
  consultar(padrao());
  announce('Filtros limpos');
});

/* Início */
const prot = param('protocolo') && db.reenvio(param('protocolo'));
const inicial = prot ? padrao() : filtros.get('reenviados') || padrao();
fill(form, inicial);
consultar(inicial, { highlight: prot ? prot.protocolo : null });
if (prot && param('novo')) {
  $('#aviso-novo').append(notice('ok', h('strong', { text: `Reenvio ${prot.protocolo} criado. ` }),
    `${f.plural(prot.guids.length, 'movimento está', 'movimentos estão')} passando pela validação de novo. Você recebe um aviso quando terminar.`));
}
if (prot) reenvioDrawer(prot.protocolo, $('#conteudo'));

/* Progresso ao vivo, sem perder o foco */
window.addEventListener('cicm:tick', () => {
  if (db.getDb().reenvios.some((r) => r.status === 'processando')) table.refresh();
});
window.addEventListener('cicm:dados', () => consultar(criterio, { keepPage: true }));
