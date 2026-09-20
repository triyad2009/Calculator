import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  createVault,
  unlockVault,
  destroyVault,
  hasVault,
  readMeta,
  writeMeta,
  recordSentTx,
} from '../lib/vault.js';
import {
  createMnemonic,
  checkMnemonic,
  mnemonicToSeed,
  deriveEvmAccount,
  deriveBtcAccount,
} from '../lib/wallet-core.js';
import { getNetwork, isEvm, DEFAULT_NETWORK, EVM_NETWORKS } from '../lib/chains.js';
import { tokensForChain } from '../lib/tokens.js';
import { getBalanceWei, getErc20Balances, getTransactionCount, prepareFees, sendRawTransaction } from '../lib/rpc.js';
import { encodeTransfer, signEip1559, signLegacy } from '../lib/evm-tx.js';
import { getUtxos, getFeeEstimates, broadcastRawTx, getBtcBalance } from '../lib/btc-api.js';
import { addressToScriptPubKey, selectCoins, signP2WPKH } from '../lib/btc-tx.js';
import { fetchPrices } from '../lib/prices.js';
import { fromWei, toWei } from '../lib/format.js';

const WalletContext = createContext(null);

const AUTO_LOCK_DEFAULT = 10; // minutes

export function WalletProvider({ children }) {
  const [status, setStatus] = useState('checking'); // checking | empty | locked | unlocked
  const [mnemonic, setMnemonic] = useState(null); // memory only — never persisted
  const [accounts, setAccounts] = useState(null);
  const [networkId, setNetworkId] = useState(() => readMeta().networkId ?? DEFAULT_NETWORK);
  const [balances, setBalances] = useState(null);
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(false);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [toasts, setToasts] = useState([]);

  const lockTimer = useRef(null);
  const accountsRef = useRef(null);
  accountsRef.current = accounts;

  const network = getNetwork(networkId);
  const evmNetworks = EVM_NETWORKS;

  /* ---------------- toasts ---------------- */

  const toast = useCallback((type, message) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 8000 : 4500);
  }, []);

  const dismissToast = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  /* ---------------- auto-lock ---------------- */

  const [autoLockMinutes, setAutoLockMinutes] = useState(
    () => readMeta().autoLockMinutes ?? AUTO_LOCK_DEFAULT,
  );

  const setAutoLock = useCallback((minutes) => {
    setAutoLockMinutes(minutes);
    writeMeta({ autoLockMinutes: minutes });
  }, []);

  const scheduleLock = useCallback(() => {
    if (lockTimer.current) clearTimeout(lockTimer.current);
    if (autoLockMinutes <= 0) return;
    lockTimer.current = setTimeout(() => {
      setMnemonic(null);
      setAccounts(null);
      setBalances(null);
      setStatus('locked');
    }, autoLockMinutes * 60_000);
  }, [autoLockMinutes]);

  const touch = useCallback(() => {
    if (status === 'unlocked') scheduleLock();
  }, [status, scheduleLock]);

  useEffect(() => {
    const events = ['pointerdown', 'keydown'];
    const handler = () => touch();
    events.forEach((e) => window.addEventListener(e, handler));
    return () => events.forEach((e) => window.removeEventListener(e, handler));
  }, [touch]);

  useEffect(() => () => lockTimer.current && clearTimeout(lockTimer.current), []);

  /* ---------------- boot ---------------- */

  useEffect(() => {
    setStatus(hasVault() ? 'locked' : 'empty');
  }, []);

  /* ---------------- key material ---------------- */

  const loadAccounts = useCallback((phrase) => {
    const seed = mnemonicToSeed(phrase);
    const next = {
      evm: deriveEvmAccount(seed, 0),
      btc: deriveBtcAccount(seed, 0, false),
      btcTestnet: deriveBtcAccount(seed, 0, true),
    };
    setAccounts(next);
    return next;
  }, []);

  const currentAccount = useMemo(() => {
    if (!accounts) return null;
    if (isEvm(network)) return accounts.evm;
    return network.id === 'bitcoin-testnet' ? accounts.btcTestnet : accounts.btc;
  }, [accounts, network]);

  const address = currentAccount?.address ?? null;

  /* ---------------- balances + prices ---------------- */

  const loadBalances = useCallback(
    async ({ account, net } = {}) => {
      const acct = account ?? accountsRef.current;
      if (!acct) return null;
      const activeNetwork = net ?? getNetwork(networkId);
      try {
        if (isEvm(activeNetwork)) {
          const tokens = tokensForChain(activeNetwork.chainId);
          const [nativeWei, tokenBalances] = await Promise.all([
            getBalanceWei(activeNetwork, acct.evm.address),
            getErc20Balances(activeNetwork, acct.evm.address, tokens),
          ]);
          const next = {
            networkId: activeNetwork.id,
            address: acct.evm.address,
            native: {
              symbol: activeNetwork.symbol,
              decimals: activeNetwork.decimals,
              amount: nativeWei,
              coingeckoId: activeNetwork.coingeckoId,
              kind: 'native',
              name: activeNetwork.name,
            },
            tokens: tokens
              .map((t) => ({
                ...t,
                kind: 'token',
                amount: tokenBalances.get(t.address.toLowerCase()) ?? 0n,
              }))
              .filter((t) => t.amount > 0n),
          };
          setBalances(next);
          return next;
        }

        const btcAccount = activeNetwork.id === 'bitcoin-testnet' ? acct.btcTestnet : acct.btc;
        const b = await getBtcBalance(activeNetwork, btcAccount.address);
        const next = {
          networkId: activeNetwork.id,
          address: btcAccount.address,
          native: {
            symbol: activeNetwork.symbol,
            decimals: 8,
            amount: b.totalSats,
            coingeckoId: activeNetwork.coingeckoId,
            kind: 'native',
            name: activeNetwork.name,
          },
          tokens: [],
        };
        setBalances(next);
        return next;
      } catch (err) {
        toast('error', `Could not load balances on ${activeNetwork.name}: ${err.message}`);
        return null;
      } finally {
        setLastUpdated(new Date());
      }
    },
    [networkId, toast],
  );

  const loadPrices = useCallback(async () => {
    setPricesLoading(true);
    try {
      const ids = new Set();
      EVM_NETWORKS.forEach((n) => ids.add(n.coingeckoId));
      tokensForChain(network.chainId ?? 0).forEach((t) => ids.add(t.coingeckoId));
      ids.add('bitcoin');
      const data = await fetchPrices([...ids]);
      setPrices(data);
    } catch (err) {
      // Prices are cosmetic; keep the UI usable and say so once.
      toast('error', `Price feed unavailable: ${err.message}`);
    } finally {
      setPricesLoading(false);
    }
  }, [network, toast]);

  const refresh = useCallback(async () => {
    if (!accountsRef.current) return;
    setLoading(true);
    await Promise.all([loadBalances(), loadPrices()]);
    setLoading(false);
  }, [loadBalances, loadPrices]);

  // Reload whenever the network changes while unlocked.
  useEffect(() => {
    if (status !== 'unlocked' || !accounts) return;
    setLoading(true);
    Promise.all([loadBalances(), loadPrices()]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [networkId, status]);

  /* ---------------- wallet lifecycle ---------------- */

  const newMnemonic = useCallback((words = 12) => createMnemonic(words), []);

  const activate = useCallback(
    (phrase) => {
      const loaded = loadAccounts(phrase);
      setMnemonic(phrase);
      setStatus('unlocked');
      scheduleLock();
      return loaded;
    },
    [loadAccounts, scheduleLock],
  );

  const finalizeCreate = useCallback(
    async (phrase, password) => {
      await createVault(phrase, password);
      activate(phrase);
      toast('success', 'Wallet created. Your keys are encrypted in this browser only.');
    },
    [activate, toast],
  );

  const importWallet = useCallback(
    async (phrase, password) => {
      const check = checkMnemonic(phrase);
      if (!check.valid) throw new Error(check.reason);
      await createVault(check.phrase, password);
      activate(check.phrase);
      toast('success', 'Wallet imported.');
    },
    [activate, toast],
  );

  const unlock = useCallback(
    async (password) => {
      const phrase = await unlockVault(password);
      if (!phrase) throw new Error('Incorrect password.');
      activate(phrase);
      return true;
    },
    [activate],
  );

  const lock = useCallback(() => {
    if (lockTimer.current) clearTimeout(lockTimer.current);
    setMnemonic(null);
    setAccounts(null);
    setBalances(null);
    setStatus('locked');
  }, []);

  const wipe = useCallback(() => {
    destroyVault();
    setMnemonic(null);
    setAccounts(null);
    setBalances(null);
    setStatus('empty');
    toast('success', 'Vault erased from this browser.');
  }, [toast]);

  const changeNetwork = useCallback((id) => {
    setNetworkId(id);
    setBalances(null);
    writeMeta({ networkId: id });
  }, []);

  /* ---------------- sending ---------------- */

  const sendEvm = useCallback(
    async ({ to, amount, token, gasOverride }) => {
      if (!mnemonic) throw new Error('Wallet is locked.');
      const net = getNetwork(networkId);
      const acct = accountsRef.current.evm;
      const decimals = token ? token.decimals : net.decimals;
      const value = token ? 0n : toWei(amount, decimals);
      const data = token ? encodeTransfer(to, toWei(amount, token.decimals)) : '0x';

      const nonce = await getTransactionCount(net, acct.address);
      const fees = await prepareFees(net, { from: acct.address, to, value, data });
      if (gasOverride) fees.gasLimit = BigInt(gasOverride);

      const tx = {
        chainId: BigInt(net.chainId),
        nonce,
        gasLimit: fees.gasLimit,
        to,
        value,
        data,
        ...(fees.type === 2
          ? { maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas }
          : { gasPrice: fees.gasPrice }),
      };

      const signed = fees.type === 2 ? signEip1559(tx, acct.privateKey) : signLegacy(tx, acct.privateKey);

      if (signed.recovered.toLowerCase() !== acct.address.toLowerCase()) {
        throw new Error('Signature did not recover to your address — aborting.');
      }

      const hash = await sendRawTransaction(net, signed.rawTransaction);
      const feeWei = fees.type === 2 ? fees.maxFeePerGas * fees.gasLimit : fees.gasPrice * fees.gasLimit;
      recordSentTx({
        networkId: net.id,
        chainId: net.chainId,
        hash,
        from: acct.address,
        to,
        valueWei: String(token ? 0n : value),
        feeWei: String(feeWei),
        symbol: token ? token.symbol : net.symbol,
        amount,
        type: fees.type,
      });
      return { hash, explorer: net.explorer.tx(hash) };
    },
    [mnemonic, networkId],
  );

  const sendBtc = useCallback(
    async ({ to, amount, feeRate }) => {
      if (!mnemonic) throw new Error('Wallet is locked.');
      const net = getNetwork(networkId);
      const acct = accountsRef.current[networkId === 'bitcoin-testnet' ? 'btcTestnet' : 'btc'];
      const sats = toWei(amount, 8);
      if (sats <= 0n) throw new Error('Enter an amount greater than zero.');

      const destination = addressToScriptPubKey(to);
      const utxos = await getUtxos(net, acct.address);
      const rate = Number(feeRate) || (await getFeeEstimates(net)).halfHour;
      const { inputs, change, fee, hasChange } = selectCoins(utxos, sats, rate);

      const outputs = [{ value: sats, scriptPubKey: destination.scriptPubKey, type: destination.type }];
      if (hasChange) {
        outputs.push({
          value: change,
          scriptPubKey: addressToScriptPubKey(acct.address).scriptPubKey,
          type: 'witness',
        });
      }

      const signed = signP2WPKH({
        privateKey: acct.privateKey,
        publicKey: acct.publicKey,
        inputs,
        outputs,
      });

      const txid = await broadcastRawTx(net, signed.rawHex);
      recordSentTx({
        networkId: net.id,
        hash: txid,
        from: acct.address,
        to,
        valueSats: String(sats),
        feeSats: String(fee),
        symbol: net.symbol,
        amount,
      });
      return { hash: txid, explorer: net.explorer.tx(txid), feeSats: fee };
    },
    [mnemonic, networkId],
  );

  const send = useCallback(
    (payload) => (isEvm(getNetwork(networkId)) ? sendEvm(payload) : sendBtc(payload)),
    [networkId, sendEvm, sendBtc],
  );

  /* ---------------- derived portfolio ---------------- */

  const priceOf = useCallback((coingeckoId) => {
    const entry = prices?.[coingeckoId];
    return typeof entry?.usd === 'number' ? entry.usd : null;
  }, [prices]);

  const portfolio = useMemo(() => {
    if (!balances) return null;
    const rows = [balances.native, ...balances.tokens].map((asset) => {
      const human = Number(fromWei(asset.amount, asset.decimals));
      const price = priceOf(asset.coingeckoId);
      return {
        ...asset,
        human,
        price,
        usd: price === null ? null : human * price,
        change: prices?.[asset.coingeckoId]?.usd_24h_change ?? null,
      };
    });
    const total = rows.reduce((sum, r) => sum + (r.usd ?? 0), 0);
    const priced = rows.some((r) => r.usd !== null);
    return { rows, total, priced };
  }, [balances, priceOf, prices]);

  const value = {
    status,
    network,
    networkId,
    evmNetworks,
    changeNetwork,
    accounts,
    account: currentAccount,
    address,
    balances,
    portfolio,
    prices,
    pricesLoading,
    loading,
    lastUpdated,
    autoLockMinutes,
    setAutoLock,
    priceOf,
    toasts,
    toast,
    dismissToast,
    newMnemonic,
    finalizeCreate,
    importWallet,
    unlock,
    lock,
    wipe,
    refresh,
    send,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside <WalletProvider>');
  return ctx;
}
