import { h, icon, $, $$, param } from '../dom.js';
import * as f from '../format.js';
import * as db from '../db.js';
import { boot, statusChip, filtros, announce, handoff } from '../ui.js';
import { enhance, validateForm, values, fill, clearErrors, options } from '../form.js';
import { dataTable } from '../table.js';
import { ciaOptions, periodoRule, noPeriodo, guidLink } from '../views.js';

boot('movimentos');

const form = $('#filtros');
enhance(form);

ciaOptions($('#c-cia'), 'Escolha a companhia');
ciaOptions($('#s-cia'));
options($('#c-suc'), db.SUCURSAIS.map((s) => ({ value: s.cod, label: `${s.cod} · ${s.nome}` })), { placeholder: 'Escolha a sucursal' });
options($('#s-nat'), Object.entries(db.NATUREZAS).map(([cod, nome]) => ({ value: cod, label: `${cod} · ${nome}` })), { placeholder: 'Todas' });
options($('#s-corretor'), db.CORRETORES.map((c) => ({ value: c.id, label: `${c.nome}${c.ativo ? '' : ' (inativo)'}` })), { placeholder: 'Todos' });

function ramos(cia, value) {
  const lista = db.RAMOS.filter((r) => r.cia === cia).map((r) => ({ value: r.cod, label: `${r.cod} · ${r.nome}` }));
  options($('#c-ramo'), lista, { placeholder: cia ? 'Escolha o ramo' : 'Escolha a companhia primeiro', value });
}
ramos('');
$('#c-cia').addEventListener('change', (e) => ramos(e.target.value));

const tipo = () => form.querySelector('input[name="tipo"]:checked').value;
function mostrarTipo() {
  $('#grupo-caso').hidden = tipo() !== 'caso';
  $('#grupo-sintetica').hidden = tipo() !== 'sintetica';
  $('#exemplo').hidden = tipo() !== 'caso';
}
$$('input[name="tipo"]', form).forEach((r) => r.addEventListener('change', () => { clearErrors(form); mostrarTipo(); }));

const padrao = () => ({
  tipo: 'sintetica', ini: f.isoDate(f.addDays(new Date(), -2)), fim: f.isoDate(new Date()),
  scia: '', status: '', nat: '', corretor: '', remessa: '', cia: '', suc: '', ramo: '', apolice: '', endosso: '', parcela: '',
});

let criterio = null;

const table = dataTable({
  caption: 'Movimentos encontrados',
  rowKey: (m) => m.guid,
  rowLabel: (m) => `movimento ${m.guid}`,
  selectable: true,
  canSelect: (m) => m.status === 'rejeitado',
  exportName: 'cicm-movimentos',
  sort: { key: 'dt', dir: 'desc' },
  emptyTitle: 'Nenhum movimento encontrado',
  emptyText: 'Confira os dados do caso ou amplie o período da consulta sintética.',
  bulk: (guids) => {
    const b = h('button', { type: 'button', class: 'btn btn-primary btn-sm' }, icon('reenviar'), `Reenviar ${f.num(guids.length)}`);
    b.addEventListener('click', () => { handoff.put('reenvio', { modo: 'lista', guids }); location.href = 'reenvio.html'; });
    return b;
  },
  columns: [
    { key: 'guid', label: 'GUID', rowHeader: true, render: guidLink },
    { key: 'dt', label: 'Data do movimento', value: (m) => m.dt, render: (m) => f.dateTimeSec(m.dt), csv: (m) => f.dateTimeSec(m.dt) },
    { key: 'cia', label: 'CIA', value: (m) => m.cia, render: (m) => h('span', { class: 'code', title: db.cia(m.cia).nome, text: m.cia }) },
    { key: 'suc', label: 'Sucursal', render: (m) => h('span', { class: 'code', title: db.sucursal(m.suc).nome, text: m.suc }) },
    { key: 'ramo', label: 'Ramo', render: (m) => h('span', { class: 'code', title: db.ramo(m.ramo).nome, text: m.ramo }) },
    { key: 'apolice', label: 'Apólice', render: (m) => h('span', { class: 'code', text: m.apolice }) },
    { key: 'endosso', label: 'End.', num: true },
    { key: 'parcela', label: 'Parc.', num: true },
    { key: 'nat', label: 'Natureza', render: (m) => h('span', { title: db.natureza(m.nat) }, h('span', { class: 'code', text: m.nat })) },
    { key: 'comissao', label: 'Comissão', num: true, render: (m) => f.money(m.comissao), csv: (m) => m.comissao.toFixed(2).replace('.', ',') },
    { key: 'status', label: 'Situação', value: (m) => db.STATUS_MOV[m.status].label, render: (m) => statusChip(db.STATUS_MOV, m.status) },
  ],
});
$('#tabela').append(table.el);

