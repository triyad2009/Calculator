import React, { useCallback, useEffect, useState } from 'react';
import { useWallet } from '../context/WalletProvider.jsx';
import { isEvm } from '../lib/chains.js';
import { getEvmHistory, getBtcHistory, HISTORY_SOURCE } from '../lib/explorer.js';
import { fromWei, formatUsd, shortAddress, trimAmount } from '../lib/format.js';
import { Button, Card, Callout, EmptyState, Icon } from '../components/ui.jsx';

export default function Activity() {
  const { network, address, priceOf } = useWallet();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const res = isEvm(network)
        ? await getEvmHistory(network, address)
        : await getBtcHistory(network, address);
      setData(res);
    } catch (err) {
      setData({ source: HISTORY_SOURCE.UNAVAILABLE, items: [], error: err.message });
    } finally {
      setLoading(false);
    }
  }, [network, address]);

  useEffect(() => {
    load();
  }, [load]);

  const price = priceOf(network.coingeckoId);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Activity</h1>
          <p className="page-sub">Transactions involving your address on {network.name}.</p>
        </div>
        <Button variant="ghost" icon="refresh" onClick={load} loading={loading}>
          Refresh
        </Button>
      </div>

      {data?.source === HISTORY_SOURCE.LOCAL && (
        <div className="mb-14">
          <Callout tone="info" icon="history">
            {network.name} has no public Blockscout indexer configured here, so this list shows only the
            transactions you broadcast from this browser. Use the explorer for the full history.
          </Callout>
        </div>
      )}

      {data?.source === HISTORY_SOURCE.UNAVAILABLE && (
        <div className="mb-14">
          <Callout tone="warn" icon="alert">
            Could not reach the history API for {network.name}.
          </Callout>
        </div>
      )}

      <Card title={data?.source === HISTORY_SOURCE.EXPLORER ? 'On-chain history' : 'Recent activity'}>
        {loading ? (
          <div className="stack">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="tx-row">
                <div className="skeleton" style={{ width: 34, height: 34, borderRadius: 10 }} />
                <div style={{ flex: 1 }}>
                  <div className="skeleton" style={{ height: 12, width: '38%', marginBottom: 7 }} />
                  <div className="skeleton" style={{ height: 10, width: '24%' }} />
                </div>
                <div className="skeleton" style={{ height: 12, width: 90 }} />
              </div>
            ))}
          </div>
        ) : !data?.items?.length ? (
          <EmptyState icon="history" title="No transactions yet">
            Once you send or receive on {network.name}, activity shows up here.
          </EmptyState>
        ) : (
          <div>
            {data.items.map((tx) => {
              const out = tx.direction === 'out';
              const amountHuman = isEvm(network)
                ? Number(fromWei(tx.valueWei ?? 0n, network.decimals))
                : Number(tx.valueSats ?? 0n) / 1e8;
              const usd = price === null ? null : amountHuman * price;
              return (
                <div key={tx.hash} className="tx-row">
                  <div className={`tx-icon ${out ? 'tx-out' : 'tx-in'}`}>
                    <Icon name={out ? 'arrowUpRight' : 'arrowDownLeft'} size={16} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 13.5 }}>
                        {out ? 'Sent' : 'Received'} {tx.symbol ? tx.symbol : network.symbol}
                      </span>
                      {tx.status === 'pending' && <span className="badge badge-warn">Pending</span>}
                      {tx.status === 'failed' && <span className="badge badge-danger">Failed</span>}
                      {tx.local && <span className="badge">Local</span>}
                    </div>
                    <div className="faint small" style={{ marginTop: 3 }}>
                      {tx.counterparty ? `${out ? 'To' : 'From'} ${shortAddress(tx.counterparty)}` : '—'}
                      {tx.timestamp ? ` · ${new Date(tx.timestamp).toLocaleString()}` : ''}
                      {tx.method ? ` · ${tx.method}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                      {out ? '−' : '+'}
                      {trimAmount(amountHuman)} {tx.symbol ? tx.symbol : network.symbol}
                    </div>
                    <div className="asset-value">{usd === null ? '—' : formatUsd(usd)}</div>
                  </div>
                  <a href={network.explorer.tx(tx.hash)} target="_blank" rel="noreferrer" title="Open in explorer">
                    <Button variant="ghost" size="sm" icon="external">
                      <span className="nav-label" />
                    </Button>
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
