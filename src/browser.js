/*
 * ZPassword — Copyright (C) 2026 TheHolyOneZ
 * Licensed under the GNU General Public License v3 or later. See LICENSE.
 */

export const api = globalThis.browser ?? globalThis.chrome;

export function hostOf(url) {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'http:' && protocol !== 'https:') return null;
    return hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export async function activeTab() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}
