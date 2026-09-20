/**
 * Bitcoin transaction builder + signer for P2WPKH (native segwit, BIP143).
 *
 * We only ever *spend* our own native-segwit (bc1q…) UTXOs, but we can *pay*
 * any standard destination: P2WPKH, P2WSH, P2TR, P2PKH and P2SH.
 */
import { sha256 } from '@noble/hashes/sha2';
import { secp256k1 } from '@noble/curves/secp256k1';
import { base58check, bech32, bech32m } from '@scure/base';
import { bytesToHex, hexToBytes, concatBytes } from './format.js';
import { hash160 } from './wallet-core.js';

export const SIGHASH_ALL = 0x01;
const b58check = base58check(sha256);

/** vsize weights (BIP141 witness discount applied to our own inputs). */
const VSIZE_BASE = 10.5;
const VSIZE_INPUT = 68; // P2WPKH witness input
const VSIZE_OUT_P2WPKH = 31;
const VSIZE_OUT_LEGACY = 34;

export const estimateVsize = (inputCount, outputs) => {
  const outCount = Array.isArray(outputs) ? outputs.length : outputs;
  const outBytes = Array.isArray(outputs)
    ? outputs.reduce((n, o) => n + (o.type === 'legacy' ? VSIZE_OUT_LEGACY : VSIZE_OUT_P2WPKH), 0)
    : outCount * VSIZE_OUT_P2WPKH;
  return Math.ceil(VSIZE_BASE + VSIZE_INPUT * inputCount + outBytes);
};

/* ---------------- little-endian primitives ---------------- */

const u32le = (n) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, Number(n), true);
  return b;
};

const u64le = (n) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(n), true);
  return b;
};

const varint = (n) => {
  const v = Number(n);
  if (v < 0xfd) return new Uint8Array([v]);
  if (v <= 0xffff) {
    const b = new Uint8Array(3);
    b[0] = 0xfd;
    new DataView(b.buffer).setUint16(1, v, true);
    return b;
  }
  const b = new Uint8Array(5);
  b[0] = 0xfe;
  new DataView(b.buffer).setUint32(1, v, true);
  return b;
};

export const doubleSha256 = (bytes) => sha256(sha256(bytes));

/** Bitcoin displays txids as reversed double-SHA256 digests. */
const reverseBytes = (bytes) => Uint8Array.from(bytes).reverse();
const reverseHex = (hex) => bytesToHex(reverseBytes(hexToBytes(hex)), false);

const txidToOutpointBytes = (txid) => reverseBytes(hexToBytes(txid));

export const scriptPubKeyP2WPKH = (publicKey) => {
  const h = hash160(publicKey);
  return concatBytes(new Uint8Array([0x76, 0xa9, 0x14]), h, new Uint8Array([0x88, 0xac]));
};

/** Decode any standard Bitcoin destination into its scriptPubKey. */
export function addressToScriptPubKey(address) {
  const addr = String(address || '').trim();

  // bech32 / bech32m (witness)
  if (/^(bc|tb|bcrt)1/i.test(addr)) {
    let decoded = null;
    for (const codec of [bech32, bech32m]) {
      try {
        decoded = codec.decode(addr, 90);
        break;
      } catch {
        /* try next codec */
      }
    }
    if (!decoded) throw new Error('Invalid bech32 address.');
    const [version, ...words] = decoded.words;
    const program = new Uint8Array(
      version === 0 ? bech32.fromWords(words) : bech32m.fromWords(words),
    );
    if (version === 0 && program.length !== 20 && program.length !== 32) {
      throw new Error('Invalid witness v0 program length.');
    }
    if (version > 0 && program.length !== 32) {
      throw new Error('Invalid witness program length.');
    }
    const versionByte = version === 0 ? 0x00 : 0x50 + version;
    return {
      scriptPubKey: concatBytes(new Uint8Array([versionByte, program.length]), program),
      type: 'witness',
    };
  }

  // base58check: P2PKH (mainnet 0x00 / testnet 0x6f) and P2SH (0x05 / 0xc4)
  if (/^[13mn2]/.test(addr)) {
    let payload;
    try {
      payload = b58check.decode(addr);
    } catch {
      throw new Error('Invalid Bitcoin address.');
    }
    const version = payload[0];
    const hash = payload.slice(1);
    if (hash.length !== 20) throw new Error('Invalid Bitcoin address payload.');
    if (version === 0x00 || version === 0x6f) {
      return {
        scriptPubKey: concatBytes(
          new Uint8Array([0x76, 0xa9, 0x14]),
          hash,
          new Uint8Array([0x88, 0xac]),
        ),
        type: 'legacy',
      };
    }
    if (version === 0x05 || version === 0xc4) {
      return {
        scriptPubKey: concatBytes(new Uint8Array([0xa9, 0x14]), hash, new Uint8Array([0x87])),
        type: 'legacy',
      };
    }
    throw new Error('Unsupported Bitcoin address version.');
  }

  throw new Error('Unrecognised Bitcoin address format.');
}

/* ---------------- coin selection ---------------- */

const DUST_SATS = 546n;

