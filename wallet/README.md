# NexVault

A fully client-side, non-custodial multi-chain crypto wallet. React + Vite, no backend.

```
npm install
npm run dev          # http://localhost:5173
npm test             # vitest, 199 tests
npm run build        # production bundle -> dist/
npm run publish:site # copy dist/ to the repo root for GitHub Pages
```

---

## Architecture

```
wallet/
├─ src/
│  ├─ lib/                    # pure logic, no React
│  │  ├─ wallet-core.js       # BIP39 phrase, BIP32 seed, EVM + Bitcoin account derivation
│  │  ├─ rlp.js               # RLP encoder (Yellow Paper Appendix B)
│  │  ├─ evm-tx.js            # EIP-1559 / legacy envelopes, ABI selectors
│  │  ├─ rpc.js               # batched JSON-RPC with endpoint fallback
│  │  ├─ btc-tx.js            # BIP143 sighash, coin selection, segwit serialisation
│  │  ├─ btc-api.js           # mempool.space REST client
│  │  ├─ prices.js            # CoinGecko, cached
│  │  ├─ explorer.js          # history via Blockscout + local tx log
│  │  ├─ vault.js             # AES-GCM encrypted localStorage vault
│  │  ├─ chains.js            # network registry (RPC endpoints, explorers)
│  │  ├─ tokens.js            # curated ERC-20 registry
│  │  └─ format.js            # BigInt unit conversion, display helpers
│  ├─ context/WalletProvider.jsx   # app state: keys, network, balances, prices, toasts
│  ├─ components/             # UI kit (icons, buttons, modal, toasts) + layout
│  └─ pages/                  # Landing, Create, Import, Unlock, Dashboard, Send, Receive, Activity, Settings
├─ tests/                     # 199 tests (see below)
└─ scripts/publish-site.mjs   # copies dist/ to the repo root
```

The `lib/` layer is deliberately framework-free so it can be tested in plain Node.

---

## Cryptography

| Step | Standard | Implementation |
|---|---|---|
| Entropy → mnemonic | BIP39 | `@scure/bip39` + `crypto.getRandomValues` |
| Mnemonic → seed | BIP39 (PBKDF2-HMAC-SHA512, 2048) | `@scure/bip39` |
| Seed → keys | BIP32 | `@scure/bip32` |
| EVM accounts | BIP44, `m/44'/60'/0'/0/i` | keccak256 of the uncompressed public key |
| Bitcoin accounts | BIP84, `m/84'/0'/0'/0/i` | P2WPKH bech32 (legacy P2PKH also derived) |
| EVM signing | EIP-1559 / EIP-155 | own RLP + secp256k1, low-S, explicit `yParity` |
| Bitcoin signing | BIP143 / BIP66 | own sighash + DER signatures |
| Vault | AES-GCM + PBKDF2-SHA256 | WebCrypto, 600,000 iterations |

Only audited, dependency-free primitives from the `@noble` / `@scure` family are used. Everything
else — RLP, transaction envelopes, sighash, serialisation — is implemented in this repo and covered
by tests.

### How the tests verify it

The suite checks the implementation against **external authorities**, so a bug cannot hide behind a
matching mistake in the same file:

- **`bip39.test.js`** — all 24 official Trezor vectors. Note the published vectors all use the
  passphrase `TREZOR` (verified independently: 24/24 match with it, 0/24 without). Empty-passphrase
  seeds are asserted separately against values recomputed with `node:crypto`.
- **`bip32.test.js`** — official BIP32 Test Vector 1 `xpub`/`xprv` for `m` and `m/0'`.
- **`evm.test.js`** — addresses, EIP-55 checksums, and full transaction serialisation compared
  byte-for-byte against `ethers`.
- **`rlp.test.js`** — canonical Yellow Paper examples plus `ethers.encodeRlp`.
- **`btc.test.js`** — the BIP143 native-P2WPKH example (scriptCode, sighash, DER signature) and full
  transactions compared byte-for-byte against `@scure/btc-signer`.
- **`rpc.test.js`** — RPC framing, endpoint fallback and fee preparation with a mocked transport,
  then a complete sign-and-broadcast pipeline cross-checked against `ethers`.
- **`vault.test.js`** — encryption round-trip, wrong-password rejection, salt/IV uniqueness,
  password rotation, erasure.
- **`app.test.jsx`** — the real UI in jsdom: create a wallet through all three steps and land on the
  dashboard, with the vault written and the plaintext phrase absent from storage.

```
Test Files  9 passed (9)
     Tests  199 passed (199)
```

Two bugs were caught this way that would have shipped silently: a compact (64-byte) signature being
emitted in the Bitcoin witness instead of DER — which the network would have rejected — and
application-level JSON-RPC errors being retried across every endpoint, which hid messages such as
`execution reverted`.

---

## Networks

| Network | Chain ID | Native | History |
|---|---|---|---|
| Ethereum | 1 | ETH | Blockscout |
| Base | 8453 | ETH | Blockscout |
| Polygon | 137 | POL | Blockscout |
| Arbitrum One | 42161 | ETH | Blockscout |
| OP Mainnet | 10 | ETH | Blockscout |
| BNB Smart Chain | 56 | BNB | local log only |
| Avalanche C-Chain | 43114 | AVAX | local log only |
| Sepolia (testnet) | 11155111 | SepoliaETH | local log only |
| Bitcoin / Bitcoin Testnet | — | BTC / tBTC | mempool.space |

Each EVM entry carries an ordered list of public CORS-enabled RPC endpoints; the first one that
answers is used for the rest of the session.

---

## Security model

- The recovery phrase is generated locally and **never transmitted**.
- At rest it is encrypted with AES-GCM; the key comes from PBKDF2-SHA256 at 600,000 iterations.
- Auto-lock (default 10 minutes, configurable in Settings) wipes keys from memory.
- Transactions are signed in memory; only signed bytes go to the network.
- Before broadcasting, an EVM signature's recovered address is checked against your own address and
  the send aborts if they differ.

### Known limitations

- Single account per chain (derivation index 0); no multi-account UI yet.
- Import accepts a BIP39 recovery phrase only — not a raw private key.
- No ERC-20 token discovery beyond the curated registry; no custom tokens yet.
- Bitcoin sends spend P2WPKH UTXOs only (the wallet's own address format).
- No hardware-wallet or WalletConnect support.
- WebCrypto requires a secure context, so the app must be served over HTTPS or `localhost`.

### ⚠️ Disclaimer

This is an **educational, unaudited** implementation. It is genuinely non-custodial, so there is no
recovery service — if the recovery phrase is lost, the funds are unrecoverable. Test on testnets
first and never store more than you can afford to lose.
