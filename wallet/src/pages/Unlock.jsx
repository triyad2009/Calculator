import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useWallet } from '../context/WalletProvider.jsx';
import { vaultCreatedAt } from '../lib/vault.js';
import { Button, Card, Field, Callout, Modal } from '../components/ui.jsx';

export default function Unlock() {
  const { unlock, wipe, toast } = useWallet();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirmWipe, setConfirmWipe] = useState(false);

  const created = vaultCreatedAt();

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await unlock(password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="auth-head">
        <div className="brand-mark" style={{ margin: '0 auto 14px', width: 44, height: 44, fontSize: 19 }}>
          N
        </div>
        <h1>Welcome back</h1>
        <p>Enter your password to decrypt this wallet.</p>
      </div>

      <Card>
        <Field label="Password" error={error} hint={created ? `Vault created ${new Date(created).toLocaleString()}` : null}>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            autoComplete="current-password"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </Field>

        <Button variant="primary" block size="lg" loading={busy} disabled={!password} onClick={submit} icon="lock">
          {busy ? 'Deriving key…' : 'Unlock'}
        </Button>

        <div className="mt-20">
          <Callout tone="info" icon="key">
            Unlocking runs 600,000 PBKDF2-SHA256 iterations, so it can take a second or two. Your password never
            leaves this device.
          </Callout>
        </div>

        <div className="row mt-20" style={{ justifyContent: 'space-between' }}>
          <Link to="/">
            <Button variant="ghost">Home</Button>
          </Link>
          <Button variant="danger" icon="trash" onClick={() => setConfirmWipe(true)}>
            Forgot password
          </Button>
        </div>
      </Card>

      <Modal
        open={confirmWipe}
        title="Erase this wallet?"
        onClose={() => setConfirmWipe(false)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirmWipe(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              icon="trash"
              onClick={() => {
                wipe();
                setConfirmWipe(false);
                toast('success', 'Vault erased. You can re-import with your recovery phrase.');
                navigate('/');
              }}
            >
              Erase and start over
            </Button>
          </>
        }
      >
        <p className="muted small">
          There is no password reset — the password is what decrypts your recovery phrase. Erasing removes the
          encrypted vault from this browser so you can create or import a wallet again.
        </p>
        <div className="mt-14">
          <Callout tone="danger" icon="alert">
            If you still have your recovery phrase, erasing here costs you nothing. If you do not, any funds in
            this wallet are permanently inaccessible.
          </Callout>
        </div>
      </Modal>
    </div>
  );
}
