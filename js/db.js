/*
 * Dados e regras de negócio do CICM.
 *
 * O "banco" é um objeto JSON no sessionStorage (chave cicm:db), criado na
 * primeira visita por um gerador determinístico. As datas são relativas ao
 * dia de hoje, para que "remessa de ontem" sempre faça sentido.
 *
 * Fluxo de uma comissão:
 *   remessa recebida → movimentos validados → integrados ou rejeitados
 *   rejeitado → corrigido (ou não) → reenviado → revalidado → integrado ou rejeitado de novo
 */

import { isoDate, fromIsoDate, startOfDay, addDays, money, perc as fmtPerc, date as fmtDate } from './format.js';

const KEY = 'cicm:db';
const SESSION_KEY = 'cicm:sessao';
const VERSION = 3;

/* ----------------------------------------------------------- Tabelas de apoio */

export const CIAS = [
  { cod: '101', nome: 'Prumo Auto' },
  { cod: '132', nome: 'Prumo Vida e Previdência' },
  { cod: '215', nome: 'Prumo Residencial' },
  { cod: '348', nome: 'Prumo Empresarial' },
];

export const SUCURSAIS = [
  { cod: '010', nome: 'São Paulo, Centro' },
  { cod: '014', nome: 'Campinas' },
  { cod: '021', nome: 'Rio de Janeiro' },
  { cod: '031', nome: 'Belo Horizonte' },
  { cod: '041', nome: 'Curitiba' },
  { cod: '051', nome: 'Porto Alegre' },
  { cod: '071', nome: 'Salvador' },
  { cod: '081', nome: 'Recife' },
];

export const RAMOS = [
  { cod: '0531', nome: 'Automóvel', cia: '101', max: 25, premio: [900, 7800] },
  { cod: '0520', nome: 'RC facultativo de veículos', cia: '101', max: 20, premio: [250, 2200] },
  { cod: '0977', nome: 'Vida em grupo', cia: '132', max: 30, premio: [400, 12000] },
  { cod: '0993', nome: 'Prestamista', cia: '132', max: 35, premio: [120, 3200] },
  { cod: '0114', nome: 'Residencial', cia: '215', max: 30, premio: [180, 2400] },
  { cod: '0171', nome: 'Fiança locatícia', cia: '215', max: 20, premio: [600, 5400] },
  { cod: '0118', nome: 'Empresarial', cia: '348', max: 25, premio: [1500, 28000] },
  { cod: '0351', nome: 'RC geral', cia: '348', max: 20, premio: [800, 16000] },
];

export const OPCOES = [
  { cod: 'CD', nome: 'Corretagem direta' },
  { cod: 'PA', nome: 'Parceria' },
  { cod: 'VD', nome: 'Venda digital' },
  { cod: 'GC', nome: 'Grandes contas' },
];

export const NATUREZAS = {
  '701': 'Emissão',
  '702': 'Endosso',
  '703': 'Cancelamento',
  '710': 'Estorno de comissão',
};

export const CORRETORES = [
  { id: 'C01', nome: 'Alvorada Corretora de Seguros', susep: '202011234', ativo: true },
  { id: 'C02', nome: 'Bússola Seguros e Benefícios', susep: '202034871', ativo: true },
  { id: 'C03', nome: 'Cais Consultoria em Seguros', susep: '202045519', ativo: true },
  { id: 'C04', nome: 'Duna Corretora', susep: '202051207', ativo: true },
  { id: 'C05', nome: 'Elo Proteção Patrimonial', susep: '202067730', ativo: true },
  { id: 'C06', nome: 'Farol Corretagem', susep: '202070046', ativo: true },
  { id: 'C07', nome: 'Garoa Seguros Ltda.', susep: '202082391', ativo: false },
  { id: 'C08', nome: 'Horizonte Azul Corretora', susep: '202093318', ativo: true },
  { id: 'C09', nome: 'Ipê Gestão de Riscos', susep: '202104472', ativo: true },
  { id: 'C10', nome: 'Jangada Seguros', susep: '202118805', ativo: true },
  { id: 'C11', nome: 'Lume Corretora Digital', susep: '202126650', ativo: true },
  { id: 'C12', nome: 'Mirante Corretora de Seguros', susep: '202139914', ativo: false },
];

