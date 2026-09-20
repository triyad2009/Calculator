/**
 * Wallet key material: BIP39 mnemonic -> BIP32 HD seed -> per-chain accounts.
 *
 * Everything here runs locally in the browser. No key material is ever
 * transmitted anywhere.
 */
import { generateMnemonic, validateMnemonic, mnemonicToSeedSync, mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { HDKey } from '@scure/bip32';
import { keccak_256 } from '@noble/hashes/sha3';
import { sha256 } from '@noble/hashes/sha2';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { secp256k1 } from '@noble/curves/secp256k1';
import { base58check, bech32 } from '@scure/base';
import { utf8ToBytes } from '@noble/hashes/utils';
// NOTE: use the project's byte helpers (0x-prefixed hex by default) everywhere in
// this module so every exported hex string has a consistent shape.
import { bytesToHex, hexToBytes, concatBytes } from './format.js';

const b58check = base58check(sha256);

export const WORD_COUNTS = [12, 15, 18, 21, 24];

export const ENTROPY_BITS = { 12: 128, 15: 160, 18: 192, 21: 224, 24: 256 };

/** Create a fresh, cryptographically random mnemonic (default: 12 words / 128-bit). */
export function createMnemonic(words = 12) {
  const strength = ENTROPY_BITS[words] ?? 128;
  return generateMnemonic(wordlist, strength);
}

export function checkMnemonic(phrase) {
  const normalized = normalizeMnemonic(phrase);
  if (!normalized) return { valid: false, reason: 'Enter your recovery phrase.' };
  const words = normalized.split(' ');
  if (![12, 15, 18, 21, 24].includes(words.length)) {
    return { valid: false, reason: `A recovery phrase has 12, 15, 18, 21 or 24 words — you entered ${words.length}.` };
  }
  if (!validateMnemonic(normalized, wordlist)) {
    return { valid: false, reason: 'That phrase is not valid — check for typos or wrong word order.' };
  }
  return { valid: true, phrase: normalized, words };
}

export const normalizeMnemonic = (phrase) =>
  String(phrase || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');

export function mnemonicToSeed(phrase, passphrase = '') {
  return mnemonicToSeedSync(normalizeMnemonic(phrase), passphrase || '');
}

/** BIP39 checksum verification of the entropy — useful for a "phrase is real" assertion. */
export function mnemonicEntropy(phrase) {
  try {
    // Bare hex (no 0x) is the conventional way to write BIP39 entropy.
    return bytesToHex(mnemonicToEntropy(normalizeMnemonic(phrase), wordlist), false);
  } catch {
    return null;
  }
}

const rootKeyCache = new WeakMap();
function rootFromSeed(seed) {
  let root = rootKeyCache.get(seed);
  if (!root) {
    root = HDKey.fromMasterSeed(seed);
    rootKeyCache.set(seed, root);
  }
  return root;
}

/* ------------------------------------------------------------------ */
/* EVM (Ethereum & every EVM-compatible chain share one address)       */
/* ------------------------------------------------------------------ */

export const EVM_PATH = (index = 0) => `m/44'/60'/0'/0/${index}`;

/** keccak256 of the uncompressed public key (minus its 0x04 prefix), last 20 bytes. */
export function publicKeyToEvmAddress(publicKeyUncompressed) {
  const body = publicKeyUncompressed.length === 65 ? publicKeyUncompressed.slice(1) : publicKeyUncompressed;
  return bytesToHex(keccak_256(body).slice(-20));
}

/** EIP-55 mixed-case checksum encoding. */
export function toChecksumAddress(address) {
  const lower = address.toLowerCase().replace('0x', '');
  const hash = bytesToHex(keccak_256(utf8ToBytes(lower)), false);
  let out = '0x';
  for (let i = 0; i < lower.length; i++) {
    out += parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
  }
  return out;
}

export function deriveEvmAccount(seed, index = 0) {
  const path = EVM_PATH(index);
  const node = rootFromSeed(seed).derive(path);
  const privateKey = node.privateKey;
  const compressed = secp256k1.getPublicKey(privateKey, true);
  const uncompressed = secp256k1.getPublicKey(privateKey, false);
  const address = toChecksumAddress(publicKeyToEvmAddress(uncompressed));
  return {
    path,
    privateKey,
    privateKeyHex: bytesToHex(privateKey),
    publicKey: compressed,
    publicKeyHex: bytesToHex(compressed),
    address,
  };
}

/**
 * Sign a 32-byte digest. Returns low-S normalised r/s plus the recovery id,
 * which is exactly what EIP-1559 / legacy transaction envelopes need.
 */
export function signDigest(privateKey, digest) {
  const sig = secp256k1.sign(digest instanceof Uint8Array ? digest : hexToBytes(digest), privateKey, { lowS: true });
  return {
    r: sig.r,
    s: sig.s,
    yParity: sig.recovery,
  };
}

/** Verify a signature recovers to `address` — used by our own test-suite and the UI. */
export function recoverAddress(digest, signature, yParity) {
  const sig = new secp256k1.Signature(signature.r, signature.s).addRecoveryBit(yParity);
  const point = sig.recoverPublicKey(digest instanceof Uint8Array ? digest : hexToBytes(digest));
  return toChecksumAddress(publicKeyToEvmAddress(point.toRawBytes(false)));
}

/* ------------------------------------------------------------------ */
/* Bitcoin                                                             */
/* ------------------------------------------------------------------ */

export const BTC_PATH = (index = 0) => `m/84'/0'/0'/0/${index}`;
export const BTC_LEGACY_PATH = (index = 0) => `m/44'/0'/0'/0/${index}`;

export const hash160 = (bytes) => ripemd160(sha256(bytes));

/** BIP173 P2WPKH (bech32) address — the default, cheapest-to-spend format. */
export function publicKeyToBech32(publicKeyCompressed, prefix = 'bc') {
  const program = hash160(publicKeyCompressed);
  const words = bech32.toWords(program);
  return bech32.encode(prefix, [0, ...words]); // witness version 0
}

/** Legacy P2PKH (base58check) address, kept for services that still require it. */
export function publicKeyToP2PKH(publicKeyCompressed, version = 0x00) {
  const payload = new Uint8Array(21);
  payload[0] = version;
  payload.set(hash160(publicKeyCompressed), 1);
  return b58check.encode(payload);
}

export function deriveBtcAccount(seed, index = 0, testnet = false) {
  const path = BTC_PATH(index);
  const node = rootFromSeed(seed).derive(path);
  const privateKey = node.privateKey;
  const compressed = secp256k1.getPublicKey(privateKey, true);
  return {
    path,
    privateKey,
    privateKeyHex: bytesToHex(privateKey),
    publicKey: compressed,
    publicKeyHex: bytesToHex(compressed),
    address: publicKeyToBech32(compressed, testnet ? 'tb' : 'bc'),
    legacyAddress: publicKeyToP2PKH(compressed, testnet ? 0x6f : 0x00),
  };
}

/* ------------------------------------------------------------------ */
/* Convenience                                                         */
/* ------------------------------------------------------------------ */

export function deriveAllAccounts(seed, index = 0) {
  return {
    evm: deriveEvmAccount(seed, index),
    btc: deriveBtcAccount(seed, index, false),
    btcTestnet: deriveBtcAccount(seed, index, true),
  };
}

export const keccak256 = (input) => keccak_256(input);
export { concatBytes, bytesToHex, hexToBytes };
