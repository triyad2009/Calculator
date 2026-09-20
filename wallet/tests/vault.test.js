import { describe, it, expect, beforeEach } from 'vitest';
import {
  createVault,
  unlockVault,
  changePassword,
  destroyVault,
  hasVault,
  readMeta,
  writeMeta,
  recordSentTx,
  readSentTxs,
  isCryptoAvailable,
  PBKDF2_ITERATIONS,
} from '../src/lib/vault.js';

/** Minimal in-memory localStorage so these tests run outside a browser. */
function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
}

const PHRASE = 'abandon '.repeat(11) + 'about';
const PASSWORD = 'correct horse battery';

describe('Encrypted vault', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it('has WebCrypto available in this environment', () => {
    expect(isCryptoAvailable()).toBe(true);
  });

  it('uses a strong PBKDF2 iteration count', () => {
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(310_000);
  });

  it('round-trips the recovery phrase through AES-GCM', async () => {
    await createVault(PHRASE, PASSWORD);
    expect(hasVault()).toBe(true);
    expect(await unlockVault(PASSWORD)).toBe(PHRASE);
  });

  it('never stores the phrase in plaintext', async () => {
    await createVault(PHRASE, PASSWORD);
    const raw = localStorage.getItem('nexvault.vault.v1');
    expect(raw).not.toContain('abandon');
    const record = JSON.parse(raw);
    expect(record.kdf).toBe('PBKDF2-SHA256');
    expect(record.iterations).toBe(PBKDF2_ITERATIONS);
    expect(record.salt).toBeTruthy();
    expect(record.iv).toBeTruthy();
    expect(record.ciphertext).toBeTruthy();
  });

  it('returns null for a wrong password (GCM auth tag mismatch)', async () => {
    await createVault(PHRASE, PASSWORD);
    expect(await unlockVault('not the password')).toBeNull();
    expect(await unlockVault('')).toBeNull();
  });

  it('rejects a weak password at creation', async () => {
    await expect(createVault(PHRASE, 'short')).rejects.toThrow(/at least 8 characters/);
    expect(hasVault()).toBe(false);
  });

  it('uses a fresh salt and IV for every vault', async () => {
    await createVault(PHRASE, PASSWORD);
    const first = JSON.parse(localStorage.getItem('nexvault.vault.v1'));
    await createVault(PHRASE, PASSWORD);
    const second = JSON.parse(localStorage.getItem('nexvault.vault.v1'));
    expect(first.salt).not.toBe(second.salt);
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it('re-encrypts under a new password and invalidates the old one', async () => {
    await createVault(PHRASE, PASSWORD);
    await changePassword(PASSWORD, 'a brand new password');
    expect(await unlockVault('a brand new password')).toBe(PHRASE);
    expect(await unlockVault(PASSWORD)).toBeNull();
  });

  it('refuses to change the password without the current one', async () => {
    await createVault(PHRASE, PASSWORD);
    await expect(changePassword('wrong', 'whatever123')).rejects.toThrow(/Current password is incorrect/);
    expect(await unlockVault(PASSWORD)).toBe(PHRASE);
  });

  it('erases everything on destroy', async () => {
    await createVault(PHRASE, PASSWORD);
    writeMeta({ networkId: 'base' });
    recordSentTx({ networkId: 'base', hash: '0xabc' });
    destroyVault();
    expect(hasVault()).toBe(false);
    expect(await unlockVault(PASSWORD)).toBeNull();
    expect(readSentTxs()).toEqual([]);
  });
});

describe('Non-secret metadata and local tx log', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it('reads and merges metadata', () => {
    expect(readMeta()).toEqual({});
    writeMeta({ networkId: 'base' });
    writeMeta({ autoLockMinutes: 30 });
    expect(readMeta()).toEqual({ networkId: 'base', autoLockMinutes: 30 });
  });

  it('records sent transactions newest-first and caps the list', () => {
    for (let i = 0; i < 5; i++) recordSentTx({ networkId: 'ethereum', hash: `0x${i}` });
    const list = readSentTxs();
    expect(list[0].hash).toBe('0x4');
    expect(list).toHaveLength(5);
    expect(list[0].recordedAt).toBeTruthy();
  });
});