function consultar(c, opts = {}) {
  criterio = c;
  let rows;
  if (c.tipo === 'caso') {
    rows = db.getDb().movs.filter((m) => m.cia === c.cia && m.suc === c.suc && m.ramo === c.ramo && m.apolice === c.apolice
      && (!c.endosso || m.endosso === Number(c.endosso)) && (!c.parcela || m.parcela === Number(c.parcela)));
    $('#lista-desc').textContent = `Apólice ${c.apolice} · ${db.ciaLabel(c.cia)} · sucursal ${c.suc} · ramo ${c.ramo}${c.endosso ? ` · endosso ${c.endosso}` : ''}${c.parcela ? ` · parcela ${c.parcela}` : ''}`;
  } else {
    rows = db.getDb().movs
      .filter((m) => noPeriodo(m.dt, c.ini, c.fim))
      .filter((m) => (!c.scia || m.cia === c.scia) && (!c.status || m.status === c.status) && (!c.nat || m.nat.startsWith(c.nat))
        && (!c.corretor || m.corretor === c.corretor) && (!c.remessa || m.remessa === c.remessa));
    $('#lista-desc').textContent = `${f.date(c.ini)} a ${f.date(c.fim)}${c.scia ? ` · ${db.ciaLabel(c.scia)}` : ''}${c.status ? ` · ${db.STATUS_MOV[c.status].label.toLowerCase()}` : ''}${c.remessa ? ` · remessa ${c.remessa}` : ''}. Marque os rejeitados para reenviar em lote.`;
  }
  table.update(rows, { resetPage: !opts.keepPage });
  return rows;
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const extra = () => {
    if (tipo() !== 'caso') return periodoRule($('#s-ini'), $('#s-fim'));
    const ap = $('#c-apolice');
    return ap.value && ap.value.length !== 10 ? [{ el: ap, msg: `A apólice tem 10 números. Esta tem ${ap.value.length}.` }] : [];
  };
  if (!validateForm(form, extra)) return;
  const c = values(form);
  filtros.set('movimentos', c);
  const rows = consultar(c);
  announce(f.plural(rows.length, 'movimento encontrado', 'movimentos encontrados'));
});

form.addEventListener('reset', (e) => {
  e.preventDefault();
  clearErrors(form);
  aplicar(padrao());
  filtros.set('movimentos', null);
  consultar(padrao());
  announce('Filtros limpos');
});

$('#exemplo').addEventListener('click', () => {
  const m = db.getDb().movs.find((x) => x.status === 'rejeitado' && x.erros.some((e) => db.ERROS[e.cod].tipo === 'campo'));
  if (!m) return;
  clearErrors(form);
  $('#c-cia').value = m.cia;
  ramos(m.cia, m.ramo);
  fill(form, { suc: m.suc, apolice: m.apolice, endosso: '', parcela: String(m.parcela) });
  announce(`Preenchido com a apólice ${m.apolice}, parcela ${m.parcela}. Agora é só consultar.`);
  $('#c-apolice').focus();
});

function aplicar(c) {
  fill(form, c);
  ramos(c.cia, c.ramo);
  mostrarTipo();
}

/* Início */
let inicial = filtros.get('movimentos') || padrao();
const pedidaRemessa = param('remessa') && db.remessa(param('remessa'));
if (pedidaRemessa) {
  const dia = f.isoDate(new Date(pedidaRemessa.recebida));
  inicial = { ...padrao(), ini: dia, fim: f.isoDate(new Date()), remessa: pedidaRemessa.num };
}
if (param('status') && db.STATUS_MOV[param('status')]) inicial = { ...padrao(), status: param('status') };
aplicar(inicial);
if (inicial.tipo === 'sintetica' || (inicial.cia && inicial.apolice)) consultar(inicial);

window.addEventListener('cicm:dados', () => { if (criterio) consultar(criterio, { keepPage: true }); });
