/*
 * ZPassword — Copyright (C) 2026 TheHolyOneZ
 * Licensed under the GNU General Public License v3 or later. See LICENSE.
 */

import { activeTab, api, hostOf } from '../src/browser.js';
import { FILL_MESSAGES, fillIntoTab } from '../src/inject.js';
import * as gen from '../src/generator.js';
import * as prefs from '../src/prefs.js';
import * as strength from '../src/strength.js';
import * as vault from '../src/vault.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const state = {
  profile: { ...prefs.DEFAULT_PROFILE },

  global: { ...prefs.DEFAULT_GLOBAL },

  pinned: false,
  host: null,
  tabId: null,
  password: '',

  recorded: null,

  autoRecordId: null,

  picker: null,

  entries: [],
  unreadable: 0,
  entryFilter: '',
  siteFilter: '',
};

const ICON = {
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.2A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a18 18 0 0 1-3.2 4M6.3 6.4A18 18 0 0 0 2 12s3.6 7 10 7a10.8 10.8 0 0 0 4-.75"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  fill: '<path d="M12 3v13"/><path d="M7 11l5 5 5-5"/><path d="M4 20h16"/>',
  note: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
};

function iconButton(name, title, action) {
  const b = document.createElement('button');
  b.className = 'icon-btn';
  b.title = title;
  b.setAttribute('aria-label', title);
  b.dataset.act = action;
  b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`;
  return b;
}

let toastTimer;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('is-shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-shown'), 2200);
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
function ago(ts) {
  const seconds = (ts - Date.now()) / 1000;
  for (const [unit, size] of [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(Math.round(seconds), 'second');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

async function guard(work) {
  try {
    await work();
    return true;
  } catch (error) {
    toast(error.message);
    return false;
  }
}

function writeControls() {
  $('#length').value = state.profile.length;
  $('#length-out').textContent = state.profile.length;

  for (const chip of $$('.chip')) {
    const key = chip.dataset.class;
    const used = gen.classChars(state.profile, key).length;
    const total = gen.UNIVERSE[key].length;
    const on = Boolean(state.profile[key]);
    chip.classList.toggle('is-on', on);
    chip.classList.toggle('is-trimmed', used !== total);
    chip.querySelector('.chip-toggle').setAttribute('aria-pressed', String(on));
    chip.querySelector('.chip-count').textContent = used === total ? `${total}` : `${used}/${total}`;
  }

  for (const el of $$('[data-opt]')) el.checked = Boolean(state.profile[el.dataset.opt]);
  for (const el of $$('[data-prof]')) el.checked = Boolean(state.profile[el.dataset.prof]);
  for (const el of $$('[data-global]')) el.value = String(state.global[el.dataset.global]);
}

function renderStrength() {
  const bits = gen.entropyBits(state.profile);
  const { key, text } = gen.strengthLabel(bits);
  const fill = $('#meter-fill');
  fill.className = key;
  fill.style.width = `${Math.min(100, (bits / 128) * 100)}%`;
  $('#strength-text').textContent = text;
  $('#bits-text').textContent = `${Math.round(bits)} bits of entropy`;
}

function paintPassword(value) {
  const pw = $('#pw');
  pw.replaceChildren();
  for (const ch of value) {
    const span = document.createElement('span');
    span.className = /[0-9]/.test(ch)
      ? 'c-digit'
      : /[A-Za-z]/.test(ch)
        ? 'c-letter'
        : 'c-symbol';
    span.textContent = ch;
    pw.append(span);
  }
  pw.setAttribute('aria-label', `Generated password, ${value.length} characters. Click to copy.`);
}

function regenerate() {
  const problem = gen.validate(state.profile);
  const pw = $('#pw');
  const error = $('#error');

  if (problem) {
    state.password = '';
    pw.textContent = 'Adjust the options below';
    pw.classList.add('is-empty');
    error.textContent = problem;
    error.hidden = false;
  } else {
    state.password = gen.generate(state.profile);
    state.recorded = null;
    paintPassword(state.password);
    pw.classList.remove('is-empty');
    error.hidden = true;
  }

  $('#copy').disabled = !state.password;
  $('#fill').disabled = !state.password || state.tabId === null;
  renderStrength();
}

async function persistProfile() {
  await guard(async () => {
    if (state.pinned && state.host) await prefs.saveForSite(state.host, state.profile);
    else await prefs.saveDefaults(state.profile);
  });
}

let updateTimer;
function scheduleUpdate({ fresh = true } = {}) {
  clearTimeout(updateTimer);
  updateTimer = setTimeout(async () => {
    if (fresh) regenerate();
    await persistProfile();
    if (fresh) await autoFillNow();
  }, 220);
}

function expandAmbiguousShortcut() {
  if (!state.profile.excludeAmbiguous) return;
  const exclude = gen.excludeMap(state.profile);
  for (const key of gen.CLASS_KEYS) {
    const set = new Set(exclude[key]);
    for (const ch of gen.AMBIGUOUS) if (gen.UNIVERSE[key].includes(ch)) set.add(ch);
    exclude[key] = [...set].join('');
  }
  state.profile.excludeAmbiguous = false;
  state.profile.exclude = exclude;
}

function setExclusion(key, chars, focusChar) {
  state.profile.exclude = { ...gen.excludeMap(state.profile), [key]: chars };
  renderPicker(focusChar);
  writeControls();
  scheduleUpdate();
}

function toggleChar(key, char) {
  if (gen.charState(state.profile, key, char) === 'ambiguous') expandAmbiguousShortcut();
  const set = new Set(gen.excludeMap(state.profile)[key]);
  if (set.has(char)) set.delete(char);
  else set.add(char);
  setExclusion(key, [...set].join(''), char);
}

function renderPicker(focusChar) {
  const key = state.picker;
  if (!key) return;

  $('#picker-title').textContent = gen.CLASS_LABELS[key];

  const grid = $('#picker-grid');
  grid.replaceChildren();
  let on = 0;

  for (const char of gen.UNIVERSE[key]) {
    const status = gen.charState(state.profile, key, char);
    if (status === 'on') on++;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'char';
    button.dataset.char = char;
    button.textContent = char;
    button.setAttribute('aria-pressed', String(status === 'on'));
    button.classList.toggle('is-off', status !== 'on');
    button.classList.toggle('is-amb', status === 'ambiguous');
    button.title =
      status === 'ambiguous'
        ? 'Held off by "Exclude look-alikes" — click to take manual control'
        : status === 'off'
          ? 'Switched off'
          : 'In use';
    button.addEventListener('click', () => toggleChar(key, char));
    grid.append(button);
  }

  $('#picker-count').textContent = `${on} of ${gen.UNIVERSE[key].length} in use`;

  const note = $('#picker-note');
  if (on === 0) {
    note.textContent = 'Nothing left — this kind will not be used at all.';
    note.hidden = false;
  } else if (!state.profile[key]) {
    note.textContent = `${gen.CLASS_LABELS[key]} are switched off entirely — tap the ${gen.CLASS_SHORT[key]} button to use them.`;
    note.hidden = false;
  } else {
    note.hidden = true;
  }

  if (focusChar) {
    [...grid.children].find((el) => el.dataset.char === focusChar)?.focus();
  }
}

let pickerReturnFocus = null;
function openPicker(key) {
  pickerReturnFocus = document.activeElement;
  state.picker = key;
  renderPicker();
  $('#picker').hidden = false;
  $('#picker-grid').querySelector('.char')?.focus();
}

function closePicker() {
  state.picker = null;
  $('#picker').hidden = true;
  pickerReturnFocus?.focus?.();
  pickerReturnFocus = null;
}

function movePickerFocus(current, delta) {
  const buttons = [...$('#picker-grid').querySelectorAll('.char')];
  const index = buttons.indexOf(current);
  if (index === -1) return;
  const next = buttons[(index + delta + buttons.length) % buttons.length];
  next?.focus();
}

function pickerColumns() {
  const template = getComputedStyle($('#picker-grid')).gridTemplateColumns;
  return Math.max(1, template.split(' ').filter(Boolean).length);
}

async function recordUse({ replace = false } = {}) {
  if (!state.password || state.recorded === state.password) return;
  if (!state.profile.historyEnabled || !(await vault.isSetUp())) return;

  if (replace && state.autoRecordId) await vault.deleteEntry(state.autoRecordId);
  const id = await vault.record({ password: state.password, host: state.host });
  state.recorded = state.password;
  state.autoRecordId = replace ? id : null;
}

function showFillStatus(text, kind) {
  const el = $('#fill-status');
  el.textContent = text;
  el.className = `fill-status ${kind}`;
  el.hidden = false;
}

async function autoFillNow() {
  if (!state.profile.autoFill || !state.password || state.tabId === null) return;
  const { filled, reason } = await fillIntoTab(state.tabId, state.password);
  if (filled) {
    showFillStatus(filled === 1 ? 'Filled the password box' : `Filled ${filled} boxes`, 'ok');
    await recordUse({ replace: true });
  } else {
    showFillStatus(FILL_MESSAGES[reason] ?? 'Nothing to fill.', 'warn');
  }
}

async function doCopy() {
  if (!state.password) return;
  const ok = await copyText(state.password);
  toast(ok ? 'Copied to clipboard' : 'Could not reach the clipboard');
  if (!ok) return;
  await recordUse();
  state.autoRecordId = null;
}

async function doFill() {
  if (!state.password || state.tabId === null) return;
  const { filled, reason } = await fillIntoTab(state.tabId, state.password);
  if (!filled) {
    toast(FILL_MESSAGES[reason] ?? 'Nothing to fill.');
    return;
  }
  await recordUse();
  state.autoRecordId = null;
  toast(filled === 1 ? 'Filled the password box' : `Filled ${filled} boxes`);
  setTimeout(() => window.close(), 500);
}

function renderScope() {
  const bar = $('#site-bar');
  const toggle = $('#site-toggle');

  if (!state.host) {
    $('#site-host').textContent = 'No website open';
    $('#site-note').textContent = 'Editing your defaults';
    toggle.hidden = true;
    bar.classList.remove('is-pinned');
  } else {
    toggle.hidden = false;
    $('#site-host').textContent = state.host;
    bar.classList.toggle('is-pinned', state.pinned);
    $('#site-note').textContent = state.pinned ? 'Uses its own rules' : 'Uses your default rules';
    toggle.textContent = state.pinned ? 'Unpin' : 'Pin these here';
  }

  $('#scope-text').textContent = state.pinned
    ? `These apply to ${state.host} only. Your defaults are untouched.`
    : state.host
      ? `These are your defaults. Pin ${state.host} on the Generate tab to give it its own.`
      : 'These are your defaults.';
}

async function toggleSite() {
  if (!state.host) return;
  if (state.pinned) {
    await prefs.clearSite(state.host);
    const { profile } = await prefs.getProfile(state.host);
    state.profile = profile;
    state.pinned = false;
    writeControls();
    regenerate();
    toast(`${state.host} now follows your defaults`);
  } else {
    if (!(await guard(() => prefs.saveForSite(state.host, state.profile)))) return;
    state.pinned = true;
    toast(`Saved these rules for ${state.host}`);
  }
  renderScope();
  await renderSites();
}

function showPane(name) {
  for (const tab of $$('.tab')) {
    const active = tab.dataset.pane === name;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  }
  for (const pane of $$('.pane')) pane.classList.toggle('is-active', pane.id === `pane-${name}`);
  if (name === 'recent') renderRecent();
  if (name === 'sites') renderSites();
}

function showState(id) {
  for (const el of $$('#pane-recent .state')) el.hidden = el.id !== id;
}

let lockTimerHandle;
async function renderLockTimer() {
  const remaining = await vault.lockCountdown();
  const el = $('#lock-timer');
  if (remaining === null) {
    el.hidden = true;
    clearInterval(lockTimerHandle);
    lockTimerHandle = null;
    return;
  }
  const total = Math.round(remaining / 1000);
  const mins = Math.floor(total / 60);
  el.textContent = mins >= 1 ? `locks in ${mins}m` : `locks in ${total}s`;
  el.hidden = false;
  if (!lockTimerHandle) lockTimerHandle = setInterval(renderLockTimer, 1000);
}

async function renderRecent() {
  const setUp = await vault.isSetUp();
  const unlocked = setUp && Boolean(await vault.unlockedKey());

  $('#lock-btn').hidden = !unlocked;
  $('#history-nudge').hidden = !(state.profile.historyEnabled && !setUp);
  $('#pass-change').hidden = !setUp;
  $('#reset-vault').hidden = !setUp;
  $('#backup-row').hidden = !setUp;
  $('#backup-hint').hidden = !setUp;
  await renderLockTimer();

  if (!unlocked) {
    state.entries = [];
    $('#saved-hint').hidden = true;
  }

  if (!state.profile.historyEnabled) return showState('recent-off');
  if (!setUp) return showState('recent-setup');
  if (!unlocked) {
    showState('recent-locked');
    $('#unlock-err').hidden = true;
    $('#unlock-pass').value = '';
    return;
  }
  showState('recent-list');
  await loadEntries();
}

async function loadEntries() {
  try {
    const { entries, unreadable } = await vault.listEntries();
    state.entries = entries;
    state.unreadable = unreadable;
  } catch {
    state.entries = [];
    return renderRecent();
  }
  paintEntries();
  renderSavedHint();
}

function renderSavedHint() {
  const hint = $('#saved-hint');
  if (!state.host) return void (hint.hidden = true);
  const count = state.entries.filter((e) => e.host === state.host).length;
  hint.hidden = count === 0;
  hint.textContent =
    count === 1
      ? `You already have 1 saved password for ${state.host} →`
      : `You already have ${count} saved passwords for ${state.host} →`;
}

function paintEntries() {
  const list = $('#entries');
  list.replaceChildren();

  const needle = state.entryFilter.trim().toLowerCase();
  const shown = needle
    ? state.entries.filter((e) =>
        `${e.host ?? ''} ${e.note ?? ''}`.toLowerCase().includes(needle),
      )
    : state.entries;

  const warn = $('#entry-warn');
  warn.hidden = state.unreadable === 0;
  if (state.unreadable > 0) {
    warn.textContent =
      `${state.unreadable} ${state.unreadable === 1 ? 'entry' : 'entries'} could not be decrypted. ` +
      'Normal if you erased and re-created the history; otherwise something has altered stored data.';
  }

  $('#entry-count').textContent = needle
    ? `${shown.length} of ${state.entries.length} shown`
    : state.entries.length === 1
      ? '1 saved password'
      : `${state.entries.length} saved passwords`;

  $('#entry-search').hidden = state.entries.length < 5;
  $('#entries-empty').hidden = state.entries.length > 0;
  $('#clear-history').hidden = state.entries.length === 0;

  if (state.entries.length > 0 && shown.length === 0) {
    const none = document.createElement('li');
    none.className = 'empty';
    none.textContent = 'Nothing matches that search.';
    list.append(none);
    return;
  }

  for (const entry of shown) list.append(buildEntry(entry));
}

function buildEntry(entry) {
  const li = document.createElement('li');
  li.className = 'entry';

  const host = document.createElement('div');
  host.className = 'entry-host';
  host.textContent = entry.host ?? 'No site';

  const pw = document.createElement('div');
  pw.className = 'entry-pw';
  const mask = '•'.repeat(Math.min(entry.password.length, 28));
  pw.textContent = mask;

  const note = document.createElement('div');
  note.className = 'entry-note';
  note.textContent = entry.note ?? '';
  note.hidden = !entry.note;

  const time = document.createElement('div');
  time.className = 'entry-time';
  time.textContent = ago(entry.ts);

  const actions = document.createElement('div');
  actions.className = 'entry-actions';
  const reveal = iconButton('eye', 'Show', 'reveal');
  actions.append(
    reveal,
    iconButton('copy', 'Copy', 'copy'),
    iconButton('fill', 'Fill on page', 'fill'),
    iconButton('note', 'Add a note', 'note'),
    iconButton('trash', 'Delete', 'delete'),
  );

  actions.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-act]');
    if (!button) return;
    await vault.touchLock(state.global.autoLockMinutes);
    await renderLockTimer();

    switch (button.dataset.act) {
      case 'reveal': {
        const shown = pw.classList.toggle('is-revealed');
        pw.textContent = shown ? entry.password : mask;
        reveal.innerHTML = `<svg viewBox="0 0 24 24">${shown ? ICON.eyeOff : ICON.eye}</svg>`;
        reveal.title = shown ? 'Hide' : 'Show';
        break;
      }
      case 'copy':
        toast((await copyText(entry.password)) ? 'Copied' : 'Could not reach the clipboard');
        break;
      case 'fill': {
        if (state.tabId === null) return toast('No page to fill.');
        const { filled, reason } = await fillIntoTab(state.tabId, entry.password);
        if (filled) {
          toast(filled === 1 ? 'Filled the password box' : `Filled ${filled} boxes`);
          setTimeout(() => window.close(), 500);
        } else {
          toast(FILL_MESSAGES[reason] ?? 'Nothing to fill.');
        }
        break;
      }
      case 'note':
        openNoteEditor(li, entry);
        break;
      case 'delete':
        await vault.deleteEntry(entry.id);
        if (entry.id === state.autoRecordId) state.autoRecordId = null;
        state.entries = state.entries.filter((e) => e.id !== entry.id);
        paintEntries();
        renderSavedHint();
        break;
    }
  });

  li.append(host, pw, note, time, actions);
  return li;
}

function openNoteEditor(li, entry) {
  if (li.querySelector('.entry-note-edit')) return;

  const input = document.createElement('input');
  input.className = 'entry-note-edit';
  input.type = 'text';
  input.value = entry.note ?? '';
  input.placeholder = 'What is this for? Enter to save, Escape to cancel';
  input.setAttribute('aria-label', 'Note for this password');

  const finish = async (save) => {
    if (save) {
      const note = input.value.trim() || null;
      await guard(async () => {
        await vault.updateEntry(entry.id, { note });
        entry.note = note;
      });
    }
    input.remove();
    paintEntries();
  };

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') finish(true);
    if (event.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));

  li.append(input);
  input.focus();
  input.select();
}

async function renderSites() {
  const sites = await prefs.listSiteProfiles();
  const list = $('#site-cards');
  list.replaceChildren();

  $('#sites-empty').hidden = sites.length > 0;
  $('#clear-sites').hidden = sites.length === 0;
  $('#site-search').hidden = sites.length < 6;

  const needle = state.siteFilter.trim().toLowerCase();
  const shown = needle ? sites.filter((s) => s.host.toLowerCase().includes(needle)) : sites;

  for (const { host, profile } of shown) {
    const li = document.createElement('li');
    li.className = 'site-card';
    if (host === state.host) li.classList.add('is-current');

    const details = document.createElement('details');
    const summary = document.createElement('summary');

    const text = document.createElement('div');
    text.className = 'site-card-text';
    const name = document.createElement('span');
    name.className = 'site-card-host';
    name.textContent = host;
    const sum = document.createElement('span');
    sum.className = 'site-card-sum';
    sum.textContent = gen.describe(profile);
    text.append(name, sum);
    summary.append(text);

    if (host === state.host) {
      const here = document.createElement('span');
      here.className = 'badge here';
      here.textContent = 'here';
      summary.append(here);
    }
    if (profile.autoFill) {
      const auto = document.createElement('span');
      auto.className = 'badge';
      auto.textContent = 'auto-fill';
      summary.append(auto);
    }

    const body = document.createElement('div');
    body.className = 'site-card-body';

    for (const [key, label] of [
      ['autoFill', 'Fill the page the moment I open ZPassword here'],
      ['autoCopy', 'Copy to the clipboard on open here'],
      ['historyEnabled', 'Save the passwords I use here'],
    ]) {
      const row = document.createElement('label');
      row.className = 'row';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = Boolean(profile[key]);
      box.addEventListener('change', async () => {
        profile[key] = box.checked;
        if (!(await guard(() => prefs.saveForSite(host, profile)))) return;
        if (host === state.host) {
          state.profile = { ...state.profile, [key]: box.checked };
          writeControls();
          await renderRecent();
        }
        await renderSites();
      });
      const span = document.createElement('span');
      span.textContent = label;
      row.append(box, span);
      body.append(row);
    }

    const note = document.createElement('p');
    note.className = 'hint';
    note.textContent =
      host === state.host
        ? 'Change the character rules on the Generate tab — you are on this site now.'
        : `Open ${host} to change its character rules.`;
    body.append(note);

    const remove = document.createElement('button');
    remove.className = 'link danger';
    remove.textContent = 'Remove these rules';
    remove.addEventListener('click', async () => {
      await prefs.clearSite(host);
      if (host === state.host) {
        const { profile: reset, pinned } = await prefs.getProfile(state.host);
        state.profile = reset;
        state.pinned = pinned;
        writeControls();
        regenerate();
        renderScope();
      }
      await renderSites();
      toast(`${host} now follows your defaults`);
    });
    body.append(remove);

    details.append(summary, body);
    li.append(details);
    list.append(li);
  }
}

async function onSettingsChange(event) {
  const profField = event.target.closest('[data-prof]');
  if (profField) {
    state.profile = { ...state.profile, [profField.dataset.prof]: profField.checked };
    await persistProfile();
    await renderRecent();
    await renderSites();
    if (profField.dataset.prof === 'autoFill' && profField.checked) await autoFillNow();
    return;
  }

  const globalField = event.target.closest('[data-global]');
  if (globalField) {
    await guard(async () => {
      state.global = await prefs.setGlobal({
        [globalField.dataset.global]: Number(globalField.value),
      });
    });
    if (globalField.dataset.global === 'autoLockMinutes') {
      await vault.touchLock(state.global.autoLockMinutes);
      await renderLockTimer();
    }
  }
}

function armDanger(button, confirmLabel, onConfirm) {
  const original = button.textContent;
  let armed = false;
  let timer;
  button.addEventListener('click', async () => {
    if (!armed) {
      armed = true;
      button.textContent = confirmLabel;
      timer = setTimeout(() => {
        armed = false;
        button.textContent = original;
      }, 4000);
      return;
    }
    clearTimeout(timer);
    armed = false;
    button.textContent = original;
    await onConfirm();
  });
}

async function exportBackup() {
  await guard(async () => {
    const backup = await vault.exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `zpassword-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    toast('Backup saved — still encrypted');
  });
}

