import { $, h, icon, param } from '../dom.js';
import { enhance, validateForm, values } from '../form.js';
import * as db from '../db.js';

const form = $('#entrar');
const aviso = $('#login-aviso');
enhance(form);

if (param('saiu')) {
  aviso.append(h('div', { class: 'notice notice-ok', role: 'status' }, icon('ok-circulo'), h('div', { text: 'Você saiu do CICM. Até a próxima!' })));
}

/* Só volta para páginas do próprio protótipo */
function destino() {
  const volta = param('volta');
  return volta && /^[a-z-]+\.html(\?[\w=&%.-]*)?$/.test(volta) && !volta.startsWith('login') ? volta : 'painel.html';
}

function entrar(matricula) {
  db.startSession({ ...db.DEMO_USER, matricula });
  db.getDb();
  location.href = destino();
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const ok = validateForm(form, () => {
    const out = [];
    const mat = $('#matricula');
    const senha = $('#senha');
    if (mat.value && !/^\d{7}$/.test(mat.value)) out.push({ el: mat, msg: `A matrícula tem 7 números. Faltam ${7 - mat.value.length}.` });
    if (senha.value && senha.value.length < 4) out.push({ el: senha, msg: 'A senha tem pelo menos 4 caracteres.' });
    return out;
  });
  if (ok) entrar(values(form).matricula);
});

$('#demo').addEventListener('click', () => entrar(db.DEMO_USER.matricula));

const ver = $('#ver-senha');
ver.addEventListener('click', () => {
  const senha = $('#senha');
  const mostrar = senha.type === 'password';
  senha.type = mostrar ? 'text' : 'password';
  ver.setAttribute('aria-pressed', String(mostrar));
});

if (db.session() && !param('saiu')) location.replace(destino());
