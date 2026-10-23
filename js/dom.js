/*
 * Utilitários de DOM. Tudo é montado com createElement e textContent,
 * nunca com innerHTML, para nenhum texto virar HTML.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Cria um elemento.
 * h('a', { href: '#', class: 'btn', on: { click: fn } }, 'Texto', filho)
 * Atributos especiais: class, text, dataset, on, e propriedades booleanas
 * (hidden, disabled, checked, selected) quando o valor é booleano.
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  applyAttrs(el, attrs);
  append(el, children);
  return el;
}

export function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'on') { for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn); continue; }
    if (k === 'text') { el.textContent = v; continue; }
    el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

function applyAttrs(el, attrs) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined) continue;
    if (k === 'class') { el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v; continue; }
    if (k === 'text') { el.textContent = v; continue; }
    if (k === 'dataset') { Object.assign(el.dataset, v); continue; }
    if (k === 'on') { for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn); continue; }
    if (typeof v === 'boolean') {
      if (k in el && !k.startsWith('aria-')) el[k] = v;
      else if (k.startsWith('aria-')) el.setAttribute(k, String(v));
      else if (v) el.setAttribute(k, '');
      continue;
    }
    if (k === 'value' && 'value' in el) { el.value = v; continue; }
    el.setAttribute(k, String(v));
  }
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Ícone do sprite: icon('busca', 'icon-sm') */
export function icon(name, extra = '') {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('class', `icon ${extra}`.trim());
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('focusable', 'false');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `img/icons.svg#i-${name}`);
  s.append(use);
  return s;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

export function replace(el, ...children) {
  clear(el);
  return append(el, children);
}

let uid = 0;
export const nextId = (prefix = 'id') => `${prefix}-${++uid}`;

/** Lê um parâmetro da URL. */
export const param = (name) => new URLSearchParams(location.search).get(name);
