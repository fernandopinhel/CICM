import { h, icon, $, $$, param } from '../dom.js';
import * as f from '../format.js';
import * as db from '../db.js';
import { boot, filtros, announce, handoff, modal, toast, notice, statusChip } from '../ui.js';
import { enhance, validateForm, values, fill, clearErrors } from '../form.js';
import { dataTable } from '../table.js';
import { ciaOptions, erroOptions, periodoRule, noPeriodo, guidLink, erroTag, tipoChip, previsaoChip } from '../views.js';

boot('erros');

const form = $('#filtros');
enhance(form);
ciaOptions($('#s-cia'));
erroOptions($('#s-codigo'));

const tipo = () => form.querySelector('input[name="tipo"]:checked').value;
function mostrarTipo() {
  $('#grupo-caso').hidden = tipo() !== 'caso';
  $('#grupo-sintetica').hidden = tipo() !== 'sintetica';
}
$$('input[name="tipo"]', form).forEach((r) => r.addEventListener('change', () => { clearErrors(form); mostrarTipo(); }));

const padrao = () => ({
  tipo: 'sintetica', guid: '', ini: f.isoDate(f.addDays(new Date(), -13)), fim: f.isoDate(new Date()),
  cia: '', remessa: '', codigo: '', como: '', sit: 'pendentes',
});

let criterio = null;

const table = dataTable({
  caption: 'Lista de erros',
  rowKey: (r) => r.key,
  rowLabel: (r) => `erro ${r.e.cod} do movimento ${r.m.guid}`,
  selectable: true,
  canSelect: (r) => r.m.status === 'rejeitado',
  exportName: 'cicm-erros',
  sort: { key: 'dt', dir: 'desc' },
  emptyTitle: 'Nenhum erro com esses filtros',
  emptyText: 'Pode ser uma boa notícia. Se esperava encontrar algo, amplie o período ou mude a situação para "Todos".',
  bulk: (keys) => {
    const guids = [...new Set(keys.map((k) => k.split(':')[0]))];
    const b = h('button', { type: 'button', class: 'btn btn-primary btn-sm' }, icon('reenviar'), `Conferir reenvio de ${f.plural(guids.length, 'movimento', 'movimentos')}`);
    b.addEventListener('click', () => { handoff.put('reenvio', { modo: 'lista', guids }); location.href = 'reenvio.html'; });
    return b;
  },
  columns: [
    { key: 'guid', label: 'GUID', rowHeader: true, value: (r) => r.m.guid, render: (r) => guidLink(r.m) },
    { key: 'dt', label: 'Data do movimento', value: (r) => r.m.dt, render: (r) => f.dateTimeSec(r.m.dt), csv: (r) => f.dateTimeSec(r.m.dt) },
    { key: 'cia', label: 'CIA', value: (r) => r.m.cia, render: (r) => h('span', { class: 'code', title: db.cia(r.m.cia).nome, text: r.m.cia }) },
    { key: 'remessa', label: 'Nº remessa', value: (r) => r.m.remessa, render: (r) => h('span', { class: 'code', text: r.m.remessa }) },
    {
      key: 'cod', label: 'Código do erro', value: (r) => r.e.cod, csv: (r) => `${r.e.cod} ${db.ERROS[r.e.cod].campo}`,
      render: (r) => h('span', {}, erroTag(r.e.cod), h('br'), h('span', { class: 'code small muted', text: db.ERROS[r.e.cod].campo })),
    },
    { key: 'desc', label: 'Descrição do erro', cls: 'wrap', value: (r) => db.ERROS[r.e.cod].desc },
    {
      key: 'como', label: 'Como resolver', value: (r) => (r.e.ok ? 'Resolvido' : db.TIPO_ERRO[db.ERROS[r.e.cod].tipo]),
      render: (r) => (r.e.ok ? h('span', { class: 'status status-ok' }, icon('ok'), 'Resolvido')
        : r.m.status === 'processando' ? statusChip(db.STATUS_MOV, 'processando') : tipoChip(r.e.cod)),
    },
    { key: 'nat', label: 'Natureza / compl.', value: (r) => r.m.nat, render: (r) => h('span', { class: 'code', title: db.natureza(r.m.nat), text: r.m.nat }) },
    { key: 'tabela', label: 'Nome da tabela', value: (r) => db.ERROS[r.e.cod].tabela, render: (r) => h('span', { class: 'code small', text: db.ERROS[r.e.cod].tabela }) },
    {
      key: 'acoes', label: 'Ações', sortable: false, csv: false, cls: 'col-actions',
      render: (r) => {
        const b = h('button', { type: 'button', class: 'btn btn-sm' }, icon('olho'), 'Ver', h('span', { class: 'visually-hidden', text: ` o erro ${r.e.cod} de ${r.m.guid}` }));
        b.addEventListener('click', () => detalhe(r, b));
        return b;
      },
    },
  ],
});
$('#tabela').append(table.el);

function linhas() {
  const out = [];
  for (const m of db.getDb().movs) for (const e of m.erros) out.push({ key: `${m.guid}:${e.cod}`, m, e });
  return out;
}

