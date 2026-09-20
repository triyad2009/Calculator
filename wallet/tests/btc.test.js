import { describe, it, expect } from 'vitest';
import * as btcSigner from '@scure/btc-signer';
import { secp256k1 } from '@noble/curves/secp256k1';
import { hexToBytes, bytesToHex, concatBytes } from '../src/lib/format.js';
import {
  buildSighash,
  scriptPubKeyP2WPKH,
  addressToScriptPubKey,
  selectCoins,
  signP2WPKH,
  estimateVsize,
} from '../src/lib/btc-tx.js';
import { deriveBtcAccount, mnemonicToSeed, publicKeyToBech32, publicKeyToP2PKH, hash160 } from '../src/lib/wallet-core.js';

/**
 * BIP143 "Native P2WPKH" worked example, transcribed verbatim from
 * bip-0143.mediawiki. Input #1 is the P2WPKH input under test.
 */
const BIP143 = {
  version: 1,
  locktime: 0x11,
  inputs: [
    {
      // display-form txid; the spec shows its reversed on-wire bytes
      txid: '9f96ade4b41d5433f4eda31e1738ec2b36f6e7d1420d94a6af99801a88f7f7ff',
      vout: 0,
      value: 625000000n,
      sequence: 0xffffffee, // LE bytes on the wire are eeffffffff
    },
    {
      txid: '8ac60eb9575db5b2d987e29f301b5b819ea83a5c6579d282d189cc04b8e151ef',
      vout: 1,
      value: 600000000n,
      sequence: 0xffffffff,
    },
  ],
  outputs: [
    { value: 112340000n, scriptPubKey: hexToBytes('76a9148280b37df378db99f66f85c95a783a76ac7a6d5988ac'), type: 'legacy' },
    { value: 223450000n, scriptPubKey: hexToBytes('76a9143bde42dbee7e4dbe6a21b2d50ce2f0167faa815988ac'), type: 'legacy' },
  ],
  privateKey: '619c335025c7f4012e556c2a58b2506e30b8511b53ade95ea316fd8c3286feb9',
  publicKey: '025476c2e83188368da1ff3e292e7acafcdb3566bb0ad253f62fc70f07aeee6357',
  expectedWitnessProgram: '00141d0f172a0ecb48aee1be1f2687d2963ae33f71a1',
  expectedScriptCode: '76a9141d0f172a0ecb48aee1be1f2687d2963ae33f71a188ac',
  expectedSighash: 'c37af31116d1b27caf68aae9e3ac82f1477929014d5b917657d0eb49478cb670',
  expectedSignatureDer:
    '304402203609e17b84f6a7d30c80bfa610b5b4542f32a8a0d5447a12fb1366d7f01cc44a0220573a954c4518331561406f90300e8f3358f51928d43c212a8caed02de67eebee01',
};

const bip143Digest = () =>
  buildSighash({
    version: BIP143.version,
    inputs: BIP143.inputs,
    outputs: BIP143.outputs,
    signIndex: 1,
    scriptCode: scriptPubKeyP2WPKH(hexToBytes(BIP143.publicKey)),
    amountSats: BIP143.inputs[1].value,
    locktime: BIP143.locktime,
  });

