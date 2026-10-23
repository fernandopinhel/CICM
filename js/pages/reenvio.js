import { h, icon, $, $$, clear, param } from '../dom.js';
import * as f from '../format.js';
import * as db from '../db.js';
import { boot, announce, handoff, confirmDialog, statusChip } from '../ui.js';
import { enhance, validateForm, values, fill, clearErrors, GUID_RE } from '../form.js';
import { dataTable } from '../table.js';
import { ciaOptions, erroOptions, periodoRule, noPeriodo, guidLink, erroTag, previsaoChip } from '../views.js';

boot('reenvio');

const LIMITE = 500;
const form = $('#selecao');
enhance(form);
ciaOptions($('#s-cia'));
erroOptions($('#s-codigo'));

const modo = () => form.querySelector('input[name="modo"]:checked').value;
function mostrarModo() {
  for (const m of ['guid', 'lista', 'sintetica']) $(`#grupo-${m}`).hidden = modo() !== m;
}
$$('input[name="modo"]', form).forEach((r) => r.addEventListener('change', () => { clearErrors(form); mostrarModo(); }));

const padrao = () => ({ modo: 'guid', guid: '', lista: '', ini: f.isoDate(f.addDays(new Date(), -6)), fim: f.isoDate(new Date()), cia: '', codigo: '' });

let conferido = { modo: 'guid', filtro: '', rows: [] };

const table = dataTable({
  caption: 'Movimentos a reenviar',
  rowKey: (r) => r.guid,
  rowLabel: (r) => `movimento ${r.guid}`,
  selectable: true,
  canSelect: (r) => r.eleg.ok,
  pageSize: 25,
  exportName: 'cicm-conferencia-reenvio',
  emptyTitle: 'Nada para conferir',
  emptyText: 'Nenhum movimento rejeitado com esses critérios.',
  onSelectionChange: () => atualizarRodape(),
  columns: [
    { key: 'guid', label: 'GUID', rowHeader: true, render: (r) => (r.m ? guidLink(r.m) : h('span', { class: 'code', text: r.guid })) },
    { key: 'apolice', label: 'Apólice', value: (r) => r.m?.apolice ?? '', render: (r) => (r.m ? h('span', { class: 'code', text: `${r.m.apolice} / ${r.m.parcela}` }) : '—') },
    { key: 'cia', label: 'CIA', value: (r) => r.m?.cia ?? '', render: (r) => (r.m ? h('span', { class: 'code', title: db.cia(r.m.cia).nome, text: r.m.cia }) : '—') },
    {
      key: 'erros', label: 'Erros pendentes', value: (r) => (r.m ? db.errosPendentes(r.m).map((e) => e.cod).join(' ') : ''),
      render: (r) => (r.m ? h('span', {}, db.errosPendentes(r.m).map((e) => [erroTag(e.cod), ' '])) : '—'),
    },
    { key: 'comissao', label: 'Comissão', num: true, value: (r) => r.m?.comissao ?? 0, render: (r) => (r.m ? f.money(r.m.comissao) : '—') },
    {
      key: 'prev', label: 'Se reenviar agora', value: (r) => (r.eleg.ok ? (r.prev.integra ? 'Deve integrar' : r.prev.texto) : r.eleg.motivo),
      render: (r) => (r.eleg.ok ? previsaoChip(r.m) : h('span', { class: 'status' }, icon('proibido'), r.eleg.motivo)),
    },
    { key: 'sit', label: 'Situação', value: (r) => (r.m ? db.STATUS_MOV[r.m.status].label : 'Não encontrado'), render: (r) => (r.m ? statusChip(db.STATUS_MOV, r.m.status) : '—') },
  ],
});
$('#tabela').append(table.el);

const parseLista = (txt) => [...new Set(txt.toUpperCase().split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))];

function conferir(c) {
  let guids = [];
  let filtro = '';
  if (c.modo === 'guid') guids = [c.guid];
  if (c.modo === 'lista') guids = parseLista(c.lista);
  if (c.modo === 'sintetica') {
    guids = db.getDb().movs
      .filter((m) => m.status === 'rejeitado' && noPeriodo(m.dt, c.ini, c.fim) && (!c.cia || m.cia === c.cia)
        && (!c.codigo || db.errosPendentes(m).some((e) => e.cod === c.codigo)) && (!c.so || db.previsao(m).integra))
      .map((m) => m.guid);
    filtro = `${f.date(c.ini)} a ${f.date(c.fim)}${c.cia ? `, CIA ${c.cia}` : ''}${c.codigo ? `, ${c.codigo}` : ''}${c.so ? ', só os que devem integrar' : ''}`;
  }
  const rows = guids.map((g) => {
    if (!GUID_RE.test(g)) return { guid: g, m: null, eleg: { ok: false, motivo: 'Não parece um GUID' }, prev: null };
    const m = db.mov(g);
    return { guid: g, m, eleg: db.elegibilidade(m), prev: m ? db.previsao(m) : null };
  });
  conferido = { modo: c.modo, filtro, rows };

  const elegiveis = rows.filter((r) => r.eleg.ok);
  const vaoIntegrar = elegiveis.filter((r) => r.prev.integra);
  table.update(rows, { resetPage: true, select: elegiveis.map((r) => r.guid) });

  const item = (label, value) => h('div', {}, h('dt', { text: label }), h('dd', { text: value }));
  clear($('#conf-totais')).append(
    item(c.modo === 'sintetica' ? 'Encontrados' : 'Informados', f.num(rows.length)),
    item('Podem ser reenviados', f.num(elegiveis.length)),
    item('Devem integrar', f.num(vaoIntegrar.length)),
    item('Devem voltar rejeitados', f.num(elegiveis.length - vaoIntegrar.length)),
    item('Fora do reenvio', f.num(rows.length - elegiveis.length)));
  $('#conf-desc').textContent = {
    guid: 'Um movimento informado pelo GUID.',
    lista: 'Movimentos da lista colada. Os que não podem ser reenviados aparecem com o motivo.',
    sintetica: `Rejeitados do filtro: ${filtro}.`,
  }[c.modo];
  $('#conferencia').hidden = false;
  atualizarRodape();
  $('#passo2').focus();
  announce(`${f.plural(elegiveis.length, 'movimento pode', 'movimentos podem')} ser reenviados. ${f.num(vaoIntegrar.length)} devem integrar.`);
}

