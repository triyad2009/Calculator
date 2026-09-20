/**
 * Encrypted local vault.
 *
 * The recovery phrase is the only secret that matters, so it is the only thing
 * stored — encrypted with AES-GCM under a key derived from the user's password
 * via PBKDF2-SHA256. Nothing is ever uploaded anywhere; there is no backend.
 */

const STORAGE_KEY = 'nexvault.vault.v1';
const META_KEY = 'nexvault.meta.v1';

export const PBKDF2_ITERATIONS = 600_000;

export const hasVault = () => {
  try {
    return Boolean(localStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
};

export function isCryptoAvailable() {
  return typeof globalThis.crypto?.subtle?.deriveBits === 'function';
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function deriveKey(password, salt) {
  const baseKey = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    256,
  );
  return crypto.subtle.importKey('raw', bits, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/**
 * Create the vault. Returns the stored record.
 * @param {string} mnemonic  recovery phrase (plaintext, never persisted)
 * @param {string} password  user password
 */
export async function createVault(mnemonic, password) {
  if (!isCryptoAvailable()) {
    throw new Error('WebCrypto is unavailable — this page must be served over HTTPS or localhost.');
  }
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(mnemonic));

  const record = {
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iterations: PBKDF2_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  return record;
}

/** Decrypt and return the recovery phrase, or null when the password is wrong. */
export async function unlockVault(password) {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const record = JSON.parse(raw);
  const key = await deriveKey(password, fromBase64(record.salt));
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(record.iv) },
      key,
      fromBase64(record.ciphertext),
    );
    return decoder.decode(plain);
  } catch {
    return null; // GCM auth tag mismatch == wrong password
  }
}

export async function changePassword(currentPassword, newPassword) {
  const mnemonic = await unlockVault(currentPassword);
  if (!mnemonic) throw new Error('Current password is incorrect.');
  await createVault(mnemonic, newPassword);
  return true;
}

export function destroyVault() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(META_KEY);
  localStorage.removeItem('nexvault.sent-txs.v1');
}

/* ------------------------------------------------------------------ */
/* Non-secret metadata (safe to store in the clear)                    */
/* ------------------------------------------------------------------ */

export const readMeta = () => {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) ?? '{}');
  } catch {
    return {};
  }
};

export const writeMeta = (patch) => {
  const next = { ...readMeta(), ...patch };
  localStorage.setItem(META_KEY, JSON.stringify(next));
  return next;
};

export const vaultCreatedAt = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').createdAt ?? null;
  } catch {
    return null;
  }
};

/* ------------------------------------------------------------------ */
/* Local log of transactions this app broadcast                        */
/* ------------------------------------------------------------------ */

const TX_KEY = 'nexvault.sent-txs.v1';

export const readSentTxs = () => {
  try {
    return JSON.parse(localStorage.getItem(TX_KEY) ?? '[]');
  } catch {
    return [];
  }
};

export function recordSentTx(tx) {
  const list = [{ ...tx, recordedAt: new Date().toISOString() }, ...readSentTxs()].slice(0, 200);
  localStorage.setItem(TX_KEY, JSON.stringify(list));
  return list;
}
