/*
 * ZPassword — Copyright (C) 2026 TheHolyOneZ
 * Licensed under the GNU General Public License v3 or later. See LICENSE.
 */

import { api } from './browser.js';
import { CLASS_KEYS, DEFAULT_EXCLUDE, UNIVERSE } from './generator.js';

const SITE_PREFIX = 'site:';
const LEGACY_SITES_KEY = 'sites';

export const DEFAULT_OPTIONS = Object.freeze({
  length: 20,
  upper: true,
  lower: true,
  digits: true,
  symbols: true,
  exclude: { ...DEFAULT_EXCLUDE },
  excludeAmbiguous: false,
  requireEachType: true,
  noRepeat: false,
});

export const DEFAULT_BEHAVIOUR = Object.freeze({
  autoFill: false,

  autoCopy: false,

  historyEnabled: true,
});

export const DEFAULT_PROFILE = Object.freeze({ ...DEFAULT_OPTIONS, ...DEFAULT_BEHAVIOUR });

export const DEFAULT_GLOBAL = Object.freeze({
  retentionDays: 30,

  autoLockMinutes: 15,

  onboarded: false,
});

export const PROFILE_KEYS = Object.keys(DEFAULT_PROFILE);
export const BEHAVIOUR_KEYS = Object.keys(DEFAULT_BEHAVIOUR);

export const MAX_SITES = 500;

function migrateLayer(stored) {
  const layer = { ...stored };
  if (typeof layer.symbolSet === 'string' && !layer.exclude) {
    const keep = new Set(layer.symbolSet);
    layer.exclude = {
      ...DEFAULT_EXCLUDE,
      symbols: [...UNIVERSE.symbols].filter((c) => !keep.has(c)).join(''),
    };
  }
  delete layer.symbolSet;
  return layer;
}

function assemble(...layers) {
  const profile = Object.assign({ ...DEFAULT_PROFILE }, ...layers.map(migrateLayer));
  profile.exclude = Object.fromEntries(
    CLASS_KEYS.map((k) => [k, profile.exclude?.[k] ?? DEFAULT_EXCLUDE[k]]),
  );
  return profile;
}

function onlyProfileKeys(profile) {
  const out = Object.fromEntries(PROFILE_KEYS.map((k) => [k, profile[k]]));
  out.exclude = { ...out.exclude };
  return out;
}

async function writeSync(patch) {
  try {
    await api.storage.sync.set(patch);
  } catch (error) {
    throw new Error(
      `Could not save: ${error?.message ?? 'browser sync storage is full'}. ` +
        'Removing a few site rules in the Sites tab will free space.',
    );
  }
}

async function migrateSiteStorage(all) {
  const legacy = all[LEGACY_SITES_KEY];
  if (!legacy || typeof legacy !== 'object') return all;

  const patch = {};
  for (const [host, profile] of Object.entries(legacy)) {
    if (!(SITE_PREFIX + host in all)) patch[SITE_PREFIX + host] = profile;
  }
  if (Object.keys(patch).length) await writeSync(patch);
  await api.storage.sync.remove(LEGACY_SITES_KEY);

  const merged = { ...all, ...patch };
  delete merged[LEGACY_SITES_KEY];
  return merged;
}

async function readAll() {
  return migrateSiteStorage((await api.storage.sync.get(null)) ?? {});
}

export async function getGlobal() {
  const all = await readAll();
  return { ...DEFAULT_GLOBAL, ...(all.app ?? {}) };
}

export async function setGlobal(patch) {
  const current = await getGlobal();
  const next = { ...current, ...patch };
  await writeSync({ app: next });
  return next;
}

export async function getProfile(host) {
  const all = await readAll();
  const override = host ? all[SITE_PREFIX + host] : undefined;
  return {
    profile: assemble(all.defaults ?? {}, override ?? {}),
    pinned: Boolean(override),
  };
}

export async function saveDefaults(profile) {
  await writeSync({ defaults: onlyProfileKeys(profile) });
}

export async function saveForSite(host, profile) {
  const all = await readAll();
  const known = Object.keys(all).filter((k) => k.startsWith(SITE_PREFIX));
  if (!known.includes(SITE_PREFIX + host) && known.length >= MAX_SITES) {
    throw new Error(
      `You already have ${MAX_SITES} sites with their own rules, which is all browser sync will hold. ` +
        'Remove one in the Sites tab first.',
    );
  }
  await writeSync({ [SITE_PREFIX + host]: onlyProfileKeys(profile) });
}

export async function clearSite(host) {
  await api.storage.sync.remove(SITE_PREFIX + host);
}

export async function clearAllSites() {
  const all = await readAll();
  const keys = Object.keys(all).filter((k) => k.startsWith(SITE_PREFIX));
  if (keys.length) await api.storage.sync.remove(keys);
}

export async function listSiteProfiles() {
  const all = await readAll();
  return Object.keys(all)
    .filter((k) => k.startsWith(SITE_PREFIX))
    .map((k) => k.slice(SITE_PREFIX.length))
    .sort()
    .map((host) => ({ host, profile: assemble(all[SITE_PREFIX + host]) }));
}
