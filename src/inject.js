/*
 * ZPassword — Copyright (C) 2026 TheHolyOneZ
 * Licensed under the GNU General Public License v3 or later. See LICENSE.
 */

import { api } from './browser.js';
import { fillPasswordFields } from './fill.js';

export async function fillIntoTab(tabId, password) {
  let frames;
  try {
    frames = await api.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: fillPasswordFields,
      args: [password],
    });
  } catch {
    return { filled: 0, reason: 'no-access' };
  }

  let filled = 0;
  let reason = 'no-password-field';
  for (const frame of frames) {
    if (!frame?.result) continue;
    filled += frame.result.filled;
    if (frame.result.reason === 'only-current-password') reason = frame.result.reason;
  }
  return { filled, reason: filled ? null : reason };
}

export const FILL_MESSAGES = {
  'no-access': 'This page does not allow filling.',
  'no-password-field': 'No password box found on this page.',
  'only-current-password': 'Only a current-password box here — click it first.',
};
