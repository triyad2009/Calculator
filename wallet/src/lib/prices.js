/**
 * USD price data from the public CoinGecko API (no key required, CORS enabled).
 * Results are cached in-memory for the session so navigating around the app
 * does not hammer the rate limit.
 */

const CACHE_TTL_MS = 60_000;
let cache = { at: 0, data: null };
let inflight = null;

const API = 'https://api.coingecko.com/api/v3';

export async function fetchPrices(ids) {
  const now = Date.now();
  if (cache.data && now - cache.at < CACHE_TTL_MS) return cache.data;
  if (inflight) return inflight;

  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};

  inflight = (async () => {
    try {
      const url = `${API}/simple/price?ids=${encodeURIComponent(unique.join(','))}&vs_currencies=usd&include_24hr_change=true`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      cache = { at: Date.now(), data };
      return data;
    } catch (err) {
      // Keep serving stale data rather than blanking the UI on a rate limit.
      if (cache.data) return cache.data;
      throw err;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export const usdPrice = (prices, coingeckoId) => {
  const entry = prices?.[coingeckoId];
  return typeof entry?.usd === 'number' ? entry.usd : null;
};

export const change24h = (prices, coingeckoId) => {
  const entry = prices?.[coingeckoId];
  return typeof entry?.usd_24h_change === 'number' ? entry.usd_24h_change : null;
};

export function invalidatePriceCache() {
  cache = { at: 0, data: null };
}
