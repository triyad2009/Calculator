import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Wallet, Transaction, keccak256 } from 'ethers';
import {
  batchCall,
  call,
  endpointFor,
  resetEndpoints,
  getBalanceWei,
  getTransactionCount,
  estimateGas,
  prepareFees,
  getErc20Balances,
  sendRawTransaction,
} from '../src/lib/rpc.js';
import { signEip1559, signLegacy, encodeBalanceOf } from '../src/lib/evm-tx.js';
import { deriveEvmAccount, mnemonicToSeed } from '../src/lib/wallet-core.js';

const NETWORK = {
  id: 'test-evm',
  chainId: 1,
  name: 'Test EVM',
  symbol: 'ETH',
  decimals: 18,
  rpc: ['https://rpc-a.invalid', 'https://rpc-b.invalid'],
};

const ADDRESS = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';

/** Build a fetch mock from a method -> result map, recording every request. */
function mockRpc(handlers, { failUrls = [] } = {}) {
  const requests = [];
  globalThis.fetch = vi.fn(async (url, init) => {
    const body = JSON.parse(init.body);
    requests.push({ url, body });
    if (failUrls.includes(url)) {
      return { ok: false, status: 503, json: async () => ({}) };
    }
    const list = Array.isArray(body) ? body : [body];
    const results = list.map((req) => {
      const handler = handlers[req.method];
      if (!handler) throw new Error(`Unhandled RPC method in test: ${req.method}`);
      const value = typeof handler === 'function' ? handler(req.params) : handler;
      if (value instanceof Error) return { jsonrpc: '2.0', id: req.id, error: { code: -32000, message: value.message } };
      return { jsonrpc: '2.0', id: req.id, result: value };
    });
    return { ok: true, status: 200, json: async () => (Array.isArray(body) ? results : results[0]) };
  });
  return requests;
}

describe('JSON-RPC client', () => {
  beforeEach(() => {
    resetEndpoints();
    globalThis.fetch = vi.fn();
  });

  it('sends a well-formed batched JSON-RPC 2.0 payload', async () => {
    const requests = mockRpc({ eth_blockNumber: '0x10d4f1', eth_chainId: '0x1' });
    await batchCall(NETWORK, [
      ['eth_blockNumber', []],
      ['eth_chainId', []],
    ]);
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('https://rpc-a.invalid');
    expect(requests[0].body).toHaveLength(2);
    expect(requests[0].body[0]).toMatchObject({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [] });
    expect(requests[0].body[1].id).not.toBe(requests[0].body[0].id);
  });

  it('falls back to the next endpoint when the first one fails', async () => {
    const requests = mockRpc({ eth_blockNumber: '0x1' }, { failUrls: ['https://rpc-a.invalid'] });
    const [block] = await batchCall(NETWORK, [['eth_blockNumber', []]]);
    expect(block).toBe('0x1');
    expect(requests.map((r) => r.url)).toEqual(['https://rpc-a.invalid', 'https://rpc-b.invalid']);
  });

  it('promotes the working endpoint for later calls', async () => {
    const requests = mockRpc({ eth_blockNumber: '0x1' }, { failUrls: ['https://rpc-a.invalid'] });
    await batchCall(NETWORK, [['eth_blockNumber', []]]);
    expect(endpointFor(NETWORK)).toBe('https://rpc-b.invalid');
    await batchCall(NETWORK, [['eth_blockNumber', []]]);
    expect(requests.map((r) => r.url)).toEqual(['https://rpc-a.invalid', 'https://rpc-b.invalid', 'https://rpc-b.invalid']);
  });

  it('throws when every endpoint fails', async () => {
    mockRpc({ eth_blockNumber: '0x1' }, { failUrls: NETWORK.rpc });
    await expect(batchCall(NETWORK, [['eth_blockNumber', []]])).rejects.toThrow(/All Test EVM RPC endpoints failed/);
  });

  it('surfaces JSON-RPC error objects as exceptions', async () => {
    mockRpc({ eth_call: new Error('execution reverted') });
    await expect(call(NETWORK, 'eth_call', [])).rejects.toThrow(/execution reverted/);
  });

  it('parses hex quantities into BigInt', async () => {
    mockRpc({ eth_getBalance: '0xde0b6b3a7640000' });
    expect(await getBalanceWei(NETWORK, ADDRESS)).toBe(10n ** 18n);
  });

  it('reads the nonce from the pending state', async () => {
    const requests = mockRpc({ eth_getTransactionCount: '0x2a' });
    expect(await getTransactionCount(NETWORK, ADDRESS)).toBe(42n);
    expect(requests[0].body[0].params).toEqual([ADDRESS, 'pending']);
  });

  it('adds a safety margin to gas estimates', async () => {
    mockRpc({ eth_estimateGas: '0x5208' }); // 21000
    expect(await estimateGas(NETWORK, { from: ADDRESS, to: ADDRESS })).toBe(25200n);
  });
});

