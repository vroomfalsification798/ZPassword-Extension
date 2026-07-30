/*
 * ZPassword — Copyright (C) 2026 TheHolyOneZ
 * Licensed under the GNU General Public License v3 or later. See LICENSE.
 */

const subtle = crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const PBKDF2_ITERATIONS = 600_000;
export const VAULT_FORMAT = 2;
export const ENTRY_FORMAT = 2;

const EMPTY = new Uint8Array(0);
const WRAP_INFO = 'zpassword/vault-wrap/v2';
const MAC_INFO = 'zpassword/vault-mac/v2';
const ENTRY_INFO = 'zpassword/entry/v1';

export class VaultError extends Error {}

export function toB64(bytes) {
  let s = '';
  const view = new Uint8Array(bytes);
  for (let i = 0; i < view.length; i++) s += String.fromCharCode(view[i]);
  return btoa(s);
}

export function fromB64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

function canonical(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

async function deriveLegacy(passphrase, salt, iterations) {
  const base = await subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  const wrapKey = await subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return { wrapKey, macKey: null };
}

async function deriveKeys(passphrase, salt, iterations) {
  const base = await subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const prk = await subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    256,
  );
  const hk = await subtle.importKey('raw', prk, 'HKDF', false, ['deriveKey']);

  const wrapKey = await subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: EMPTY, info: enc.encode(WRAP_INFO) },
    hk,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  const macKey = await subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: EMPTY, info: enc.encode(MAC_INFO) },
    hk,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign', 'verify'],
  );
  return { wrapKey, macKey };
}

async function sealVault(publicKeyJwk, privateKeyJwk, passphrase) {
  if (!passphrase) throw new VaultError('A passphrase is required.');
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const { wrapKey, macKey } = await deriveKeys(passphrase, salt, PBKDF2_ITERATIONS);

  const ct = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrapKey,
    enc.encode(JSON.stringify(privateKeyJwk)),
  );
  const mac = await subtle.sign('HMAC', macKey, enc.encode(canonical(publicKeyJwk)));

  return {
    v: VAULT_FORMAT,
    publicKeyJwk,
    publicKeyMac: toB64(mac),
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, salt: toB64(salt) },
    privateKey: { iv: toB64(iv), ct: toB64(ct) },
  };
}

export async function createVault(passphrase) {
  if (!passphrase) throw new VaultError('A passphrase is required.');
  const pair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);
  return sealVault(
    await subtle.exportKey('jwk', pair.publicKey),
    await subtle.exportKey('jwk', pair.privateKey),
    passphrase,
  );
}

export async function unlockVault(vault, passphrase) {
  const format = vault.v ?? 1;
  const salt = fromB64(vault.kdf.salt);
  const { wrapKey, macKey } =
    format >= 2
      ? await deriveKeys(passphrase, salt, vault.kdf.iterations)
      : await deriveLegacy(passphrase, salt, vault.kdf.iterations);

  let plain;
  try {
    plain = await subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(vault.privateKey.iv) },
      wrapKey,
      fromB64(vault.privateKey.ct),
    );
  } catch {
    throw new VaultError('That passphrase does not match.');
  }
  const privateKeyJwk = JSON.parse(dec.decode(plain));

  if (format >= 2) {
    const genuine = await subtle.verify(
      'HMAC',
      macKey,
      fromB64(vault.publicKeyMac),
      enc.encode(canonical(vault.publicKeyJwk)),
    );
    if (!genuine) {
      throw new VaultError(
        'The stored public key does not match this vault. Saved data has been altered — nothing was decrypted.',
      );
    }
    return { privateKeyJwk, vault, upgraded: false };
  }

  return {
    privateKeyJwk,
    vault: await sealVault(vault.publicKeyJwk, privateKeyJwk, passphrase),
    upgraded: true,
  };
}

export async function rewrapVault(vault, privateKeyJwk, newPassphrase) {
  return sealVault(vault.publicKeyJwk, privateKeyJwk, newPassphrase);
}

async function entryKey(sharedBits, epkRaw, usage) {
  const hkdf = await subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: epkRaw, info: enc.encode(ENTRY_INFO) },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  );
}

export async function encryptEntry(publicKeyJwk, payload, aad = '') {
  const recipient = await subtle.importKey(
    'jwk',
    publicKeyJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const ephemeral = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);
  const shared = await subtle.deriveBits(
    { name: 'ECDH', public: recipient },
    ephemeral.privateKey,
    256,
  );
  const epkRaw = new Uint8Array(await subtle.exportKey('raw', ephemeral.publicKey));
  const key = await entryKey(shared, epkRaw, 'encrypt');
  const iv = randomBytes(12);

  const ct = await subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(aad) },
    key,
    enc.encode(JSON.stringify(payload)),
  );
  return { v: ENTRY_FORMAT, epk: toB64(epkRaw), iv: toB64(iv), ct: toB64(ct) };
}

export async function decryptEntry(privateKeyJwk, entry, aad = '') {
  const priv = await subtle.importKey(
    'jwk',
    privateKeyJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  );
  const epkRaw = fromB64(entry.epk);
  const ephemeralPub = await subtle.importKey(
    'raw',
    epkRaw,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const shared = await subtle.deriveBits({ name: 'ECDH', public: ephemeralPub }, priv, 256);
  const key = await entryKey(shared, epkRaw, 'decrypt');

  const params = { name: 'AES-GCM', iv: fromB64(entry.iv) };

  if ((entry.v ?? 1) >= 2) params.additionalData = enc.encode(aad);

  let plain;
  try {
    plain = await subtle.decrypt(params, key, fromB64(entry.ct));
  } catch {
    throw new VaultError('This entry could not be decrypted.');
  }
  return JSON.parse(dec.decode(plain));
}
