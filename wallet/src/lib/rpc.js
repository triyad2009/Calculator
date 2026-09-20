/**
 * Tiny JSON-RPC client with per-network endpoint fallback.
 *
 * Public endpoints get rate-limited or go offline, so the first URL that
 * answers successfully is promoted to the front of the list for the rest of
 * the session. All calls are plain `fetch`, which the browser performs
 * directly (these endpoints all send permissive CORS headers).
 */
import { hexToBigInt, bigIntToHex, encodeBalanceOf, decodeUint, decodeAbiString } from './evm-tx.js';

const workingEndpoint = new Map();

export function endpointFor(network) {
  return workingEndpoint.get(network.id) ?? network.rpc[0];
}

/** Forget which endpoint worked (used by tests and by manual "reset RPC" flows). */
export function resetEndpoints() {
  workingEndpoint.clear();
}

class RpcError extends Error {
  constructor(message, { code, url } = {}) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
    this.url = url;
  }
}

async function post(url, payload, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) throw new RpcError(`HTTP ${res.status}`, { url });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

let rpcId = 1;

/**
 * JSON-RPC error codes that mean "this node is throttling us" rather than
 * "your request is invalid". Only these trigger a fallback to another
 * endpoint; anything else (e.g. geth's code 3 "execution reverted") is a real
 * answer and is surfaced to the caller untouched.
 */
const RETRYABLE_RPC_CODES = new Set([-32005, -32002, -32016, -32603]);

/** Raw batched call: `batchCall(network, [[method, params], ...]) -> results[]` */
export async function batchCall(network, calls) {
  const primary = endpointFor(network);
  const endpoints = [primary, ...network.rpc.filter((u) => u !== primary)];
  const payload = calls.map(([method, params]) => ({
    jsonrpc: '2.0',
    id: rpcId++,
    method,
    params: params ?? [],
  }));

  let lastError;

  for (const url of endpoints) {
    let json;
    try {
      json = await post(url, payload);
    } catch (err) {
      lastError = err; // transport failure — the next endpoint may work
      continue;
    }

    // This endpoint answered, so prefer it for the rest of the session.
    if (workingEndpoint.get(network.id) !== url) workingEndpoint.set(network.id, url);

    const byId = new Map((Array.isArray(json) ? json : [json]).map((r) => [r.id, r]));
    if (payload.some((p) => !byId.has(p.id))) {
      lastError = new RpcError('Incomplete RPC response', { url });
      continue;
    }

    let rpcError = null;
    for (const p of payload) {
      const r = byId.get(p.id);
      if (r.error) {
        rpcError = new RpcError(r.error.message || 'RPC error', { code: r.error.code, url });
        break;
      }
    }

    if (rpcError) {
      if (RETRYABLE_RPC_CODES.has(rpcError.code)) {
        lastError = rpcError; // throttled — try another endpoint
        continue;
      }
      throw rpcError; // a genuine answer from a working node
    }

    return payload.map((p) => byId.get(p.id).result);
  }

  throw new RpcError(
    `All ${network.name} RPC endpoints failed. Last error: ${lastError?.message ?? 'unknown'}`,
    {},
  );
}

export async function call(network, method, params = []) {
  const [result] = await batchCall(network, [[method, params]]);
  return result;
}

/* ------------------------------------------------------------------ */
/* High level helpers                                                  */
/* ------------------------------------------------------------------ */

export const getBlockNumber = (network) => call(network, 'eth_blockNumber').then(hexToBigInt);

export const getBalanceWei = (network, address) =>
  call(network, 'eth_getBalance', [address, 'latest']).then(hexToBigInt);

export const getTransactionCount = (network, address) =>
  call(network, 'eth_getTransactionCount', [address, 'pending']).then(hexToBigInt);

export const getCode = (network, address) => call(network, 'eth_getCode', [address, 'latest']);

