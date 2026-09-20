import React from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '../context/WalletProvider.jsx';
import { formatUsd, trimAmount, shortAddress } from '../lib/format.js';
import { Button, Card, Icon, TokenIcon, EmptyState, CopyButton } from '../components/ui.jsx';

export default function Dashboard() {
  const { network, address, portfolio, loading, balances, lastUpdated, refresh, pricesLoading } = useWallet();

  const change = portfolio?.rows?.[0]?.change;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Portfolio</h1>
          <p className="page-sub">
            <span className="row" style={{ gap: 7 }}>
              <span className="chain-dot" style={{ background: network.color }} />
              {network.name}
              <span className="faint">·</span>
              <span className="mono">{shortAddress(address)}</span>
            </span>
          </p>
        </div>
        <div className="row">
          {lastUpdated ? (
            <span className="faint small">
              {loading ? 'Refreshing…' : `Updated ${lastUpdated.toLocaleTimeString()}`}
            </span>
          ) : null}
          <Button variant="ghost" icon="refresh" onClick={refresh} loading={loading}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="balance-hero">
        <div className="row-between wrap">
          <div>
            <div className="balance-label">Total balance</div>
            <div className="balance-value">
              {portfolio?.priced ? formatUsd(portfolio.total) : loading ? '—' : 'No price data'}
            </div>
            <div className="balance-delta">
              {pricesLoading ? (
                'Fetching prices…'
              ) : change !== null && change !== undefined ? (
                <span className={change >= 0 ? 'pos' : 'neg'}>
                  {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)}% {network.symbol} · 24h
                </span>
              ) : (
                <span className="faint">Prices unavailable — amounts below are still live from the chain</span>
              )}
            </div>
          </div>
          <div className="hero-actions" style={{ marginTop: 0 }}>
            <Link to="/send">
              <Button variant="primary" icon="send">
                Send
              </Button>
            </Link>
            <Link to="/receive">
              <Button variant="ghost" icon="receive">
                Receive
              </Button>
            </Link>
            <CopyButton value={address} label="Address" />
          </div>
        </div>
      </div>

      <div className="grid grid-2 mt-20">
        <Card title="Assets">
          {!balances && loading ? (
            <div className="stack">
              {[0, 1, 2].map((i) => (
                <div key={i} className="asset-row">
                  <div className="skeleton" style={{ width: 38, height: 38, borderRadius: '50%' }} />
                  <div style={{ flex: 1 }}>
                    <div className="skeleton" style={{ height: 12, width: '45%', marginBottom: 7 }} />
                    <div className="skeleton" style={{ height: 10, width: '30%' }} />
                  </div>
                  <div className="skeleton" style={{ height: 12, width: 70 }} />
                </div>
              ))}
            </div>
          ) : !portfolio?.rows?.length ? (
            <EmptyState
              icon="wallet"
              title="No assets on this network yet"
              action={
                <Link to="/receive">
                  <Button variant="primary" icon="receive">
                    Get your address
                  </Button>
                </Link>
              }
            >
              Send some {network.symbol} to your address, or switch network from the sidebar to see balances
              elsewhere.
            </EmptyState>
          ) : (
            <div>
              {portfolio.rows.map((asset) => (
                <div key={(asset.address ?? 'native') + asset.symbol} className="asset-row">
                  <TokenIcon symbol={asset.symbol} color={asset.kind === 'native' ? network.color : undefined} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="asset-name">{asset.kind === 'native' ? network.name : asset.name}</div>
                    <div className="asset-sub">
                      {asset.symbol}
                      {asset.price !== null ? ` · ${formatUsd(asset.price, true)}` : ' · no price'}
                    </div>
                  </div>
                  <div>
                    <div className="asset-amount">
                      {trimAmount(asset.human)} {asset.symbol}
                    </div>
                    <div className="asset-value">{asset.usd !== null ? formatUsd(asset.usd) : '—'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="stack">
          <Card title="Network">
            <InfoRow label="Network" value={network.name} />
            <InfoRow label="Chain ID" value={network.chainId ?? '—'} mono />
            <InfoRow
              label="Address"
              value={shortAddress(address, 10, 8)}
              mono
              action={<CopyButton value={address} label="" />}
            />
            <InfoRow label="RPC" value={new URL(network.rpc[0]).host} mono />
            <div className="mt-14">
              <a href={network.explorer.address(address)} target="_blank" rel="noreferrer">
                <Button variant="ghost" size="sm" icon="external">
                  View on explorer
                </Button>
              </a>
            </div>
          </Card>

          <Card title="How this works">
            <div className="stack" style={{ gap: 11 }}>
              <Mini icon="shield" text="Balances are read directly from public JSON-RPC nodes and Bitcoin APIs." />
              <Mini icon="bolt" text="Transactions are signed locally; only the signed bytes are broadcast." />
              <Mini icon="lock" text="Your recovery phrase stays encrypted in this browser and auto-locks." />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function InfoRow({ label, value, mono, action }) {
  return (
    <div className="row-between" style={{ padding: '7px 0' }}>
      <span className="muted small">{label}</span>
      <span className="row">
        <span className={mono ? 'mono' : ''} style={{ fontSize: 13 }}>
          {value}
        </span>
        {action}
      </span>
    </div>
  );
}

function Mini({ icon, text }) {
  return (
    <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
      <span style={{ color: 'var(--accent)', marginTop: 2 }}>
        <Icon name={icon} size={15} />
      </span>
      <span className="small muted">{text}</span>
    </div>
  );
}
