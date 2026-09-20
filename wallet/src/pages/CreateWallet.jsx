import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useWallet } from '../context/WalletProvider.jsx';
import { WORD_COUNTS } from '../lib/wallet-core.js';
import { Button, Card, Field, Icon, Callout } from '../components/ui.jsx';

const pickQuizzIndexes = (length) => {
  const pool = Array.from({ length }, (_, i) => i);
  const picked = [];
  while (picked.length < 3) {
    const at = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(at, 1)[0]);
  }
  return picked.sort((a, b) => a - b);
};

export default function CreateWallet() {
  const { newMnemonic, finalizeCreate, toast } = useWallet();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [words, setWords] = useState(12);
  const [phrase, setPhrase] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [quiz, setQuiz] = useState([]);
  const [answers, setAnswers] = useState({});
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const list = useMemo(() => (phrase ? phrase.split(' ') : []), [phrase]);

  const generate = () => {
    const next = newMnemonic(words);
    setPhrase(next);
    setRevealed(false);
    setQuiz(pickQuizzIndexes(words));
    setAnswers({});
    setStep(2);
  };

  const quizPassed = quiz.every((i) => (answers[i] ?? '').trim().toLowerCase() === list[i]);

  const finish = async () => {
    setError(null);
    if (password.length < 8) return setError('Use at least 8 characters for your password.');
    if (password !== confirm) return setError('The two passwords do not match.');
    setBusy(true);
    try {
      await finalizeCreate(phrase, password);
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
        <h1>Create your wallet</h1>
        <p>Three steps. Nothing is uploaded anywhere.</p>
      </div>

      <div className="steps">
        {['Generate', 'Back up', 'Password'].map((label, i) => (
          <React.Fragment key={label}>
            {i > 0 && <span className="step-line" />}
            <span className={`step ${step === i + 1 ? 'active' : ''}`}>
              <span className="step-num">{i + 1}</span>
              {label}
            </span>
          </React.Fragment>
        ))}
      </div>

      {step === 1 && (
        <Card>
          <Field
            label="Recovery phrase length"
            hint="Longer phrases carry more entropy. 12 words (128 bits) is the common standard; 24 words (256 bits) is the maximum."
          >
            <div className="row wrap">
              {WORD_COUNTS.map((w) => (
                <Button
                  key={w}
                  variant={words === w ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => setWords(w)}
                >
                  {w} words
                </Button>
              ))}
            </div>
          </Field>

          <Callout tone="info" icon="shield">
            Your phrase is generated with <code>crypto.getRandomValues</code> in this browser. It is never sent
            anywhere — not to a server, not to analytics, nowhere.
          </Callout>

          <div className="row mt-20" style={{ justifyContent: 'space-between' }}>
            <Link to="/">
              <Button variant="ghost">Cancel</Button>
            </Link>
            <Button variant="primary" icon="bolt" onClick={generate}>
              Generate phrase
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <div className="row-between mb-14">
            <div className="card-title" style={{ margin: 0 }}>
              Your recovery phrase
            </div>
            <Button size="sm" variant="ghost" icon={revealed ? 'eyeOff' : 'eye'} onClick={() => setRevealed((r) => !r)}>
              {revealed ? 'Hide' : 'Reveal'}
            </Button>
          </div>

          <div className={`seed-grid ${revealed ? 'revealed' : 'seed-blur'}`}>
            {list.map((w, i) => (
              <div key={`${w}-${i}`} className="seed-word">
                <span className="seed-index">{i + 1}</span>
                <span>{w}</span>
              </div>
            ))}
          </div>

          <div className="mt-14">
            <Callout tone="danger" icon="alert" title="Write this down on paper">
              Anyone with these {list.length} words controls every asset in this wallet, on every network. Never
              screenshot it, never paste it into a website, and never store it in a cloud note. NexVault cannot
              recover it for you.
            </Callout>
          </div>

          <div className="mt-20">
            <div className="card-title">Confirm you saved it</div>
            <div className="grid grid-3">
              {quiz.map((i) => (
                <Field key={i} label={`Word #${i + 1}`}>
                  <input
                    className="input"
                    autoComplete="off"
                    spellCheck={false}
                    value={answers[i] ?? ''}
                    onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))}
                    placeholder={`word ${i + 1}`}
                  />
                </Field>
              ))}
            </div>
          </div>

          <div className="row mt-14" style={{ justifyContent: 'space-between' }}>
            <Button variant="ghost" onClick={() => setStep(1)}>
              Back
            </Button>
            <div className="row">
              <Button variant="ghost" icon="refresh" onClick={generate}>
                Regenerate
              </Button>
              <Button variant="primary" disabled={!quizPassed} onClick={() => setStep(3)}>
                Continue
              </Button>
            </div>
          </div>
          {!quizPassed && (
            <div className="field-hint mt-8">Fill in the three words above to continue.</div>
          )}
        </Card>
      )}

      {step === 3 && (
        <Card>
          <Field
            label="Choose a password"
            hint="This unlocks the wallet in this browser. It encrypts your phrase locally with AES-GCM and is not your recovery phrase — forgetting it can only be fixed by re-importing the phrase."
            error={error}
          >
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
              onKeyDown={(e) => e.key === 'Enter' && finish()}
            />
          </Field>

          <Callout tone="info" icon="lock">
            Key derivation runs PBKDF2-SHA256 for 600,000 iterations, so unlocking takes a moment on slower
            devices. That delay is deliberate — it slows down brute-force attacks.
          </Callout>

          <div className="row mt-20" style={{ justifyContent: 'space-between' }}>
            <Button variant="ghost" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button variant="primary" loading={busy} onClick={finish} icon="check">
              {busy ? 'Deriving keys…' : 'Create wallet'}
            </Button>
          </div>
        </Card>
      )}

      <p className="center faint small mt-20">
        Already have a phrase?{' '}
        <Link to="/import">Import it instead</Link>
      </p>
    </div>
  );
}
