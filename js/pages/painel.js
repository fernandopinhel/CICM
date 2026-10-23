import { h, icon, svg, $, clear } from '../dom.js';
import * as f from '../format.js';
import * as db from '../db.js';
import { boot, statusChip } from '../ui.js';
import { erroTag, remessaDrawer } from '../views.js';

const sessao = boot('painel');

const agora = new Date();
const hoje = f.startOfDay(agora);
const saudacao = agora.getHours() < 12 ? 'Bom dia' : agora.getHours() < 18 ? 'Boa tarde' : 'Boa noite';
$('#hoje').textContent = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
$('#saudacao').textContent = `${saudacao}, ${sessao.nome.split(' ')[0]}`;

function render() {
  kpis();
  grafico();
  atencao();
  topErros();
  ultimasRemessas();
}

/* ---------------------------------------------------------------- KPIs */

function kpi({ label, value, foot, href, tone }) {
  return h('div', { class: ['kpi', tone ? `kpi-${tone}` : ''] },
    h('dt', {}, href ? h('a', { class: 'kpi-link', href }, label) : label),
    h('dd', {}, h('span', { class: 'kpi-value', text: value }), h('span', { class: 'kpi-foot', text: foot })));
}

function kpis() {
  const d = db.getDb();
  const ini7 = f.addDays(hoje, -6);
  const ini14 = f.addDays(hoje, -13);
  const ult7 = d.movs.filter((m) => new Date(m.dt) >= ini7);
  const ant7 = d.movs.filter((m) => new Date(m.dt) >= ini14 && new Date(m.dt) < ini7);
  const taxa = (l) => (l.length ? (l.filter((m) => m.rej0).length / l.length) * 100 : 0);
  const t7 = taxa(ult7);
  const delta = t7 - taxa(ant7);
  const remessas7 = d.remessas.filter((r) => new Date(r.recebida) >= ini7).length;

  const pend = d.movs.filter((m) => m.status === 'rejeitado' || m.status === 'processando');
  const retido = pend.reduce((s, m) => s + m.comissao, 0);

  const rvHoje = d.reenvios.filter((r) => f.sameDay(r.criado, agora));
  const integradosHoje = rvHoje.reduce((s, r) => s + db.resumoReenvio(r).integrados, 0);
  const emProc = d.reenvios.filter((r) => r.status === 'processando').length;

  const sinal = delta > 0.05 ? 'mais' : delta < -0.05 ? 'menos' : null;
  replaceKids($('#kpis'),
    kpi({ label: 'Movimentos recebidos', value: f.num(ult7.length), foot: `em ${f.plural(remessas7, 'remessa', 'remessas')} nos últimos 7 dias`, href: 'remessas.html' }),
    kpi({
      label: 'Taxa de rejeição na carga', value: f.pct(t7), tone: t7 > 10 ? 'bad' : null,
      foot: sinal ? `${f.pct(Math.abs(delta)).replace('%', ' p.p.')} ${sinal === 'mais' ? 'acima' : 'abaixo'} dos 7 dias anteriores` : 'Igual aos 7 dias anteriores',
      href: 'relatorio.html',
    }),
    kpi({ label: 'Comissão retida', value: f.money(retido), foot: `${f.plural(pend.length, 'movimento pendente', 'movimentos pendentes')} de correção ou reenvio`, href: 'erros.html', tone: 'signal' }),
    kpi({
      label: 'Reenvios hoje', value: f.num(rvHoje.length), tone: 'ok',
      foot: emProc ? `${f.num(emProc)} em processamento agora` : `${f.plural(integradosHoje, 'movimento integrado', 'movimentos integrados')} por reenvio`,
      href: 'reenviados.html',
    }));
}

function replaceKids(el, ...kids) { clear(el); el.append(...kids); }

/* -------------------------------------------------------------- Gráfico */

