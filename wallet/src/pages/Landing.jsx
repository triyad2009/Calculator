import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useWallet } from '../context/WalletProvider.jsx';
import { ALL_NETWORKS } from '../lib/chains.js';
import { BrandMark } from '../components/Layout.jsx';
import { Button, Icon, Callout } from '../components/ui.jsx';

const FEATURES = [
  {
    icon: 'shield',
    title: 'Your keys never leave the browser',
    body: 'BIP39 entropy, BIP32 derivation and every signature happen locally. There is no backend, no account and no server that ever sees your seed.',
  },
  {
    icon: 'key',
    title: 'Real HD cryptography',
    body: 'Standard BIP39 recovery phrases and BIP44/BIP84 derivation paths — restore the same wallet in any compliant tool.',
  },
  {
    icon: 'globe',
    title: 'One seed, many chains',
    body: 'Ethereum, Base, Polygon, Arbitrum, OP Mainnet, BNB Chain, Avalanche and Sepolia share one address, plus native Bitcoin.',
  },
  {
    icon: 'bolt',
    title: 'Live balances and prices',
    body: 'Native and ERC-20 balances read straight from public JSON-RPC nodes, priced from the public CoinGecko feed.',
  },
  {
    icon: 'send',
    title: 'Sign and broadcast for real',
    body: 'EIP-1559 transactions and BIP143 segwit Bitcoin transactions are signed locally and submitted to the network.',
  },
  {
    icon: 'lock',
    title: 'Encrypted at rest',
    body: 'Your recovery phrase is sealed with AES-GCM under a PBKDF2-SHA256 derived key and auto-locks when you step away.',
  },
];

export default function Landing() {
  const { status } = useWallet();
  const navigate = useNavigate();

  const openWallet = () => navigate(status === 'unlocked' ? '/dashboard' : '/unlock');

  return (
    <div className="landing">
      <nav className="landing-nav">
        <BrandMark />
        <div className="row">
          {status === 'empty' ? (
            <>
              <Link to="/import">
                <Button variant="ghost">Import existing</Button>
              </Link>
              <Link to="/create">
                <Button variant="primary" icon="plus">
                  Create wallet
                </Button>
              </Link>
            </>
          ) : (
            <Button variant="primary" icon="lock" onClick={openWallet}>
              {status === 'unlocked' ? 'Open wallet' : 'Unlock'}
            </Button>
          )}
        </div>
      </nav>

      <header className="hero">
        <span className="hero-eyebrow">
          <Icon name="shield" size={13} />
          Non-custodial · open source · no server
        </span>
        <h1>
          A crypto wallet that
          <br />
          <span className="grad">never sees your keys</span>
        </h1>
        <p>
          NexVault derives, encrypts and signs entirely inside your browser. Create a wallet, hold assets across
          eight EVM networks and Bitcoin, and send real transactions — without ever handing a private key to anyone.
        </p>
        <div className="hero-cta">
          {status === 'empty' ? (
            <>
              <Link to="/create">
                <Button variant="primary" size="lg" icon="plus">
                  Create a new wallet
                </Button>
              </Link>
              <Link to="/import">
                <Button variant="ghost" size="lg" icon="import">
                  I have a recovery phrase
                </Button>
              </Link>
            </>
          ) : (
            <Button variant="primary" size="lg" icon="lock" onClick={openWallet}>
              {status === 'unlocked' ? 'Open wallet' : 'Unlock wallet'}
            </Button>
          )}
        </div>

        <div className="network-marquee">
          {ALL_NETWORKS.map((n) => (
            <span key={n.id} className="chain-chip">
              <span className="chain-dot" style={{ background: n.color }} />
              {n.name}
            </span>
          ))}
        </div>
      </header>

      <section className="feature-grid">
        {FEATURES.map((f) => (
          <div key={f.title} className="feature">
            <div className="feature-icon">
              <Icon name={f.icon} size={18} />
            </div>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </section>

      <section className="mt-20">
        <Callout tone="warn" icon="alert" title="Read this before you fund the wallet">
          NexVault is an educational, unaudited implementation of standard wallet cryptography. It is genuinely
          non-custodial — which also means there is no recovery service. If you lose your recovery phrase, the funds
          are unrecoverable. Test on Sepolia or Bitcoin testnet first, and never store more than you can afford to
          lose.
        </Callout>
      </section>

      <footer className="site-footer">
        <span>NexVault — client-side wallet demo. Keys are generated and stored in your browser only.</span>
        <span>
          <Link to="/create">Create</Link> · <Link to="/import">Import</Link>
        </span>
      </footer>
    </div>
  );
}