/*
 * Catálogo de erros. "tipo" diz como cada um se resolve:
 *   campo     corrige-se um dado do movimento aqui no CICM
 *   reenvio   falha temporária ou de ordem: basta reenviar
 *   origem    só a companhia corrige; reenviar sem isso gera a mesma rejeição
 *   descartar movimento duplicado: o certo é descartar
 */
export const ERROS = {
  E101: {
    campo: 'CD_CORRETOR', tabela: 'TB_CORRETOR_VIGENCIA', tipo: 'campo', editor: 'corretor',
    titulo: 'Corretor inativo',
    desc: 'O corretor informado está inativo na data do movimento.',
    como: 'Troque pelo corretor que responde pela apólice hoje. A comissão passa a ser paga a ele.',
  },
  E205: {
    campo: 'PC_COMISSAO', tabela: 'TB_LIMITE_COMISSAO_RAMO', tipo: 'campo', editor: 'perc',
    titulo: 'Comissão acima do limite',
    desc: 'O percentual de comissão passa do limite do ramo.',
    como: 'Informe um percentual dentro do limite do ramo. O valor da comissão é recalculado junto.',
  },
  E210: {
    campo: 'VL_COMISSAO', tabela: 'TB_PARCELA_COMISSAO', tipo: 'campo', editor: 'recalc',
    titulo: 'Valor da comissão não confere',
    desc: 'O valor da comissão é diferente de prêmio × percentual.',
    como: 'Recalcule o valor a partir do prêmio e do percentual do movimento.',
  },
  E233: {
    campo: 'CD_OPCAO_COML', tabela: 'TB_PARTICIPACAO_APOLICE', tipo: 'campo', editor: 'opcao',
    titulo: 'Opção comercial em branco',
    desc: 'O campo CD_OPCAO_COML (opção comercial) é obrigatório.',
    como: 'Escolha o canal pelo qual a apólice foi vendida.',
  },
  E318: {
    campo: 'DT_VENCIMENTO', tabela: 'TB_PARCELA', tipo: 'campo', editor: 'venc',
    titulo: 'Vencimento antes da emissão',
    desc: 'A data de vencimento da parcela é anterior à emissão da apólice.',
    como: 'Informe um vencimento igual ou posterior à data de emissão.',
  },
  E402: {
    campo: 'NR_APOLICE', tabela: 'TB_APOLICE', tipo: 'origem',
    titulo: 'Apólice não encontrada',
    desc: 'A apólice não existe na companhia informada.',
    como: 'Precisa ser acertado no sistema de emissão da companhia. Reenviar agora gera a mesma rejeição.',
  },
  E407: {
    campo: 'NR_PARCELA', tabela: 'TB_PARCELA_COMISSAO', tipo: 'descartar',
    titulo: 'Parcela duplicada',
    desc: 'A parcela já foi integrada por outro movimento.',
    como: 'Confira o movimento já integrado. Se for mesmo duplicado, descarte este para a comissão não ser paga duas vezes.',
  },
  E512: {
    campo: 'NR_ENDOSSO', tabela: 'TB_ENDOSSO', tipo: 'reenvio',
    titulo: 'Endosso fora de ordem',
    desc: 'O endosso chegou antes do endosso anterior.',
    como: 'O endosso anterior já foi integrado. Basta reenviar.',
  },
  E901: {
    campo: 'SYS_TIMEOUT', tabela: 'TB_FILA_INTEGRACAO', tipo: 'reenvio',
    titulo: 'Tempo esgotado na integração',
    desc: 'O sistema de destino não respondeu a tempo.',
    como: 'Falha temporária. Basta reenviar.',
  },
};

export const TIPO_ERRO = {
  campo: 'Corrigir aqui',
  reenvio: 'Basta reenviar',
  origem: 'Corrigir na companhia',
  descartar: 'Descartar',
};

export const STATUS_MOV = {
  integrado: { label: 'Integrado', tone: 'ok', icon: 'ok-circulo' },
  rejeitado: { label: 'Rejeitado', tone: 'bad', icon: 'x-circulo' },
  processando: { label: 'Em reenvio', tone: 'info progress', icon: 'atualizar' },
  descartado: { label: 'Descartado', tone: 'neutral', icon: 'proibido' },
};

