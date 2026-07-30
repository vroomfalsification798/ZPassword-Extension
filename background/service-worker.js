/*
 * ZPassword — Copyright (C) 2026 TheHolyOneZ
 * Licensed under the GNU General Public License v3 or later. See LICENSE.
 */

import { api, hostOf } from '../src/browser.js';
import { generate, validate } from '../src/generator.js';
import { fillIntoTab } from '../src/inject.js';
import { getGlobal, getProfile } from '../src/prefs.js';
import { AUTOLOCK_ALARM, isSetUp, lock, purge, record } from '../src/vault.js';

const MENU_ID = 'zpassword-fill';
const FILL_COMMAND = 'generate-and-fill';
const PURGE_ALARM = 'zpassword-purge';

async function flashBadge(tabId, text, color) {
  try {
    await api.action.setBadgeBackgroundColor({ color });
    await api.action.setBadgeText({ tabId, text });
    setTimeout(() => api.action.setBadgeText({ tabId, text: '' }).catch(() => {}), 2500);
  } catch {
  }
}

async function generateAndFill(tab) {
  const host = hostOf(tab.url ?? '');
  const { profile } = await getProfile(host);

  if (validate(profile)) {
    await flashBadge(tab.id, '!', '#d13c3c');
    return;
  }

  const password = generate(profile);
  const { filled } = await fillIntoTab(tab.id, password);
  if (!filled) {
    await flashBadge(tab.id, '—', '#6b7280');
    return;
  }

  if (profile.historyEnabled && (await isSetUp())) await record({ password, host });
  await flashBadge(tab.id, '✓', '#30a46c');
}

api.runtime.onInstalled.addListener(async () => {
  await api.contextMenus.removeAll();
  api.contextMenus.create({
    id: MENU_ID,
    title: 'Fill with a new password',
    contexts: ['editable'],
  });
  api.alarms.create(PURGE_ALARM, { periodInMinutes: 720, delayInMinutes: 1 });
});

api.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;
  await generateAndFill(tab);
});

api.commands.onCommand.addListener(async (command, tab) => {
  if (command !== FILL_COMMAND) return;

  const target = tab ?? (await api.tabs.query({ active: true, currentWindow: true }))[0];
  if (target?.id) await generateAndFill(target);
});

api.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === AUTOLOCK_ALARM) {
    await lock();
  } else if (alarm.name === PURGE_ALARM) {
    const { retentionDays } = await getGlobal();
    await purge(retentionDays);
  }
});

api.runtime.onStartup.addListener(async () => {
  const { retentionDays } = await getGlobal();
  await purge(retentionDays);
});