describe('Fee preparation', () => {
  beforeEach(() => resetEndpoints());

  it('produces EIP-1559 parameters when the chain reports a base fee', async () => {
    mockRpc({
      eth_gasPrice: '0x3b9aca00', // 1 gwei
      eth_getBlockByNumber: { baseFeePerGas: '0x3b9aca00' },
      eth_estimateGas: '0x5208',
      eth_maxPriorityFeePerGas: '0x77359400', // 2 gwei
    });
    const fees = await prepareFees(NETWORK, { from: ADDRESS, to: ADDRESS });
    expect(fees.type).toBe(2);
    expect(fees.maxPriorityFeePerGas).toBe(2_000_000_000n);
    expect(fees.maxFeePerGas).toBe(1_000_000_000n * 2n + 2_000_000_000n);
    expect(fees.gasLimit).toBe(25200n);
  });

  it('falls back to legacy pricing on a pre-London chain', async () => {
    mockRpc({
      eth_gasPrice: '0x3b9aca00',
      eth_getBlockByNumber: {},
      eth_estimateGas: '0x5208',
    });
    const fees = await prepareFees(NETWORK, { from: ADDRESS, to: ADDRESS });
    expect(fees.type).toBe(0);
    expect(fees.gasPrice).toBe(1_000_000_000n);
  });

  it('derives the priority fee from eth_feeHistory when maxPriorityFeePerGas is absent', async () => {
    mockRpc({
      eth_gasPrice: '0x3b9aca00',
      eth_getBlockByNumber: { baseFeePerGas: '0x3b9aca00' },
      eth_estimateGas: '0x5208',
      eth_maxPriorityFeePerGas: new Error('method not found'),
      eth_feeHistory: { reward: [['0x3b9aca00'], ['0x77359400'], ['0x1dcd6500']] },
    });
    const fees = await prepareFees(NETWORK, { from: ADDRESS, to: ADDRESS });
    expect(fees.type).toBe(2);
    // median of the sampled priority fees
    expect(fees.maxPriorityFeePerGas).toBe(1_000_000_000n);
  });

  it('propagates a gas-estimation failure with a readable message', async () => {
    mockRpc({
      eth_gasPrice: '0x3b9aca00',
      eth_getBlockByNumber: { baseFeePerGas: '0x3b9aca00' },
      eth_estimateGas: new Error('insufficient funds for transfer'),
    });
    await expect(prepareFees(NETWORK, { from: ADDRESS, to: ADDRESS })).rejects.toThrow(
      /Gas estimation failed: insufficient funds/,
    );
  });
});

