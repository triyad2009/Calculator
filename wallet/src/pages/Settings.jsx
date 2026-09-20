import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../context/WalletProvider.jsx';
import { unlockVault, changePassword, vaultCreatedAt, PBKDF2_ITERATIONS } from '../lib/vault.js';
import { mnemonicToSeed, deriveEvmAccount, deriveBtcAccount } from '../lib/wallet-core.js';
import { isEvm } from '../lib/chains.js';
import { shortAddress } from '../lib/format.js';
import { Button, Card, Field, Callout, Modal, CopyButton } from '../components/ui.jsx';

const LOCK_OPTIONS = [
  { value: 5, label: '5 minutes' },
  { value: 10, label: '10 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 0, label: 'Never' },
];

export default function Settings() {
  const { network, accounts, address, autoLockMinutes, setAutoLock, wipe, toast } = useWallet();
  const navigate = useNavigate();

  const [secrets, setSecrets] = useState(null); // { mnemonic, evmKey, btcKey }
  const [prompt, setPrompt] = useState(null); // 'reveal' | 'keys' | 'password' | 'wipe'
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [showSecrets, setShowSecrets] = useState(false);

  const created = vaultCreatedAt();

  const closePrompt = () => {
    setPrompt(null);
    setPassword('');
    setNewPassword('');
    setConfirm('');
    setError(null);
  };

  /** Decrypt the vault with the password the user just typed. */
  const deriveSecrets = async (pwd) => {
    const mnemonic = await unlockVault(pwd);
    if (!mnemonic) throw new Error('Incorrect password.');
    const seed = mnemonicToSeed(mnemonic);
    return {
      mnemonic,
      evmKey: deriveEvmAccount(seed, 0).privateKeyHex,
      btcKey: deriveBtcAccount(seed, 0, false).privateKeyHex,
    };
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      if (prompt === 'reveal' || prompt === 'keys') {
        setSecrets(await deriveSecrets(password));
        setShowSecrets(false);
        setPassword('');
      } else if (prompt === 'password') {
        if (newPassword.length < 8) throw new Error('New password must be at least 8 characters.');
        if (newPassword !== confirm) throw new Error('The two new passwords do not match.');
        await changePassword(password, newPassword);
        toast('success', 'Password changed and the vault re-encrypted.');
        closePrompt();
      } else if (prompt === 'wipe') {
        const mnemonic = await unlockVault(password);
        if (!mnemonic) throw new Error('Incorrect password.');
        wipe();
        closePrompt();
        navigate('/');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Security, key export and wallet management.</p>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="stack">
          <Card title="Wallet">
            <Row label="Vault created" value={created ? new Date(created).toLocaleString() : '—'} />
            <Row label="Current network" value={`${network.name}${network.testnet ? ' (testnet)' : ''}`} />
            <Row label="EVM address" value={shortAddress(accounts?.evm.address, 10, 8)} mono />
            <Row label="EVM path" value={accounts?.evm.path} mono />
            <Row label="Bitcoin address" value={shortAddress(accounts?.btc.address, 12, 8)} mono />
            <Row label="Bitcoin path" value={accounts?.btc.path} mono />
          </Card>

          <Card title="Auto-lock">
            <Field
              label="Lock the wallet after inactivity"
              hint="Locking clears the recovery phrase and all private keys from memory. You will need your password again."
            >
              <select
                className="input"
                value={autoLockMinutes}
                onChange={(e) => {
                  setAutoLock(Number(e.target.value));
                  toast('success', 'Auto-lock updated.');
                }}
              >
                {LOCK_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          </Card>

          <Card title="Change password">
            <p className="muted small">
              Changing your password re-derives the encryption key and re-encrypts the recovery phrase in place.
              Your addresses do not change.
            </p>
            <div className="mt-14">
              <Button variant="ghost" icon="key" onClick={() => setPrompt('password')}>
                Change password
              </Button>
            </div>
          </Card>
        </div>

        <div className="stack">
          <Card title="Recovery & keys">
            <div className="mb-14">
              <Callout tone="danger" icon="alert" title="Handle with extreme care">
                Your recovery phrase and private keys are shown in plaintext on this screen and copied to your
                clipboard. Anyone who sees them owns this wallet. Never share them, and never enter them on
                another website.
              </Callout>
            </div>
            <div className="row wrap">
              <Button variant="ghost" icon="eye" onClick={() => setPrompt('reveal')}>
                Reveal recovery phrase
              </Button>
              <Button variant="ghost" icon="key" onClick={() => setPrompt('keys')}>
                Export private keys
              </Button>
            </div>
          </Card>

          <Card title="Security model">
            <div className="stack" style={{ gap: 11 }}>
              <Bullet text={`Recovery phrase encrypted with AES-GCM, key derived via PBKDF2-SHA256 at ${PBKDF2_ITERATIONS.toLocaleString()} iterations.`} />
              <Bullet text="Everything is stored in this browser's localStorage. There is no server, no account and no telemetry." />
              <Bullet text="Transactions are signed in memory; only signed bytes are broadcast to the network." />
              <Bullet text="Clearing your browser data erases the vault. Your recovery phrase is the only backup." />
            </div>
          </Card>

          <Card title="Danger zone">
            <p className="muted small">
              Erase the encrypted vault from this browser. You will be able to create or import a wallet again —
              and you will need your recovery phrase to get back into this one.
            </p>
            <div className="mt-14">
              <Button variant="danger" icon="trash" onClick={() => setPrompt('wipe')}>
                Erase wallet from this browser
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* ---- password prompt ---- */}
      <Modal
        open={Boolean(prompt) && !secrets}
        title={
          prompt === 'reveal'
            ? 'Confirm your password'
            : prompt === 'keys'
              ? 'Confirm your password'
              : prompt === 'password'
                ? 'Change password'
                : 'Confirm erasure'
        }
        onClose={busy ? undefined : closePrompt}
        actions={
          <>
            <Button variant="ghost" disabled={busy} onClick={closePrompt}>
              Cancel
            </Button>
            <Button
              variant={prompt === 'wipe' ? 'danger' : 'primary'}
              loading={busy}
              disabled={!password}
              onClick={submit}
            >
              {prompt === 'wipe' ? 'Erase wallet' : prompt === 'password' ? 'Update password' : 'Unlock'}
            </Button>
          </>
        }
      >
        {error && (
          <div className="mb-14">
            <Callout tone="danger" icon="alert">
              {error}
            </Callout>
          </div>
        )}
        <Field label={prompt === 'wipe' ? 'Enter your password to confirm' : 'Current password'}>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            autoComplete="current-password"
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </Field>
        {prompt === 'password' && (
          <>
            <Field label="New password" hint="At least 8 characters.">
              <input
                className="input"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Confirm new password">
              <input
                className="input"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </Field>
          </>
        )}
      </Modal>

      {/* ---- secrets ---- */}
      <Modal
        open={Boolean(secrets)}
        title="Secret material"
        onClose={() => {
          setSecrets(null);
          setShowSecrets(false);
        }}
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setSecrets(null);
              setShowSecrets(false);
            }}
          >
            Done
          </Button>
        }
      >
        <div className="mb-14">
          <Callout tone="danger" icon="alert">
            Anyone with this information controls every asset in this wallet. Close this dialog as soon as you
            have written it down.
          </Callout>
        </div>

        <div className="row-between mb-14">
          <span className="muted small">Reveal on screen</span>
          <Button size="sm" variant="ghost" icon={showSecrets ? 'eyeOff' : 'eye'} onClick={() => setShowSecrets((s) => !s)}>
            {showSecrets ? 'Hide' : 'Reveal'}
          </Button>
        </div>

        {prompt === 'keys' ? (
          <div className="stack">
            <SecretBlock
              label={`EVM private key (${isEvm(network) ? network.name : 'all EVM chains'})`}
              value={secrets?.evmKey}
              revealed={showSecrets}
            />
            <SecretBlock label="Bitcoin private key (BIP84)" value={secrets?.btcKey} revealed={showSecrets} />
          </div>
        ) : (
          <SecretBlock
            label="Recovery phrase"
            value={secrets?.mnemonic}
            revealed={showSecrets}
            words
          />
        )}
      </Modal>
    </>
  );
}

function SecretBlock({ label, value, revealed, words }) {
  return (
    <div>
      <div className="field-label">
        <span>{label}</span>
        <CopyButton value={value ?? ''} />
      </div>
      {words ? (
        <div className={`seed-grid ${revealed ? 'revealed' : 'seed-blur'}`}>
          {(value ?? '').split(' ').map((w, i) => (
            <div key={`${w}-${i}`} className="seed-word">
              <span className="seed-index">{i + 1}</span>
              <span>{w}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className={`address-box ${revealed ? '' : 'seed-blur'}`}>{value}</div>
      )}
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="row-between" style={{ padding: '7px 0' }}>
      <span className="muted small">{label}</span>
      <span className={mono ? 'mono small' : 'small'}>{value}</span>
    </div>
  );
}

function Bullet({ text }) {
  return (
    <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
      <span style={{ color: 'var(--accent)', marginTop: 3, flexShrink: 0 }}>
        <span className="dot" />
      </span>
      <span className="small muted">{text}</span>
    </div>
  );
}
