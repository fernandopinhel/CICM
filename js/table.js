/*
 * Tabela de dados: ordenação por coluna, paginação, seleção em lote,
 * exportação para CSV e impressão. A mesma em todas as consultas.
 */

import { h, icon, $, $$, clear, nextId } from './dom.js';
import { num, norm } from './format.js';
import { announce, emptyState } from './ui.js';

const PAGE_SIZES = [10, 25, 50, 100];

/**
 * columns: [{ key, label, value(row), render(row), num, rowHeader, sortable, csv(row), cls }]
 * Devolve { el, update(rows, opts), selected(), clearSelection() }.
 */
export function dataTable(cfg) {
  const {
    caption, columns, rowKey, selectable = false, rowLabel = (r) => rowKey(r),
    exportName = 'cicm', emptyTitle = 'Nada encontrado', emptyText = 'Ajuste os filtros e consulte de novo.',
    bulk, onSelectionChange,
  } = cfg;
  let rows = cfg.rows || [];
  let pageSize = cfg.pageSize || 10;
  let page = 1;
  let sort = cfg.sort || null;
  let highlight = cfg.highlight || null;
  let highlightTimer = null;
  const selected = new Set(cfg.initialSelected || []);

  const capId = nextId('tbl-cap');
  const countEl = h('p', { class: 'count', 'aria-live': 'polite' });
  const sizeId = nextId('tbl-size');
  const sizeSel = h('select', { class: 'select', id: sizeId },
    PAGE_SIZES.map((n) => h('option', { value: n, selected: n === pageSize, text: n })));
  sizeSel.addEventListener('change', () => { pageSize = Number(sizeSel.value); page = 1; render(); });

  const btnCsv = h('button', { type: 'button', class: 'btn btn-sm', on: { click: exportCsv } }, icon('baixar'), 'Exportar CSV');
  const btnPrint = h('button', { type: 'button', class: 'btn btn-sm', on: { click: () => window.print() } }, icon('imprimir'), 'Imprimir');
  const tools = h('div', { class: 'table-tools' },
    countEl,
    cfg.toolsExtra || null,
    h('div', { class: 'inline-field' }, h('label', { for: sizeId, text: 'Por página' }), sizeSel),
    btnCsv, btnPrint);

  const bulkCount = h('strong');
  const bulkActions = h('div', { class: 'page-actions' });
  const bulkBar = h('div', { class: 'bulkbar', hidden: true }, bulkCount, bulkActions,
    h('button', { type: 'button', class: 'btn btn-ghost btn-sm', on: { click: () => { selected.clear(); render(); announce('Seleção limpa'); } } }, 'Limpar seleção'));

  const thead = h('thead');
  const tbody = h('tbody');
  const table = h('table', { class: 'data' }, h('caption', { class: 'visually-hidden', id: capId, text: caption }), thead, tbody);
  const scroll = h('div', { class: 'table-scroll', role: 'region', 'aria-label': `${caption}, tabela`, tabindex: '0' }, table);
  const pager = h('nav', { class: 'pager', 'aria-label': `Páginas de ${caption.toLowerCase()}` });
  const empty = h('div');
  const el = h('div', { class: 'data-table' }, tools, bulkBar, scroll, empty, pager);

  function sorted() {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    const val = col.value || ((r) => r[col.key]);
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = val(a); const vb = val(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va ?? '').localeCompare(String(vb ?? ''), 'pt-BR', { numeric: true }) * dir;
    });
  }

  function renderHead(pageRows) {
    clear(thead);
    const tr = h('tr');
    if (selectable) {
      const all = h('input', { type: 'checkbox', 'aria-label': 'Selecionar todos desta página' });
      const elig = pageRows.filter((r) => !cfg.canSelect || cfg.canSelect(r));
      const n = elig.filter((r) => selected.has(rowKey(r))).length;
      all.checked = elig.length > 0 && n === elig.length;
      all.indeterminate = n > 0 && n < elig.length;
      all.disabled = !elig.length;
      all.addEventListener('change', () => {
        elig.forEach((r) => (all.checked ? selected.add(rowKey(r)) : selected.delete(rowKey(r))));
        render();
        announce(`${num(selected.size)} selecionados`);
        $('thead input[type="checkbox"]', table)?.focus();
      });
      tr.append(h('th', { class: 'col-check', scope: 'col' }, all));
    }
    for (const c of columns) {
      const th = h('th', { scope: 'col', class: [c.num ? 'col-num' : '', c.cls || ''] });
      if (c.sortable === false) th.append(c.label);
      else {
        const active = sort && sort.key === c.key;
        if (active) th.setAttribute('aria-sort', sort.dir === 'asc' ? 'ascending' : 'descending');
        const b = h('button', { type: 'button', class: 'sort-btn', dataset: { key: c.key } },
          c.label, icon(active ? (sort.dir === 'asc' ? 'cima' : 'baixo') : 'ordenar'));
        b.addEventListener('click', () => {
          sort = active && sort.dir === 'asc' ? { key: c.key, dir: 'desc' } : { key: c.key, dir: 'asc' };
          page = 1;
          render();
          announce(`Ordenado por ${c.label.toLowerCase()}, ${sort.dir === 'asc' ? 'crescente' : 'decrescente'}`);
          $(`.sort-btn[data-key="${c.key}"]`, thead)?.focus();
        });
        th.append(b);
      }
      tr.append(th);
    }
    thead.append(tr);
  }

  function renderBody(pageRows) {
    clear(tbody);
    for (const r of pageRows) {
      const key = rowKey(r);
      const tr = h('tr', { class: [selected.has(key) ? 'is-selected' : '', highlight === key ? 'is-new' : ''], dataset: { key } });
      if (selectable) {
        const can = !cfg.canSelect || cfg.canSelect(r);
        const cb = h('input', { type: 'checkbox', 'aria-label': `Selecionar ${rowLabel(r)}`, checked: selected.has(key), disabled: !can });
        cb.addEventListener('change', () => {
          if (cb.checked) selected.add(key); else selected.delete(key);
          tr.classList.toggle('is-selected', cb.checked);
          renderHead(pageRows);
          renderBulk();
        });
        tr.append(h('td', { class: 'col-check' }, cb));
      }
      for (const c of columns) {
        const content = c.render ? c.render(r) : (c.value ? c.value(r) : r[c.key]);
        tr.append(h(c.rowHeader ? 'th' : 'td', { scope: c.rowHeader ? 'row' : null, class: [c.num ? 'col-num' : '', c.cls || ''] }, content));
      }
      tbody.append(tr);
    }
  }

  function renderBulk() {
    if (!selectable) return;
    bulkBar.hidden = selected.size === 0;
    bulkCount.textContent = `${num(selected.size)} ${selected.size === 1 ? 'selecionado' : 'selecionados'}`;
    clear(bulkActions);
    if (bulk && selected.size) bulkActions.append(bulk([...selected]));
    if (ready) onSelectionChange?.([...selected]);
  }

  function renderPager(total, pages) {
    clear(pager);
    pager.hidden = total === 0;
    const ini = total ? (page - 1) * pageSize + 1 : 0;
    const fim = Math.min(total, page * pageSize);
    pager.append(h('p', { class: 'muted', text: `Mostrando ${num(ini)} a ${num(fim)} de ${num(total)}` }));
    const ul = h('ul');
    const btn = (label, target, iconName, disabled, current) => {
      const b = h('button', {
        type: 'button', disabled, 'aria-current': current ? 'page' : null, dataset: { page: target },
        'aria-label': iconName ? label : `Página ${target}`,
      }, iconName ? icon(iconName, 'icon-sm') : String(target));
      b.addEventListener('click', () => {
        page = target;
        render();
        const again = $(`button[data-page="${target}"]${iconName ? '' : '[aria-current]'}`, pager) || $('button[aria-current]', pager);
        (again && !again.disabled ? again : $('button[aria-current]', pager))?.focus();
        announce(`Página ${page} de ${pages}`);
      });
      return h('li', {}, b);
    };
    ul.append(btn('Primeira página', 1, 'primeira', page === 1), btn('Página anterior', Math.max(1, page - 1), 'esquerda', page === 1));
    const show = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
    let last = 0;
    for (const p of [...show].sort((a, b) => a - b)) {
      if (p - last > 1) ul.append(h('li', { class: 'gap', 'aria-hidden': 'true', text: '…' }));
      ul.append(btn('', p, null, false, p === page));
      last = p;
    }
    ul.append(btn('Próxima página', Math.min(pages, page + 1), 'direita', page === pages), btn('Última página', pages, 'ultima', page === pages));
    pager.append(ul);
  }

  function render() {
    const all = sorted();
    const total = all.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (highlight) {
      const i = all.findIndex((r) => rowKey(r) === highlight);
      if (i >= 0 && cfg._jumped !== highlight) { page = Math.floor(i / pageSize) + 1; cfg._jumped = highlight; }
    }
    page = Math.min(page, pages);
    const pageRows = all.slice((page - 1) * pageSize, page * pageSize);
    /* O destaque de "recém-criado" aparece uma vez só */
    if (highlight && !highlightTimer) highlightTimer = setTimeout(() => { highlight = null; highlightTimer = null; }, 2600);

    clear(countEl);
    countEl.append(h('strong', { text: num(total) }), ` ${total === 1 ? 'resultado' : 'resultados'}`);
    btnCsv.disabled = btnPrint.disabled = sizeSel.disabled = total === 0;

    scroll.hidden = total === 0;
    clear(empty);
    if (!total) empty.append(emptyState(emptyTitle, emptyText));
    renderHead(pageRows);
    renderBody(pageRows);
    renderBulk();
    renderPager(total, pages);
  }

  function csvCell(v) {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[";\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  }

  function exportCsv() {
    const cols = columns.filter((c) => c.csv !== false);
    const lines = [cols.map((c) => csvCell(c.label)).join(';')];
    for (const r of sorted()) {
      lines.push(cols.map((c) => csvCell(c.csv ? c.csv(r) : c.value ? c.value(r) : r[c.key])).join(';'));
    }
    const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `${exportName}.csv` });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    announce(`Arquivo ${exportName}.csv gerado com ${num(rows.length)} linhas`);
  }

  let ready = false;
  render();
  ready = true;

  return {
    el,
    update(newRows, opts = {}) {
      rows = newRows;
      if (opts.resetPage) page = 1;
      if ('highlight' in opts) highlight = opts.highlight;
      if (opts.select) { selected.clear(); opts.select.forEach((k) => selected.add(k)); }
      const keys = new Set(rows.map(rowKey));
      for (const k of [...selected]) if (!keys.has(k)) selected.delete(k);
      render();
    },
    /** Redesenha só o corpo, sem perder foco nem página (para progresso ao vivo). */
    refresh() {
      const focused = document.activeElement;
      const key = focused?.closest?.('tr')?.dataset.key;
      render();
      if (key && focused && !focused.isConnected) {
        const tr = $(`tr[data-key="${CSS.escape(key)}"]`, tbody);
        const same = tr && $$('a, button, input', tr).find((x) => x.textContent === focused.textContent && x.tagName === focused.tagName);
        same?.focus();
      }
    },
    selected: () => [...selected],
    clearSelection() { selected.clear(); render(); },
  };
}

/** Filtro de texto simples sobre várias propriedades. */
export const textMatch = (q, ...vals) => !q || vals.some((v) => norm(v).includes(norm(q)));
