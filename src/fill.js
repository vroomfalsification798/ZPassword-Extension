/*
 * ZPassword — Copyright (C) 2026 TheHolyOneZ
 * Licensed under the GNU General Public License v3 or later. See LICENSE.
 */

export function fillPasswordFields(password) {
  const inputs = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      if (el instanceof HTMLInputElement) inputs.push(el);
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);

  const usable = (el) => {
    if (el.disabled || el.readOnly) return false;
    const rects = el.getClientRects();
    if (!rects.length) return false;
    const style = getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none';
  };

  const hint = (el) =>
    [el.autocomplete, el.name, el.id, el.placeholder, el.getAttribute('aria-label')]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

  const isPasswordish = (el) =>
    el.type === 'password' || (el.type === 'text' && /pass(word)?|pwd/.test(hint(el)));

  let fields = inputs.filter((el) => isPasswordish(el) && usable(el));
  if (fields.length === 0) return { filled: 0, reason: 'no-password-field' };

  const active = document.activeElement;
  if (active instanceof HTMLInputElement && fields.includes(active)) {
    fields = [active];
  } else {
    const isNew = (el) => /new|confirm|repeat|retype|verify|again/.test(hint(el));
    const isCurrent = (el) => /current|old|existing/.test(hint(el));

    const fresh = fields.filter(isNew);
    if (fresh.length) fields = fresh;
    else if (fields.length > 1) fields = fields.filter((el) => !isCurrent(el));
  }
  if (fields.length === 0) return { filled: 0, reason: 'only-current-password' };

  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;

  for (const el of fields) {
    el.focus();
    nativeSetter.call(el, password);
    el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  return { filled: fields.length, reason: null };
}
