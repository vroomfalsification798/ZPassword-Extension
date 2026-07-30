/*
 * ZPassword — Copyright (C) 2026 TheHolyOneZ
 * Licensed under the GNU General Public License v3 or later. See LICENSE.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AMBIGUOUS,
  DEFAULT_EXCLUDE,
  GeneratorError,
  UNIVERSE,
  activeClasses,
  charState,
  classChars,
  describe,
  entropyBits,
  generate,
  poolFor,
  strengthLabel,
  validate,
} from '../src/generator.js';

import {
  VAULT_FORMAT,
  VaultError,
  createVault,
  decryptEntry,
  encryptEntry,
  rewrapVault,
  unlockVault,
} from '../src/crypto.js';

import {
  MINIMUM_BITS,
  passphraseAdvice,
  passphraseBits,
  passphraseVerdict,
} from '../src/strength.js';

const base = {
  length: 20,
  lower: true,
  upper: true,
  digits: true,
  symbols: true,
  exclude: { ...DEFAULT_EXCLUDE },
  excludeAmbiguous: false,
  requireEachType: true,
  noRepeat: false,
};

const opts = (over = {}) => ({ ...base, exclude: { ...base.exclude }, ...over });

test('produces the requested length across the whole allowed range', () => {
  for (const length of [6, 7, 12, 20, 33, 64]) {
    assert.equal(generate(opts({ length })).length, length);
  }
});

test('only ever emits characters from the active pool', () => {
  const o = opts({ length: 64 });
  const pool = new Set(poolFor(o));
  for (let i = 0; i < 200; i++) {
    for (const c of generate(o)) assert.ok(pool.has(c), `unexpected character ${c}`);
  }
});

test('requireEachType puts at least one of every enabled class in', () => {
  const o = opts({ length: 8 });
  for (let i = 0; i < 500; i++) {
    const pw = generate(o);
    for (const cls of activeClasses(o)) {
      assert.ok([...pw].some((c) => cls.includes(c)), `missing a class in ${pw}`);
    }
  }
});

test('disabled classes never appear', () => {
  const o = opts({ symbols: false, digits: false, length: 40 });
  for (let i = 0; i < 100; i++) {
    assert.match(generate(o), /^[a-zA-Z]+$/);
  }
});

test('excludeAmbiguous removes look-alike characters', () => {
  const o = opts({ excludeAmbiguous: true, length: 64 });
  for (let i = 0; i < 200; i++) {
    for (const c of generate(o)) assert.ok(!AMBIGUOUS.includes(c), `found ambiguous ${c}`);
  }
});

test('noRepeat yields all-distinct characters', () => {
  const o = opts({ noRepeat: true, length: 40 });
  for (let i = 0; i < 200; i++) {
    const pw = generate(o);
    assert.equal(new Set(pw).size, pw.length);
  }
});

test('per-character exclusions are respected exactly', () => {
  const off = [...UNIVERSE.symbols].filter((c) => !'-_.'.includes(c)).join('');
  const o = opts({
    exclude: { upper: '', lower: '', digits: '', symbols: off },
    lower: false,
    upper: false,
    digits: false,
    length: 30,
  });
  for (let i = 0; i < 100; i++) assert.match(generate(o), /^[-_.]+$/);
});

test('a character switched off in one class never appears', () => {
  const o = opts({ exclude: { ...base.exclude, lower: 'aeiou', digits: '0123456789' }, length: 64 });
  for (let i = 0; i < 200; i++) {
    const pw = generate(o);
    assert.ok(!/[aeiou0-9]/.test(pw), `leaked an excluded character: ${pw}`);
  }
});

test('emptying a class drops it rather than breaking generation', () => {
  const o = opts({ exclude: { ...base.exclude, digits: UNIVERSE.digits }, length: 30 });
  assert.equal(validate(o), null);
  assert.equal(activeClasses(o).length, 3);
  assert.ok(!/[0-9]/.test(generate(o)));
});

test('emptying every enabled class is reported, not thrown raw', () => {
  const o = opts({
    upper: false,
    lower: false,
    symbols: false,
    exclude: { ...base.exclude, digits: UNIVERSE.digits },
  });
  assert.match(validate(o), /switched off/);
  assert.throws(() => generate(o), GeneratorError);
});

test('charState explains why a character is off', () => {
  const o = opts({ excludeAmbiguous: true, exclude: { ...base.exclude, upper: 'Q' } });
  assert.equal(charState(o, 'upper', 'A'), 'on');
  assert.equal(charState(o, 'upper', 'Q'), 'off');
  assert.equal(charState(o, 'upper', 'O'), 'ambiguous');
  assert.equal(charState(o, 'digits', '0'), 'ambiguous');
});

test('classChars combines per-class exclusions with the look-alike shortcut', () => {
  const o = opts({ excludeAmbiguous: true, exclude: { ...base.exclude, lower: 'z' } });
  const chars = classChars(o, 'lower');
  assert.ok(!chars.includes('z'), 'manual exclusion applied');
  assert.ok(!chars.includes('l'), 'look-alike exclusion applied');
  assert.ok(!chars.includes('o'), 'look-alike exclusion applied');
  assert.ok(chars.includes('a'));
});

test('describe summarises a rule set for the Sites list', () => {
  assert.match(describe(opts()), /^20 chars · A–Z a–z 0–9 !#\$ \(26\/32\)$/);
  assert.match(describe(opts({ digits: false, symbols: false })), /^20 chars · A–Z a–z$/);
});

test('the default symbol exclusions are the shell-hostile ones', () => {
  for (const ch of '"\'`\\|~') assert.ok(DEFAULT_EXCLUDE.symbols.includes(ch), ch);
  assert.ok(!classChars(opts(), 'symbols').includes('\\'));
  assert.ok(classChars(opts(), 'symbols').includes('!'));
});

test('rejects impossible configurations instead of looping or throwing raw', () => {
  assert.equal(typeof validate(opts({ lower: false, upper: false, digits: false, symbols: false })), 'string');
  assert.equal(typeof validate(opts({ length: 3, requireEachType: true })), 'string');
  assert.equal(
    typeof validate(
      opts({ noRepeat: true, length: 40, upper: false, digits: false, symbols: false }),
    ),
    'string',
  );
  assert.equal(validate(opts()), null);
  assert.throws(() => generate(opts({ length: 2 })), GeneratorError);
});

test('entropy and strength track the option set', () => {
  assert.ok(entropyBits(opts({ length: 20 })) > entropyBits(opts({ length: 10 })));
  assert.ok(entropyBits(opts({ length: 20 })) > entropyBits(opts({ length: 20, symbols: false })));

  assert.ok(entropyBits(opts({ noRepeat: true })) < entropyBits(opts({ noRepeat: false })));
  assert.equal(strengthLabel(entropyBits(opts({ length: 20 }))).key, 'excellent');
  assert.equal(strengthLabel(entropyBits(opts({ length: 6, symbols: false, upper: false, digits: false }))).key, 'weak');
});

test('output is not obviously biased', () => {
  const counts = new Map();
  const o = opts({ upper: false, digits: false, symbols: false, requireEachType: false, length: 26 });
  for (let i = 0; i < 1000; i++) {
    for (const c of generate(o)) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  assert.equal(counts.size, 26);
  for (const [, n] of counts) assert.ok(n > 700 && n < 1300, `skewed frequency ${n}`);
});

test('two consecutive passwords differ', () => {
  assert.notEqual(generate(opts()), generate(opts()));
});

test('vault: entries encrypt without a passphrase and decrypt with one', async () => {
  const vault = await createVault('correct horse battery staple');
  const entry = await encryptEntry(vault.publicKeyJwk, { password: 'hunter2', host: 'example.com' });

  assert.ok(!JSON.stringify(entry).includes('hunter2'));

  const { privateKeyJwk } = await unlockVault(vault, 'correct horse battery staple');
  assert.deepEqual(await decryptEntry(privateKeyJwk, entry), {
    password: 'hunter2',
    host: 'example.com',
  });
});

test('vault: the wrong passphrase is rejected', async () => {
  const vault = await createVault('right');
  await assert.rejects(() => unlockVault(vault, 'wrong'), VaultError);
});

test('vault: each entry uses a fresh ephemeral key', async () => {
  const vault = await createVault('pass');
  const a = await encryptEntry(vault.publicKeyJwk, { password: 'same' });
  const b = await encryptEntry(vault.publicKeyJwk, { password: 'same' });
  assert.notEqual(a.epk, b.epk);
  assert.notEqual(a.ct, b.ct);
});

test('vault: a tampered ciphertext fails the auth tag', async () => {
  const vault = await createVault('pass');
  const { privateKeyJwk: priv } = await unlockVault(vault, 'pass');
  const entry = await encryptEntry(vault.publicKeyJwk, { password: 'secret' });
  const flipped = { ...entry, ct: entry.ct.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')) };
  await assert.rejects(() => decryptEntry(priv, flipped), VaultError);
});

test('vault: an entry sealed to a different key pair cannot be read', async () => {
  const mine = await createVault('mine');
  const theirs = await createVault('theirs');
  const entry = await encryptEntry(theirs.publicKeyJwk, { password: 'secret' });
  const { privateKeyJwk } = await unlockVault(mine, 'mine');
  await assert.rejects(() => decryptEntry(privateKeyJwk, entry), VaultError);
});

test('vault: changing the passphrase keeps existing entries readable', async () => {
  const vault = await createVault('old one');
  const entry = await encryptEntry(vault.publicKeyJwk, { password: 'keepme' });

  const { privateKeyJwk } = await unlockVault(vault, 'old one');
  const rotated = await rewrapVault(vault, privateKeyJwk, 'new one');

  await assert.rejects(() => unlockVault(rotated, 'old one'), VaultError);
  const { privateKeyJwk: priv2 } = await unlockVault(rotated, 'new one');
  assert.equal((await decryptEntry(priv2, entry)).password, 'keepme');
});

test('vault: a swapped public key is caught before anything is decrypted', async () => {
  const mine = await createVault('my passphrase here');
  const attacker = await createVault('theirs');

  const tampered = { ...mine, publicKeyJwk: attacker.publicKeyJwk };

  await assert.rejects(
    () => unlockVault(tampered, 'my passphrase here'),
    (error) => error instanceof VaultError && /altered/.test(error.message),
  );
});

test('vault: entry metadata is bound to the ciphertext', async () => {
  const vault = await createVault('pass');
  const { privateKeyJwk } = await unlockVault(vault, 'pass');
  const entry = await encryptEntry(vault.publicKeyJwk, { password: 'secret' }, 'id-1|1000');

  assert.equal((await decryptEntry(privateKeyJwk, entry, 'id-1|1000')).password, 'secret');

  await assert.rejects(() => decryptEntry(privateKeyJwk, entry, 'id-2|1000'), VaultError);
  await assert.rejects(() => decryptEntry(privateKeyJwk, entry, 'id-1|9999'), VaultError);
});

test('vault: format 1 entries still open, without metadata binding', async () => {
  const vault = await createVault('pass');
  const { privateKeyJwk } = await unlockVault(vault, 'pass');
  const entry = await encryptEntry(vault.publicKeyJwk, { password: 'old' }, '');
  const legacy = { epk: entry.epk, iv: entry.iv, ct: entry.ct };

  assert.equal((await decryptEntry(privateKeyJwk, legacy, 'anything')).password, 'old');
});

test('vault: a format 1 vault is upgraded on first unlock', async () => {
  const modern = await createVault('a decent passphrase');

  const legacy = await legacyVault('a decent passphrase', modern.publicKeyJwk, modern);

  const first = await unlockVault(legacy, 'a decent passphrase');
  assert.equal(first.upgraded, true);
  assert.equal(first.vault.v, VAULT_FORMAT);
  assert.ok(first.vault.publicKeyMac);

  const second = await unlockVault(first.vault, 'a decent passphrase');
  assert.equal(second.upgraded, false);
  assert.deepEqual(second.privateKeyJwk, first.privateKeyJwk);

  await assert.rejects(() => unlockVault(first.vault, 'wrong'), VaultError);
});

async function legacyVault(passphrase, publicKeyJwk, modern) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 10_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  const { privateKeyJwk } = await unlockVault(modern, passphrase);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(privateKeyJwk)),
  );
  const b64 = (b) => Buffer.from(new Uint8Array(b)).toString('base64');
  return {
    v: 1,
    publicKeyJwk,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 10_000, salt: b64(salt) },
    privateKey: { iv: b64(iv), ct: b64(ct) },
  };
}

test('strength: a phrase is scored by words, not flattered by length', () => {
  const phrase = 'otter clamp vinyl dusk';
  assert.equal(Math.round(passphraseBits(phrase)), 44);

  assert.ok(passphraseBits(phrase) < phrase.length * Math.log2(27));
});

test('strength: obvious passphrases are refused', () => {
  for (const bad of ['password', 'aaaaaaaaaaaa', 'hunter2', 'abc']) {
    assert.equal(passphraseVerdict(passphraseBits(bad)).usable, false, bad);
  }
});

test('strength: decent passphrases are accepted', () => {
  for (const good of ['otter clamp vinyl dusk', 'Tr0ub4dor&3xKlmZ', 'correct horse battery staple']) {
    assert.equal(passphraseVerdict(passphraseBits(good)).usable, true, good);
  }
});

test('strength: repetition does not buy entropy', () => {
  assert.ok(passphraseBits('aaaaaaaaaaaaaaaa') < passphraseBits('qxjmvbzrkwfpdhgn'));
});

test('strength: advice appears exactly while the passphrase is unusable', () => {
  assert.ok(passphraseAdvice(''));
  assert.ok(passphraseAdvice('password'));
  assert.equal(passphraseAdvice('otter clamp vinyl dusk'), null);
  assert.ok(passphraseBits('otter clamp vinyl dusk') >= MINIMUM_BITS);
});
