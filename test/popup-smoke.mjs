/*
 * ZPassword — Copyright (C) 2026 TheHolyOneZ
 * Licensed under the GNU General Public License v3 or later. See LICENSE.
 */

import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const fails = [];
const ok = (label, cond) => {
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${label}`);
  if (!cond) fails.push(label);
};

const areas = { sync: {}, local: {}, session: {} };
const area = (name) => ({
  get: async (keys) => {
    const src = areas[name];
    if (keys == null) return { ...src };
    const list = Array.isArray(keys) ? keys : [keys];
    return Object.fromEntries(list.filter((k) => k in src).map((k) => [k, src[k]]));
  },
  set: async (obj) => Object.assign(areas[name], structuredClone(obj)),
  remove: async (keys) => {
    for (const k of Array.isArray(keys) ? keys : [keys]) delete areas[name][k];
  },
});

const fills = [];
let openedOptions = false;
const chromeStub = {
  storage: { sync: area('sync'), local: area('local'), session: area('session') },
  tabs: { query: async () => [{ id: 7, url: 'https://github.com/settings/admin' }] },
  scripting: {
    executeScript: async ({ func, args }) => {
      fills.push({ func, password: args[0] });
      return [{ result: { filled: 2, reason: null } }];
    },
  },
  alarms: { create: () => {}, clear: async () => {} },
  runtime: {
    getManifest: () => JSON.parse(readFileSync(`${ROOT}/manifest.json`, 'utf8')),
    openOptionsPage: () => void (openedOptions = true),
  },
  commands: { getAll: async () => [{ name: '_execute_action', shortcut: 'Ctrl+Shift+Y' }] },
};

const dom = new JSDOM(readFileSync(`${ROOT}/popup/popup.html`, 'utf8'), {
  url: 'chrome-extension://zpassword/popup/popup.html',
  pretendToBeVisual: true,
});
const { window } = dom;

globalThis.window = window;
globalThis.document = window.document;
for (const k of ['HTMLInputElement', 'Event', 'MouseEvent', 'Node', 'Element', 'getComputedStyle']) {
  globalThis[k] = window[k];
}
window.chrome = chromeStub;
globalThis.chrome = chromeStub;
Object.defineProperty(window, 'crypto', { value: webcrypto, configurable: true });
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

let clipboard = null;
Object.defineProperty(window.navigator, 'clipboard', {
  value: { writeText: async (t) => void (clipboard = t) },
  configurable: true,
});
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });

let closes = 0;
window.close = () => closes++;

const errors = [];
window.addEventListener('error', (e) => errors.push(e.message));
process.on('unhandledRejection', (e) => errors.push(String(e)));

await import(`${ROOT}/popup/popup.js`);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = () => wait(80);

const settleDebounced = () => wait(400);
await settle();

const $ = (s) => window.document.querySelector(s);
const $$ = (s) => [...window.document.querySelectorAll(s)];
const visible = (el) => el && !el.hidden;
const chip = (k) => $(`.chip[data-class="${k}"]`);
const toggleOf = (k) => chip(k).querySelector('.chip-toggle');
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const dblclick = (el) => {
  click(el);
  click(el);
  el.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
};
const check = (el, value) => {
  el.checked = value;
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
};

console.log('\n— popup boot —');
const pw0 = $('#pw').textContent;
ok('auto-generates a password on open', pw0.length === 20 && !$('#pw').classList.contains('is-empty'));
ok('shows entropy and strength', /bits of entropy/.test($('#bits-text').textContent) && $('#strength-text').textContent === 'Excellent');
ok('detects the active host', $('#site-host').textContent === 'github.com');
ok('site starts unpinned', $('#site-toggle').textContent === 'Pin these here');
ok('has five tabs', $$('.tab').length === 5);
ok('all four classes start on', $$('.chip.is-on').length === 4);
ok('symbol chip shows it is trimmed by default', chip('symbols').classList.contains('is-trimmed') && chip('symbols').querySelector('.chip-count').textContent === '26/32');
ok('letter chip shows the full count', chip('upper').querySelector('.chip-count').textContent === '26');
ok('first run shows the introduction', visible($('#intro')));
ok('password is coloured per character class', (() => {
  const spans = [...$('#pw').children];
  if (spans.length !== pw0.length) return false;
  return spans.every((el, i) => {
    const ch = pw0[i];
    const want = /[0-9]/.test(ch) ? 'c-digit' : /[A-Za-z]/.test(ch) ? 'c-letter' : 'c-symbol';
    return el.className === want && el.textContent === ch;
  });
})());
click($('#intro-dismiss'));
await settle();
ok('dismissing the introduction sticks', !visible($('#intro')) && areas.sync.app.onboarded === true);

console.log('\n— regenerate —');
click($('#regen'));
await settle();
ok('produces a different password', $('#pw').textContent !== pw0 && $('#pw').textContent.length === 20);

console.log('\n— length —');
$('#length').value = '32';
$('#length').dispatchEvent(new window.Event('input', { bubbles: true }));
await settleDebounced();
ok('slider regenerates at the new length', $('#pw').textContent.length === 32);
ok('length persisted to storage.sync', areas.sync.defaults?.length === 32);
ok('readout updated', $('#length-out').textContent === '32');

console.log('\n— toggling a whole class —');
click(toggleOf('symbols'));
await settleDebounced();
ok('symbols switch off', !chip('symbols').classList.contains('is-on'));
ok('password has no symbols', /^[A-Za-z0-9]+$/.test($('#pw').textContent));
ok('persisted', areas.sync.defaults.symbols === false);
click(toggleOf('symbols'));
await settleDebounced();
ok('and back on again', areas.sync.defaults.symbols === true);

console.log('\n— character picker —');
ok('picker starts closed', !visible($('#picker')));
dblclick(toggleOf('lower'));
await settle();
ok('double-click opens the picker', visible($('#picker')));
ok('titled for the class', $('#picker-title').textContent === 'Lowercase letters');
ok('class survived the double-click unchanged', chip('lower').classList.contains('is-on'));
ok('shows every character in the class', $$('#picker-grid .char').length === 26);
ok('counts what is in use', $('#picker-count').textContent === '26 of 26 in use');

let aButton = $$('#picker-grid .char').find((b) => b.textContent === 'a');
click(aButton);
await settleDebounced();
aButton = $$('#picker-grid .char').find((b) => b.textContent === 'a');
ok('clicking a character switches it off', aButton.classList.contains('is-off'));
ok('count drops', $('#picker-count').textContent === '25 of 26 in use');
ok('exclusion persisted', areas.sync.defaults.exclude.lower === 'a');
ok('chip shows the class is trimmed', chip('lower').classList.contains('is-trimmed') && chip('lower').querySelector('.chip-count').textContent === '25/26');
ok('the character never appears in output', !$('#pw').textContent.includes('a'));

click(aButton);
await settleDebounced();
ok('clicking again switches it back on', areas.sync.defaults.exclude.lower === '');

click($('[data-pick="none"]'));
await settleDebounced();
ok('None empties the class', $('#picker-count').textContent === '0 of 26 in use');
ok('warns the class will not be used', visible($('#picker-note')) && $('#picker-note').textContent.includes('will not be used'));
ok('still generates from the other classes', !/[a-z]/.test($('#pw').textContent) && $('#pw').textContent.length === 32);

click($('[data-pick="all"]'));
await settleDebounced();
ok('All restores the class', $('#picker-count').textContent === '26 of 26 in use' && areas.sync.defaults.exclude.lower === '');

console.log('\n— look-alikes shortcut inside the picker —');
click($('#picker-close'));
check($('[data-opt="excludeAmbiguous"]'), true);
await settleDebounced();
ok('no look-alikes in the password', !/[Il1|O0o]/.test($('#pw').textContent));

click(chip('digits').querySelector('.chip-more'));
await settle();
ok('⋯ opens the picker too', visible($('#picker')) && $('#picker-title').textContent === 'Digits');
let zero = $$('#picker-grid .char').find((b) => b.textContent === '0');
ok('0 shows as held by the shortcut', zero.classList.contains('is-amb') && zero.classList.contains('is-off'));

click(zero);
await settleDebounced();
zero = $$('#picker-grid .char').find((b) => b.textContent === '0');
ok('reaching for it turns the shortcut into explicit exclusions', areas.sync.defaults.excludeAmbiguous === false);
ok('the character the user aimed at is now on', !zero.classList.contains('is-off'));
ok('1 stays off explicitly', areas.sync.defaults.exclude.digits.includes('1') && !areas.sync.defaults.exclude.digits.includes('0'));
ok('the other classes kept their look-alikes off', areas.sync.defaults.exclude.lower.includes('l') && areas.sync.defaults.exclude.upper.includes('O') && areas.sync.defaults.exclude.symbols.includes('|'));
ok('Advanced checkbox is back off', $('[data-opt="excludeAmbiguous"]').checked === false);

click($('[data-pick="reset"]'));
await settleDebounced();
ok('Reset returns the class to its default', areas.sync.defaults.exclude.digits === '');
ok('opening the picker moves focus into the grid', (() => {
  click(chip('symbols').querySelector('.chip-more'));
  return $('#picker-grid').firstElementChild === window.document.activeElement;
})());
ok('symbols grid holds the whole universe', $$('#picker-grid .char').length === 32);
$('#picker-grid').firstElementChild.dispatchEvent(
  new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
);
ok('arrow keys move between characters', window.document.activeElement.dataset.char === '"');
window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
ok('Escape closes the picker', !visible($('#picker')));

click($('#picker-close'));
ok('picker closes', !visible($('#picker')));

console.log('\n— impossible options —');
for (const k of ['upper', 'lower', 'digits', 'symbols']) click(toggleOf(k));
await settleDebounced();
ok('explains why nothing can be generated', visible($('#error')) && $('#error').textContent.includes('at least one'));
ok('disables Copy and Fill', $('#copy').disabled && $('#fill').disabled);
for (const k of ['upper', 'lower', 'digits', 'symbols']) click(toggleOf(k));
await settleDebounced();
ok('recovers when the classes come back', $('#error').hidden && !$('#copy').disabled);

console.log('\n— copy and fill —');
click($('#copy'));
await settle();
ok('copies to the clipboard', clipboard === $('#pw').textContent);
const before = fills.length;
click($('#fill'));
await settle();
ok('injects the filler into the tab', fills.length === before + 1 && typeof fills.at(-1).func === 'function');
ok('passes the current password', fills.at(-1).password === $('#pw').textContent);
await wait(600);
ok('the explicit Fill button closes the popup', closes === 1);

console.log('\n— per-site rules —');
click($('#site-toggle'));
await settle();
ok('pinning stores a profile under its own sync key', Boolean(areas.sync['site:github.com']));
ok('and not in a single shared map', areas.sync.sites === undefined);
ok('site bar reflects the pin', $('#site-toggle').textContent === 'Unpin' && $('#site-bar').classList.contains('is-pinned'));
ok('settings scope switches to the site', $('#scope-text').textContent.includes('github.com only'));

$('#length').value = '24';
$('#length').dispatchEvent(new window.Event('input', { bubbles: true }));
await settleDebounced();
ok('edits now land on the site, not the defaults', areas.sync['site:github.com'].length === 24 && areas.sync.defaults.length === 32);

console.log('\n— always fill on open —');
check($('[data-prof="autoFill"]'), true);
await settle();
ok('auto-fill saved against the pinned site', areas.sync['site:github.com'].autoFill === true);
ok('it fills immediately', fills.at(-1).password === $('#pw').textContent);
ok('and reports it in the UI', visible($('#fill-status')) && $('#fill-status').textContent.includes('Filled'));
const closesBefore = closes;
await wait(700);
ok('auto-fill does NOT close the popup', closes === closesBefore);

const fillsBefore = fills.length;
click($('#regen'));
await settle();
ok('regenerating re-fills the page', fills.length === fillsBefore + 1 && fills.at(-1).password === $('#pw').textContent);

console.log('\n— encrypted history —');
ok('nudges to turn history on', visible($('#history-nudge')));
click($('.tab[data-pane="recent"]'));
await settle();
ok('recent tab offers setup', visible($('#recent-setup')));

$('#setup-pass').value = 'password';
$('#setup-pass').dispatchEvent(new window.Event('input', { bubbles: true }));
await settle();
ok('rates a weak passphrase as unusable', ['Too weak', 'Still guessable'].includes($('#setup-verdict').textContent));
ok('offers concrete advice', $('#setup-advice').textContent.includes('four unrelated words'));
click($('#setup-go'));
await settle();
ok('refuses to build a vault on it', visible($('#setup-err')) && !areas.local.vault);

$('#setup-pass').value = 'otter clamp vinyl dusk';
$('#setup-pass').dispatchEvent(new window.Event('input', { bubbles: true }));
await settle();
ok('a four-word phrase passes', $('#setup-verdict').textContent !== 'Too weak' && !$('#setup-advice').textContent);

$('#setup-pass').value = 'hunter2hunter2';
$('#setup-pass').dispatchEvent(new window.Event('input', { bubbles: true }));
$('#setup-pass2').value = 'nope';
click($('#setup-go'));
await settle();
ok('rejects a mismatched passphrase', visible($('#setup-err')) && $('#setup-err').textContent.includes('do not match'));

$('#setup-pass2').value = 'hunter2hunter2';
click($('#setup-go'));
await wait(3000);
ok('vault created and unlocked', visible($('#recent-list')));
ok('vault stored in local, not sync', Boolean(areas.local.vault) && !areas.sync.vault);
ok('private key is sealed', typeof areas.local.vault.privateKey.ct === 'string');
ok('unlocked key is only in session storage', Boolean(areas.session.unlocked) && !areas.local.unlocked);

console.log('\n— auto-fill leaves one entry, not a trail —');
click($('.tab[data-pane="generate"]'));
click($('#regen'));
await settle();
click($('.tab[data-pane="recent"]'));
await settle();
ok('the auto-filled password is recorded', $('#entries').children.length === 1);
const firstPw = $('#pw').textContent;

click($('.tab[data-pane="generate"]'));
click($('#regen'));
await settle();
click($('#regen'));
await settle();
click($('.tab[data-pane="recent"]'));
await settle();
ok('further auto-fills replace it rather than pile up', $('#entries').children.length === 1);
ok('the entry tracks the latest password', $('.entry-pw') && !$('#entries').textContent.includes(firstPw));
ok('ciphertext does not contain the password', !JSON.stringify(areas.local.history).includes($('#pw').textContent));
ok('recorded under the right host', $('#entries').textContent.includes('github.com'));
ok('shown masked by default', $('.entry-pw').textContent.startsWith('•'));

click($('.tab[data-pane="generate"]'));
click($('#copy'));
await settle();
click($('#regen'));
await settle();
click($('.tab[data-pane="recent"]'));
await settle();
ok('a password you deliberately copied is kept, not replaced', $('#entries').children.length === 2);

console.log('\n— search, notes, and the saved-here hint —');
ok('points out you already have one for this site', visible($('#saved-hint')) && $('#saved-hint').textContent.includes('github.com'));

click($$('.entry-actions [data-act="note"]')[0]);
await settle();
ok('note editor opens on the entry', Boolean($('.entry-note-edit')));
$('.entry-note-edit').value = 'work account';
$('.entry-note-edit').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
await settle();
ok('the note is saved and shown', $('.entry-note').textContent === 'work account');
ok('the note is inside the ciphertext, not beside it', !JSON.stringify(areas.local.history).includes('work account'));

$('#entry-search').value = 'work';
$('#entry-search').dispatchEvent(new window.Event('input', { bubbles: true }));
await settle();
ok('search matches on the note', $('#entries').children.length === 1);
$('#entry-search').value = 'nothing-like-this';
$('#entry-search').dispatchEvent(new window.Event('input', { bubbles: true }));
await settle();
ok('an empty result says so', $('#entries').textContent.includes('Nothing matches'));
$('#entry-search').value = 'github';
$('#entry-search').dispatchEvent(new window.Event('input', { bubbles: true }));
await settle();
ok('search matches on the host', $('#entries').children.length === 2);
$('#entry-search').value = '';
$('#entry-search').dispatchEvent(new window.Event('input', { bubbles: true }));
await settle();
ok('clearing the search restores the list', $('#entries').children.length === 2);

const current = $('#pw').textContent;
click($$('.entry-actions [data-act="reveal"]')[0]);
await settle();
ok('reveal shows the real password', $('.entry-pw').textContent === current);
click($$('.entry-actions [data-act="copy"]')[0]);
await settle();
ok('entry copy works', clipboard === current);

console.log('\n— lock / unlock —');
click($('#lock-btn'));
await settle();
ok('locking hides the entries', visible($('#recent-locked')) && !areas.session.unlocked);
$('#unlock-pass').value = 'wrong';
click($('#unlock-go'));
await wait(1500);
ok('wrong passphrase rejected', visible($('#unlock-err')) && $('#unlock-err').textContent.includes('does not match'));
$('#unlock-pass').value = 'hunter2hunter2';
click($('#unlock-go'));
await wait(1500);
ok('right passphrase unlocks', visible($('#recent-list')) && $('#entries').children.length === 2);

click($$('.entry-actions [data-act="delete"]')[0]);
await settle();
ok('entry deleted', $('#entries').children.length === 1);

console.log('\n— backup and restore —');

click($$('.entry-actions [data-act="note"]')[0]);
await settle();
$('.entry-note-edit').value = 'keeper';
$('.entry-note-edit').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
await settle();
ok('the surviving entry takes a note', $('.entry-note').textContent === 'keeper');

const vaultMod = await import(`${ROOT}/src/vault.js`);
const backup = await vaultMod.exportBackup();
ok('backup carries the sealed vault', backup.format === 'zpassword-vault-backup' && Boolean(backup.vault.privateKey.ct));
ok('backup carries the entries', backup.history.length === 1);
ok('nothing in the backup is plaintext', !JSON.stringify(backup).includes(current) && !JSON.stringify(backup).includes('keeper'));

await vaultMod.resetVault();
ok('reset clears the vault', !areas.local.vault);

const file = { name: 'backup.json', text: async () => JSON.stringify(backup) };
Object.defineProperty($('#import-file'), 'files', { value: [file], configurable: true });
$('#import-file').dispatchEvent(new window.Event('change', { bubbles: true }));
await wait(300);
ok('restoring brings the vault back', Boolean(areas.local.vault));
ok('and the entries with it', areas.local.history.length === 1);
ok('restore leaves it locked', !areas.session.unlocked && visible($('#recent-locked')));

$('#unlock-pass').value = 'hunter2hunter2';
click($('#unlock-go'));
await wait(1500);
ok('the original passphrase still opens the restored vault', visible($('#recent-list')) && $('#entries').children.length === 1);
ok('the note survived the round trip', $('.entry-note').textContent === 'keeper');

let rejected = false;
try {
  await vaultMod.importBackup({ format: 'something-else' });
} catch {
  rejected = true;
}
ok('a file that is not a backup is refused', rejected);

console.log('\n— Sites tab —');
click($('.tab[data-pane="sites"]'));
await settle();
ok('lists the pinned site', $('#site-cards').children.length === 1 && $('.site-card-host').textContent === 'github.com');
const summary = $('.site-card-sum').textContent;
ok('summarises its rules', summary.startsWith('24 chars · ') && /A–Z/.test(summary) && /!#\$/.test(summary));
ok('marks the site you are on', $('.site-card').classList.contains('is-current') && Boolean($('.badge.here')));
ok('flags auto-fill', $$('.badge').some((b) => b.textContent === 'auto-fill'));

const siteBoxes = $$('.site-card-body input[type=checkbox]');
ok('offers the three behaviours per site', siteBoxes.length === 3);
ok('auto-fill shown as on for this site', siteBoxes[0].checked === true);
check(siteBoxes[2], false);
await settle();
ok('editing a site behaviour saves to that site', areas.sync['site:github.com'].historyEnabled === false);
click($('.tab[data-pane="recent"]'));
await settle();
ok('history pane reflects the per-site switch', visible($('#recent-off')));
ok('the Settings checkbox reflects it too', $('[data-prof="historyEnabled"]').checked === false);

click($('.tab[data-pane="sites"]'));
await settle();
click($$('.site-card-body .link.danger')[0]);
await settle();
ok('removing site rules empties the list', $('#site-cards').children.length === 0 && visible($('#sites-empty')));
ok('storage no longer has the site', !areas.sync['site:github.com']);
click($('.tab[data-pane="generate"]'));
ok('the site bar falls back to defaults', $('#site-toggle').textContent === 'Pin these here');
ok('defaults were never touched by the site edits', areas.sync.defaults.length === 32);

console.log('\n— migration from older storage shapes —');
const prefs = await import(`${ROOT}/src/prefs.js`);

areas.sync.sites = {
  'old.example': { length: 16, symbolSet: '!@#', upper: true, lower: true, digits: true, symbols: true },
  'other.example': { length: 12 },
};
const migrated = (await prefs.getProfile('old.example')).profile;
ok('symbolSet becomes per-character exclusions', migrated.exclude.symbols.length === 29 && !migrated.exclude.symbols.includes('!'));
ok('the old key is dropped', migrated.symbolSet === undefined);
ok('the rest of the profile survives', migrated.length === 16);
ok('missing behaviour keys pick up defaults', migrated.autoFill === false && migrated.historyEnabled === true);
ok('the sites map is split into per-site keys', Boolean(areas.sync['site:old.example']) && Boolean(areas.sync['site:other.example']));
ok('the legacy map is removed', areas.sync.sites === undefined);
ok('every migrated site is listed', (await prefs.listSiteProfiles()).map((s) => s.host).join() === 'old.example,other.example');
ok('migration is idempotent', (await prefs.getProfile('old.example')).profile.length === 16);
await prefs.clearAllSites();
ok('clearAllSites removes every site key', Object.keys(areas.sync).filter((k) => k.startsWith('site:')).length === 0);

console.log('\n— navigation —');
click($('.tab[data-pane="generate"]'));
ok('the active tab is marked for assistive tech', $('#tab-generate').getAttribute('aria-selected') === 'true' && $('#tab-recent').getAttribute('aria-selected') === 'false');
ok('inactive tabs leave the tab order', $('#tab-recent').tabIndex === -1 && $('#tab-generate').tabIndex === 0);
$('#tab-generate').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
await settle();
ok('arrow keys move between tabs', $('#pane-recent').classList.contains('is-active'));
$('#tab-recent').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
await settle();
ok('and back again', $('#pane-generate').classList.contains('is-active'));

click($('.tab[data-pane="settings"]'));
click($('#open-tab'));
ok('settings can open the full-tab view', openedOptions === true);

console.log('\n— About tab —');
click($('.tab[data-pane="about"]'));
await settle();
ok('about pane opens', $('#pane-about').classList.contains('is-active'));
const manifestVersion = JSON.parse(readFileSync(`${ROOT}/manifest.json`, 'utf8')).version;
ok('shows the version', $('#about-version').textContent === `v${manifestVersion}`);
ok('and matches package.json', JSON.parse(readFileSync(`${ROOT}/package.json`, 'utf8')).version === manifestVersion);

const links = $$('#pane-about a').map((a) => a.getAttribute('href'));
for (const url of [
  'https://zsync.eu/zpassword-extension/',
  'https://github.com/TheHolyOneZ/ZPassword-Extension',
  'https://github.com/TheHolyOneZ',
  'https://zsync.eu',
]) {
  ok(`links to ${url}`, links.includes(url));
}
ok('every link opens in a new tab', $$('#pane-about a').every((a) => a.target === '_blank'));
ok('and none can reach back into the popup', $$('#pane-about a').every((a) => a.rel.includes('noopener')));
ok('states the licence', $('#pane-about').textContent.includes('GNU General Public License v3'));
ok('names the author', $('#pane-about').textContent.includes('TheHolyOneZ'));
ok('lists the tech stack', $('.tech').children.length >= 5 && $('.tech').textContent.includes('Manifest V3'));
ok('spells out where each link goes', $$('.link-where').length === 4);

console.log('\n— page filler (run against a real form) —');
const page = new JSDOM(`<form>
  <input type="text" name="username">
  <input type="password" autocomplete="current-password" name="old">
  <input type="password" autocomplete="new-password" name="new">
  <input type="password" name="confirm_password">
</form>`, { pretendToBeVisual: true });
const pdoc = page.window.document;

page.window.HTMLElement.prototype.getClientRects = function () {
  return [{ width: 100, height: 20 }];
};
const { fillPasswordFields } = await import(`${ROOT}/src/fill.js`);
const run = new page.window.Function(
  'document', 'getComputedStyle', 'HTMLInputElement', 'Event',
  `return (${fillPasswordFields.toString()})("S3cret!")`,
);
const res = run(pdoc, page.window.getComputedStyle, page.window.HTMLInputElement, page.window.Event);
ok('fills new + confirm, skips current-password', res.filled === 2);
ok('current password untouched', pdoc.querySelector('[name=old]').value === '');
ok('new password set', pdoc.querySelector('[name=new]').value === 'S3cret!');
ok('confirm set', pdoc.querySelector('[name=confirm_password]').value === 'S3cret!');
ok('username untouched', pdoc.querySelector('[name=username]').value === '');

console.log('\n— uncaught errors —');
ok('none', errors.length === 0);
if (errors.length) console.log(errors);

console.log(fails.length ? `\n${fails.length} FAILURE(S)` : '\nALL PASSED');
process.exit(fails.length ? 1 : 0);
