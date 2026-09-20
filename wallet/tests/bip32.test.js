import { describe, it, expect } from 'vitest';
import { HDKey } from '@scure/bip32';
import { hexToBytes } from '@noble/hashes/utils';
import { mnemonicToSeed, deriveEvmAccount, deriveBtcAccount, EVM_PATH, BTC_PATH } from '../src/lib/wallet-core.js';

/**
 * BIP32 Test Vector 1, transcribed verbatim from bip-0032.mediawiki
 * (seed 000102030405060708090a0b0c0d0e0f).
 */
const SEED = '000102030405060708090a0b0c0d0e0f';
const VECTOR_1 = {
  m: {
    xpub: 'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8',
    xprv: 'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi',
  },
  "m/0'": {
    xpub: 'xpub68Gmy5EdvgibQVfPdqkBBCHxA5htiqg55crXYuXoQRKfDBFA1WEjWgP6LHhwBZeNK1VTsfTFUHCdrfp1bgwQ9xv5ski8PX9rL2dZXvgGDnw',
    xprv: 'xprv9uHRZZhk6KAJC1avXpDAp4MDc3sQKNxDiPvvkX8Br5ngLNv1TxvUxt4cV1rGL5hj6KCesnDYUhd7oWgT11eZG7XnxHrnYeSvkzY7d2bhkJ7',
  },
};

describe('BIP32 — official Test Vector 1', () => {
  it('derives the documented master key from the spec seed', () => {
    const root = HDKey.fromMasterSeed(hexToBytes(SEED));
    expect(root.publicExtendedKey).toBe(VECTOR_1.m.xpub);
    expect(root.privateExtendedKey).toBe(VECTOR_1.m.xprv);
  });

  it("derives the documented m/0' hardened child", () => {
    const child = HDKey.fromMasterSeed(hexToBytes(SEED)).derive("m/0'");
    expect(child.publicExtendedKey).toBe(VECTOR_1["m/0'"].xpub);
    expect(child.privateExtendedKey).toBe(VECTOR_1["m/0'"].xprv);
  });
});

describe('BIP44/BIP84 derivation paths', () => {
  const phrase = 'abandon '.repeat(11) + 'about';
  const seed = mnemonicToSeed(phrase);

  it('uses the standard Ethereum coin type 60 path', () => {
    expect(EVM_PATH(0)).toBe("m/44'/60'/0'/0/0");
    expect(EVM_PATH(3)).toBe("m/44'/60'/0'/0/3");
  });

  it('uses the standard Bitcoin segwit coin type 0 path', () => {
    expect(BTC_PATH(0)).toBe("m/84'/0'/0'/0/0");
  });

  it('derives distinct accounts for distinct indexes', () => {
    const a0 = deriveEvmAccount(seed, 0);
    const a1 = deriveEvmAccount(seed, 1);
    expect(a0.address).not.toBe(a1.address);
  });

  it('is deterministic across repeated derivation', () => {
    expect(deriveEvmAccount(seed, 0).address).toBe(deriveEvmAccount(seed, 0).address);
    expect(deriveBtcAccount(seed, 0).address).toBe(deriveBtcAccount(seed, 0).address);
  });
});
