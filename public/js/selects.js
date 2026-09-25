import { tr } from './i18n.js';
// Native form values stay the source of truth; every visible picker uses our design.
let serial = 0;
let active = null;
const controls = new WeakMap();
const labelOf = (select) => select.getAttribute('aria-label') || select.labels?.[0]?.querySelector('.sr-only, span')?.textContent?.trim() || select.name || tr('Vybrat');

function close(restore = false) {
  if (!active) return;
  const { button, panel } = active;
  active = null;
  button.setAttribute('aria-expanded', 'false');
  button.removeAttribute('aria-activedescendant');
  panel.remove();
  if (restore && button.isConnected) button.focus();
}

function open(select, button) {
  if (select.disabled) return;
  if (active?.button === button) { close(); return; }
  close();
  const panel = document.createElement('div');
  panel.className = 'picker-menu';
  panel.id = button.getAttribute('aria-controls');
  panel.setAttribute('role', 'listbox');
  panel.setAttribute('aria-label', labelOf(select));
  panel.setAttribute('popover', 'manual');
  const options = [...select.options];
  let index = Math.max(0, select.selectedIndex);
  const choose = (i) => {
    if (options[i]?.disabled) return;
    const changed = select.selectedIndex !== i;
    select.selectedIndex = i;
    close(true);
    sync(select);
    if (changed) {
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };
  options.forEach((option, i) => {
    const item = document.createElement('div');
    item.className = 'picker-option';
    item.id = `${panel.id}-${i}`;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(i === select.selectedIndex));
    if (option.disabled) item.setAttribute('aria-disabled', 'true');
    item.textContent = option.textContent;
    item.addEventListener('pointerdown', (e) => e.preventDefault());
    item.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); choose(i); });
    panel.append(item);
  });
  // Uvnitř modálního okna (aria-modal) musí být i nabídka – co je mimo, prohlížeč ze stromu
  // přístupnosti vyřadí a čtečka obrazovky položky nepřečte. Nabídka běží ve vrchní vrstvě
  // (popover), takže ji posouvání ani animace okna neoříznou.
  (button.closest('[aria-modal="true"]') || document.body).append(panel);
  panel.showPopover?.();
  const rect = button.getBoundingClientRect();
  const width = Math.min(Math.max(rect.width, 200), innerWidth - 24);
  panel.style.width = `${width}px`;
  panel.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - width - 12))}px`;
  const below = innerHeight - rect.bottom - 16;
  const above = rect.top - 16;
  panel.style.maxHeight = `${Math.max(64, Math.min(320, Math.max(below, above)))}px`;
  panel.style.top = `${below >= Math.min(panel.scrollHeight, 240) || below >= above ? rect.bottom + 6 : Math.max(8, rect.top - panel.offsetHeight - 6)}px`;
  button.setAttribute('aria-expanded', 'true');
  const highlight = () => {
    [...panel.children].forEach((item, i) => item.classList.toggle('is-highlighted', i === index));
    button.setAttribute('aria-activedescendant', `${panel.id}-${index}`);
    const item = panel.children[index];
    if (item) {
      if (item.offsetTop < panel.scrollTop) panel.scrollTop = item.offsetTop;
      else if (item.offsetTop + item.offsetHeight > panel.scrollTop + panel.clientHeight) panel.scrollTop = item.offsetTop + item.offsetHeight - panel.clientHeight;
    }
  };
  let typed = '', typedAt = 0;
  active = { button, panel, select, key(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(true); return; }
    if (e.key === 'Tab') { close(); return; }
    if (['Enter', ' '].includes(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); choose(index); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault(); e.stopImmediatePropagation();
      const direction = e.key === 'ArrowUp' || e.key === 'End' ? -1 : 1;
      index = e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : (index + direction + options.length) % options.length;
      for (let n = 0; n < options.length && options[index]?.disabled; n++) index = (index + direction + options.length) % options.length;
      highlight();
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
      e.preventDefault(); e.stopImmediatePropagation();
      typed = Date.now() - typedAt > 700 ? e.key : typed + e.key;
      typedAt = Date.now();
      const found = options.findIndex((o) => !o.disabled && o.textContent.toLocaleLowerCase('cs').startsWith(typed.toLocaleLowerCase('cs')));
      if (found >= 0) { index = found; highlight(); }
    }
  } };
  highlight();
}

function sync(select) {
  const button = controls.get(select);
  if (!button) return;
  const text = select.selectedOptions[0]?.textContent || tr('Vybrat');
  if (button.firstElementChild.textContent !== text) button.firstElementChild.textContent = text;
  button.disabled = select.disabled;
  const label = `${labelOf(select)}: ${text}`;
  if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
  for (const attr of ['aria-invalid', 'aria-describedby']) {
    if (select.hasAttribute(attr)) {
      if (button.getAttribute(attr) !== select.getAttribute(attr)) button.setAttribute(attr, select.getAttribute(attr));
    } else if (button.hasAttribute(attr)) button.removeAttribute(attr);
  }
}

export function initSelects() {
  const enhance = () => {
    if (active && (!active.button.isConnected || active.select.disabled)) close();
    document.querySelectorAll('select:not([multiple])').forEach((select) => {
      if (!controls.has(select)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'picker-trigger';
        const label = document.createElement('span');
        label.className = 'picker-label';
        button.append(label);
        button.setAttribute('role', 'combobox');
        button.setAttribute('aria-haspopup', 'listbox');
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-controls', `picker-${++serial}`);
        controls.set(select, button);
        select.classList.add('picker-source');
        select.tabIndex = -1;
        select.setAttribute('aria-hidden', 'true');
        select.after(button);
        button.addEventListener('click', (e) => { e.preventDefault(); open(select, button); });
        button.addEventListener('keydown', (e) => {
          if (['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); open(select, button); }
        });
        select.addEventListener('change', () => sync(select));
        select.addEventListener('focus', () => button.focus());
      }
      sync(select);
    });
  };
  new MutationObserver(enhance).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'selected', 'aria-invalid', 'aria-describedby'] });
  window.addEventListener('keydown', (e) => active?.key(e), true);
  document.addEventListener('pointerdown', (e) => { if (active && !active.panel.contains(e.target) && !active.button.contains(e.target)) close(); }, true);
  document.addEventListener('wheel', (e) => { if (active && !active.panel.contains(e.target)) close(); }, { capture: true, passive: true });
  document.addEventListener('touchmove', (e) => { if (active && !active.panel.contains(e.target)) close(); }, { capture: true, passive: true });
  window.addEventListener('resize', () => close());
  window.addEventListener('hashchange', () => close());
  document.addEventListener('reset', () => requestAnimationFrame(enhance));
  enhance();
}
