/*
 * ZPassword — Copyright (C) 2026 TheHolyOneZ
 * Licensed under the GNU General Public License v3 or later. See LICENSE.
 */

const CLASS_SIZES = [
  [/[a-z]/, 26],
  [/[A-Z]/, 26],
  [/[0-9]/, 10],
  [/[^A-Za-z0-9]/, 33],
];

const BITS_PER_WORD = 11;

export const MINIMUM_BITS = 4 * BITS_PER_WORD;

export function passphraseBits(passphrase) {
  if (!passphrase) return 0;

  const words = passphrase.trim().split(/[\s._+-]+/).filter(Boolean);
  if (words.length >= 3) return words.length * BITS_PER_WORD;

  let pool = 0;
  for (const [pattern, size] of CLASS_SIZES) if (pattern.test(passphrase)) pool += size;
  if (pool === 0) return 0;

  const distinct = new Set(passphrase).size;
  const effective = Math.min(passphrase.length, distinct + (passphrase.length - distinct) / 2);
  return effective * Math.log2(pool);
}

export function passphraseVerdict(bits) {
  if (bits < 30) return { key: 'weak', text: 'Too weak', usable: false };
  if (bits < MINIMUM_BITS) return { key: 'fair', text: 'Still guessable', usable: false };
  if (bits < 60) return { key: 'good', text: 'Reasonable', usable: true };
  if (bits < 80) return { key: 'strong', text: 'Strong', usable: true };
  return { key: 'excellent', text: 'Excellent', usable: true };
}

export function passphraseAdvice(passphrase) {
  const bits = passphraseBits(passphrase);
  if (!passphrase) return 'Four unrelated words beat one clever word.';
  if (passphraseVerdict(bits).usable) return null;
  const words = passphrase.trim().split(/[\s._+-]+/).filter(Boolean).length;
  return words >= 2
    ? 'Add another word or two — length is what protects this.'
    : 'Try four unrelated words, like "otter-clamp-vinyl-dusk".';
}