function selecionados() {
  const set = new Set(table.selected());
  return conferido.rows.filter((r) => set.has(r.guid) && r.eleg.ok);
}

function atualizarRodape() {
  const sel = selecionados();
  const falham = sel.filter((r) => !r.prev.integra).length;
  const btn = $('#confirmar');
  btn.disabled = sel.length === 0;
  $('span', btn).textContent = sel.length ? `Reenviar ${f.plural(sel.length, 'movimento', 'movimentos')}` : 'Reenviar';
  $('#conf-hint').textContent = !sel.length
    ? 'Marque ao menos um movimento para reenviar.'
    : falham
      ? `Atenção: ${f.plural(falham, 'dos marcados deve', 'dos marcados devem')} voltar rejeitado${falham > 1 ? 's' : ''}. Desmarque se a companhia ainda não acertou.`
      : 'Todos os marcados devem integrar.';
}

$('#confirmar').addEventListener('click', async (e) => {
  const sel = selecionados();
  if (!sel.length) return;
  const falham = sel.filter((r) => !r.prev.integra).length;
  const total = sel.reduce((s, r) => s + r.m.comissao, 0);
  const ok = await confirmDialog({
    title: `Reenviar ${f.plural(sel.length, 'movimento', 'movimentos')}?`,
    text: falham
      ? `${f.num(sel.length - falham)} devem integrar e ${f.num(falham)} devem voltar rejeitados. A revalidação leva alguns segundos e gera um protocolo.`
      : `Todos devem integrar, liberando ${f.money(total)} em comissões. A revalidação leva alguns segundos e gera um protocolo.`,
    confirm: falham ? 'Reenviar mesmo assim' : 'Reenviar',
    opener: e.currentTarget,
  });
  if (!ok) return;
  const rv = db.reenviar(sel.map((r) => r.guid), conferido.modo, conferido.filtro);
  location.href = `reenviados.html?protocolo=${rv.protocolo}&novo=1`;
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const extra = () => {
    if (modo() === 'sintetica') return periodoRule($('#s-ini'), $('#s-fim'), 62);
    if (modo() === 'lista') {
      const el = $('#l-lista');
      const lista = parseLista(el.value);
      if (lista.length > LIMITE) return [{ el, msg: `A lista tem ${f.num(lista.length)} GUIDs. Reenvie até ${LIMITE} de cada vez.` }];
      if (lista.length && !lista.some((g) => GUID_RE.test(g))) return [{ el, msg: 'Nenhuma linha parece um GUID. Cada GUID tem 17 caracteres: F, 15 números e uma letra.' }];
    }
    if (modo() === 'guid') {
      const el = $('#g-guid');
      if (GUID_RE.test(el.value) && !db.mov(el.value)) return [{ el, msg: 'Não há movimento com esse GUID. Confira se copiou todos os 17 caracteres.' }];
    }
    return [];
  };
  if (!validateForm(form, extra)) return;
  const c = values(form);
  c.so = $('#s-so').checked;
  conferir(c);
});

form.addEventListener('reset', (e) => {
  e.preventDefault();
  clearErrors(form);
  fill(form, padrao());
  $('#s-so').checked = true;
  mostrarModo();
  $('#conferencia').hidden = true;
  announce('Seleção limpa');
});

/* Início: GUIDs vindos de outra tela (erros, movimentos, reenviados) */
const veio = handoff.take('reenvio');
fill(form, padrao());
if (veio?.guids?.length) {
  fill(form, { modo: 'lista', lista: veio.guids.join('\n') });
  mostrarModo();
  conferir({ modo: 'lista', lista: veio.guids.join('\n') });
} else if (param('guid')) {
  fill(form, { modo: 'guid', guid: param('guid').toUpperCase() });
  mostrarModo();
  conferir({ modo: 'guid', guid: param('guid').toUpperCase() });
} else {
  mostrarModo();
}

window.addEventListener('cicm:dados', () => {
  if ($('#conferencia').hidden) return;
  conferido.rows = conferido.rows.map((r) => (r.m ? { ...r, eleg: db.elegibilidade(r.m), prev: db.previsao(r.m) } : r));
  table.update(conferido.rows);
  atualizarRodape();
});