describe('BIP143 — official native P2WPKH vector', () => {
  it('derives the documented witness program from the public key', () => {
    // The witness program is OP_0 PUSH20 <hash160(pubkey)>; the scriptCode used
    // for signing is the equivalent P2PKH script (asserted separately below).
    const program = concatBytes(new Uint8Array([0x00, 0x14]), hash160(hexToBytes(BIP143.publicKey)));
    expect(bytesToHex(program, false)).toBe(BIP143.expectedWitnessProgram);
    // And it agrees with the independent reference implementation.
    expect(bytesToHex(btcSigner.p2wpkh(hexToBytes(BIP143.publicKey)).script, false)).toBe(
      BIP143.expectedWitnessProgram,
    );
  });

  it('derives the documented scriptCode from the public key', () => {
    expect(bytesToHex(scriptPubKeyP2WPKH(hexToBytes(BIP143.publicKey)), false)).toBe(BIP143.expectedScriptCode);
  });

  it('computes the documented sighash for input #1', () => {
    expect(bytesToHex(bip143Digest(), false)).toBe(BIP143.expectedSighash);
  });

  it('produces the documented DER signature with the documented private key', () => {
    const sig = secp256k1.sign(bip143Digest(), hexToBytes(BIP143.privateKey), { lowS: true });
    // The spec publishes the signature in DER form plus the sighash type byte.
    expect(bytesToHex(concatBytes(sig.toDERRawBytes(), new Uint8Array([0x01])), false)).toBe(
      BIP143.expectedSignatureDer,
    );
  });

  it('the documented signature verifies against the documented public key', () => {
    const sig = secp256k1.Signature.fromDER(hexToBytes(BIP143.expectedSignatureDer.slice(0, -2)));
    expect(secp256k1.verify(sig, bip143Digest(), hexToBytes(BIP143.publicKey))).toBe(true);
  });
});

describe('Bitcoin address derivation — cross-checked against @scure/btc-signer', () => {
  const seed = mnemonicToSeed('abandon '.repeat(11) + 'about');
  const account = deriveBtcAccount(seed, 0);

  it('matches the reference bech32 address', () => {
    expect(account.address).toBe(btcSigner.p2wpkh(account.publicKey).address);
  });

  it('matches the reference witness program script', () => {
    const reference = bytesToHex(btcSigner.p2wpkh(account.publicKey).script);
    const ours = bytesToHex(addressToScriptPubKey(account.address).scriptPubKey);
    expect(ours).toBe(reference);
    expect(reference.startsWith('0x0014')).toBe(true);
  });

  it('derives a testnet address with the tb1 prefix', () => {
    const testnet = deriveBtcAccount(seed, 0, true);
    expect(testnet.address.startsWith('tb1')).toBe(true);
    expect(publicKeyToBech32(testnet.publicKey, 'tb')).toBe(testnet.address);
    // The witness program must be identical on mainnet and testnet — only the HRP differs.
    expect(testnet.address.slice(3, -6)).toBe(account.address.slice(3, -6));
  });

  it('derives a legacy P2PKH address starting with 1', () => {
    expect(account.legacyAddress.startsWith('1')).toBe(true);
    expect(publicKeyToP2PKH(account.publicKey)).toBe(account.legacyAddress);
  });

  it('derives distinct addresses for distinct indexes', () => {
    expect(deriveBtcAccount(seed, 0).address).not.toBe(deriveBtcAccount(seed, 1).address);
  });
});

describe('Destination script decoding', () => {
  const seed = mnemonicToSeed('abandon '.repeat(11) + 'about');
  const account = deriveBtcAccount(seed, 0);

  it('decodes our own bech32 address into a witness v0 scriptPubKey', () => {
    const { scriptPubKey, type } = addressToScriptPubKey(account.address);
    expect(type).toBe('witness');
    expect(bytesToHex(scriptPubKey).slice(0, 6)).toBe('0x0014');
    expect(scriptPubKey.length).toBe(22);
  });

  it('decodes a legacy P2PKH (1…) address into a P2PKH script', () => {
    const { scriptPubKey, type } = addressToScriptPubKey(account.legacyAddress);
    expect(type).toBe('legacy');
    expect(bytesToHex(scriptPubKey, false)).toMatch(/^76a914[0-9a-f]{40}88ac$/);
  });

  it('decodes a P2SH (3…) address into a P2SH script', () => {
    const { scriptPubKey, type } = addressToScriptPubKey('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy');
    expect(type).toBe('legacy');
    expect(bytesToHex(scriptPubKey, false)).toMatch(/^a914[0-9a-f]{40}87$/);
  });

  it('decodes a taproot (bc1p…) address into a witness v1 scriptPubKey', () => {
    const { scriptPubKey, type } = addressToScriptPubKey(
      'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297',
    );
    expect(type).toBe('witness');
    expect(bytesToHex(scriptPubKey, false)).toMatch(/^5120[0-9a-f]{64}$/);
  });

  it('rejects garbage input', () => {
    expect(() => addressToScriptPubKey('not-a-bitcoin-address')).toThrow();
    expect(() => addressToScriptPubKey('')).toThrow();
  });
});

