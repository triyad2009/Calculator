/**
 * Bitcoin data + broadcast via the public mempool.space REST API (CORS enabled).
 * All signing happens locally — the API only ever sees already-signed raw
 * transactions and public addresses.
 */

async function json(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, options);
    const text = await res.text();
    if (!res.ok) {
      throw new Error(text ? `HTTP ${res.status}: ${text.slice(0, 160)}` : `HTTP ${res.status}`);
    }
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(timer);
  }
}

export const getAddressInfo = (network, address) =>
  json(`${network.apiBase}/address/${address}`);

/** Balance in satoshis, split confirmed / unconfirmed. */
export async function getBtcBalance(network, address) {
  const info = await getAddressInfo(network, address);
  const chain = info.chain_stats ?? {};
  const mempool = info.mempool_stats ?? {};
  const confirmed = (chain.funded_txo_sum ?? 0) - (chain.spent_txo_sum ?? 0);
  const unconfirmed = (mempool.funded_txo_sum ?? 0) - (mempool.spent_txo_sum ?? 0);
  return {
    confirmedSats: BigInt(confirmed),
    unconfirmedSats: BigInt(unconfirmed),
    totalSats: BigInt(confirmed + unconfirmed),
    txCount: (chain.tx_count ?? 0) + (mempool.tx_count ?? 0),
  };
}

export const getUtxos = (network, address) =>
  json(`${network.apiBase}/address/${address}/utxo`);

export const getBtcTxs = (network, address) =>
  json(`${network.apiBase}/address/${address}/txs`);

/** Recommended fee rate in sat/vB (mempool.space "fastest/hour/economy/minimum"). */
export async function getFeeEstimates(network) {
  const data = await json(`${network.apiBase}/v1/fees/recommended`);
  return {
    fastest: data.fastestFee ?? 20,
    halfHour: data.halfHourFee ?? 15,
    hour: data.hourFee ?? 10,
    minimum: data.minimumFee ?? 5,
  };
}

export async function broadcastRawTx(network, rawHex) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`${network.apiBase}/tx`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: rawHex,
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(text ? `Rejected by network: ${text.slice(0, 200)}` : `HTTP ${res.status}`);
    return text.trim(); // txid
  } finally {
    clearTimeout(timer);
  }
}
