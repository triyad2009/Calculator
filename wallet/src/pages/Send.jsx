import React, { useEffect, useMemo, useState } from 'react';
import { useWallet } from '../context/WalletProvider.jsx';
import { isEvm } from '../lib/chains.js';
import { prepareFees, getTransactionCount } from '../lib/rpc.js';
import { getFeeEstimates } from '../lib/btc-api.js';
import { estimateVsize } from '../lib/btc-tx.js';
import { encodeTransfer } from '../lib/evm-tx.js';
import { fromWei, formatUsd, isBtcAddress, isEvmAddress, toWei, trimAmount } from '../lib/format.js';
import { Button, Card, Field, Callout, Modal, Icon, TokenIcon } from '../components/ui.jsx';

export default function Send() {
  const { network, address, account, balances, send, refresh, toast, priceOf } = useWallet();
  const evm = isEvm(network);

  const assets = useMemo(() => {
    if (!balances) return [];
    return [balances.native, ...balances.tokens];
  }, [balances]);

  const [assetKey, setAssetKey] = useState('native');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [feeRate, setFeeRate] = useState('');
  const [feeOptions, setFeeOptions] = useState(null);
  const [estimate, setEstimate] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState(null);
  const [review, setReview] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [formError, setFormError] = useState(null);

  const asset = assets.find((a) => (a.kind === 'native' ? 'native' : a.address.toLowerCase()) === assetKey) ?? assets[0];
  const available = asset ? Number(fromWei(asset.amount, asset.decimals)) : 0;

  const validAddress = evm ? isEvmAddress(to) : isBtcAddress(to);
  const parsedAmount = (() => {
    try {
      return toWei(amount, asset?.decimals ?? 18);
    } catch {
      return null;
    }
  })();
  const canSubmit = validAddress && parsedAmount !== null && parsedAmount > 0n;

  /* Bitcoin fee-rate presets */
  useEffect(() => {
    if (evm) return;
    let cancelled = false;
    getFeeEstimates(network)
      .then((r) => {
        if (cancelled) return;
        setFeeOptions(r);
        setFeeRate((current) => current || String(r.halfHour));
      })
      .catch(() => setFeeOptions(null));
    return () => {
      cancelled = true;
    };
  }, [network, evm]);

  /* Live fee estimate (debounced) */
  useEffect(() => {
    if (!canSubmit || !asset) {
      setEstimate(null);
      setEstimateError(null);
      return undefined;
    }
    let cancelled = false;
    setEstimating(true);
    const timer = setTimeout(async () => {
      try {
        if (evm) {
          const data = asset.kind === 'token' ? encodeTransfer(to, toWei(amount, asset.decimals)) : '0x';
          const value = asset.kind === 'token' ? 0n : toWei(amount, network.decimals);
          const fees = await prepareFees(network, { from: address, to, value, data });
          const feeWei = fees.type === 2 ? fees.maxFeePerGas * fees.gasLimit : fees.gasPrice * fees.gasLimit;
          if (!cancelled) {
            setEstimate({
              type: fees.type,
              gasLimit: fees.gasLimit,
              feeWei,
              feeHuman: Number(fromWei(feeWei, network.decimals)),
            });
            setEstimateError(null);
          }
        } else {
          const rate = Number(feeRate) || 10;
          const vsize = estimateVsize(1, [{ type: 'witness' }, { type: 'witness' }]);
          if (!cancelled) {
            setEstimate({ feeSats: BigInt(Math.ceil(vsize * rate)), vsize, rate });
            setEstimateError(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setEstimate(null);
          setEstimateError(err.message);
        }
      } finally {
        if (!cancelled) setEstimating(false);
      }
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, amount, assetKey, feeRate, network.id]);

  const setMax = async () => {
    if (!asset) return;
    if (asset.kind === 'token' || !evm) {
      setAmount(trimAmount(available, 8));
      return;
    }
    try {
      const fees = await prepareFees(network, { from: address, to: to || address, value: 1n, data: '0x' });
      const feeWei = fees.type === 2 ? fees.maxFeePerGas * fees.gasLimit : fees.gasPrice * fees.gasLimit;
      const max = asset.amount - feeWei;
      if (max <= 0n) {
        toast('error', `Your ${network.symbol} balance does not cover the network fee.`);
        return;
      }
      setAmount(trimAmount(Number(fromWei(max, network.decimals)), 8));
    } catch {
      setAmount(trimAmount(available, 8));
    }
  };

  const feeUsd = useMemo(() => {
    if (!estimate) return null;
    const price = priceOf(network.coingeckoId);
    if (price === null) return null;
    const fee = evm ? estimate.feeHuman : Number(estimate.feeSats) / 1e8;
    return fee * price;
  }, [estimate, network, evm, priceOf]);

  const submit = async () => {
    setFormError(null);
    setSending(true);
    try {
      const res = await send({
        to: to.trim(),
        amount,
        token: asset.kind === 'token' ? asset : null,
        feeRate,
      });
      setResult(res);
      setReview(false);
      setAmount('');
      toast('success', `Broadcast — tx ${res.hash.slice(0, 10)}…`);
      await refresh();
    } catch (err) {
      setFormError(err.message);
      toast('error', err.message);
    } finally {
      setSending(false);
    }
  };

  if (!balances) {
    return (
      <>
        <h1 className="page-title">Send</h1>
        <p className="page-sub">Waiting for balances to load on {network.name}…</p>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Send</h1>
          <p className="page-sub">
            Signed locally, then broadcast to {network.name}. Double-check the destination — transactions are
            irreversible.
          </p>
        </div>
      </div>

      {!network.testnet && (
        <div className="mb-14">
          <Callout tone="warn" icon="alert">
            You are on <strong>{network.name}</strong> mainnet. Real value moves when you confirm.
          </Callout>
        </div>
      )}

      <div className="grid grid-2">
        <Card title="Transaction">
          {assets.length > 1 && (
            <Field label="Asset">
              <select className="input" value={assetKey} onChange={(e) => setAssetKey(e.target.value)}>
                {assets.map((a) => (
                  <option key={a.kind === 'native' ? 'native' : a.address} value={a.kind === 'native' ? 'native' : a.address.toLowerCase()}>
                    {a.kind === 'native' ? `${network.name} (${a.symbol})` : `${a.name} (${a.symbol})`} —{' '}
                    {trimAmount(Number(fromWei(a.amount, a.decimals)))}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field
            label="Recipient"
            error={to && !validAddress ? (evm ? 'Enter a valid 0x… Ethereum address.' : 'Enter a valid Bitcoin address.') : null}
            hint={evm ? 'A 0x… address (40 hex characters).' : 'bech32 (bc1…), legacy (1…) or P2SH (3…) address.'}
          >
            <input
              className={`input mono ${to && !validAddress ? 'invalid' : ''}`}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder={evm ? '0x…' : 'bc1…'}
              spellCheck={false}
              autoComplete="off"
            />
          </Field>

          <Field
            label="Amount"
            error={amount && parsedAmount === null ? 'Enter a valid number.' : null}
            action={
              <button className="btn btn-ghost btn-sm" onClick={setMax} type="button">
                MAX {trimAmount(available)}
              </button>
            }
          >
            <div className="input-group">
              <input
                className="input"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="0.0"
                inputMode="decimal"
              />
              <span
                className="btn btn-ghost"
                style={{ pointerEvents: 'none', minWidth: 74, justifyContent: 'center' }}
              >
                {asset?.symbol}
              </span>
            </div>
          </Field>

          {!evm && (
            <Field label="Fee rate (sat/vB)" hint="Higher rates confirm faster. Presets come from mempool.space.">
              <div className="row wrap">
                {feeOptions &&
                  [
                    ['Fastest', feeOptions.fastest],
                    ['30 min', feeOptions.halfHour],
                    ['1 hour', feeOptions.hour],
                    ['Minimum', feeOptions.minimum],
                  ].map(([label, rate]) => (
                    <Button
                      key={label}
                      size="sm"
                      variant={String(rate) === feeRate ? 'primary' : 'ghost'}
                      onClick={() => setFeeRate(String(rate))}
                    >
                      {label} · {rate}
                    </Button>
                  ))}
                <input
                  className="input"
                  style={{ width: 96 }}
                  value={feeRate}
                  onChange={(e) => setFeeRate(e.target.value.replace(/[^0-9]/g, ''))}
                  inputMode="numeric"
                />
              </div>
            </Field>
          )}

          {formError && (
            <div className="mb-14">
              <Callout tone="danger" icon="alert">
                {formError}
              </Callout>
            </div>
          )}

          <Button variant="primary" block size="lg" disabled={!canSubmit} onClick={() => setReview(true)} icon="send">
            Review transfer
          </Button>
        </Card>

        <div className="stack">
          <Card title="Estimate">
            {estimating ? (
              <div className="row">
                <span className="spinner" /> <span className="muted small">Estimating network fee…</span>
              </div>
            ) : estimateError ? (
              <Callout tone="warn" icon="alert">
                Could not estimate the fee: {estimateError}. You can still review and send — the fee is resolved
                at broadcast time.
              </Callout>
            ) : estimate ? (
              <div className="stack" style={{ gap: 8 }}>
                {evm ? (
                  <>
                    <InfoRow label="Transaction type" value={estimate.type === 2 ? 'EIP-1559 (type 2)' : 'Legacy (type 0)'} />
                    <InfoRow label="Gas limit" value={estimate.gasLimit.toString()} mono />
                    <InfoRow label="Max fee" value={`${trimAmount(estimate.feeHuman, 8)} ${network.symbol}`} mono />
                  </>
                ) : (
                  <>
                    <InfoRow label="Fee rate" value={`${estimate.rate} sat/vB`} mono />
                    <InfoRow label="Estimated size" value={`~${estimate.vsize} vB`} mono />
                    <InfoRow label="Estimated fee" value={`${estimate.feeSats} sats`} mono />
                  </>
                )}
                <InfoRow label="Fee value" value={feeUsd === null ? '—' : formatUsd(feeUsd)} />
              </div>
            ) : (
              <p className="muted small">Enter a recipient and amount to see a network fee estimate.</p>
            )}
          </Card>

          <Card title="You are sending from">
            <div className="row" style={{ gap: 12 }}>
              <TokenIcon symbol={asset?.symbol} color={asset?.kind === 'native' ? network.color : undefined} />
              <div style={{ minWidth: 0 }}>
                <div className="mono small truncate" title={address}>
                  {address}
                </div>
                <div className="faint small">
                  {account?.path} · {trimAmount(available)} {asset?.symbol} available
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={review}
        title="Confirm transfer"
        onClose={() => !sending && setReview(false)}
        actions={
          <>
            <Button variant="ghost" disabled={sending} onClick={() => setReview(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={sending} onClick={submit} icon="send">
              {sending ? 'Signing & broadcasting…' : 'Sign and send'}
            </Button>
          </>
        }
      >
        <div className="stack" style={{ gap: 9 }}>
          <InfoRow label="Asset" value={`${asset?.name ?? network.name} (${asset?.symbol})`} />
          <InfoRow label="Amount" value={`${amount} ${asset?.symbol}`} />
          <InfoRow label="Network" value={network.name} />
          <InfoRow
            label="Fee"
            value={
              estimate
                ? evm
                  ? `${trimAmount(estimate.feeHuman, 8)} ${network.symbol}`
                  : `${estimate.feeSats} sats`
                : 'resolved at broadcast'
            }
          />
          <div>
            <div className="field-label">Recipient</div>
            <div className="address-box">{to}</div>
          </div>
        </div>
        <div className="mt-14">
          <Callout tone="warn" icon="alert">
            Verify the full address above. Crypto transfers cannot be reversed.
          </Callout>
        </div>
      </Modal>

      <Modal
        open={Boolean(result)}
        title="Transaction broadcast"
        onClose={() => setResult(null)}
        actions={
          <Button variant="primary" onClick={() => setResult(null)}>
            Done
          </Button>
        }
      >
        <div className="center" style={{ padding: '6px 0 12px' }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 14,
              margin: '0 auto 12px',
              display: 'grid',
              placeItems: 'center',
              background: 'rgba(52,211,153,0.14)',
              border: '1px solid rgba(52,211,153,0.3)',
              color: 'var(--success)',
            }}
          >
            <Icon name="check" size={20} />
          </div>
          <p className="muted small">Your signed transaction was accepted by the network.</p>
        </div>
        <div className="field-label">Transaction hash</div>
        <div className="address-box">{result?.hash}</div>
        <div className="mt-14">
          <a href={result?.explorer} target="_blank" rel="noreferrer">
            <Button variant="ghost" icon="external">
              Track on explorer
            </Button>
          </a>
        </div>
      </Modal>
    </>
  );
}

function InfoRow({ label, value, mono }) {
  return (
    <div className="row-between">
      <span className="muted small">{label}</span>
      <span className={mono ? 'mono small' : 'small'} style={{ fontWeight: 600 }}>
        {value}
      </span>
    </div>
  );
}