export const STATUS_REMESSA = {
  processada: { label: 'Processada', tone: 'ok', icon: 'ok-circulo' },
  com_pendencias: { label: 'Com pendências', tone: 'warn', icon: 'erros' },
  regularizada: { label: 'Regularizada', tone: 'ok', icon: 'ok' },
  processando: { label: 'Em processamento', tone: 'info progress', icon: 'atualizar' },
  rejeitada: { label: 'Arquivo rejeitado', tone: 'bad', icon: 'x-circulo' },
};

export const STATUS_REENVIO = {
  processando: { label: 'Em processamento', tone: 'info progress', icon: 'atualizar' },
  concluido: { label: 'Concluído', tone: 'ok', icon: 'ok-circulo' },
  parcial: { label: 'Concluído com rejeições', tone: 'warn', icon: 'erros' },
  falhou: { label: 'Sem sucesso', tone: 'bad', icon: 'x-circulo' },
};

export const MODOS_REENVIO = {
  guid: 'Por caso de comissão',
  lista: 'Por lista de casos',
  sintetica: 'Sintética (por filtro)',
};

export const SISTEMA = 'Processamento automático';

export const DEMO_USER = { matricula: '4821375', nome: 'Marina Couto', cargo: 'Analista de comissões' };
const EQUIPE = ['Marina Couto', 'Rafael Antunes', 'Júlia Prado'];

/* Consultas rápidas às tabelas de apoio */
export const cia = (cod) => CIAS.find((c) => c.cod === cod);
export const ramo = (cod) => RAMOS.find((r) => r.cod === cod);
export const sucursal = (cod) => SUCURSAIS.find((s) => s.cod === cod);
export const corretor = (id) => CORRETORES.find((c) => c.id === id);
export const opcao = (cod) => OPCOES.find((o) => o.cod === cod);
export const ciaLabel = (cod) => `${cod} · ${cia(cod)?.nome ?? ''}`;
export const natureza = (nat) => NATUREZAS[String(nat).split('/')[0]] ?? '';

const round2 = (v) => Math.round(v * 100) / 100;

/* --------------------------------------------------------------- Sessão */

export function session() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
}

export function startSession(user) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...user, desde: Date.now() }));
}

export function endSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

const quem = () => session()?.nome ?? DEMO_USER.nome;

/* --------------------------------------------------------------- Banco */

let db = null;
let index = null;

export function getDb() {
  if (!db) db = load();
  return db;
}

function load() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.v === VERSION) return parsed;
    }
  } catch { /* banco corrompido: gera de novo */ }
  const fresh = generate();
  persist(fresh);
  return fresh;
}

function persist(data) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('CICM: não foi possível salvar no sessionStorage.', err);
  }
}

export function save() {
  index = null;
  persist(db);
  window.dispatchEvent(new CustomEvent('cicm:dados'));
}

export function resetDb() {
  sessionStorage.removeItem(KEY);
  db = null;
  index = null;
  getDb();
  window.dispatchEvent(new CustomEvent('cicm:dados'));
}

/** Índices em memória, refeitos depois de cada gravação. */
export function idx() {
  if (index) return index;
  const d = getDb();
  const byGuid = new Map();
  const byRemessa = new Map();
  for (const m of d.movs) {
    byGuid.set(m.guid, m);
    if (!byRemessa.has(m.remessa)) byRemessa.set(m.remessa, []);
    byRemessa.get(m.remessa).push(m);
  }
  index = {
    byGuid,
    byRemessa,
    remessa: new Map(d.remessas.map((r) => [r.num, r])),
    reenvio: new Map(d.reenvios.map((r) => [r.protocolo, r])),
  };
  return index;
}

export const mov = (guid) => idx().byGuid.get(String(guid || '').trim().toUpperCase());
export const remessa = (num) => idx().remessa.get(String(num));
export const reenvio = (prot) => idx().reenvio.get(String(prot || '').trim().toUpperCase());

/* --------------------------------------------------------- Regras de negócio */

/** Erros que os próprios dados do movimento revelam. */
export function validar(m) {
  const out = [];
  if (!corretor(m.corretor)?.ativo) out.push('E101');
  const r = ramo(m.ramo);
  if (r && m.perc > r.max) out.push('E205');
  else if (Math.abs(m.comissao - round2((m.premio * m.perc) / 100)) > 0.009) out.push('E210');
  if (!m.opcao) out.push('E233');
  if (m.venc < m.emissao) out.push('E318');
  return out;
}