export async function estimateGas(network, { from, to, value, data }) {
  const hex = await call(network, 'eth_estimateGas', [
    {
      from,
      to,
      value: bigIntToHex(BigInt(value ?? 0)),
      ...(data && data !== '0x' ? { data } : {}),
    },
  ]);
  // 20% safety margin — public nodes frequently return tight estimates.
  return (hexToBigInt(hex) * 120n) / 100n;
}

export async function getGasPrice(network) {
  return hexToBigInt(await call(network, 'eth_gasPrice'));
}

async function getPriorityFee(network, fallbackGasPrice) {
  try {
    const hex = await call(network, 'eth_maxPriorityFeePerGas');
    const value = hexToBigInt(hex);
    if (value > 0n) return value;
  } catch {
    /* not supported on every chain */
  }
  try {
    const history = await call(network, 'eth_feeHistory', ['0x5', 'latest', [25]]);
    const rewards = (history?.reward ?? []).map((r) => hexToBigInt(r[0])).filter((r) => r > 0n);
    if (rewards.length) {
      const sorted = rewards.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      return sorted[Math.floor(sorted.length / 2)];
    }
  } catch {
    /* fall through */
  }
  return fallbackGasPrice / 10n || 1000000000n;
}

async function getBaseFee(network) {
  try {
    const block = await call(network, 'eth_getBlockByNumber', ['latest', false]);
    if (block?.baseFeePerGas) return hexToBigInt(block.baseFeePerGas);
  } catch {
    /* pre-London chain */
  }
  return null;
}

/** True when the chain supports EIP-1559 fee fields. */
export async function supportsEip1559(network) {
  return (await getBaseFee(network)) !== null;
}

/**
 * Resolve gas + fee parameters for a transaction.
 * Returns either `{ type: 2, maxFeePerGas, maxPriorityFeePerGas, gasLimit }`
 * or `{ type: 0, gasPrice, gasLimit }`.
 */
export async function prepareFees(network, { from, to, value, data }) {
  const gasPrice = await getGasPrice(network);
  const baseFee = await getBaseFee(network);
  let gasLimit;
  try {
    gasLimit = await estimateGas(network, { from, to, value, data });
  } catch (err) {
    throw new Error(`Gas estimation failed: ${err.message}`);
  }

  if (baseFee !== null) {
    const priority = await getPriorityFee(network, gasPrice);
    const maxFee = baseFee * 2n + priority;
    return {
      type: 2,
      maxFeePerGas: maxFee > gasPrice ? maxFee : gasPrice,
      maxPriorityFeePerGas: priority,
      gasLimit,
      baseFee,
      gasPrice,
    };
  }
  return { type: 0, gasPrice, gasLimit };
}

export async function sendRawTransaction(network, rawTx) {
  return call(network, 'eth_sendRawTransaction', [rawTx]);
}

export const getTransactionReceipt = (network, hash) =>
  call(network, 'eth_getTransactionReceipt', [hash]);

export const getTransaction = (network, hash) => call(network, 'eth_getTransactionByHash', [hash]);

/** Batched ERC-20 balance read (one round trip for the whole token list). */
export async function getErc20Balances(network, owner, tokens) {
  if (!tokens.length) return new Map();
  const calls = tokens.map((t) => ['eth_call', [{ to: t.address, data: encodeBalanceOf(owner) }, 'latest']]);
  const results = await batchCall(network, calls);
  const out = new Map();
  results.forEach((raw, i) => {
    try {
      out.set(tokens[i].address.toLowerCase(), decodeUint(raw));
    } catch {
      out.set(tokens[i].address.toLowerCase(), 0n);
    }
  });
  return out;
}

export async function getTokenMeta(network, contract) {
  const [decimalsRaw, symbolRaw] = await batchCall(network, [
    ['eth_call', [{ to: contract, data: '0x313ce567' }, 'latest']],
    ['eth_call', [{ to: contract, data: '0x95d89b41' }, 'latest']],
  ]);
  return { decimals: Number(decodeUint(decimalsRaw)), symbol: decodeAbiString(symbolRaw) };
}

export { RpcError };