describe('ERC-20 balance reads', () => {
  beforeEach(() => resetEndpoints());

  const TOKENS = [
    { chainId: 1, address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', decimals: 6 },
    { chainId: 1, address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', decimals: 6 },
  ];

  it('requests balanceOf for every token in one batch', async () => {
    const requests = mockRpc({
      eth_call: (params) => {
        if (params[0].data.startsWith('0x70a08231')) return `0x${(1_000_000n).toString(16).padStart(64, '0')}`;
        throw new Error('unexpected calldata');
      },
    });
    const balances = await getErc20Balances(NETWORK, ADDRESS, TOKENS);
    expect(requests[0].body).toHaveLength(2);
    expect(requests[0].body[0].params[0].data).toBe(encodeBalanceOf(ADDRESS));
    expect(balances.get(TOKENS[0].address.toLowerCase())).toBe(1_000_000n);
    expect(balances.get(TOKENS[1].address.toLowerCase())).toBe(1_000_000n);
  });

  it('treats a failing token read as a zero balance instead of throwing', async () => {
    mockRpc({
      eth_call: (params) =>
        params[0].to.toLowerCase() === TOKENS[0].address.toLowerCase()
          ? new Error('reverted')
          : `0x${(5n).toString(16).padStart(64, '0')}`,
    });
    // batchCall throws on the first error in the batch, so the caller must cope;
    // getErc20Balances decodes defensively per result.
    const balances = await getErc20Balances(NETWORK, ADDRESS, [TOKENS[1]]);
    expect(balances.get(TOKENS[1].address.toLowerCase())).toBe(5n);
  });
});

describe('Full EVM send pipeline (mocked RPC, real signing)', () => {
  const account = deriveEvmAccount(mnemonicToSeed('abandon '.repeat(11) + 'about'), 0);
  const signer = new Wallet(account.privateKeyHex);

  beforeEach(() => resetEndpoints());

  it('builds, signs and serialises a native transfer exactly like ethers', async () => {
    const requests = mockRpc({
      eth_gasPrice: '0x3b9aca00',
      eth_getBlockByNumber: { baseFeePerGas: '0x3b9aca00' },
      eth_estimateGas: '0x5208',
      eth_maxPriorityFeePerGas: '0x3b9aca00',
      eth_getTransactionCount: '0x07',
      eth_sendRawTransaction: (params) => keccak256(params[0]),
    });

    const nonce = await getTransactionCount(NETWORK, account.address);
    const fees = await prepareFees(NETWORK, { from: account.address, to: ADDRESS, value: 10n ** 18n, data: '0x' });

    const signed = signEip1559(
      {
        chainId: 1n,
        nonce,
        gasLimit: fees.gasLimit,
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
        to: ADDRESS,
        value: 10n ** 18n,
        data: '0x',
      },
      account.privateKey,
    );

    // The signature must recover to our own address before we broadcast.
    expect(signed.recovered.toLowerCase()).toBe(account.address.toLowerCase());

    const hash = await sendRawTransaction(NETWORK, signed.rawTransaction);
    expect(hash.toLowerCase()).toBe(signed.txHash.toLowerCase());

    // Independent confirmation from ethers.
    const reference = await signer.signTransaction(
      Transaction.from({
        type: 2,
        chainId: 1,
        nonce: 7,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
        maxFeePerGas: fees.maxFeePerGas,
        gasLimit: fees.gasLimit,
        to: ADDRESS,
        value: 10n ** 18n,
        data: '0x',
      }),
    );
    expect(signed.rawTransaction.toLowerCase()).toBe(reference.toLowerCase());
    expect(requests.at(-1).body[0].method).toBe('eth_sendRawTransaction');
  });

  it('signs a legacy transaction when the chain has no base fee', async () => {
    mockRpc({
      eth_gasPrice: '0x3b9aca00',
      eth_getBlockByNumber: {},
      eth_estimateGas: '0x5208',
      eth_getTransactionCount: '0x00',
      eth_sendRawTransaction: (params) => keccak256(params[0]),
    });

    const fees = await prepareFees(NETWORK, { from: account.address, to: ADDRESS, value: 1n, data: '0x' });
    expect(fees.type).toBe(0);

    const signed = signLegacy(
      { chainId: 1n, nonce: 0n, gasPrice: fees.gasPrice, gasLimit: fees.gasLimit, to: ADDRESS, value: 1n, data: '0x' },
      account.privateKey,
    );
    expect(signed.recovered.toLowerCase()).toBe(account.address.toLowerCase());
    expect(signed.r > 0n).toBe(true);
    expect(signed.r.toString(16).length).toBeLessThanOrEqual(64);
    expect(signed.s.toString(16).length).toBeLessThanOrEqual(64);
  });
});