/** Erros que continuariam existindo se o movimento fosse reenviado agora. */
export function errosNoReenvio(m) {
  const persistentes = m.erros
    .filter((e) => !e.ok && (ERROS[e.cod].tipo === 'origem' || ERROS[e.cod].tipo === 'descartar'))
    .map((e) => e.cod);
  return [...new Set([...validar(m), ...persistentes])];
}

export const errosPendentes = (m) => m.erros.filter((e) => !e.ok);

/** Previsão do que acontece se o movimento for reenviado. */
export function previsao(m) {
  const restantes = errosNoReenvio(m);
  if (!restantes.length) return { integra: true, texto: 'Deve integrar' };
  const nomes = restantes.map((c) => `${c} ${ERROS[c].titulo.toLowerCase()}`);
  return { integra: false, restantes, texto: `Deve voltar rejeitado: ${nomes.join('; ')}` };
}

/** Pode entrar num reenvio? */
export function elegibilidade(m) {
  if (!m) return { ok: false, motivo: 'GUID não encontrado' };
  if (m.status === 'rejeitado') return { ok: true, motivo: '' };
  if (m.status === 'processando') return { ok: false, motivo: `Já está no reenvio ${m.rv}` };
  if (m.status === 'integrado') return { ok: false, motivo: 'Já integrado' };
  return { ok: false, motivo: 'Movimento descartado' };
}

export function remessaStats(rem) {
  const movs = idx().byRemessa.get(rem.num) || [];
  const s = { total: movs.length, rejCarga: 0, pendentes: 0, integrados: 0, descartados: 0, emReenvio: 0, valor: 0, retido: 0 };
  for (const m of movs) {
    s.valor += m.comissao;
    if (m.rej0) s.rejCarga++;
    if (m.status === 'rejeitado') { s.pendentes++; s.retido += m.comissao; }
    else if (m.status === 'processando') { s.emReenvio++; s.retido += m.comissao; }
    else if (m.status === 'integrado') s.integrados++;
    else if (m.status === 'descartado') s.descartados++;
  }
  s.taxa = s.total ? (s.rejCarga / s.total) * 100 : 0;
  s.valor = round2(s.valor);
  s.retido = round2(s.retido);
  return s;
}

export function statusRemessa(rem) {
  if (rem.status === 'processando' || rem.status === 'rejeitada') return rem.status;
  const s = remessaStats(rem);
  if (s.pendentes + s.emReenvio > 0) return 'com_pendencias';
  if (s.rejCarga > 0) return 'regularizada';
  return 'processada';
}

export function progressoReenvio(rv) {
  if (rv.status !== 'processando') return 1;
  return Math.min(1, Math.max(0, (Date.now() - rv.inicio) / (rv.fim - rv.inicio)));
}

export function resumoReenvio(rv) {
  const vals = Object.values(rv.res || {});
  return {
    total: rv.guids.length,
    integrados: vals.filter((v) => v === 'integrado').length,
    rejeitados: vals.filter((v) => v === 'rejeitado').length,
  };
}

/* ------------------------------------------------------------- Ações */

/**
 * Corrige dados de um movimento rejeitado.
 * mudancas: { corretor?, perc?, opcao?, venc?, recalc? }
 */
export function corrigir(guid, mudancas) {
  const m = mov(guid);
  if (!m || m.status !== 'rejeitado') throw new Error('Só dá para corrigir movimentos rejeitados.');
  const antes = { ...m };
  const partes = [];

  if (mudancas.corretor && mudancas.corretor !== m.corretor) {
    m.corretor = mudancas.corretor;
    partes.push(`Corretor: ${corretor(antes.corretor)?.nome} → ${corretor(m.corretor)?.nome}`);
  }
  if (mudancas.perc !== undefined && mudancas.perc !== m.perc) {
    m.perc = round2(mudancas.perc);
    m.comissao = round2((m.premio * m.perc) / 100);
    partes.push(`Percentual: ${fmtPerc(antes.perc)} → ${fmtPerc(m.perc)} (comissão ${money(m.comissao)})`);
  }
  if (mudancas.recalc) {
    const novo = round2((m.premio * m.perc) / 100);
    if (novo !== m.comissao) {
      m.comissao = novo;
      partes.push(`Comissão recalculada: ${money(antes.comissao)} → ${money(novo)}`);
    }
  }
  if (mudancas.opcao && mudancas.opcao !== m.opcao) {
    m.opcao = mudancas.opcao;
    partes.push(`Opção comercial: ${opcao(m.opcao)?.nome}`);
  }
  if (mudancas.venc && mudancas.venc !== m.venc) {
    m.venc = mudancas.venc;
    partes.push(`Vencimento: ${fmtDate(antes.venc)} → ${fmtDate(m.venc)}`);
  }
  if (!partes.length) return { mudou: false };

  const restantes = validar(m);
  for (const e of m.erros) {
    if (ERROS[e.cod].tipo === 'campo') e.ok = !restantes.includes(e.cod);
  }
  m.hist.push({ dt: new Date().toISOString(), ev: 'corrigido', por: quem(), txt: partes.join('. ') });
  save();
  return { mudou: true, partes };
}