function grafico() {
  const d = db.getDb();
  const dias = [];
  for (let i = 13; i >= 0; i--) {
    const dia = f.addDays(hoje, -i);
    const iso = f.isoDate(dia);
    const movs = d.movs.filter((m) => f.isoDate(new Date(m.dt)) === iso);
    const rej = movs.filter((m) => m.rej0).length;
    dias.push({ dia, total: movs.length, rej, ok: movs.length - rej, taxa: movs.length ? (rej / movs.length) * 100 : 0 });
  }
  const W = 720; const H = 250;
  const m = { l: 44, r: 6, t: 14, b: 40 };
  const pw = W - m.l - m.r; const ph = H - m.t - m.b;
  const max = Math.max(10, ...dias.map((x) => x.total));
  const passo = Math.ceil(max / 4 / 10) * 10;
  const ymax = passo * 4;
  const y = (v) => m.t + ph - (v / ymax) * ph;
  const col = pw / dias.length;
  const bw = Math.min(30, col * 0.58);

  const total14 = dias.reduce((s, x) => s + x.total, 0);
  const rej14 = dias.reduce((s, x) => s + x.rej, 0);
  const pico = dias.reduce((a, b) => (b.taxa > a.taxa ? b : a), dias[0]);
  const resumo = `Gráfico de barras: ${f.num(total14)} movimentos em 14 dias, ${f.pct((rej14 / Math.max(1, total14)) * 100)} rejeitados na carga. O dia com mais rejeição foi ${f.date(pico.dia)}, com ${f.pct(pico.taxa)}. A tabela logo abaixo traz os números de cada dia.`;

  const tip = h('p', { class: 'chart-tip', 'aria-hidden': 'true', text: 'Passe o mouse ou toque num dia para ver os números.' });
  const chart = svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': resumo });

  for (let i = 0; i <= 4; i++) {
    const v = passo * i;
    chart.append(svg('line', { class: 'grid-line', x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }),
      svg('text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end', text: f.num(v) }));
  }
  dias.forEach((x, i) => {
    const cx = m.l + col * i + col / 2;
    const g = svg('g', { class: ['col', i === dias.length - 1 ? 'today' : ''].join(' ') });
    g.append(svg('rect', { class: 'bar-hit', x: m.l + col * i + 2, y: m.t, width: col - 4, height: ph, rx: 6 }));
    if (x.ok) g.append(svg('rect', { class: 'bar-ok', x: cx - bw / 2, y: y(x.total), width: bw, height: Math.max(0, y(x.rej) - y(x.total)), rx: 3 }));
    if (x.rej) g.append(svg('rect', { class: 'bar-bad', x: cx - bw / 2, y: y(x.rej), width: bw, height: Math.max(1.5, m.t + ph - y(x.rej)), rx: 2 }));
    g.append(svg('text', { x: cx, y: H - m.b + 16, 'text-anchor': 'middle', text: f.dayMonth(x.dia) }),
      svg('text', { x: cx, y: H - m.b + 30, 'text-anchor': 'middle', text: i === dias.length - 1 ? 'hoje' : f.weekday(x.dia) }));
    const show = () => {
      tip.textContent = `${f.weekday(x.dia)}, ${f.date(x.dia)}: ${f.num(x.total)} recebidos, ${f.num(x.ok)} integrados e ${f.num(x.rej)} rejeitados (${f.pct(x.taxa)}).`;
    };
    g.addEventListener('pointerenter', show);
    g.addEventListener('click', show);
    chart.append(g);
  });

  const tabela = h('table', { class: 'data' },
    h('caption', { class: 'visually-hidden', text: 'Movimentos recebidos por dia' }),
    h('thead', {}, h('tr', {}, ['Dia', 'Recebidos', 'Integrados', 'Rejeitados', 'Taxa'].map((t, i) => h('th', { scope: 'col', class: i ? 'col-num' : '', text: t })))),
    h('tbody', {}, dias.map((x) => h('tr', {},
      h('th', { scope: 'row', text: `${f.weekday(x.dia)}, ${f.date(x.dia)}` }),
      h('td', { class: 'col-num', text: f.num(x.total) }),
      h('td', { class: 'col-num', text: f.num(x.ok) }),
      h('td', { class: 'col-num', text: f.num(x.rej) }),
      h('td', { class: 'col-num', text: f.pct(x.taxa) })))));

  replaceKids($('#grafico'), chart, tip,
    h('details', { class: 'data-alt' }, h('summary', { text: 'Ver os números em tabela' }),
      h('div', { class: 'table-scroll', role: 'region', 'aria-label': 'Movimentos recebidos por dia, em tabela', tabindex: '0' }, tabela)));
}

