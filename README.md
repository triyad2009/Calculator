# Calculator + NexVault

This repository contains two independent projects:

| | |
|---|---|
| **`Calculator.java`** | The original Java Swing GUI calculator with exception handling. |
| **`wallet/`** | **NexVault** — a fully client-side, non-custodial multi-chain crypto wallet web app. |

The built wallet site is published from the repository root (`index.html`, `assets/`) so that
GitHub Pages — configured on this repo as *branch `main`, path `/`* — serves it directly at
**https://triyad2009.github.io/Calculator/**.

---

## 1. Java Swing Calculator

Title: **GUI-Based Calculator with Exception Handling Mechanism**

A Java Swing calculator that performs addition, subtraction, multiplication, division, modulus and
square-root operations. Exception handling keeps the application from crashing on invalid input or
division by zero.

### Run it

```bash
javac Calculator.java
java Calculator
```

### Limitations of the original application

- **Limited functionality** — only basic arithmetic; no trigonometric or logarithmic functions.
- **UI scaling issues** — the fixed `null` layout does not adapt to different screen sizes.
- **Single operation at a time** — no chaining of operations without intermediate results.
- **Error handling** — basic cases are covered, but not things like multiple decimal points.
- **No memory functions** — no M+, M−, MR.

---

## 2. NexVault — self-custody crypto wallet

A complete wallet web application that lives entirely in the browser. There is **no backend**: key
generation, encryption and transaction signing all happen on your device, and only already-signed
transactions are ever sent to the network.

### What it does

- **Create or import** a wallet from a standard BIP39 recovery phrase (12/15/18/21/24 words).
- **One seed, many chains** — Ethereum, Base, Polygon, Arbitrum One, OP Mainnet, BNB Smart Chain,
  Avalanche C-Chain and Sepolia all share a single address, plus native Bitcoin (mainnet + testnet).
- **Live balances** for native assets and a curated ERC-20 list, read straight from public JSON-RPC
  nodes, priced from the public CoinGecko API.
- **Send for real** — EIP-1559 (with legacy fallback) on EVM chains, and BIP143 native-segwit
  transactions on Bitcoin, signed locally and broadcast.
- **Receive** with a QR code, bech32 or legacy Bitcoin address, and copy-to-clipboard.
- **Activity history** via Blockscout for supported chains, plus a local log of what you broadcast.
- **Encrypted at rest** — the recovery phrase is sealed with AES-GCM under a PBKDF2-SHA256 key
  (600,000 iterations) and the wallet auto-locks after inactivity.

### Develop

```bash
cd wallet
npm install
npm run dev        # http://localhost:5173
npm test           # 199 tests
npm run build      # -> wallet/dist
npm run publish:site   # copies dist to the repo root for GitHub Pages
```

### Verified cryptography

The wallet core is covered by tests that check it against **published standard vectors** and
**independent reference implementations**, not against itself:

| Area | Verified against |
|---|---|
| BIP39 mnemonic → seed | All 24 official Trezor vectors (passphrase `TREZOR`), plus empty-passphrase seeds recomputed independently with `node:crypto` PBKDF2 |
| BIP32 HD derivation | Official BIP32 Test Vector 1 (`xpub`/`xprv`) |
| EVM address & EIP-55 | `ethers`, plus the EIP-55 specification cases |
| EIP-1559 / legacy signing | Byte-for-byte identical serialisation to `ethers` |
| RLP encoding | Yellow Paper / Wiki examples, cross-checked against `ethers.encodeRlp` |
| Bitcoin BIP143 sighash | The native-P2WPKH example in `bip-0143.mediawiki` |
| Bitcoin transaction signing | Byte-for-byte identical to `@scure/btc-signer` |

See [`wallet/README.md`](wallet/README.md) for architecture, API details and the security model.

### ⚠️ Security notice

NexVault is an **educational, unaudited** implementation of standard wallet cryptography. It is
genuinely non-custodial, which also means **there is no recovery service** — lose the recovery
phrase and the funds are gone. Test on Sepolia or Bitcoin testnet first, and never store more than
you can afford to lose.

---

## Deployment notes

GitHub Pages for this repository is configured as *branch `main`, path `/`*. Because of that, the
production build is committed at the repository root:

```
/index.html          <- built entry point
/assets/             <- built JS/CSS
/.nojekyll           <- disables Jekyll processing
/Calculator.java     <- untouched
/wallet/             <- website source
```

`npm run publish:site` (run from `wallet/`) regenerates those files. It only ever touches names that
Vite emitted and asserts afterwards that `Calculator.java`, `README.md` and `wallet/package.json`
are still present.