export function descartar(guid, motivo) {
  const m = mov(guid);
  if (!m || m.status !== 'rejeitado') throw new Error('Só dá para descartar movimentos rejeitados.');
  m.status = 'descartado';
  m.erros.forEach((e) => { e.ok = true; });
  m.hist.push({ dt: new Date().toISOString(), ev: 'descartado', por: quem(), txt: motivo });
  save();
}

/** Cria um protocolo de reenvio. Devolve o protocolo. */
export function reenviar(guids, modo, filtro = '') {
  const d = getDb();
  const elegiveis = [...new Set(guids)].map(mov).filter((m) => elegibilidade(m).ok);
  if (!elegiveis.length) throw new Error('Nenhum movimento elegível para reenvio.');
  const agora = Date.now();
  const protocolo = novoProtocolo(d, new Date(agora));
  const duracao = Math.min(14000, 3500 + elegiveis.length * 180);
  const rv = {
    protocolo,
    criado: new Date(agora).toISOString(),
    por: quem(),
    modo,
    filtro,
    guids: elegiveis.map((m) => m.guid),
    status: 'processando',
    inicio: agora,
    fim: agora + duracao,
    res: {},
  };
  for (const m of elegiveis) {
    m.status = 'processando';
    m.rv = protocolo;
    m.hist.push({ dt: rv.criado, ev: 'reenviado', por: rv.por, txt: `Protocolo ${protocolo}` });
  }
  d.reenvios.push(rv);
  save();
  return rv;
}

export function reprocessarRemessa(num) {
  const rem = remessa(num);
  if (!rem || rem.status !== 'rejeitada') throw new Error('Só dá para reprocessar remessas rejeitadas.');
  rem.status = 'processando';
  rem.liberaEm = Date.now() + 7000;
  rem.eventos.push({ dt: new Date().toISOString(), txt: `Reprocessamento pedido por ${quem()} com o arquivo corrigido pela companhia.` });
  save();
}

export const temProcessamento = () => {
  const d = getDb();
  return d.remessas.some((r) => r.status === 'processando') || d.reenvios.some((r) => r.status === 'processando');
};

/**
 * Avança o que está em processamento (remessas e reenvios).
 * Devolve os eventos concluídos, para a interface avisar.
 */
export function tick() {
  const d = getDb();
  const agora = Date.now();
  const eventos = [];

  for (const rem of d.remessas) {
    if (rem.status !== 'processando' || agora < rem.liberaEm) continue;
    const dt = new Date(agora);
    const pend = rem.pend || [];
    pend.forEach((m, i) => {
      m.dt = new Date(agora - (pend.length - i) * 1000).toISOString();
      m.hist.forEach((ev) => { ev.dt = m.dt; });
    });
    d.movs.push(...pend);
    delete rem.pend;
    delete rem.liberaEm;
    rem.status = 'ok';
    rem.processada = dt.toISOString();
    const rej = pend.filter((m) => m.rej0).length;
    rem.eventos.push({ dt: rem.processada, txt: `Processada: ${pend.length} movimentos, ${rej} rejeitados.` });
    eventos.push({ tipo: 'remessa', rem, total: pend.length, rejeitados: rej });
  }

  for (const rv of d.reenvios) {
    if (rv.status !== 'processando' || agora < rv.fim) continue;
    const quando = new Date(agora).toISOString();
    for (const g of rv.guids) {
      const m = d.movs.find((x) => x.guid === g);
      if (!m || m.status !== 'processando' || m.rv !== rv.protocolo) continue;
      processarReenvio(m, rv, quando);
    }
    finalizar(rv, quando);
    eventos.push({ tipo: 'reenvio', rv, ...resumoReenvio(rv) });
  }

  if (eventos.length) save();
  return eventos;
}

