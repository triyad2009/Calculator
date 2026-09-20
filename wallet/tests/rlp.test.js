import { describe, it, expect } from 'vitest';
import { encodeRlp } from 'ethers';
import { rlpEncode, rlpEncodeHex, addressToBytes, toFixedBytes, toBytes } from '../src/lib/rlp.js';
import { hexToBytes, bytesToHex } from '../src/lib/format.js';

/** Our encoder returns 0x-prefixed hex; the published vectors are bare hex. */
const encHex = (value) => rlpEncodeHex(value).slice(2);

/** JSON label that tolerates BigInt (JSON.stringify cannot serialise it). */
const label = (value) => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

/**
 * Canonical RLP examples from the Ethereum Wiki / Yellow Paper Appendix B.
 *
 * Note on JS strings: RLP encodes *bytes*, and a JS string is UTF-8 encoded
 * first. So '\x80' (U+0080) becomes the two bytes c2 80, whereas a single
 * literal 0x80 byte must be passed as a Uint8Array.
 */
const CASES = [
  ['dog', '83646f67'],
  [['cat', 'dog'], 'c88363617483646f67'],
  ['', '80'],
  [[], 'c0'],
  [0, '80'],
  [15, '0f'],
  [1024, '820400'],
  [
    'Lorem ipsum dolor sit amet, consectetur adipisicing elit',
    'b8384c6f72656d20697073756d20646f6c6f722073697420616d65742c20636f6e7365637465747572206164697069736963696e6720656c6974',
  ],
  [[[], [[]], [[], [[]]]], 'c7c0c1c0c3c0c1c0'],
  ['\x00', '00'],
  ['\x0f', '0f'],
  ['\x04\x00', '820400'],
  [new Uint8Array([0x80]), '8180'],
  [new Uint8Array([0x00]), '00'],
  [BigInt('0x1234'), '821234'],
  ['0x1234', '821234'],
  ['0x', '80'],
];

describe('RLP encoder — spec examples', () => {
  // Plain loop rather than it.each: several cases contain BigInt, which
  // vitest's %j formatter cannot serialise.
  for (const [input, expected] of CASES) {
    it(`encodes ${label(input)} as ${expected}`, () => {
      expect(encHex(input)).toBe(expected);
    });
  }

  it('UTF-8 encodes JS strings before encoding (U+0080 is two bytes)', () => {
    expect(encHex('\x80')).toBe('82c280');
  });
});

describe('RLP encoder — cross-checked against ethers', () => {
  it('agrees with ethers for ASCII strings', () => {
    for (const value of ['dog', '', 'Lorem ipsum dolor sit amet, consectetur adipisicing elit']) {
      expect(encHex(value)).toBe(encodeRlp(new TextEncoder().encode(value)).slice(2));
    }
  });

  it('agrees with ethers for nested lists of strings', () => {
    const value = ['cat', 'dog'];
    expect(encHex(value)).toBe(encodeRlp(value.map((v) => new TextEncoder().encode(v))).slice(2));
  });

  it('agrees with ethers for byte arrays', () => {
    const value = new Uint8Array([0x80]);
    expect(encHex(value)).toBe(encodeRlp(value).slice(2));
  });

  it('agrees with ethers for hex-quantity integers', () => {
    expect(encHex(1024)).toBe(encodeRlp('0x0400').slice(2));
    expect(encHex(BigInt('0x1234'))).toBe(encodeRlp('0x1234').slice(2));
  });

  it('agrees with ethers for a transaction-shaped nested structure', () => {
    const to = addressToBytes('0x3535353535353535353535353535353535353535');
    const fields = [9n, 20000000000n, 21000n, to, 10n ** 18n, new Uint8Array(0), 1n, 0n, 0n];
    const ours = encHex(fields);
    const theirs = encodeRlp([
      '0x09',
      '0x04a817c800',
      '0x5208',
      '0x3535353535353535353535353535353535353535',
      '0x0de0b6b3a7640000',
      '0x',
      '0x01',
      '0x',
      '0x',
    ]).slice(2);
    expect(ours).toBe(theirs);
  });
});

describe('RLP byte helpers', () => {
  it('preserves explicit byte arrays verbatim (never strips leading zeros)', () => {
    const hash = new Uint8Array([0, 0, 0, 1]);
    expect(toBytes(hash)).toBe(hash);
    // A 4-byte value starting with zeros still encodes as 4 bytes.
    expect(encHex(hash)).toBe('8400000001');
  });

  it('minimally encodes integers', () => {
    expect(bytesToHex(toBytes(0n), false)).toBe('');
    expect(bytesToHex(toBytes(1n), false)).toBe('01');
    expect(bytesToHex(toBytes(256n), false)).toBe('0100');
  });

  it('addressToBytes enforces 20 bytes', () => {
    expect(addressToBytes('0x3535353535353535353535353535353535353535').length).toBe(20);
    expect(() => addressToBytes('0x1234')).toThrow(/20 bytes/);
  });

  it('addressToBytes returns empty bytes for a null destination (contract creation)', () => {
    expect(addressToBytes(null).length).toBe(0);
    expect(addressToBytes(undefined).length).toBe(0);
  });

  it('toFixedBytes left-pads to the requested width', () => {
    expect(bytesToHex(toFixedBytes('0x1', 8), false)).toBe('0000000000000001');
    expect(() => toFixedBytes('0x010203', 2)).toThrow();
  });

  it('returns an empty-string encoding for null/undefined/empty inputs', () => {
    for (const v of [null, undefined, '', 0, 0n]) {
      expect(encHex(v)).toBe('80');
    }
  });

  it('rejects invalid hex strings', () => {
    expect(() => toBytes('0xzz')).toThrow(/invalid hex/);
  });

  it('rejects non-integer and negative numbers', () => {
    expect(() => toBytes(1.5)).toThrow(/invalid number/);
    expect(() => toBytes(-1)).toThrow(/invalid number/);
    expect(() => toBytes(-1n)).toThrow(/negative/);
  });

  it('round-trips hexToBytes/bytesToHex', () => {
    expect(bytesToHex(hexToBytes('0xdeadBEEF'))).toBe('0xdeadbeef');
  });
});
