/** Unit, number and string helpers. All token math is done in BigInt wei. */

export const toWei = (amount, decimals = 18) => {
  if (amount === null || amount === undefined || amount === '') return 0n;
  const str = String(amount).trim().replace(/,/g, '');
  // Requires at least one digit, so "." and "-" are rejected rather than read as zero.
  if (!/^-?(?:\d+\.?\d*|\d*\.\d+)$/.test(str)) {
    throw new Error(`"${amount}" is not a valid decimal amount`);
  }
  const negative = str.startsWith('-');
  const [intPart = '0', fracPart = ''] = (negative ? str.slice(1) : str).split('.');
  if (fracPart.length > decimals) {
    throw new Error(`Too many decimals (max ${decimals})`);
  }
  const padded = (fracPart + '0'.repeat(decimals)).slice(0, decimals);
  const value = BigInt((intPart || '0') + padded);
  return negative ? -value : value;
};

export const fromWei = (wei, decimals = 18) => {
  const w = BigInt(wei);
  const negative = w < 0n;
  const abs = negative ? -w : w;
  const base = 10n ** BigInt(decimals);
  const intPart = abs / base;
  const fracPart = (abs % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${intPart}${fracPart ? `.${fracPart}` : ''}`;
};

/** Trim long balances for display, keeping the value parseable elsewhere. */
export const trimAmount = (value, maxDecimals = 6) => {
  if (value === null || value === undefined || value === '') return '0';
  const [i, f] = String(value).split('.');
  if (!f) return i;
  const trimmed = f.slice(0, maxDecimals).replace(/0+$/, '');
  return trimmed ? `${i}.${trimmed}` : i;
};

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usdPrecise = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

export const formatUsd = (value, precise = false) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (n !== 0 && Math.abs(n) < 0.01) return precise ? usdPrecise.format(n) : '<$0.01';
  return (precise ? usdPrecise : usd).format(n);
};

export const formatNumber = (value, max = 4) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: max }).format(n);
};

export const shortAddress = (addr, head = 6, tail = 4) => {
  if (!addr) return '';
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
};

export const hexToBytes = (hex) => {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const even = clean.length % 2 ? `0${clean}` : clean;
  const out = new Uint8Array(even.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(even.slice(i * 2, i * 2 + 2), 16);
  return out;
};

export const bytesToHex = (bytes, prefix = true) =>
  `${prefix ? '0x' : ''}${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;

export const concatBytes = (...arrays) => {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
};

export const isEvmAddress = (value) => /^0x[0-9a-fA-F]{40}$/.test(String(value || '').trim());

/** Rough bech32 / legacy Bitcoin address sanity check. */
export const isBtcAddress = (value) => {
  const v = String(value || '').trim();
  return /^(bc1|tb1|bcrt1)[02-9ac-hj-np-z]{25,87}$/i.test(v) || /^[13mn2][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(v);
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