function processarReenvio(m, rv, quando) {
  const restantes = errosNoReenvio(m);
  m.tentativas = (m.tentativas || 0) + 1;
  if (!restantes.length) {
    m.status = 'integrado';
    m.erros.forEach((e) => { e.ok = true; });
    m.rv = rv.protocolo;
    m.hist.push({ dt: quando, ev: 'integrado', por: SISTEMA, txt: `Integrado pelo reenvio ${rv.protocolo}` });
    rv.res[m.guid] = 'integrado';
  } else {
    m.status = 'rejeitado';
    m.rv = null;
    for (const cod of restantes) {
      const e = m.erros.find((x) => x.cod === cod);
      if (e) e.ok = false; else m.erros.push({ cod, ok: false });
    }
    m.erros.forEach((e) => { if (!restantes.includes(e.cod)) e.ok = true; });
    m.hist.push({ dt: quando, ev: 'rejeitado', por: SISTEMA, txt: `Rejeitado de novo no reenvio ${rv.protocolo}: ${restantes.join(', ')}` });
    rv.res[m.guid] = 'rejeitado';
  }
}

function finalizar(rv, quando) {
  const r = resumoReenvio(rv);
  rv.status = r.integrados === r.total ? 'concluido' : r.integrados === 0 ? 'falhou' : 'parcial';
  rv.concluido = quando;
}

function novoProtocolo(d, quando) {
  d.seq.reenvio += 1;
  return `RV-${quando.getFullYear()}-${String(d.seq.reenvio).padStart(4, '0')}`;
}

/* ------------------------------------------------------------ Gerador */

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ymd = (d) => isoDate(d).replaceAll('-', '');

