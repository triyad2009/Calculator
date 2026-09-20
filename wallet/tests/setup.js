import { webcrypto } from 'node:crypto';

/**
 * jsdom implements crypto.getRandomValues but not crypto.subtle, and the vault
 * needs AES-GCM + PBKDF2. Node's WebCrypto is spec-compliant, so use it.
 */
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true, writable: true });
}

if (typeof window !== 'undefined') {
  window.matchMedia ??= (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });

  // Silence React's act() noise for effects we do not assert on.
  if (!globalThis.IS_REACT_ACT_ENVIRONMENT) globalThis.IS_REACT_ACT_ENVIRONMENT = true;
}