/* ------------------------------------------------------- Precisa de atenção */

function item({ iconName, tone, title, sub, action }) {
  const badge = h('span', { class: `rank status-${tone}`, 'aria-hidden': 'true' }, icon(iconName, 'icon-sm'));
  return h('li', {}, badge, h('div', { class: 'grow' }, h('strong', { text: title }), h('span', { class: 'muted small', text: sub })), action);
}

function botaoRemessa(rem, texto) {
  const b = h('button', { type: 'button', class: 'btn btn-sm' }, texto, h('span', { class: 'visually-hidden', text: ` da remessa ${rem.num}` }));
  b.addEventListener('click', () => remessaDrawer(rem.num, b));
  return b;
}

function atencao() {
  const d = db.getDb();
  const out = [];

  for (const r of d.remessas.filter((x) => x.status === 'rejeitada')) {
    out.push(item({ iconName: 'x-circulo', tone: 'bad', title: `Remessa ${r.num}: arquivo rejeitado`, sub: `${db.ciaLabel(r.cia)} · o trailer não confere`, action: botaoRemessa(r, 'Resolver') }));
  }
  for (const r of d.remessas.filter((x) => x.status === 'processando')) {
    out.push(item({ iconName: 'atualizar', tone: 'info', title: `Remessa ${r.num} em processamento`, sub: `${db.ciaLabel(r.cia)} · recebida ${f.relative(r.recebida)}`, action: botaoRemessa(r, 'Acompanhar') }));
  }
  for (const rv of d.reenvios.filter((x) => x.status === 'processando')) {
    out.push(item({ iconName: 'atualizar', tone: 'info', title: `Reenvio ${rv.protocolo} em processamento`, sub: f.plural(rv.guids.length, 'movimento', 'movimentos'), action: h('a', { class: 'btn btn-sm', href: `reenviados.html?protocolo=${rv.protocolo}` }, 'Acompanhar', h('span', { class: 'visually-hidden', text: ` o reenvio ${rv.protocolo}` })) }));
  }
  const limite = f.addDays(hoje, -3);
  for (const rv of d.reenvios.filter((x) => (x.status === 'falhou' || x.status === 'parcial') && new Date(x.criado) >= limite)) {
    const r = db.resumoReenvio(rv);
    out.push(item({
      iconName: 'erros', tone: rv.status === 'falhou' ? 'bad' : 'warn', title: `Reenvio ${rv.protocolo}: ${db.STATUS_REENVIO[rv.status].label.toLowerCase()}`,
      sub: `${f.plural(r.rejeitados, 'movimento voltou rejeitado', 'movimentos voltaram rejeitados')} · ${f.relative(rv.criado)}`,
      action: h('a', { class: 'btn btn-sm', href: `reenviados.html?protocolo=${rv.protocolo}` }, 'Ver', h('span', { class: 'visually-hidden', text: ` o reenvio ${rv.protocolo}` })),
    }));
  }
  const ini7 = f.addDays(hoje, -6);
  const pico = d.remessas
    .filter((r) => new Date(r.recebida) >= ini7 && r.status === 'ok')
    .map((r) => ({ r, s: db.remessaStats(r) }))
    .filter((x) => x.s.taxa >= 20 && x.s.pendentes > 0)
    .sort((a, b) => b.s.taxa - a.s.taxa)[0];
  if (pico) {
    const cont = new Map();
    for (const m of db.idx().byRemessa.get(pico.r.num)) if (m.status === 'rejeitado') for (const e of m.erros) if (!e.ok) cont.set(e.cod, (cont.get(e.cod) || 0) + 1);
    const [cod] = [...cont.entries()].sort((a, b) => b[1] - a[1])[0] || [];
    out.push(item({
      iconName: 'relatorio', tone: 'warn', title: `Remessa ${pico.r.num} com ${f.pct(pico.s.taxa)} de rejeição`,
      sub: cod ? `A maioria é ${cod}, ${db.ERROS[cod].titulo.toLowerCase()} · ${f.plural(pico.s.pendentes, 'pendente', 'pendentes')}` : '',
      action: h('a', { class: 'btn btn-sm', href: `erros.html?remessa=${pico.r.num}` }, 'Ver erros', h('span', { class: 'visually-hidden', text: ` da remessa ${pico.r.num}` })),
    }));
  }
  const antigos = d.movs.filter((m) => m.status === 'rejeitado' && new Date(m.dt) < limite).length;
  if (antigos) {
    out.push(item({
      iconName: 'relogio', tone: 'warn', title: `${f.plural(antigos, 'movimento rejeitado', 'movimentos rejeitados')} há mais de 3 dias`,
      sub: 'Comissões paradas há mais tempo atrasam o pagamento dos corretores.',
      action: h('a', { class: 'btn btn-sm', href: 'erros.html?antigos=1' }, 'Ver', h('span', { class: 'visually-hidden', text: ' os movimentos antigos' })),
    }));
  }
  if (!out.length) out.push(item({ iconName: 'ok-circulo', tone: 'ok', title: 'Tudo em dia', sub: 'Nenhuma remessa ou reenvio com problema.', action: null }));
  replaceKids($('#atencao'), ...out);
}

