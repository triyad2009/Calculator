import React, { useState } from 'react';

/* ---------------- icons ---------------- */

const PATHS = {
  wallet: 'M3 7.5A2.5 2.5 0 0 1 5.5 5H18a2 2 0 0 1 2 2v1M3 7.5V17a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2M3 7.5h16M21 10.5h-4a1.75 1.75 0 0 0 0 3.5h4v-3.5Z',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  send: 'M4 12h14M13 6l6 6-6 6',
  receive: 'M20 12H6M11 18l-6-6 6-6',
  history: 'M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4.5V9H8M12 7.5V12l3 1.8',
  settings: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4 15H3.8a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 5 8.2l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10.6 4V3.8a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.4.9Z',
  lock: 'M6 11V8a6 6 0 1 1 12 0v3M5 11h14v9H5z',
  copy: 'M9 9h10v10H9zM5 15H4V4h11v1',
  check: 'M4.5 12.5 9 17l10.5-10.5',
  plus: 'M12 5v14M5 12h14',
  import: 'M12 3v12M7.5 10.5 12 15l4.5-4.5M4 20h16',
  shield: 'M12 3 5 6v6c0 4.4 3 8.3 7 9 4-.7 7-4.6 7-9V6l-7-3Z',
  bolt: 'M13 3 5 13h6l-1 8 8-10h-6l1-8Z',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3.5 9h17M3.5 15h17M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z',
  key: 'M15.5 3a5.5 5.5 0 1 0-5.2 7.3L3 17.6V21h3.4l.9-.9v-1.7h1.7l1-1h1.6l1.3-1.3A5.5 5.5 0 0 0 15.5 3Zm1.7 3.4a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z',
  trash: 'M4 7h16M9 7V5h6v2M6.5 7l1 13h9l1-13M10.5 11v5M13.5 11v5',
  refresh: 'M20 11a8 8 0 1 0-.7 4.5M20 5v6h-6',
  arrowUpRight: 'M7 17 17 7M9 7h8v8',
  arrowDownLeft: 'M17 7 7 17M15 17H7V9',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Zm9.5 2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  eyeOff: 'M4 4l16 16M9.9 5.9A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.3 4.1M6.3 8.1A17 17 0 0 0 2.5 12S6 18.5 12 18.5c1 0 1.9-.2 2.7-.5M9.9 9.9a2.5 2.5 0 0 0 3.5 3.5',
  alert: 'M12 8.5v5M12 17h.01M10.3 3.9 2.6 17.4A2 2 0 0 0 4.3 20.4h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  external: 'M14 4h6v6M20 4 11 13M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h11',
};

export function Icon({ name, size = 17, strokeWidth = 1.7, style }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

/* ---------------- buttons ---------------- */

export function Button({ variant = 'default', size, block, icon, children, loading, ...rest }) {
  const classes = ['btn', variant !== 'default' && `btn-${variant}`, size && `btn-${size}`, block && 'btn-block']
    .filter(Boolean)
    .join(' ');
  return (
    <button className={classes} disabled={loading || rest.disabled} {...rest}>
      {loading ? <span className="spinner" /> : icon ? <Icon name={icon} size={size === 'sm' ? 14 : 16} /> : null}
      {children}
    </button>
  );
}

/* ---------------- surfaces ---------------- */

export function Card({ title, action, children, className = '', style }) {
  return (
    <div className={`card ${className}`} style={style}>
      {(title || action) && (
        <div className="row-between mb-14">
          {title ? <div className="card-title" style={{ margin: 0 }}>{title}</div> : <span />}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function Badge({ tone, children }) {
  return <span className={`badge ${tone ? `badge-${tone}` : ''}`}>{children}</span>;
}

export function Callout({ tone = 'info', icon = 'alert', title, children }) {
  return (
    <div className={`callout callout-${tone}`}>
      <span className="callout-icon">
        <Icon name={icon} size={16} />
      </span>
      <div>
        {title ? <strong style={{ display: 'block', marginBottom: 3 }}>{title}</strong> : null}
        {children}
      </div>
    </div>
  );
}

/* ---------------- copy ---------------- */

export function CopyButton({ value, label = 'Copy', size = 'sm', variant = 'ghost' }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard API needs a secure context; fall back for http origins.
      const el = document.createElement('textarea');
      el.value = value;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      el.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <Button size={size} variant={variant} onClick={copy} icon={copied ? 'check' : 'copy'}>
      {copied ? 'Copied' : label}
    </Button>
  );
}

/* ---------------- modal ---------------- */

export function Modal({ open, title, children, onClose, actions }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {title ? <h3 className="modal-title">{title}</h3> : null}
        {children}
        {actions ? <div className="modal-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

/* ---------------- misc ---------------- */

export function TokenIcon({ symbol, color, size = 38 }) {
  const initials = (symbol || '?').replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase() || '?';
  return (
    <div
      className="token-icon"
      style={{ width: size, height: size, fontSize: size * 0.32, background: color ?? 'linear-gradient(135deg,#5eead4,#6366f1)' }}
    >
      {initials}
    </div>
  );
}

export function Field({ label, hint, error, children, action }) {
  return (
    <label className="field">
      <span className="field-label">
        <span>{label}</span>
        {action}
      </span>
      {children}
      {error ? <div className="field-error">{error}</div> : hint ? <div className="field-hint">{hint}</div> : null}
    </label>
  );
}

export function Spinner({ large }) {
  return <span className={`spinner ${large ? 'spinner-lg' : ''}`} />;
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="center-screen">
      <div className="stack center" style={{ alignItems: 'center' }}>
        <Spinner large />
        <div className="muted small">{label}</div>
      </div>
    </div>
  );
}

export function EmptyState({ icon = 'wallet', title, children, action }) {
  return (
    <div className="card center" style={{ padding: '38px 22px' }}>
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: 14,
          margin: '0 auto 14px',
          display: 'grid',
          placeItems: 'center',
          background: 'var(--panel-2)',
          border: '1px solid var(--border)',
          color: 'var(--muted)',
        }}
      >
        <Icon name={icon} size={20} />
      </div>
      <h3 style={{ fontSize: 16, marginBottom: 6 }}>{title}</h3>
      <div className="muted small" style={{ maxWidth: 420, margin: '0 auto' }}>
        {children}
      </div>
      {action ? <div className="mt-20">{action}</div> : null}
    </div>
  );
}