function generate() {
  const rnd = mulberry32(1322019);
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const chance = (p) => rnd() < p;
  const weighted = (pairs) => {
    const total = pairs.reduce((s, [, w]) => s + w, 0);
    let x = rnd() * total;
    for (const [v, w] of pairs) { x -= w; if (x < 0) return v; }
    return pairs[pairs.length - 1][0];
  };

  const agora = Date.now();
  const hoje = startOfDay(new Date(agora));
  const d = { v: VERSION, hoje: isoDate(hoje), remessas: [], movs: [], reenvios: [], seq: { reenvio: 411 } };
  const guids = new Set();
  const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const ativos = CORRETORES.filter((c) => c.ativo);

  const novoGuid = () => {
    let g;
    do { g = `F${int(10000000, 99999999)}${int(1000000, 9999999)}${pick(LETRAS)}`; } while (guids.has(g));
    guids.add(g);
    return g;
  };

  const erroAleatorio = () => weighted([
    ['E233', 20], ['E205', 15], ['E210', 12], ['E101', 11], ['E901', 11],
    ['E318', 8], ['E402', 8], ['E512', 8], ['E407', 7],
  ]);

  /* Deixa os dados do movimento coerentes com o erro sorteado */
  const sujar = (m, cod, spike) => {
    const r = ramo(m.ramo);
    if (cod === 'E101') m.corretor = spike ? 'C07' : pick(['C07', 'C12']);
    if (cod === 'E205') { m.perc = round2(r.max + int(1, 9) + 0.5); m.comissao = round2((m.premio * m.perc) / 100); }
    if (cod === 'E210') m.comissao = round2(m.comissao * (1 + int(6, 30) / 100));
    if (cod === 'E233') m.opcao = null;
    if (cod === 'E318') m.venc = isoDate(addDays(fromIsoDate(m.emissao), -int(3, 25)));
  };

  const gerarMovs = (rem, n, taxa, spike = false) => {
    const lista = [];
    const ramos = RAMOS.filter((r) => r.cia === rem.cia);
    const base = new Date(rem.recebida).getTime() + int(2, 6) * 60000;
    for (let i = 0; i < n; i++) {
      const r = pick(ramos);
      const nat = weighted([['701', 55], ['702', 25], ['703', 9], ['710', 11]]);
      const parcela = nat === '701' ? int(1, 12) : int(1, 6);
      const premio = round2(r.premio[0] + rnd() * (r.premio[1] - r.premio[0]));
      const pc = round2(Math.max(5, r.max - int(0, 12) - rnd()));
      const dt = new Date(base + i * int(1, 3) * 1000);
      const emissao = addDays(startOfDay(dt), -int(4, 80));
      const m = {
        guid: novoGuid(),
        cia: rem.cia,
        suc: pick(SUCURSAIS).cod,
        ramo: r.cod,
        apolice: `${rem.cia}${int(1000000, 9999999)}`,
        endosso: nat === '702' ? int(1, 6) : 0,
        parcela,
        nat: `${nat}/${String(int(1, 18)).padStart(2, '0')}`,
        corretor: pick(ativos).id,
        premio,
        perc: pc,
        comissao: round2((premio * pc) / 100),
        opcao: pick(OPCOES).cod,
        emissao: isoDate(emissao),
        venc: isoDate(addDays(emissao, 30 * parcela)),
        remessa: rem.num,
        dt: dt.toISOString(),
        status: 'integrado',
        rej0: false,
        erros: [],
        rv: null,
        hist: [{ dt: dt.toISOString(), ev: 'recebido', por: SISTEMA, txt: `Remessa ${rem.num}` }],
      };
      if (chance(taxa)) {
        const cods = [spike && chance(0.8) ? 'E101' : erroAleatorio()];
        if (chance(0.16)) {
          const extra = pick(['E233', 'E318', 'E901']);
          if (!cods.includes(extra)) cods.push(extra);
        }
        cods.forEach((c) => sujar(m, c, spike));
        m.status = 'rejeitado';
        m.rej0 = true;
        m.erros = cods.map((cod) => ({ cod, ok: false }));
        m.hist.push({ dt: dt.toISOString(), ev: 'rejeitado', por: SISTEMA, txt: cods.join(', ') });
      } else {
        m.hist.push({ dt: dt.toISOString(), ev: 'integrado', por: SISTEMA, txt: '' });
      }
      m.corretor0 = m.corretor; // corretor como chegou, antes de correções (para o relatório)
      lista.push(m);
    }
    return lista;
  };

  let numero = 1236;
  for (let off = 13; off >= 0; off--) {
    const dia = addDays(hoje, -off);
    CIAS.forEach((c, ci) => {
      let recebida = new Date(dia);
      recebida.setHours(2 + ci, int(0, 59), int(0, 59), 0);
      if (recebida.getTime() > agora) recebida = new Date(agora - (5 - ci) * 25 * 60000);
      const rem = {
        num: String(numero++),
        cia: c.cod,
        recebida: recebida.toISOString(),
        arquivo: `CMS${c.cod}_${ymd(dia)}_01.TXT`,
        status: 'ok',
        processada: new Date(recebida.getTime() + int(4, 16) * 60000).toISOString(),
        eventos: [{ dt: recebida.toISOString(), txt: 'Arquivo recebido da companhia.' }],
      };
      const n = int(22, 46);
      const spike = off === 5 && c.cod === '101';
      const taxa = spike ? 0.38 : off === 1 && c.cod === '132' ? 0.13 : 0.055 + rnd() * 0.03;

      if (off === 0 && c.cod === '348') {
        rem.recebida = new Date(agora - 9 * 60000).toISOString();
        rem.eventos[0].dt = rem.recebida;
        rem.status = 'processando';
        rem.processada = null;
        rem.liberaEm = agora + 45000;
        rem.pend = gerarMovs(rem, n, taxa);
      } else if (off === 3 && c.cod === '215') {
        rem.status = 'rejeitada';
        rem.processada = null;
        rem.motivo = `O trailer informa ${n + 2} registros, mas o arquivo tem ${n}. Nenhum movimento foi carregado.`;
        rem.eventos.push({ dt: new Date(recebida.getTime() + 3 * 60000).toISOString(), txt: 'Arquivo rejeitado na conferência do trailer.' });
        rem.pend = gerarMovs(rem, n, taxa);
      } else {
        const movs = gerarMovs(rem, n, taxa, spike);
        d.movs.push(...movs);
        const rej = movs.filter((m) => m.rej0).length;
        rem.eventos.push({ dt: rem.processada, txt: `Processada: ${movs.length} movimentos, ${rej} rejeitados.` });
      }
      d.remessas.push(rem);
    });
  }

  /* Histórico de correções e reenvios dos dias anteriores */
  const porDia = new Map();
  const antigos = d.movs.filter((m) => m.rej0 && new Date(m.dt) < addDays(hoje, -1));
  for (const m of antigos) {
    const cod = m.erros[0].cod;
    if (cod === 'E407' && chance(0.55)) {
      const t = new Date(new Date(m.dt).getTime() + int(20, 30) * 3600000);
      if (t.getTime() > agora) continue;
      m.status = 'descartado';
      m.erros.forEach((e) => { e.ok = true; });
      m.hist.push({ dt: t.toISOString(), ev: 'descartado', por: pick(EQUIPE), txt: 'Duplicidade confirmada com a companhia.' });
      continue;
    }
    if (m.erros.some((e) => e.cod === 'E402' || e.cod === 'E407') || !chance(0.64)) continue;
    const dia = isoDate(addDays(new Date(m.dt), int(1, 2)));
    if (fromIsoDate(dia) > hoje) continue;
    if (!porDia.has(dia)) porDia.set(dia, []);
    porDia.get(dia).push(m);
  }

  /* Uma tentativa sem sucesso: apólices não encontradas reenviadas sem correção */
  const semOrigem = antigos.filter((m) => m.status === 'rejeitado' && m.erros.some((e) => e.cod === 'E402')).slice(0, 3);

  const lotes = [...porDia.keys()].map((dia) => ({ dia, movs: porDia.get(dia), hora: int(9, 15) }));
  if (semOrigem.length) lotes.push({ dia: isoDate(addDays(hoje, -2)), movs: semOrigem, hora: 16, semCorrecao: true });
  lotes.sort((a, b) => (a.dia + a.hora).localeCompare(b.dia + b.hora));

  for (const lote of lotes) {
    const { movs } = lote;
    const por = lote.semCorrecao ? 'Rafael Antunes' : pick(EQUIPE);
    const inicio = fromIsoDate(lote.dia);
    inicio.setHours(lote.hora, int(0, 59), 0, 0);
    if (inicio.getTime() > agora - 3600000) inicio.setTime(agora - 3600000 * int(2, 4));
    if (!lote.semCorrecao) movs.forEach((m, i) => {
      const t = new Date(inicio.getTime() - (movs.length - i) * 90000);
      const mudancas = [];
      for (const e of m.erros) {
        const r = ramo(m.ramo);
        if (e.cod === 'E101') { m.corretor = pick(ativos).id; mudancas.push(`Corretor trocado para ${corretor(m.corretor).nome}`); }
        if (e.cod === 'E205') { m.perc = round2(r.max - int(0, 4)); m.comissao = round2((m.premio * m.perc) / 100); mudancas.push(`Percentual ajustado para ${fmtPerc(m.perc)}`); }
        if (e.cod === 'E210') { m.comissao = round2((m.premio * m.perc) / 100); mudancas.push('Comissão recalculada'); }
        if (e.cod === 'E233') { m.opcao = pick(OPCOES).cod; mudancas.push(`Opção comercial: ${opcao(m.opcao).nome}`); }
        if (e.cod === 'E318') { m.venc = isoDate(addDays(fromIsoDate(m.emissao), 30 * m.parcela)); mudancas.push(`Vencimento: ${fmtDate(m.venc)}`); }
      }
      if (mudancas.length) m.hist.push({ dt: t.toISOString(), ev: 'corrigido', por, txt: mudancas.join('. ') });
    });
    const protocolo = novoProtocolo(d, inicio);
    const fim = new Date(inicio.getTime() + int(2, 5) * 60000);
    const modo = lote.semCorrecao || movs.length > 1 ? (movs.length > 6 ? 'sintetica' : 'lista') : 'guid';
    const rv = {
      protocolo, criado: inicio.toISOString(), por, modo,
      filtro: modo === 'sintetica' ? 'Rejeitados corrigidos do dia anterior' : '',
      guids: movs.map((m) => m.guid), status: 'processando', inicio: inicio.getTime(), fim: fim.getTime(), res: {},
    };
    for (const m of movs) {
      m.hist.push({ dt: rv.criado, ev: 'reenviado', por, txt: `Protocolo ${protocolo}` });
      m.status = 'processando';
      m.rv = protocolo;
      processarReenvio(m, rv, fim.toISOString());
    }
    finalizar(rv, fim.toISOString());
    d.reenvios.push(rv);
  }

  return d;
}
