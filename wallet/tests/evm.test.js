import { describe, it, expect } from 'vitest';
import { Transaction, Wallet, getAddress, HDNodeWallet, keccak256, toUtf8Bytes } from 'ethers';
import { secp256k1 } from '@noble/curves/secp256k1';
import {
  deriveEvmAccount,
  mnemonicToSeed,
  toChecksumAddress,
  signDigest,
  recoverAddress,
  publicKeyToEvmAddress,
} from '../src/lib/wallet-core.js';
import { signEip1559, signLegacy, SELECTORS, encodeTransfer, encodeBalanceOf, decodeAbiString } from '../src/lib/evm-tx.js';
import { hexToBytes, bytesToHex } from '../src/lib/format.js';

const PHRASE = 'abandon '.repeat(11) + 'about';
const SEED = mnemonicToSeed(PHRASE);
const ACCOUNT = deriveEvmAccount(SEED, 0);

/** EIP-55 specification test cases. */
const EIP55_CASES = [
  '0x52908400098527886E0F7030069857D2E4169EE7',
  '0x8617E340B3D01FA5F11F306F4090FD50E238070D',
  '0xde709f2102306220921060314715629080e2fb77',
  '0x27b1fdb04752bbc536007a920d24acb045561c26',
  '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
  '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
  '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB',
  '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb',
];

