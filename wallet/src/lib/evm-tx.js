/**
 * EIP-1559 (type 2) and legacy (type 0) transaction construction and signing.
 *
 * Envelopes follow EIP-2718: 0x02 || rlp([...]) for EIP-1559 and a plain RLP
 * list for legacy. The digest is keccak256 of the *unsigned* envelope, and the
 * signature is low-S normalised with an explicit recovery id (yParity).
 */
import { keccak256, signDigest, recoverAddress } from './wallet-core.js';
import { rlpEncode, addressToBytes, toBytes } from './rlp.js';
import { bytesToHex, concatBytes } from './format.js';

/** Bigint-safe parse of a hex quantity returned by JSON-RPC. */
export const hexToBigInt = (hex) => {
  if (hex === null || hex === undefined || hex === '') return 0n;
  const clean = String(hex).startsWith('0x') ? String(hex).slice(2) : String(hex);
  return clean ? BigInt(`0x${clean}`) : 0n;
};

export const bigIntToHex = (value) => `0x${BigInt(value).toString(16)}`;

/**
 * Build the unsigned EIP-1559 envelope + its signing digest.
 */
export function buildEip1559Unsigned(tx) {
  const fields = [
    BigInt(tx.chainId),
    BigInt(tx.nonce),
    BigInt(tx.maxPriorityFeePerGas),
    BigInt(tx.maxFeePerGas),
    BigInt(tx.gasLimit),
    addressToBytes(tx.to),
    BigInt(tx.value ?? 0),
    toBytes(tx.data ?? '0x'),
    [], // accessList
  ];
  const encoded = rlpEncode(fields);
  const unsigned = concatBytes(new Uint8Array([0x02]), encoded);
  return { fields, unsigned, digest: keccak256(unsigned) };
}

export function signEip1559(tx, privateKey) {
  const { fields, digest } = buildEip1559Unsigned(tx);
  const { r, s, yParity } = signDigest(privateKey, digest);
  const signed = concatBytes(
    new Uint8Array([0x02]),
    rlpEncode([...fields, BigInt(yParity), r, s]),
  );
  const hash = bytesToHex(digest);
  return {
    rawTransaction: bytesToHex(signed),
    hash: keccak256TxId(signed),
    txHash: keccak256TxId(signed),
    signingHash: hash,
    r,
    s,
    yParity,
    type: 2,
    recovered: recoverAddress(digest, { r, s }, yParity),
  };
}

/** A broadcast transaction's id is keccak256 of its *signed* encoding. */
const keccak256TxId = (signedBytes) => bytesToHex(keccak256(signedBytes));

export function buildLegacyUnsigned(tx) {
  const fields = [
    BigInt(tx.nonce),
    BigInt(tx.gasPrice),
    BigInt(tx.gasLimit),
    addressToBytes(tx.to),
    BigInt(tx.value ?? 0),
    toBytes(tx.data ?? '0x'),
    BigInt(tx.chainId), // EIP-155 replay protection
    0n,
    0n,
  ];
  const encoded = rlpEncode(fields);
  return { fields, unsigned: encoded, digest: keccak256(encoded) };
}

export function signLegacy(tx, privateKey) {
  const { digest } = buildLegacyUnsigned(tx);
  const { r, s, yParity } = signDigest(privateKey, digest);
  const v = BigInt(tx.chainId) * 2n + 35n + BigInt(yParity);
  const signed = rlpEncode([
    BigInt(tx.nonce),
    BigInt(tx.gasPrice),
    BigInt(tx.gasLimit),
    addressToBytes(tx.to),
    BigInt(tx.value ?? 0),
    toBytes(tx.data ?? '0x'),
    v,
    r,
    s,
  ]);
  return {
    rawTransaction: bytesToHex(signed),
    txHash: keccak256TxId(signed),
    signingHash: bytesToHex(digest),
    r,
    s,
    v,
    yParity,
    type: 0,
    recovered: recoverAddress(digest, { r, s }, yParity),
  };
}

/* ------------------------------------------------------------------ */
/* ABI encoding for the small set of ERC-20 calls we make              */
/* ------------------------------------------------------------------ */

/** 4-byte function selector, as bare hex so it can be concatenated after `0x`. */
export const selector = (signature) =>
  bytesToHex(keccak256(new TextEncoder().encode(signature)).slice(0, 4), false);

export const SELECTORS = {
  balanceOf: selector('balanceOf(address)'),
  decimals: selector('decimals()'),
  symbol: selector('symbol()'),
  transfer: selector('transfer(address,uint256)'),
};

const padAddress = (address) => address.toLowerCase().replace('0x', '').padStart(64, '0');
const padUint = (value) => BigInt(value).toString(16).padStart(64, '0');

export const encodeBalanceOf = (owner) => `0x${SELECTORS.balanceOf}${padAddress(owner)}`;
export const encodeTransfer = (to, amount) => `0x${SELECTORS.transfer}${padAddress(to)}${padUint(amount)}`;

/** Decode a dynamic `string` return value (symbol()) or fall back to raw bytes. */
export function decodeAbiString(hex) {
  if (!hex || hex === '0x') return '';
  const body = hex.replace('0x', '');
  if (body.length < 128) {
    // static bytes32-style string (e.g. MKR)
    const bytes = [];
    for (let i = 0; i < body.length; i += 2) {
      const c = parseInt(body.slice(i, i + 2), 16);
      if (c === 0) break;
      bytes.push(c);
    }
    return new TextDecoder().decode(new Uint8Array(bytes));
  }
  const length = parseInt(body.slice(64, 128), 16) * 2;
  const bytes = [];
  for (let i = 0; i < length; i += 2) {
    bytes.push(parseInt(body.slice(128 + i, 128 + i + 2), 16));
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

export const decodeUint = (hex) => hexToBigInt(hex);