async function importBackupFile(file) {
  await guard(async () => {
    let backup;
    try {
      backup = JSON.parse(await file.text());
    } catch {
      throw new Error('That file is not readable JSON.');
    }
    const count = await vault.importBackup(backup);
    state.entries = [];
    toast(`Restored ${count} ${count === 1 ? 'entry' : 'entries'} — unlock to read them`);
    await renderRecent();
  });
}

function renderSetupStrength() {
  const value = $('#setup-pass').value;
  const bits = strength.passphraseBits(value);
  const verdict = strength.passphraseVerdict(bits);

  const fill = $('#setup-meter');
  fill.className = verdict.key;
  fill.style.width = `${Math.min(100, (bits / 90) * 100)}%`;
  $('#setup-verdict').textContent = value ? verdict.text : '';
  $('#setup-bits').textContent = value ? `${Math.round(bits)} bits` : '';
  $('#setup-advice').textContent = strength.passphraseAdvice(value) ?? '';
  return verdict;
}

function wireChips() {
  for (const chip of $$('.chip')) {
    const key = chip.dataset.class;
    const toggle = chip.querySelector('.chip-toggle');

    toggle.addEventListener('click', () => {
      state.profile = { ...state.profile, [key]: !state.profile[key] };
      writeControls();
      if (state.picker === key) renderPicker();
      scheduleUpdate();
    });

    toggle.addEventListener('dblclick', () => openPicker(key));
    chip.querySelector('.chip-more').addEventListener('click', () => openPicker(key));
  }
}