/* ------------------------------------------------------------ Top erros */

function topErros() {
  const cont = new Map();
  for (const m of db.getDb().movs) {
    if (m.status !== 'rejeitado') continue;
    for (const e of m.erros) {
      if (e.ok) continue;
      const c = cont.get(e.cod) || { n: 0, valor: 0 };
      c.n++;
      c.valor += m.comissao;
      cont.set(e.cod, c);
    }
  }
  const top = [...cont.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 5);
  if (!top.length) {
    replaceKids($('#top-erros'), h('li', {}, h('span', { class: 'muted', text: 'Nenhum erro pendente. Bom trabalho!' })));
    return;
  }
  replaceKids($('#top-erros'), ...top.map(([cod, c], i) => h('li', {},
    h('span', { class: 'rank', 'aria-hidden': 'true', text: i + 1 }),
    h('div', { class: 'grow' },
      h('span', {}, erroTag(cod), ' ', h('strong', { text: db.ERROS[cod].titulo })),
      h('span', { class: 'muted small', text: `${f.plural(c.n, 'movimento', 'movimentos')} · ${f.money(c.valor)} retidos` })),
    h('a', { class: 'btn btn-sm', href: `erros.html?codigo=${cod}` }, 'Ver', h('span', { class: 'visually-hidden', text: ` os erros ${cod}` })))));
}

/* ------------------------------------------------------- Últimas remessas */

function ultimasRemessas() {
  const ult = [...db.getDb().remessas].sort((a, b) => b.recebida.localeCompare(a.recebida)).slice(0, 6);
  replaceKids($('#ultimas-remessas'), ...ult.map((r) => {
    const s = db.remessaStats(r);
    return h('li', {},
      h('div', { class: 'grow' },
        h('span', {}, h('strong', { class: 'code', text: r.num }), ' ', h('span', { class: 'muted small', text: db.ciaLabel(r.cia) })),
        h('span', { class: 'muted small', text: `${f.relative(r.recebida)}${s.total ? ` · ${f.plural(s.total, 'movimento', 'movimentos')}, ${f.num(s.rejCarga)} rejeitados` : ''}` })),
      statusChip(db.STATUS_REMESSA, db.statusRemessa(r)),
      botaoRemessa(r, 'Detalhes'));
  }));
}

render();
window.addEventListener('cicm:dados', render);