function consultar(c, opts = {}) {
  criterio = c;
  let rows = linhas();
  let desc;
  if (c.protocolo) {
    const rv = db.reenvio(c.protocolo);
    const set = new Set(rv ? rv.guids : []);
    rows = rows.filter((r) => set.has(r.m.guid) && !r.e.ok);
    desc = `Erros que continuam pendentes nos movimentos do reenvio ${c.protocolo}.`;
  } else if (c.tipo === 'caso') {
    rows = rows.filter((r) => r.m.guid === c.guid);
    desc = `Todos os erros do movimento ${c.guid}.`;
  } else {
    rows = rows.filter((r) => noPeriodo(r.m.dt, c.ini, c.fim)
      && (!c.cia || r.m.cia === c.cia) && (!c.remessa || r.m.remessa === c.remessa)
      && (!c.codigo || r.e.cod === c.codigo) && (!c.como || db.ERROS[r.e.cod].tipo === c.como)
      && (c.sit === 'pendentes' ? !r.e.ok : c.sit === 'resolvidos' ? r.e.ok : true));
    const sit = { pendentes: 'pendentes', resolvidos: 'resolvidos', '': 'pendentes e resolvidos' }[c.sit];
    desc = `${f.date(c.ini)} a ${f.date(c.fim)} · ${sit}${c.cia ? ` · ${db.ciaLabel(c.cia)}` : ''}${c.remessa ? ` · remessa ${c.remessa}` : ''}${c.codigo ? ` · ${c.codigo}` : ''}.`;
  }
  $('#lista-desc').textContent = `${desc} Marque linhas de movimentos rejeitados para reenviar em lote.`;
  table.update(rows, { resetPage: !opts.keepPage });
  return rows;
}

function detalhe(r, opener) {
  const { m, e } = r;
  const def = db.ERROS[e.cod];
  const foot = [h('a', { class: 'btn btn-primary', href: `movimento.html?guid=${m.guid}` }, icon('corrigir'), m.status === 'rejeitado' && def.tipo === 'campo' && !e.ok ? 'Abrir o caso para corrigir' : 'Abrir o caso')];
  if (m.status === 'rejeitado' && def.tipo === 'reenvio' && db.previsao(m).integra) {
    const b = h('button', { type: 'button', class: 'btn' }, icon('reenviar'), 'Reenviar agora');
    b.addEventListener('click', () => {
      const rv = db.reenviar([m.guid], 'guid');
      dlg.close();
      toast({ title: `Reenvio ${rv.protocolo} criado`, text: m.guid, tone: 'info', action: { label: 'Acompanhar', href: `reenviados.html?protocolo=${rv.protocolo}` } });
    });
    foot.unshift(b);
  }
  const dlg = modal({
    title: `${e.cod} · ${def.titulo}`, desc: `Movimento ${m.guid}`, drawer: true, opener, foot,
    body: [
      h('p', {}, e.ok ? h('span', { class: 'status status-ok' }, icon('ok'), 'Resolvido') : tipoChip(e.cod)),
      h('p', { text: def.desc }),
      e.ok ? null : notice('info', h('strong', { text: 'Como resolver: ' }), def.como),
      h('h3', { class: 'section-title', text: 'Onde está o erro' }),
      h('dl', { class: 'desc-list' },
        h('dt', { text: 'Campo' }), h('dd', { class: 'code', text: def.campo }),
        h('dt', { text: 'Tabela' }), h('dd', { class: 'code', text: def.tabela })),
      h('h3', { class: 'section-title', text: 'Movimento' }),
      h('dl', { class: 'desc-list' },
        h('dt', { text: 'Situação' }), h('dd', {}, statusChip(db.STATUS_MOV, m.status)),
        h('dt', { text: 'Apólice' }), h('dd', { class: 'code', text: `${m.apolice} · parcela ${m.parcela}` }),
        h('dt', { text: 'Companhia' }), h('dd', { text: db.ciaLabel(m.cia) }),
        h('dt', { text: 'Remessa' }), h('dd', {}, h('a', { href: `remessas.html?remessa=${m.remessa}`, text: m.remessa })),
        h('dt', { text: 'Comissão' }), h('dd', { text: f.money(m.comissao) }),
        m.status === 'rejeitado' ? [h('dt', { text: 'Se reenviar agora' }), h('dd', {}, previsaoChip(m))] : null),
    ],
  });
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validateForm(form, () => (tipo() === 'sintetica' ? periodoRule($('#s-ini'), $('#s-fim'), 62) : []))) return;
  const c = values(form);
  filtros.set('erros', c);
  const rows = consultar(c);
  announce(f.plural(rows.length, 'erro encontrado', 'erros encontrados'));
});

form.addEventListener('reset', (e) => {
  e.preventDefault();
  clearErrors(form);
  fill(form, padrao());
  mostrarTipo();
  filtros.set('erros', null);
  consultar(padrao());
  announce('Filtros limpos');
});

/* Início: parâmetros da URL têm prioridade sobre os filtros salvos */
let inicial = filtros.get('erros') || padrao();
const hojeIso = f.isoDate(new Date());
if (param('codigo') && db.ERROS[param('codigo')]) inicial = { ...padrao(), codigo: param('codigo') };
if (param('remessa') && db.remessa(param('remessa'))) {
  inicial = { ...padrao(), remessa: param('remessa'), ini: f.isoDate(new Date(db.remessa(param('remessa')).recebida)), fim: hojeIso };
}
if (param('antigos')) inicial = { ...padrao(), fim: f.isoDate(f.addDays(new Date(), -4)) };
if (param('guid')) inicial = { ...padrao(), tipo: 'caso', guid: param('guid').toUpperCase() };
fill(form, inicial);
mostrarTipo();
if (param('protocolo')) consultar({ ...inicial, protocolo: param('protocolo').toUpperCase() });
else consultar(inicial);

window.addEventListener('cicm:dados', () => { if (criterio) consultar(criterio, { keepPage: true }); });
