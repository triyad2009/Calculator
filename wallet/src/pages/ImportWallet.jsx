import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useWallet } from '../context/WalletProvider.jsx';
import { checkMnemonic } from '../lib/wallet-core.js';
import { Button, Card, Field, Callout } from '../components/ui.jsx';

export default function ImportWallet() {
  const { importWallet, toast } = useWallet();
  const navigate = useNavigate();

  const [phrase, setPhrase] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const live = checkMnemonic(phrase);
  const words = phrase.trim() ? phrase.trim().split(/\s+/).length : 0;

  const submit = async () => {
    setError(null);
    if (!live.valid) return setError(live.reason);
    if (password.length < 8) return setError('Use at least 8 characters for your password.');
    if (password !== confirm) return setError('The two passwords do not match.');

    setBusy(true);
    try {
      await importWallet(phrase, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
      toast('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="auth-head">
        <h1>Import a wallet</h1>
        <p>Restore an existing wallet from its recovery phrase.</p>
      </div>

      <Card>
        <Field
          label="Recovery phrase"
          hint={`12, 15, 18, 21 or 24 words, in order, separated by spaces.${words ? ` You have entered ${words}.` : ''}`}
          error={phrase.trim() && !live.valid ? live.reason : null}
        >
          <textarea
            className="input mono"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder="abandon abandon abandon …"
            spellCheck={false}
            autoComplete="off"
          />
        </Field>

        {live.valid && (
          <div className="mb-14">
            <Callout tone="success" icon="check">
              Valid {live.words.length}-word phrase — the BIP39 checksum passes.
            </Callout>
          </div>
        )}

        <Field label="New password for this browser" hint="Encrypts the phrase locally with AES-GCM.">
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
          />
        </Field>

        <Field label="Confirm password">
          <input
            className="input"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repeat it"
            autoComplete="new-password"
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </Field>

        <Callout tone="warn" icon="shield">
          Import only into a device and browser you trust. Once unlocked, the phrase lives in this browser&apos;s
          memory until you lock the wallet.
        </Callout>

        <div className="row mt-20" style={{ justifyContent: 'space-between' }}>
          <Link to="/">
            <Button variant="ghost">Cancel</Button>
          </Link>
          <Button variant="primary" loading={busy} disabled={!live.valid} onClick={submit} icon="import">
            {busy ? 'Deriving keys…' : 'Import wallet'}
          </Button>
        </div>
      </Card>

      <p className="center faint small mt-20">
        Importing accepts a BIP39 recovery phrase (the standard 12–24 words). A new wallet?{' '}
        <Link to="/create">Create one</Link>
      </p>
    </div>
  );
}
