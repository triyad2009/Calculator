import { describe, it, expect } from 'vitest';
import {
  toWei,
  fromWei,
  trimAmount,
  formatUsd,
  formatNumber,
  shortAddress,
  isEvmAddress,
  isBtcAddress,
  hexToBytes,
  bytesToHex,
  concatBytes,
} from '../src/lib/format.js';

describe('Unit conversion', () => {
  it('converts whole ether to wei', () => {
    expect(toWei('1', 18)).toBe(10n ** 18n);
    expect(toWei('2.5', 18)).toBe(25n * 10n ** 17n);
  });

  it('converts satoshis correctly', () => {
    expect(toWei('1', 8)).toBe(100000000n);
    expect(toWei('0.00000001', 8)).toBe(1n);
  });

  it('round-trips through fromWei', () => {
    for (const value of ['0', '1', '0.000000000000000001', '12345.6789', '0.1']) {
      expect(fromWei(toWei(value, 18), 18)).toBe(value);
    }
  });

  it('normalises trailing zeros on the way back', () => {
    expect(fromWei(toWei('1.500', 18), 18)).toBe('1.5');
    expect(fromWei(0n, 18)).toBe('0');
  });

  it('handles negative amounts', () => {
    expect(toWei('-1.5', 18)).toBe(-15n * 10n ** 17n);
    expect(fromWei(-15n * 10n ** 17n, 18)).toBe('-1.5');
  });

  it('rejects more decimals than the asset allows', () => {
    expect(() => toWei('0.123456789', 8)).toThrow(/Too many decimals/);
  });

  it('rejects non-numeric input', () => {
    for (const bad of ['abc', '.', '-', '1.2.3', '1e5', '0x10', '--1', 'NaN']) {
      expect(() => toWei(bad, 18), `expected "${bad}" to throw`).toThrow();
    }
  });

  it('treats a blank field as zero rather than an error', () => {
    // Deliberate: the Send form calls this while the user is still typing.
    expect(toWei('', 18)).toBe(0n);
    expect(toWei(null, 18)).toBe(0n);
    expect(toWei(undefined, 18)).toBe(0n);
  });

  it('strips thousands separators', () => {
    expect(toWei('1,000.5', 18)).toBe(toWei('1000.5', 18));
  });
});

describe('Display formatting', () => {
  it('trims long fractional balances', () => {
    expect(trimAmount('1.234567890', 6)).toBe('1.234567');
    expect(trimAmount('1.000000', 6)).toBe('1');
    expect(trimAmount('0.5', 6)).toBe('0.5');
  });

  it('formats USD amounts', () => {
    expect(formatUsd(1234.5)).toBe('$1,234.50');
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(NaN)).toBe('—');
    expect(formatUsd(0.001)).toBe('<$0.01');
  });

  it('formats plain numbers', () => {
    expect(formatNumber(1234.5678, 2)).toBe('1,234.57');
    expect(formatNumber('nope')).toBe('0');
  });

  it('shortens addresses', () => {
    const addr = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
    expect(shortAddress(addr)).toBe('0x9858…da94');
    expect(shortAddress('short')).toBe('short');
    expect(shortAddress('')).toBe('');
  });
});

describe('Address validation', () => {
  it('accepts valid EVM addresses', () => {
    expect(isEvmAddress('0x9858EfFD232B4033E47d90003D41EC34EcaEda94')).toBe(true);
    expect(isEvmAddress('0x' + '0'.repeat(40))).toBe(true);
  });

  it('rejects invalid EVM addresses', () => {
    for (const bad of ['0x123', '9858EfFD232B4033E47d90003D41EC34EcaEda94', '0x' + 'g'.repeat(40), '', null]) {
      expect(isEvmAddress(bad)).toBe(false);
    }
  });

  it('accepts bech32 and legacy Bitcoin addresses', () => {
    expect(isBtcAddress('bc1qr583w2swedy2acd7rung055k8t3n7udp7vyzyg')).toBe(true);
    expect(isBtcAddress('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx')).toBe(true);
    expect(isBtcAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toBe(true);
  });

  it('rejects invalid Bitcoin addresses', () => {
    for (const bad of ['0x9858EfFD232B4033E47d90003D41EC34EcaEda94', 'bc1', '', null]) {
      expect(isBtcAddress(bad)).toBe(false);
    }
  });
});

describe('Byte helpers', () => {
  it('parses hex with and without the 0x prefix', () => {
    expect(bytesToHex(hexToBytes('deadbeef'))).toBe('0xdeadbeef');
    expect(bytesToHex(hexToBytes('0xdeadbeef'))).toBe('0xdeadbeef');
    expect(bytesToHex(hexToBytes('0xabc'))).toBe('0x0abc');
  });

  it('can omit the prefix', () => {
    expect(bytesToHex(hexToBytes('0xff'), false)).toBe('ff');
  });

  it('concatenates byte arrays', () => {
    const out = concatBytes(new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array([4, 5]));
    expect(bytesToHex(out, false)).toBe('0102030405');
    expect(out.length).toBe(5);
  });
});