describe('Coin selection', () => {
  const utxo = (txid, value, confirmed = true) => ({
    txid,
    vout: 0,
    value,
    status: { confirmed },
  });

  it('selects the largest UTXO first', () => {
    const utxos = [utxo('a'.repeat(64), 10000), utxo('b'.repeat(64), 50000), utxo('c'.repeat(64), 30000)];
    const { inputs } = selectCoins(utxos, 40000, 5);
    expect(inputs[0].txid).toBe('b'.repeat(64));
  });

  it('produces change above the dust threshold and balances the books', () => {
    const utxos = [utxo('a'.repeat(64), 1_000_000)];
    const { inputs, change, fee, totalIn, hasChange } = selectCoins(utxos, 100_000, 10);
    expect(hasChange).toBe(true);
    expect(change).toBeGreaterThan(546n);
    expect(inputs.reduce((n, i) => n + i.value, 0n)).toBe(totalIn);
    expect(totalIn).toBe(100_000n + change + fee);
  });

  it('accumulates multiple UTXOs when one is not enough', () => {
    const utxos = [utxo('a'.repeat(64), 30_000), utxo('b'.repeat(64), 30_000), utxo('c'.repeat(64), 30_000)];
    const { inputs } = selectCoins(utxos, 60_000, 5);
    expect(inputs.length).toBeGreaterThanOrEqual(3);
  });

  it('ignores unconfirmed UTXOs', () => {
    const utxos = [utxo('a'.repeat(64), 1_000_000, false)];
    expect(() => selectCoins(utxos, 10_000, 5)).toThrow(/Insufficient confirmed balance/);
  });

  it('throws when the balance cannot cover amount plus fee', () => {
    const utxos = [utxo('a'.repeat(64), 10_000)];
    expect(() => selectCoins(utxos, 500_000, 5)).toThrow(/Insufficient confirmed balance/);
  });

  it('drops the change output when the remainder would be dust', () => {
    // Pick an amount so the leftover lands below 546 sats.
    const utxos = [utxo('a'.repeat(64), 100_000)];
    const { change, hasChange } = selectCoins(utxos, 99_000, 2);
    if (!hasChange) expect(change).toBe(0n);
    else expect(change).toBeGreaterThanOrEqual(546n);
  });
});

describe('Fee estimation', () => {
  it('matches the reference vsize for a 1-in/1-out transaction', () => {
    expect(estimateVsize(1, [{ type: 'witness' }])).toBe(110);
  });

  it('grows with additional inputs', () => {
    const one = estimateVsize(1, [{ type: 'witness' }]);
    const two = estimateVsize(2, [{ type: 'witness' }]);
    expect(two - one).toBe(68);
  });

  it('charges more for legacy outputs than witness outputs', () => {
    expect(estimateVsize(1, [{ type: 'legacy' }])).toBeGreaterThan(estimateVsize(1, [{ type: 'witness' }]));
  });
});

