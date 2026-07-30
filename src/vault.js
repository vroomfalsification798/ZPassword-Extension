/*
 * ZPassword — Copyright (C) 2026 TheHolyOneZ
 * Licensed under the GNU General Public License v3 or later. See LICENSE.
 */

import { api } from './browser.js';
import {
  VaultError,
  createVault,
  decryptEntry,
  encryptEntry,
  rewrapVault,
  unlockVault,
} from './crypto.js';

export { VaultError };

const MAX_ENTRIES = 200;
const SESSION_KEY = 'unlocked';

export const AUTOLOCK_ALARM = 'zpassword-autolock';

const aadFor = (entry) => `${entry.id}|${entry.ts}`;

let memorySession = null;
const sessionArea = api.storage.session ?? {
  get: async () => (memorySession ? { [SESSION_KEY]: memorySession } : {}),
  set: async (obj) => {
    memorySession = obj[SESSION_KEY];
  },
  remove: async () => {
    memorySession = null;
  },
};

async function readLocal() {
  const { vault = null, history = [] } = await api.storage.local.get(['vault', 'history']);
  return { vault, history };
}

export async function getVault() {
  return (await readLocal()).vault;
}

export async function isSetUp() {
  return (await getVault()) !== null;
}

export async function setupVault(passphrase) {
  if (await isSetUp()) throw new VaultError('History is already set up.');
  const vault = await createVault(passphrase);
  await api.storage.local.set({ vault, history: [] });
  return vault;
}

function scheduleAutoLock(expiresAt) {
  try {
    api.alarms.create(AUTOLOCK_ALARM, { when: expiresAt });
  } catch {
  }
}

export async function unlock(passphrase, autoLockMinutes = 15) {
  const stored = await getVault();
  if (!stored) throw new VaultError('History is not set up yet.');

  const { privateKeyJwk, vault, upgraded } = await unlockVault(stored, passphrase);

  if (upgraded) await api.storage.local.set({ vault });

  const expiresAt = Date.now() + autoLockMinutes * 60_000;
  await sessionArea.set({ [SESSION_KEY]: { jwk: privateKeyJwk, expiresAt } });
  scheduleAutoLock(expiresAt);
  return privateKeyJwk;
}

export async function lock() {
  await sessionArea.remove(SESSION_KEY);
  try {
    await api.alarms.clear(AUTOLOCK_ALARM);
  } catch {
  }
}

export async function unlockedKey() {
  const stored = (await sessionArea.get(SESSION_KEY))[SESSION_KEY];
  if (!stored) return null;
  if (Date.now() > stored.expiresAt) {
    await lock();
    return null;
  }
  return stored.jwk;
}

export async function lockCountdown() {
  const stored = (await sessionArea.get(SESSION_KEY))[SESSION_KEY];
  if (!stored) return null;
  return Math.max(0, stored.expiresAt - Date.now());
}

export async function touchLock(autoLockMinutes = 15) {
  const stored = (await sessionArea.get(SESSION_KEY))[SESSION_KEY];
  if (!stored) return;
  const expiresAt = Date.now() + autoLockMinutes * 60_000;
  await sessionArea.set({ [SESSION_KEY]: { ...stored, expiresAt } });
  scheduleAutoLock(expiresAt);
}

export async function record({ password, host, note }) {
  const { vault, history } = await readLocal();
  if (!vault) return null;

  const id = crypto.randomUUID();
  const ts = Date.now();
  const sealed = await encryptEntry(
    vault.publicKeyJwk,
    { password, host: host ?? null, note: note ?? null },
    aadFor({ id, ts }),
  );

  const next = [{ id, ts, ...sealed }, ...history].slice(0, MAX_ENTRIES);
  await api.storage.local.set({ history: next });
  return id;
}

export async function listEntries() {
  const jwk = await unlockedKey();
  if (!jwk) throw new VaultError('History is locked.');
  const { history } = await readLocal();

  const entries = [];
  let unreadable = 0;
  for (const entry of history) {
    try {
      const payload = await decryptEntry(jwk, entry, aadFor(entry));
      entries.push({ id: entry.id, ts: entry.ts, ...payload });
    } catch {
      unreadable++;
    }
  }
  entries.sort((a, b) => b.ts - a.ts);
  return { entries, unreadable };
}

export async function updateEntry(id, patch) {
  const jwk = await unlockedKey();
  if (!jwk) throw new VaultError('History is locked.');

  const { vault, history } = await readLocal();
  const index = history.findIndex((e) => e.id === id);
  if (index === -1) throw new VaultError('That entry no longer exists.');

  const existing = history[index];
  const payload = await decryptEntry(jwk, existing, aadFor(existing));
  const sealed = await encryptEntry(
    vault.publicKeyJwk,
    { ...payload, ...patch },
    aadFor(existing),
  );

  const next = [...history];
  next[index] = { id: existing.id, ts: existing.ts, ...sealed };
  await api.storage.local.set({ history: next });
}

export async function deleteEntry(id) {
  const { history } = await readLocal();
  await api.storage.local.set({ history: history.filter((e) => e.id !== id) });
}

export async function clearHistory() {
  await api.storage.local.set({ history: [] });
}

export async function countEntries() {
  return (await readLocal()).history.length;
}

export async function purge(retentionDays) {
  if (!retentionDays || retentionDays <= 0) return 0;
  const cutoff = Date.now() - retentionDays * 86_400_000;
  const { history } = await readLocal();
  const kept = history.filter((e) => e.ts >= cutoff);
  if (kept.length !== history.length) await api.storage.local.set({ history: kept });
  return history.length - kept.length;
}

export async function changePassphrase(current, next) {
  const stored = await getVault();
  if (!stored) throw new VaultError('History is not set up yet.');
  const { privateKeyJwk } = await unlockVault(stored, current);
  await api.storage.local.set({ vault: await rewrapVault(stored, privateKeyJwk, next) });
  await lock();
}

export async function resetVault() {
  await lock();
  await api.storage.local.remove(['vault', 'history']);
}

const BACKUP_FORMAT = 'zpassword-vault-backup';

export async function exportBackup() {
  const { vault, history } = await readLocal();
  if (!vault) throw new VaultError('There is no saved history to export yet.');
  return {
    format: BACKUP_FORMAT,
    v: 1,
    exportedAt: new Date().toISOString(),
    vault,
    history,
  };
}

export async function importBackup(backup) {
  if (!backup || backup.format !== BACKUP_FORMAT) {
    throw new VaultError('That file is not a ZPassword backup.');
  }
  if (!backup.vault?.publicKeyJwk || !backup.vault?.privateKey?.ct) {
    throw new VaultError('That backup is missing its vault, so it cannot be restored.');
  }
  const history = Array.isArray(backup.history) ? backup.history : [];
  await lock();
  await api.storage.local.set({ vault: backup.vault, history });
  return history.length;
}
