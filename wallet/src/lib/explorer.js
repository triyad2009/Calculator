/**
 * Transaction history.
 *
 * EVM chains with a public Blockscout instance get full history. For the rest
 * we fall back to the local log of transactions this app broadcast, so the
 * Activity tab is always honest about where its data came from.
 */
import { getBtcTxs } from './btc-api.js';
import { readSentTxs } from './vault.js';

export const HISTORY_SOURCE = {
  EXPLORER: 'explorer',
  LOCAL: 'local',
  UNAVAILABLE: 'unavailable',
};

/** Normalise a Blockscout v2 transaction into our own shape. */
function mapBlockscout(tx, selfAddress) {
  const from = tx.from?.hash;
  const to = tx.to?.hash;
  const out = (from ?? '').toLowerCase() === (selfAddress ?? '').toLowerCase();
  const value = BigInt(tx.total?.value ?? tx.value ?? '0');
  return {
    hash: tx.hash,
    timestamp: tx.timestamp,
    status: tx.status === 'ok' ? 'success' : tx.status === 'error' ? 'failed' : 'pending',
    direction: out ? 'out' : 'in',
    counterparty: out ? to : from,
    valueWei: value,
    feeWei: BigInt(tx.fee?.value ?? '0'),
    method: tx.method ?? null,
    tokenTransfers: (tx.token_transfers ?? []).slice(0, 4).map((t) => ({
      symbol: t.token?.symbol ?? '?',
      decimals: Number(t.token?.decimals ?? 18),
      value: BigInt(t.total?.value ?? '0'),
    })),
  };
}

export async function getEvmHistory(network, address, { limit = 25 } = {}) {
  if (!network.blockscout) {
    return { source: HISTORY_SOURCE.LOCAL, items: localHistory(network.id, address) };
  }
  const url = `${network.blockscout}/addresses/${address}/transactions?filter=to%20%7C%20from`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return {
      source: HISTORY_SOURCE.EXPLORER,
      items: (json.items ?? []).slice(0, limit).map((tx) => mapBlockscout(tx, address)),
    };
  } catch {
    return { source: HISTORY_SOURCE.LOCAL, items: localHistory(network.id, address) };
  } finally {
    clearTimeout(timer);
  }
}

export async function getBtcHistory(network, address, { limit = 25 } = {}) {
  try {
    const txs = await getBtcTxs(network, address);
    return {
      source: HISTORY_SOURCE.EXPLORER,
      items: (txs ?? []).slice(0, limit).map((tx) => {
        const funded = tx.vin?.some((i) => i.prevout?.scriptpubkey_address === address) ?? false;
        const received = (tx.vout ?? [])
          .filter((o) => o.scriptpubkey_address === address)
          .reduce((n, o) => n + o.value, 0);
        const sent = (tx.vin ?? [])
          .filter((i) => i.prevout?.scriptpubkey_address === address)
          .reduce((n, o) => n + (i.prevout?.value ?? 0), 0);
        return {
          hash: tx.txid,
          timestamp: tx.status?.block_time ? new Date(tx.status.block_time * 1000).toISOString() : null,
          status: tx.status?.confirmed ? 'success' : 'pending',
          direction: funded && sent > received ? 'out' : 'in',
          valueSats: BigInt(funded && sent > received ? sent - received : received),
          feeSats: BigInt(tx.fee ?? 0),
        };
      }),
    };
  } catch {
    return { source: HISTORY_SOURCE.UNAVAILABLE, items: [] };
  }
}

/** Transactions broadcast from this browser for a given network. */
export function localHistory(networkId, address) {
  return readSentTxs()
    .filter((tx) => tx.networkId === networkId && (!address || tx.from?.toLowerCase() === address.toLowerCase()))
    .map((tx) => ({
      hash: tx.hash,
      timestamp: tx.recordedAt,
      status: 'pending',
      direction: 'out',
      counterparty: tx.to,
      valueWei: tx.valueWei ? BigInt(tx.valueWei) : 0n,
      feeWei: tx.feeWei ? BigInt(tx.feeWei) : 0n,
      local: true,
      symbol: tx.symbol,
    }));
}