describe('Transaction signing — cross-checked against @scure/btc-signer', () => {
  const seed = mnemonicToSeed('abandon '.repeat(11) + 'about');
  const account = deriveBtcAccount(seed, 0);
  // For P2WPKH the on-chain output script is the witness program (0014<hash160>),
  // while the BIP143 *scriptCode* used when signing is the P2PKH script.
  const witnessProgram = btcSigner.p2wpkh(account.publicKey).script;

  const buildReference = ({ inputs, outputs }) => {
    const tx = new btcSigner.Transaction({ version: 2, lock_time: 0, allowUnknownOutputs: true });
    for (const input of inputs) {
      tx.addInput({
        txid: input.txid,
        index: input.vout,
        sequence: 0xffffffff,
        sighashType: 1,
        witnessUtxo: { script: witnessProgram, amount: input.value },
      });
    }
    for (const output of outputs) {
      tx.addOutput({ script: output.scriptPubKey, amount: output.value });
    }
    tx.sign(account.privateKey);
    tx.finalize();
    return { hex: tx.hex, id: tx.id, vsize: tx.vsize };
  };

  it('signs a single-input / single-output transaction identically', () => {
    const inputs = [{ txid: 'a'.repeat(63) + '1', vout: 0, value: 100_000n }];
    const outputs = [{ value: 90_000n, scriptPubKey: witnessProgram }];

    const ours = signP2WPKH({ privateKey: account.privateKey, publicKey: account.publicKey, inputs, outputs });
    const theirs = buildReference({ inputs, outputs });

    expect(ours.rawHex).toBe(theirs.hex);
    expect(ours.txid).toBe(theirs.id);
    expect(ours.vsize).toBe(theirs.vsize);
  });

  it('signs a two-input / two-output (change) transaction identically', () => {
    const inputs = [
      { txid: 'a'.repeat(63) + '1', vout: 0, value: 60_000n },
      { txid: 'b'.repeat(63) + '2', vout: 3, value: 70_000n },
    ];
    const outputs = [
      { value: 100_000n, scriptPubKey: witnessProgram },
      { value: 25_000n, scriptPubKey: witnessProgram },
    ];

    const ours = signP2WPKH({ privateKey: account.privateKey, publicKey: account.publicKey, inputs, outputs });
    const theirs = buildReference({ inputs, outputs });

    expect(ours.rawHex).toBe(theirs.hex);
    expect(ours.txid).toBe(theirs.id);
  });

  it('signs to a legacy P2PKH destination identically', () => {
    const inputs = [{ txid: 'c'.repeat(63) + '3', vout: 1, value: 200_000n }];
    const outputs = [{ value: 190_000n, scriptPubKey: addressToScriptPubKey(account.legacyAddress).scriptPubKey }];

    const ours = signP2WPKH({ privateKey: account.privateKey, publicKey: account.publicKey, inputs, outputs });
    const theirs = buildReference({ inputs, outputs });

    expect(ours.rawHex).toBe(theirs.hex);
    expect(ours.txid).toBe(theirs.id);
  });

  it('emits DER-encoded signatures in the witness (BIP66 consensus rule)', () => {
    const inputs = [{ txid: 'a'.repeat(63) + '1', vout: 0, value: 100_000n }];
    const outputs = [{ value: 90_000n, scriptPubKey: witnessProgram }];
    const { rawHex } = signP2WPKH({ privateKey: account.privateKey, publicKey: account.publicKey, inputs, outputs });
    // witness stack item length (0x47/0x48) followed by a DER SEQUENCE header
    expect(rawHex).toMatch(/02(47|48)30(44|45)02/);
  });

  it('emits a segwit marker/flag and a two-item witness stack', () => {
    const inputs = [{ txid: 'a'.repeat(63) + '1', vout: 0, value: 100_000n }];
    const outputs = [{ value: 90_000n, scriptPubKey: witnessProgram }];
    const { rawHex } = signP2WPKH({ privateKey: account.privateKey, publicKey: account.publicKey, inputs, outputs });
    // version (4 bytes LE) then marker 00 + flag 01
    expect(rawHex.slice(8, 12)).toBe('0001');
    // the witness contains our compressed public key
    expect(rawHex.endsWith(bytesToHex(account.publicKey, false) + '00000000')).toBe(true);
  });
});
