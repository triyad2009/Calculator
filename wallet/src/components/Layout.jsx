import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useWallet } from '../context/WalletProvider.jsx';
import { ALL_NETWORKS } from '../lib/chains.js';
import { shortAddress } from '../lib/format.js';
import { Button, Icon, CopyButton } from './ui.jsx';

const NAV = [
  { to: '/dashboard', label: 'Portfolio', icon: 'grid' },
  { to: '/send', label: 'Send', icon: 'send' },
  { to: '/receive', label: 'Receive', icon: 'receive' },
  { to: '/activity', label: 'Activity', icon: 'history' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

export function NetworkPicker() {
  const { networkId, changeNetwork } = useWallet();
  return (
    <select className="input" value={networkId} onChange={(e) => changeNetwork(e.target.value)}>
      <optgroup label="EVM networks">
        {ALL_NETWORKS.filter((n) => n.chainId).map((n) => (
          <option key={n.id} value={n.id}>
            {n.name}
          </option>
        ))}
      </optgroup>
      <optgroup label="Bitcoin">
        {ALL_NETWORKS.filter((n) => !n.chainId).map((n) => (
          <option key={n.id} value={n.id}>
            {n.name}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

export function Toasts() {
  const { toasts, dismissToast } = useWallet();
  if (!toasts.length) return null;
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span style={{ color: t.type === 'error' ? 'var(--danger)' : 'var(--success)', flexShrink: 0 }}>
            <Icon name={t.type === 'error' ? 'alert' : 'check'} size={16} />
          </span>
          <div style={{ flex: 1, wordBreak: 'break-word' }}>{t.message}</div>
          <button
            className="btn btn-ghost btn-sm"
            style={{ padding: '2px 8px' }}
            onClick={() => dismissToast(t.id)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export function Layout({ children }) {
  const { network, address, lock, account } = useWallet();
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">N</div>
          <div>
            <div className="brand-name">NexVault</div>
            <div className="brand-sub">Self-custody</div>
          </div>
        </div>

        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">
              <Icon name={item.icon} size={17} />
            </span>
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}

        <div className="sidebar-footer">
          <div className="field-label" style={{ padding: '0 4px' }}>
            <span>Network</span>
            {network.testnet ? <span className="badge badge-warn">Testnet</span> : null}
          </div>
          <NetworkPicker />

          {address ? (
            <div className="card card-tight" style={{ marginTop: 4 }}>
              <div className="row-between">
                <div style={{ minWidth: 0 }}>
                  <div className="small" style={{ fontWeight: 600 }}>
                    {account?.path}
                  </div>
                  <div className="faint small truncate mono" title={address}>
                    {shortAddress(address, 8, 6)}
                  </div>
                </div>
                <CopyButton value={address} label="" variant="ghost" size="sm" />
              </div>
            </div>
          ) : null}

          <Button
            variant="ghost"
            block
            icon="logout"
            onClick={() => {
              lock();
              navigate('/');
            }}
          >
            <span className="nav-label">Lock wallet</span>
          </Button>
        </div>
      </aside>

      <main className="main">{children}</main>
      <Toasts />
    </div>
  );
}

export function AuthLayout({ children }) {
  return (
    <>
      <div className="auth-wrap">{children}</div>
      <Toasts />
    </>
  );
}

export function BrandMark() {
  return (
    <div className="row" style={{ gap: 10 }}>
      <div className="brand-mark">N</div>
      <div>
        <div className="brand-name">NexVault</div>
        <div className="brand-sub">Self-custody wallet</div>
      </div>
    </div>
  );
}