/** Greedy largest-first selection. Returns inputs, change and fee in sats. */
export function selectCoins(utxos, targetSats, feeRate) {
  const spendable = utxos
    .filter((u) => u.status?.confirmed)
    .map((u) => ({ txid: u.txid, vout: u.vout, value: BigInt(u.value) }))
    .sort((a, b) => (a.value > b.value ? -1 : a.value < b.value ? 1 : 0));

  const target = BigInt(targetSats);
  const chosen = [];
  let total = 0n;

  for (const utxo of spendable) {
    chosen.push(utxo);
    total += utxo.value;

    const probe = (withChange) => {
      const outputs = [
        { value: target, type: 'witness' },
        ...(withChange ? [{ value: 1000n, type: 'witness' }] : []),
      ];
      return BigInt(Math.ceil(estimateVsize(chosen.length, outputs) * feeRate));
    };

    const feeWithChange = probe(true);
    if (total >= target + feeWithChange) {
      const change = total - target - feeWithChange;
      if (change >= DUST_SATS) {
        return { inputs: chosen, change, fee: feeWithChange, totalIn: total, hasChange: true };
      }
      // Change would be dust — drop the change output and let it become fee.
      const feeNoChange = probe(false);
      return { inputs: chosen, change: 0n, fee: total - target, totalIn: total, hasChange: false, _feeNoChange: feeNoChange };
    }
  }
  throw new Error('Insufficient confirmed balance to cover this amount plus the network fee.');
}

/* ---------------- BIP143 sighash ---------------- */

export function buildSighash({ version = 2, inputs, outputs, signIndex, scriptCode, amountSats, locktime = 0, hashType = SIGHASH_ALL }) {
  const hashPrevouts = doubleSha256(
    concatBytes(...inputs.map((i) => concatBytes(txidToOutpointBytes(i.txid), u32le(i.vout)))),
  );

  const hashSequence = doubleSha256(
    concatBytes(...inputs.map((i) => u32le(i.sequence ?? 0xffffffff))),
  );

  const hashOutputs = doubleSha256(
    concatBytes(
      ...outputs.map((o) => concatBytes(u64le(o.value), varint(o.scriptPubKey.length), o.scriptPubKey)),
    ),
  );

  const input = inputs[signIndex];
  const preimage = concatBytes(
    u32le(version),
    hashPrevouts,
    hashSequence,
    txidToOutpointBytes(input.txid),
    u32le(input.vout),
    varint(scriptCode.length),
    scriptCode,
    u64le(amountSats),
    u32le(input.sequence ?? 0xffffffff),
    hashOutputs,
    u32le(locktime),
    u32le(hashType),
  );

  return doubleSha256(preimage);
}

/** Sign every input of a P2WPKH transaction and serialise the signed tx. */
export function signP2WPKH({ privateKey, publicKey, inputs, outputs, version = 2, locktime = 0, hashType = SIGHASH_ALL }) {
  const scriptCode = scriptPubKeyP2WPKH(publicKey);

  const signatures = inputs.map((input, index) => {
    const digest = buildSighash({
      version,
      inputs,
      outputs,
      signIndex: index,
      scriptCode,
      amountSats: input.value,
      locktime,
      hashType,
    });
    const sig = secp256k1.sign(digest, privateKey, { lowS: true });
    // Bitcoin consensus requires DER-encoded signatures (BIP66), not compact
    // r||s, followed by the one-byte sighash type.
    return concatBytes(sig.toDERRawBytes(), new Uint8Array([hashType]));
  });

  return serialiseSegwit({ version, inputs, outputs, signatures, publicKey, locktime });
}

/** Canonical segwit serialisation + the (witness-free) txid. */
export function serialiseSegwit({ version = 2, inputs, outputs, signatures, publicKey, locktime = 0 }) {
  const parts = [u32le(version), new Uint8Array([0x00, 0x01]), varint(inputs.length)];

  for (const input of inputs) {
    parts.push(txidToOutpointBytes(input.txid), u32le(input.vout), varint(0), u32le(input.sequence ?? 0xffffffff));
  }

  parts.push(varint(outputs.length));
  for (const output of outputs) {
    parts.push(u64le(output.value), varint(output.scriptPubKey.length), output.scriptPubKey);
  }

  for (let i = 0; i < inputs.length; i++) {
    parts.push(varint(2), varint(signatures[i].length), signatures[i], varint(publicKey.length), publicKey);
  }
  parts.push(u32le(locktime));

  const raw = concatBytes(...parts);

  // txid commits to the *non-witness* serialisation.
  const legacyParts = [u32le(version), varint(inputs.length)];
  for (const input of inputs) {
    legacyParts.push(txidToOutpointBytes(input.txid), u32le(input.vout), varint(0), u32le(input.sequence ?? 0xffffffff));
  }
  legacyParts.push(varint(outputs.length));
  for (const output of outputs) {
    legacyParts.push(u64le(output.value), varint(output.scriptPubKey.length), output.scriptPubKey);
  }
  legacyParts.push(u32le(locktime));

  return {
    rawHex: bytesToHex(raw, false),
    txid: bytesToHex(reverseBytes(doubleSha256(concatBytes(...legacyParts))), false),
    vsize: estimateVsize(inputs.length, outputs),
  };
}

export const satsToBtc = (sats) => Number(BigInt(sats)) / 1e8;
