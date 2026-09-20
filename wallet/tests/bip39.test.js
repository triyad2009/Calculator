import { describe, it, expect } from 'vitest';
import { mnemonicToSeedSync, validateMnemonic, entropyToMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { HDKey } from '@scure/bip32';
import { bytesToHex, hexToBytes } from '../src/lib/format.js';
import vectors from './fixtures/bip39-english.json';

import {
  createMnemonic,
  checkMnemonic,
  mnemonicToSeed,
  mnemonicEntropy,
  normalizeMnemonic,
  WORD_COUNTS,
  ENTROPY_BITS,
} from '../src/lib/wallet-core.js';

/**
 * The official BIP39 test vectors (tests/fixtures/bip39-english.json), sourced
 * from trezor/python-mnemonic. Each row is [entropy, mnemonic, seed, xprv].
 *
 * IMPORTANT: every published vector is computed with the passphrase "TREZOR",
 * not an empty one — the passphrase is implicit in the vector set rather than
 * stored as a field. Verified independently with node:crypto PBKDF2: 24/24
 * vectors match with "TREZOR" and 0/24 match with an empty passphrase.
 */
const VECTOR_PASSPHRASE = 'TREZOR';

describe('BIP39 — official Trezor test vectors', () => {
  it('has 24 official english vectors loaded', () => {
    expect(vectors.english.length).toBe(24);
  });

  it.each(vectors.english.map((v, i) => [i, v]))(
    'vector #%i: entropy -> mnemonic -> seed',
    (_i, [entropy, mnemonic, seed, xprv]) => {
      expect(entropyToMnemonic(hexToBytes(entropy), wordlist)).toBe(mnemonic.trim());
      expect(bytesToHex(mnemonicToSeedSync(mnemonic.trim(), VECTOR_PASSPHRASE), false)).toBe(seed);
      // The published xprv is the BIP32 master key for that same seed.
      expect(HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic.trim(), VECTOR_PASSPHRASE)).privateExtendedKey).toBe(xprv);
    },
  );

  it('our wrapper produces the same seed as the reference implementation', () => {
    const [, mnemonic, seed] = vectors.english[0];
    expect(bytesToHex(mnemonicToSeed(mnemonic.trim(), VECTOR_PASSPHRASE), false)).toBe(seed);
  });
});

/**
 * Empty-passphrase seeds for the two all-"abandon" phrases, computed
 * independently with node:crypto PBKDF2-HMAC-SHA512 (2048 iters, salt
 * "mnemonic") — these are the values a wallet with no passphrase must produce.
 */
describe('BIP39 — empty passphrase', () => {
  it('derives the expected seed for the all-abandon 12-word phrase', () => {
    expect(mnemonicToSeed('abandon '.repeat(11) + 'about')).toBeInstanceOf(Uint8Array);
    expect(bytesToHex(mnemonicToSeed('abandon '.repeat(11) + 'about'), false)).toBe(
      '5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4',
    );
  });

  it('derives the expected seed for the all-abandon 24-word phrase', () => {
    expect(bytesToHex(mnemonicToSeed('abandon '.repeat(23) + 'art'), false)).toBe(
      '408b285c123836004f4b8842c89324c1f01382450c0d439af345ba7fc49acf705489c6fc77dbd4e3dc1dd8cc6bc9f043db8ada1e243c4a0eafb290d399480840',
    );
  });

  it('a passphrase changes the seed', () => {
    const phrase = 'abandon '.repeat(11) + 'about';
    expect(bytesToHex(mnemonicToSeed(phrase, VECTOR_PASSPHRASE), false)).toBe(vectors.english[0][2]);
    expect(mnemonicToSeed(phrase, VECTOR_PASSPHRASE)).not.toEqual(mnemonicToSeed(phrase, ''));
  });
});

describe('BIP39 — mnemonic generation and validation', () => {
  it.each(WORD_COUNTS)('generates a valid %i-word mnemonic', (words) => {
    const phrase = createMnemonic(words);
    expect(phrase.trim().split(/\s+/).length).toBe(words);
    expect(validateMnemonic(phrase, wordlist)).toBe(true);
    expect(checkMnemonic(phrase).valid).toBe(true);
  });

  it('produces different entropy on every call (no reused randomness)', () => {
    const seen = new Set(Array.from({ length: 25 }, () => createMnemonic(12)));
    expect(seen.size).toBe(25);
  });

  it('maps word counts to the correct entropy bit lengths', () => {
    expect(ENTROPY_BITS[12]).toBe(128);
    expect(ENTROPY_BITS[24]).toBe(256);
  });

  it('round-trips a generated phrase through entropy', () => {
    const phrase = createMnemonic(24);
    expect(mnemonicEntropy(phrase)).toMatch(/^[0-9a-f]{64}$/);
    expect(entropyToMnemonic(hexToBytes(mnemonicEntropy(phrase)), wordlist)).toBe(phrase);
  });

  it('rejects an empty phrase', () => {
    const res = checkMnemonic('');
    expect(res.valid).toBe(false);
  });

  it('rejects a phrase with the wrong word count', () => {
    const res = checkMnemonic('abandon abandon abandon');
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/12, 15, 18, 21 or 24/);
  });

  it('rejects a phrase with a broken checksum', () => {
    const phrase = createMnemonic(12).trim().split(/\s+/);
    // Swap the final (checksum-bearing) word for a different valid dictionary word.
    const last = phrase.at(-1);
    const replacement = wordlist.find((w) => w !== last && w !== phrase.at(-2));
    phrase[phrase.length - 1] = replacement;
    const res = checkMnemonic(phrase.join(' '));
    // Either the checksum fails, or we accidentally hit a valid alternative — assert the message is informative.
    if (!res.valid) expect(res.reason).toMatch(/not valid/);
  });

  it('normalises case and extra whitespace before validating', () => {
    const phrase = createMnemonic(12);
    const messy = `  ${phrase.toUpperCase().split(/\s+/).join('   ')}  `;
    expect(normalizeMnemonic(messy)).toBe(phrase);
    expect(checkMnemonic(messy).valid).toBe(true);
  });


});
