/**
 * Minimal, dependency-free RLP encoder (Ethereum Yellow Paper, Appendix B)
 * plus the helpers needed to turn JS values into canonical RLP byte strings.
 */
import { hexToBytes, bytesToHex, concatBytes } from './format.js';

const enc = (s) => new TextEncoder().encode(s);

/**
 * Normalise any supported input to a Uint8Array.
 *
 * Numbers and bigints are minimally encoded (no leading zero bytes), as RLP
 * requires for integers. Explicit Uint8Array inputs are preserved *verbatim* —
 * a 32-byte hash or 20-byte address must not be shortened.
 */
export function toBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value === null || value === undefined || value === '' || value === 0 || value === 0n) return new Uint8Array(0);
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0) throw new Error(`RLP: invalid number ${value}`);
    return toBytes(BigInt(value));
  }
  if (typeof value === 'bigint') {
    if (value < 0n) throw new Error('RLP: negative integers are not supported');
    if (value === 0n) return new Uint8Array(0);
    let hex = value.toString(16);
    if (hex.length % 2) hex = `0${hex}`;
    return hexToBytes(hex);
  }
  if (typeof value === 'string') {
    if (value.startsWith('0x') || value.startsWith('0X')) {
      const body = value.slice(2);
      if (body.length === 0) return new Uint8Array(0);
      if (!/^[0-9a-fA-F]+$/.test(body)) throw new Error(`RLP: invalid hex string ${value}`);
      return hexToBytes(body.length % 2 ? `0${body}` : body);
    }
    return enc(value);
  }
  if (Array.isArray(value)) throw new Error('RLP: arrays must be passed to rlpEncode directly');
  throw new Error(`RLP: unsupported value type ${typeof value}`);
}

function encodeLength(length, offset) {
  if (length < 56) return new Uint8Array([offset + length]);
  const lenBytes = [];
  let l = length;
  while (l > 0) {
    lenBytes.unshift(l % 256);
    l = Math.floor(l / 256);
  }
  return new Uint8Array([offset + 55 + lenBytes.length, ...lenBytes]);
}

function encodeOne(value) {
  if (Array.isArray(value)) {
    const payload = concatBytes(...value.map(encodeOne));
    return concatBytes(encodeLength(payload.length, 0xc0), payload);
  }
  const bytes = toBytes(value);
  if (bytes.length === 1 && bytes[0] < 0x80) return bytes;
  return concatBytes(encodeLength(bytes.length, 0x80), bytes);
}

/** RLP-encode a nested array/bytes/number/bigint/hex-string structure. */
export function rlpEncode(input) {
  return encodeOne(input);
}

export const rlpEncodeHex = (input) => bytesToHex(rlpEncode(input));

/**
 * Canonical fixed-width encodings used inside transaction envelopes:
 * an address is always 20 bytes, a hash always 32.
 */
export const addressToBytes = (address) => {
  if (!address) return new Uint8Array(0);
  const bytes = hexToBytes(address);
  if (bytes.length !== 20) throw new Error(`RLP: address must be 20 bytes, got ${bytes.length}`);
  return bytes;
};

export const toFixedBytes = (value, size) => {
  const bytes = hexToBytes(value);
  if (bytes.length > size) throw new Error(`RLP: value larger than ${size} bytes`);
  const out = new Uint8Array(size);
  out.set(bytes, size - bytes.length);
  return out;
};