describe('EVM address derivation — cross-checked against ethers', () => {
  it('derives the same address as ethers for the all-abandon phrase', () => {
    const reference = HDNodeWallet.fromPhrase(PHRASE, undefined, "m/44'/60'/0'/0/0");
    expect(ACCOUNT.address.toLowerCase()).toBe(reference.address.toLowerCase());
  });

  it.each([0, 1, 2, 5])('matches ethers for account index %i', (index) => {
    const reference = HDNodeWallet.fromPhrase(PHRASE, undefined, `m/44'/60'/0'/0/${index}`);
    expect(deriveEvmAccount(SEED, index).address.toLowerCase()).toBe(reference.address.toLowerCase());
  });

  it('produces a checksummed 0x address', () => {
    expect(ACCOUNT.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(toChecksumAddress(ACCOUNT.address)).toBe(ACCOUNT.address);
  });
});

describe('EIP-55 checksum encoding', () => {
  it.each(EIP55_CASES)('checksums %s correctly', (expected) => {
    expect(toChecksumAddress(expected.toLowerCase())).toBe(expected);
  });

  it.each(EIP55_CASES)('agrees with ethers.getAddress for %s', (expected) => {
    expect(toChecksumAddress(expected.toLowerCase())).toBe(getAddress(expected.toLowerCase()));
  });
});

describe('ECDSA signing and recovery', () => {
  it('recovers the signer address from a signature', () => {
    const digest = hexToBytes(keccak256(toUtf8Bytes('nexvault-test-message')).slice(2));
    const { r, s, yParity } = signDigest(ACCOUNT.privateKey, digest);
    expect(recoverAddress(digest, { r, s }, yParity).toLowerCase()).toBe(ACCOUNT.address.toLowerCase());
  });

  it('produces low-S signatures (EIP-2 requirement)', () => {
    const digest = hexToBytes(keccak256(toUtf8Bytes('low-s-check')).slice(2));
    const { s } = signDigest(ACCOUNT.privateKey, digest);
    const HALF_N = BigInt('0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0');
    expect(s).toBeLessThanOrEqual(HALF_N);
  });

  it('publicKeyToEvmAddress accepts the raw 64-byte key body and the 65-byte key', () => {
    const full = secp256k1.getPublicKey(ACCOUNT.privateKey, false);
    expect(full.length).toBe(65);
    expect(publicKeyToEvmAddress(full).toLowerCase()).toBe(ACCOUNT.address.toLowerCase());
    expect(publicKeyToEvmAddress(full.slice(1)).toLowerCase()).toBe(ACCOUNT.address.toLowerCase());
  });

  it('the compressed public key is 33 bytes and matches ethers', () => {
    expect(ACCOUNT.publicKey.length).toBe(33);
    const reference = HDNodeWallet.fromPhrase(PHRASE, undefined, "m/44'/60'/0'/0/0");
    expect(ACCOUNT.publicKeyHex.toLowerCase()).toBe(reference.publicKey.toLowerCase());
  });
});

describe('EIP-1559 (type 2) transaction signing — cross-checked against ethers', () => {
  const base = {
    chainId: 1n,
    nonce: 7n,
    maxPriorityFeePerGas: 1500000000n,
    maxFeePerGas: 30000000000n,
    gasLimit: 21000n,
    to: '0x3535353535353535353535353535353535353535',
    value: 10n ** 18n,
    data: '0x',
  };

  const signer = new Wallet(ACCOUNT.privateKeyHex);
  const referenceSign = async (fields) => {
    const raw = await signer.signTransaction(Transaction.from(fields));
    return { serialized: raw, hash: keccak256(raw) };
  };

  it('serialises byte-for-byte identically to ethers', async () => {
    const ours = signEip1559(base, ACCOUNT.privateKey);
    const theirs = await referenceSign({
      type: 2,
      chainId: 1,
      nonce: 7,
      maxPriorityFeePerGas: 1500000000n,
      maxFeePerGas: 30000000000n,
      gasLimit: 21000n,
      to: base.to,
      value: 10n ** 18n,
      data: '0x',
    });

    expect(ours.rawTransaction.toLowerCase()).toBe(theirs.serialized.toLowerCase());
    expect(ours.txHash.toLowerCase()).toBe(theirs.hash.toLowerCase());
  });

  it('the signature recovers to our own address', () => {
    const signed = signEip1559(base, ACCOUNT.privateKey);
    expect(signed.recovered.toLowerCase()).toBe(ACCOUNT.address.toLowerCase());
  });

  it('signs a contract call with calldata identically to ethers', async () => {
    const data = encodeTransfer('0x3535353535353535353535353535353535353535', 1000000n);
    const tx = { ...base, to: '0xdac17f958d2ee523a2206206994597c13d831ec7', value: 0n, data, nonce: 12n };
    const ours = signEip1559(tx, ACCOUNT.privateKey);
    const theirs = await referenceSign({
      type: 2, chainId: 1, nonce: 12, maxPriorityFeePerGas: 1500000000n, maxFeePerGas: 30000000000n,
      gasLimit: 21000n, to: tx.to, value: 0n, data,
    });
    expect(ours.rawTransaction.toLowerCase()).toBe(theirs.serialized.toLowerCase());
  });

  it('encodes a zero value as an empty RLP item', async () => {
    const tx = { ...base, value: 0n };
    const ours = signEip1559(tx, ACCOUNT.privateKey);
    const theirs = await referenceSign({
      type: 2, chainId: 1, nonce: 7, maxPriorityFeePerGas: 1500000000n, maxFeePerGas: 30000000000n,
      gasLimit: 21000n, to: base.to, value: 0n, data: '0x',
    });
    expect(ours.rawTransaction.toLowerCase()).toBe(theirs.serialized.toLowerCase());
  });
});

describe('Legacy EIP-155 (type 0) transaction signing — cross-checked against ethers', () => {
  const base = {
    chainId: 137n,
    nonce: 3n,
    gasPrice: 50000000000n,
    gasLimit: 21000n,
    to: '0x3535353535353535353535353535353535353535',
    value: 5n * 10n ** 17n,
    data: '0x',
  };

  const signer = new Wallet(ACCOUNT.privateKeyHex);

  it('serialises byte-for-byte identically to ethers', async () => {
    const ours = signLegacy(base, ACCOUNT.privateKey);
    const raw = await signer.signTransaction(
      Transaction.from({
        type: 0,
        chainId: 137,
        nonce: 3,
        gasPrice: 50000000000n,
        gasLimit: 21000n,
        to: base.to,
        value: 5n * 10n ** 17n,
        data: '0x',
      }),
    );

    expect(ours.rawTransaction.toLowerCase()).toBe(raw.toLowerCase());
    expect(ours.txHash.toLowerCase()).toBe(keccak256(raw).toLowerCase());
  });

  it('computes v with EIP-155 replay protection', () => {
    const ours = signLegacy(base, ACCOUNT.privateKey);
    expect(ours.v).toBe(137n * 2n + 35n + BigInt(ours.yParity));
  });
});

describe('ABI encoding', () => {
  it('uses the canonical ERC-20 function selectors', () => {
    expect(SELECTORS.balanceOf).toBe('70a08231');
    expect(SELECTORS.decimals).toBe('313ce567');
    expect(SELECTORS.symbol).toBe('95d89b41');
    expect(SELECTORS.transfer).toBe('a9059cbb');
  });

  it('encodes balanceOf with a zero-padded 32-byte argument', () => {
    const data = encodeBalanceOf(ACCOUNT.address);
    expect(data.length).toBe(2 + 8 + 64);
    expect(data.slice(10)).toBe(ACCOUNT.address.toLowerCase().slice(2).padStart(64, '0'));
  });

  it('encodes transfer(address,uint256) with two padded arguments', () => {
    const data = encodeTransfer('0x3535353535353535353535353535353535353535', 1000000n);
    expect(data.slice(0, 10)).toBe('0xa9059cbb');
    expect(data.slice(10, 74)).toBe(('35'.repeat(20)).padStart(64, '0'));
    expect(BigInt(`0x${data.slice(74)}`)).toBe(1000000n);
  });

  it('decodes a dynamic ABI string return value', () => {
    expect(decodeAbiString(abiEncodeString('USDT'))).toBe('USDT');
    expect(decodeAbiString(abiEncodeString('Wrapped BTC'))).toBe('Wrapped BTC');
  });

  it('decodes a static bytes32-style symbol (e.g. MKR)', () => {
    // Older tokens return the symbol as a bare bytes32 with no offset header.
    const encoded = '0x' + bytesToHex(new TextEncoder().encode('MKR'), false).padEnd(64, '0');
    expect(decodeAbiString(encoded)).toBe('MKR');
  });

  it('tolerates empty return data', () => {
    expect(decodeAbiString('0x')).toBe('');
    expect(decodeAbiString('')).toBe('');
  });
});

/** Encode a `string` the way Solidity's ABI does for a single dynamic return value. */
function abiEncodeString(value) {
  const bytes = new TextEncoder().encode(value);
  const word = (hex) => hex.padStart(64, '0');
  return '0x' + word('20') + word(bytes.length.toString(16)) + bytesToHex(bytes, false).padEnd(64, '0');
}
