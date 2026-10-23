/*
 * Validação declarativa de formulários.
 *
 * As regras vêm do HTML: required, data-rules="guid digits", data-mask="guid".
 * Cada tela soma as regras de negócio com o parâmetro `extra`.
 *
 * Comportamento:
 *  - os erros aparecem no envio, no campo e num resumo no topo com links;
 *  - depois disso, o erro de um campo some enquanto a pessoa corrige,
 *    mas nenhum erro novo aparece no meio da digitação.
 */

import { h, icon, $, $$ } from './dom.js';

export const GUID_RE = /^F\d{15}[A-Z]$/;

const RULES = {
  guid: (v) => (!v || GUID_RE.test(v) ? '' : 'O GUID tem 17 caracteres: F, 15 números e uma letra. Exemplo: F394674803011287A.'),
  digits: (v, el) => (!v || /^\d+$/.test(v) ? '' : `Use só números em ${labelOf(el).toLowerCase()}.`),
};

function labelOf(el) {
  if (el.dataset.label) return el.dataset.label;
  const lab = el.id && document.querySelector(`label[for="${el.id}"]`);
  const legend = el.closest('fieldset')?.querySelector('legend');
  const text = (lab || legend)?.childNodes[0]?.textContent || el.name || 'este campo';
  return text.trim();
}

function requiredMsg(el) {
  if (el.dataset.msgRequired) return el.dataset.msgRequired;
  const label = labelOf(el);
  return el.tagName === 'SELECT' ? `Escolha ${artigo(label)} ${label.toLowerCase()}.` : `Informe ${artigo(label)} ${label.toLowerCase()}.`;
}

function artigo(label) {
  const l = label.toLowerCase();
  const fem = ['data', 'companhia', 'cia', 'apólice', 'parcela', 'sucursal', 'opção', 'lista', 'situação', 'remessa', 'matrícula', 'senha'];
  return fem.some((w) => l.startsWith(w)) ? 'a' : 'o';
}

/** Valida um campo. Devolve a mensagem de erro ou ''. */
export function checkField(el) {
  if (el.disabled || el.closest('[hidden]')) return '';
  const v = (el.value || '').trim();
  if (el.required && !v) return requiredMsg(el);
  for (const r of (el.dataset.rules || '').split(/\s+/).filter(Boolean)) {
    const msg = RULES[r]?.(v, el);
    if (msg) return msg;
  }
  return '';
}

export function setFieldError(el, msg) {
  const id = `${el.id}-erro`;
  let p = document.getElementById(id);
  const describedby = (el.getAttribute('aria-describedby') || '').split(' ').filter((x) => x && x !== id);
  if (!msg) {
    p?.remove();
    el.removeAttribute('aria-invalid');
    if (describedby.length) el.setAttribute('aria-describedby', describedby.join(' '));
    else el.removeAttribute('aria-describedby');
    return;
  }
  if (!p) {
    p = h('p', { class: 'field-error', id });
    const host = el.closest('.field') || el.parentElement;
    host.append(p);
  }
  p.replaceChildren(icon('erros', 'icon-sm'), h('span', { text: msg }));
  el.setAttribute('aria-invalid', 'true');
  el.setAttribute('aria-describedby', [id, ...describedby].join(' '));
}

/**
 * Valida o formulário inteiro.
 * extra(form) devolve [{ el, msg }] com as regras de negócio da tela.
 * Devolve true se está tudo certo; senão mostra os erros e foca o resumo.
 */
export function validateForm(form, extra) {
  const fields = $$('input, select, textarea', form).filter((el) => el.id && el.type !== 'radio' && el.type !== 'checkbox');
  const errors = [];
  for (const el of fields) {
    const msg = checkField(el);
    setFieldError(el, msg);
    if (msg) errors.push({ el, msg });
  }
  if (extra) {
    for (const e of extra(form) || []) {
      if (errors.some((x) => x.el === e.el)) continue;
      setFieldError(e.el, e.msg);
      errors.push(e);
    }
  }
  renderSummary(form, errors);
  form.dataset.validated = 'true';
  return errors.length === 0;
}

function renderSummary(form, errors) {
  $('.error-summary', form)?.remove();
  if (!errors.length) return;
  const box = h('div', { class: 'error-summary', tabindex: '-1', role: 'group', 'aria-labelledby': `${form.id}-resumo` },
    h('h2', { id: `${form.id}-resumo` }, icon('erros'), errors.length === 1 ? 'Corrija 1 campo para continuar' : `Corrija ${errors.length} campos para continuar`),
    h('ul', {}, errors.map((e) => h('li', {}, h('a', {
      href: `#${e.el.id}`,
      on: { click: (ev) => { ev.preventDefault(); e.el.focus(); } },
    }, e.msg)))));
  form.prepend(box);
  box.focus();
}

export function clearErrors(form) {
  $('.error-summary', form)?.remove();
  $$('[aria-invalid="true"]', form).forEach((el) => setFieldError(el, ''));
  delete form.dataset.validated;
}

/** Máscaras e limpeza de erros durante a correção. */
export function enhance(form) {
  form.setAttribute('novalidate', '');
  form.addEventListener('input', (e) => {
    const el = e.target;
    const mask = el.dataset?.mask;
    if (mask === 'guid') {
      const pos = el.selectionStart;
      const before = el.value;
      el.value = before.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17);
      if (before !== el.value && pos !== null) el.setSelectionRange(Math.min(pos, el.value.length), Math.min(pos, el.value.length));
    }
    if (mask === 'digits') el.value = el.value.replace(/\D/g, '').slice(0, Number(el.maxLength) > 0 ? el.maxLength : 20);
    if (form.dataset.validated && el.getAttribute('aria-invalid') === 'true' && !checkField(el)) {
      setFieldError(el, '');
      const summary = $('.error-summary', form);
      if (summary && !$('[aria-invalid="true"]', form)) summary.remove();
    }
  });
  form.addEventListener('change', (e) => {
    const el = e.target;
    if (form.dataset.validated && el.getAttribute('aria-invalid') === 'true' && !checkField(el)) setFieldError(el, '');
  });
}

/** Lê os valores nomeados do formulário. */
export function values(form) {
  const out = {};
  for (const [k, v] of new FormData(form).entries()) out[k] = typeof v === 'string' ? v.trim() : v;
  return out;
}

/** Preenche o formulário a partir de um objeto. */
export function fill(form, data) {
  if (!data) return;
  for (const [k, v] of Object.entries(data)) {
    const els = $$(`[name="${k}"]`, form);
    for (const el of els) {
      if (el.type === 'radio' || el.type === 'checkbox') el.checked = el.value === v;
      else el.value = v;
    }
  }
}

/** Preenche um <select> com opções. */
export function options(select, list, { placeholder, value } = {}) {
  select.replaceChildren();
  if (placeholder !== undefined) select.append(h('option', { value: '', text: placeholder }));
  for (const o of list) select.append(h('option', { value: o.value, text: o.label, selected: value !== undefined && o.value === value }));
}
