import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useWallet } from '../context/WalletProvider.jsx';
import { isEvm } from '../lib/chains.js';
import { Button, Card, Callout, CopyButton } from '../components/ui.jsx';

export default function Receive() {
  const { network, address, account, accounts } = useWallet();
  const evm = isEvm(network);
  const [showLegacy, setShowLegacy] = useState(false);

  const displayed = !evm && showLegacy && accounts ? accounts.btc.legacyAddress : address;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Receive</h1>
          <p className="page-sub">
            Share this address to receive {network.symbol} on {network.name}.
          </p>
        </div>
      </div>

      <div className="grid grid-2">
        <Card title="Your address">
          <div className="qr-frame">
            <QRCodeSVG value={displayed} size={188} level="M" marginSize={1} />
          </div>

          <div className="field-label mt-14">
            <span>{!evm && showLegacy ? 'Legacy (P2PKH) address' : `${network.name} address`}</span>
            <span className="faint">{account?.path}</span>
          </div>
          <div className="address-box">{displayed}</div>

          <div className="row mt-14 wrap">
            <CopyButton value={displayed} label="Copy address" variant="primary" size="md" />
            {!evm && accounts ? (
              <Button variant="ghost" icon="key" onClick={() => setShowLegacy((s) => !s)}>
                {showLegacy ? 'Use bech32 address' : 'Use legacy address'}
              </Button>
            ) : null}
          </div>
        </Card>

        <div className="stack">
          <Card title="Important">
            <div className="stack" style={{ gap: 11 }}>
              <Callout tone="info" icon="globe">
                Only send <strong>{network.symbol}</strong> and assets native to <strong>{network.name}</strong> to
                this address. Tokens sent from another chain will not appear here.
              </Callout>
              {evm ? (
                <Callout tone="success" icon="shield">
                  Every EVM network in NexVault shares this single address — the same address receives on
                  Ethereum, Base, Polygon, Arbitrum and the rest.
                </Callout>
              ) : (
                <Callout tone="success" icon="shield">
                  The bech32 (<code>bc1…</code>) address is native segwit and has the lowest transaction fees. Use
                  the legacy (<code>1…</code>) form only if a sender does not support bech32.
                </Callout>
              )}
              <Callout tone="warn" icon="alert">
                Always verify the address on the sender&apos;s side. Clipboard malware and lookalike domains are
                the most common way funds are stolen.
              </Callout>
            </div>
          </Card>

          <Card title="Derivation">
            <div className="row-between">
              <span className="muted small">Path</span>
              <span className="mono small">{account?.path}</span>
            </div>
            <div className="row-between" style={{ marginTop: 7 }}>
              <span className="muted small">Standard</span>
              <span className="small">{evm ? 'BIP44 (coin type 60)' : 'BIP84 native segwit'}</span>
            </div>
            <div className="row-between" style={{ marginTop: 7 }}>
              <span className="muted small">Public key</span>
              <span className="mono small truncate" style={{ maxWidth: 210 }} title={account?.publicKeyHex}>
                {account?.publicKeyHex}
              </span>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