function wireTabs() {
  const tabs = $$('.tab');
  for (const tab of tabs) {
    tab.addEventListener('click', () => showPane(tab.dataset.pane));
    tab.addEventListener('keydown', (event) => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      const next = tabs[(tabs.indexOf(tab) + step + tabs.length) % tabs.length];
      showPane(next.dataset.pane);
      next.focus();
    });
  }
}

function wirePicker() {
  for (const el of $$('[data-close-picker]')) el.addEventListener('click', closePicker);

  for (const el of $$('[data-pick]')) {
    el.addEventListener('click', () => {
      const key = state.picker;
      if (!key) return;
      if (el.dataset.pick === 'none') {
        setExclusion(key, gen.UNIVERSE[key]);
        return;
      }
      expandAmbiguousShortcut();
      setExclusion(key, el.dataset.pick === 'all' ? '' : gen.DEFAULT_EXCLUDE[key]);
    });
  }

  $('#picker-grid').addEventListener('keydown', (event) => {
    const button = event.target.closest('.char');
    if (!button) return;
    const columns = pickerColumns();
    const moves = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: columns,
      ArrowUp: -columns,
    };
    if (event.key in moves) {
      event.preventDefault();
      movePickerFocus(button, moves[event.key]);
    }
  });

  $('#picker').addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const focusable = [...$('#picker .sheet-panel').querySelectorAll('button, input')].filter(
      (el) => !el.disabled,
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

function wire() {
  $('#regen').addEventListener('click', async (event) => {
    regenerate();
    event.currentTarget.classList.remove('spin');
    void event.currentTarget.offsetWidth;
    event.currentTarget.classList.add('spin');
    await autoFillNow();
  });
  $('#pw').addEventListener('click', doCopy);
  $('#copy').addEventListener('click', doCopy);
  $('#fill').addEventListener('click', doFill);
  $('#site-toggle').addEventListener('click', toggleSite);
  $('#history-nudge').addEventListener('click', () => showPane('recent'));
  $('#saved-hint').addEventListener('click', () => showPane('recent'));

  $('#intro-dismiss').addEventListener('click', async () => {
    $('#intro').hidden = true;
    await guard(async () => {
      state.global = await prefs.setGlobal({ onboarded: true });
    });
  });

  wireChips();
  wireTabs();
  wirePicker();

  for (const el of $$('[data-opt]')) {
    el.addEventListener('change', () => {
      state.profile = { ...state.profile, [el.dataset.opt]: el.checked };
      writeControls();
      if (state.picker) renderPicker();
      scheduleUpdate();
    });
  }

  $('#length').addEventListener('input', () => {
    state.profile.length = Number($('#length').value);
    $('#length-out').textContent = state.profile.length;
    scheduleUpdate();
  });

  for (const el of $$('[data-goto]')) {
    el.addEventListener('click', () => showPane(el.dataset.goto));
  }

  $('#pane-settings').addEventListener('change', onSettingsChange);

  $('#entry-search').addEventListener('input', (event) => {
    state.entryFilter = event.target.value;
    paintEntries();
  });
  $('#site-search').addEventListener('input', (event) => {
    state.siteFilter = event.target.value;
    renderSites();
  });

  $('#lock-btn').addEventListener('click', async () => {
    await vault.lock();
    toast('History locked');
    await renderRecent();
  });

  $('#setup-pass').addEventListener('input', renderSetupStrength);

  $('#setup-go').addEventListener('click', async () => {
    const pass = $('#setup-pass').value;
    const again = $('#setup-pass2').value;
    const err = $('#setup-err');
    err.hidden = true;

    const verdict = renderSetupStrength();
    if (!verdict.usable) {
      err.textContent =
        'That passphrase is guessable enough that saved passwords would not really be protected.';
      err.hidden = false;
      return;
    }
    if (pass !== again) {
      err.textContent = 'The two passphrases do not match.';
      err.hidden = false;
      return;
    }

    const button = $('#setup-go');
    button.disabled = true;
    button.textContent = 'Setting up…';
    try {
      await vault.setupVault(pass);
      await vault.unlock(pass, state.global.autoLockMinutes);
      $('#setup-pass').value = $('#setup-pass2').value = '';
      renderSetupStrength();
      toast('History is on');

      await recordUse({ replace: state.profile.autoFill });
      await renderRecent();
    } finally {
      button.disabled = false;
      button.textContent = 'Turn on saved history';
    }
  });

  $('#unlock-go').addEventListener('click', unlockFromForm);
  $('#unlock-pass').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') unlockFromForm();
  });

  $('#cp-go').addEventListener('click', async () => {
    const err = $('#cp-err');
    err.hidden = true;
    const next = $('#cp-new').value;

    if (!strength.passphraseVerdict(strength.passphraseBits(next)).usable) {
      err.textContent = 'The new passphrase is too guessable. Four unrelated words works well.';
      err.hidden = false;
      return;
    }
    if (next !== $('#cp-new2').value) {
      err.textContent = 'The two new passphrases do not match.';
      err.hidden = false;
      return;
    }

    const button = $('#cp-go');
    button.disabled = true;
    button.textContent = 'Changing…';
    try {
      await vault.changePassphrase($('#cp-old').value, next);
      $('#cp-old').value = $('#cp-new').value = $('#cp-new2').value = '';
      toast('Passphrase changed — history relocked');
      await renderRecent();
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = 'Change passphrase';
    }
  });

  $('#export-vault').addEventListener('click', exportBackup);
  $('#import-vault').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', async (event) => {
    const [file] = event.target.files ?? [];
    if (file) await importBackupFile(file);
    event.target.value = '';
  });

  $('#open-tab').addEventListener('click', () => {
    api.runtime.openOptionsPage?.();
    window.close();
  });

  armDanger($('#clear-history'), 'Really clear?', async () => {
    await vault.clearHistory();
    state.autoRecordId = null;
    state.entries = [];
    paintEntries();
    renderSavedHint();
    toast('History cleared');
  });

  armDanger($('#reset-vault'), 'Tap again to erase everything', async () => {
    await vault.resetVault();
    state.autoRecordId = null;
    state.entries = [];
    toast('Saved history erased');
    await renderRecent();
  });

  armDanger($('#clear-sites'), 'Tap again to remove them all', async () => {
    await prefs.clearAllSites();
    const { profile, pinned } = await prefs.getProfile(state.host);
    state.profile = profile;
    state.pinned = pinned;
    writeControls();
    regenerate();
    renderScope();
    await renderSites();
    toast('All site rules removed');
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.picker) {
      event.preventDefault();
      closePicker();
      return;
    }
    const typing = event.target.matches('input, textarea, select');
    if (!typing && !state.picker && event.key.toLowerCase() === 'r') {
      event.preventDefault();
      $('#regen').click();
    }
  });
}

