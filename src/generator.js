/*
 * ZPassword — Copyright (C) 2026 TheHolyOneZ
 * Licensed under the GNU General Public License v3 or later. See LICENSE.
 */

export const CLASS_KEYS = ['upper', 'lower', 'digits', 'symbols'];

export const UNIVERSE = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789',
  symbols: '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~',
};

export const CLASS_LABELS = {
  upper: 'Uppercase letters',
  lower: 'Lowercase letters',
  digits: 'Digits',
  symbols: 'Symbols',
};

export const CLASS_SHORT = {
  upper: 'A–Z',
  lower: 'a–z',
  digits: '0–9',
  symbols: '!#$',
};

export const DEFAULT_EXCLUDE = Object.freeze({
  upper: '',
  lower: '',
  digits: '',
  symbols: '"\'`\\|~',
});

export const AMBIGUOUS = 'Il1|O0o';

export const MIN_LENGTH = 6;
export const MAX_LENGTH = 64;

export class GeneratorError extends Error {}

function randomInt(max) {
  if (max <= 0) throw new GeneratorError('empty pool');
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  let value;
  do {
    crypto.getRandomValues(buf);
    value = buf[0];
  } while (value >= limit);
  return value % max;
}

function pick(chars) {
  return chars[randomInt(chars.length)];
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function excludeMap(opts) {
  const given = opts.exclude ?? {};
  return Object.fromEntries(CLASS_KEYS.map((k) => [k, given[k] ?? '']));
}

export function charState(opts, key, char) {
  if (opts.excludeAmbiguous && AMBIGUOUS.includes(char)) return 'ambiguous';
  return excludeMap(opts)[key].includes(char) ? 'off' : 'on';
}

export function classChars(opts, key) {
  const off = new Set(excludeMap(opts)[key] + (opts.excludeAmbiguous ? AMBIGUOUS : ''));
  return [...UNIVERSE[key]].filter((c) => !off.has(c)).join('');
}

export function activeClasses(opts) {
  return CLASS_KEYS.filter((k) => opts[k])
    .map((k) => classChars(opts, k))
    .filter((chars) => chars.length > 0);
}

export function poolFor(opts) {
  return [...new Set(activeClasses(opts).join(''))].join('');
}

export function entropyBits(opts) {
  const pool = poolFor(opts).length;
  const length = Math.min(opts.length, MAX_LENGTH);
  if (pool === 0 || length === 0) return 0;
  if (!opts.noRepeat) return length * Math.log2(pool);
  let bits = 0;
  for (let i = 0; i < length && i < pool; i++) bits += Math.log2(pool - i);
  return bits;
}

export function strengthLabel(bits) {
  if (bits < 40) return { key: 'weak', text: 'Weak' };
  if (bits < 60) return { key: 'fair', text: 'Fair' };
  if (bits < 80) return { key: 'good', text: 'Good' };
  if (bits < 110) return { key: 'strong', text: 'Strong' };
  return { key: 'excellent', text: 'Excellent' };
}

export function validate(opts) {
  if (!CLASS_KEYS.some((k) => opts[k])) return 'Pick at least one kind of character.';

  const classes = activeClasses(opts);
  if (classes.length === 0) {
    return 'Every character in the selected kinds is switched off.';
  }

  const pool = poolFor(opts);
  if (opts.length < MIN_LENGTH || opts.length > MAX_LENGTH) {
    return `Length must be between ${MIN_LENGTH} and ${MAX_LENGTH}.`;
  }
  if (opts.requireEachType && opts.length < classes.length) {
    return `Needs at least ${classes.length} characters to include one of each kind.`;
  }
  if (opts.noRepeat && opts.length > pool.length) {
    return `Only ${pool.length} characters are switched on — allow repeats or shorten.`;
  }
  return null;
}

export function generate(opts) {
  const problem = validate(opts);
  if (problem) throw new GeneratorError(problem);

  const classes = activeClasses(opts);
  let pool = [...poolFor(opts)];
  const chars = [];

  const take = (from) => {
    const c = pick(from);
    if (opts.noRepeat) {
      pool = pool.filter((p) => p !== c);
      classes.forEach((_, i) => {
        classes[i] = classes[i].split(c).join('');
      });
    }
    return c;
  };

  if (opts.requireEachType) {
    for (let i = 0; i < classes.length; i++) {
      chars.push(take(classes[i] || pool.join('')));
    }
  }
  while (chars.length < opts.length) chars.push(take(pool.join('')));

  return shuffle(chars).join('');
}

export function describe(opts) {
  const kinds = CLASS_KEYS.filter((k) => opts[k]).map((k) => {
    const used = classChars(opts, k).length;
    const total = UNIVERSE[k].length;
    return used === total ? CLASS_SHORT[k] : `${CLASS_SHORT[k]} (${used}/${total})`;
  });
  return `${opts.length} chars · ${kinds.join(' ') || 'nothing selected'}`;
}