async function unlockFromForm() {
  const button = $('#unlock-go');
  const err = $('#unlock-err');
  err.hidden = true;
  button.disabled = true;
  button.textContent = 'Unlocking…';
  try {
    await vault.unlock($('#unlock-pass').value, state.global.autoLockMinutes);
    $('#unlock-pass').value = '';
    await renderRecent();
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = 'Unlock';
  }
}

async function init() {
  const tab = await activeTab();
  state.tabId = tab?.id ?? null;
  state.host = hostOf(tab?.url ?? '');

  state.global = await prefs.getGlobal();
  const { profile, pinned } = await prefs.getProfile(state.host);
  state.profile = profile;
  state.pinned = pinned;

  writeControls();
  renderScope();
  regenerate();
  wire();

  $('#intro').hidden = state.global.onboarded;
  const { version } = api.runtime.getManifest();
  $('#version').textContent = `v${version}`;
  $('#about-version').textContent = `v${version}`;
  try {
    const commands = await api.commands.getAll();
    const shortcut = commands.find((c) => c.name === '_execute_action')?.shortcut;
    $('#shortcut-hint').textContent = shortcut ? `open with ${shortcut}` : '';
  } catch {
  }

  await vault.purge(state.global.retentionDays);

  await renderRecent();
  await renderSites();

  if (state.profile.autoCopy && state.password) await doCopy();
  await autoFillNow();
}

init();
