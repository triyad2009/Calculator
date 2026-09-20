// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App.jsx';

/**
 * End-to-end smoke test of the real UI: it renders the app, creates a wallet
 * through the actual three-step flow (which runs real BIP39 generation, the
 * backup quiz and AES-GCM vault encryption), and lands on the dashboard.
 *
 * Network calls are stubbed to fail — the app must degrade gracefully rather
 * than crash, which is itself part of what this asserts.
 */

/** Render and let the provider's boot effect settle before asserting. */
async function renderApp() {
  let api;
  await act(async () => {
    api = render(<App />);
  });
  return api;
}

const readSeedWords = (container) =>
  [...container.querySelectorAll('.seed-word')].map((el) => el.querySelectorAll('span')[1].textContent.trim());

// vitest runs with globals:false, which disables testing-library's automatic
// cleanup, so unmount explicitly or renders leak between tests.
afterEach(cleanup);

beforeEach(() => {
  // HashRouter derives the route from window.location.hash, which persists in
  // the jsdom document between renders — reset it so every test starts at '/'.
  window.location.hash = '';
  localStorage.clear();
  // Every external call fails; the UI must still work.
  globalThis.fetch = vi.fn(async () => {
    throw new Error('network unavailable in test');
  });
  vi.stubGlobal('matchMedia', (query) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
});

describe('NexVault UI', () => {
  it('renders the landing page and offers both onboarding paths', async () => {
    await renderApp();
    expect(screen.getByRole('heading', { name: /never sees your keys/i })).toBeTruthy();
    expect((await screen.findAllByRole('link', { name: /create a new wallet/i })).length).toBeGreaterThan(0);
    expect((await screen.findAllByRole('link', { name: /i have a recovery phrase/i })).length).toBeGreaterThan(0);
    // All configured networks are advertised.
    expect(screen.getByText('Ethereum')).toBeTruthy();
    expect(screen.getByText('Bitcoin')).toBeTruthy();
  });

  it('creates a wallet end to end and reaches the dashboard', async () => {
    const user = userEvent.setup();
    const { container } = await renderApp();

    await user.click((await screen.findAllByRole('link', { name: /create a new wallet/i }))[0]);
    expect(await screen.findByRole('heading', { name: /create your wallet/i })).toBeTruthy();

    // Step 1 — generate a 12-word phrase.
    await user.click(screen.getByRole('button', { name: /generate phrase/i }));
    await waitFor(() => expect(container.querySelectorAll('.seed-word')).toHaveLength(12));

    const words = readSeedWords(container);
    expect(words).toHaveLength(12);
    expect(words.every((w) => /^[a-z]+$/.test(w))).toBe(true);

    // Step 2 — answer the three backup questions.
    const prompts = screen.getAllByRole('textbox');
    expect(prompts).toHaveLength(3);
    for (const input of prompts) {
      const label = input.closest('label').querySelector('.field-label').textContent;
      const index = Number(label.match(/Word #(\d+)/)[1]) - 1;
      await user.type(input, words[index]);
    }
    await user.click(screen.getByRole('button', { name: /^continue$/i }));

    // Step 3 — set the vault password.
    const passwords = screen.getAllByLabelText(/password/i);
    await user.type(passwords[0], 'hunter2hunter2');
    await user.type(passwords[1], 'hunter2hunter2');
    await user.click(screen.getByRole('button', { name: /create wallet/i }));

    // We land on the portfolio view, with the wallet's address shown.
    expect(await screen.findByRole('heading', { name: /portfolio/i }, { timeout: 20000 })).toBeTruthy();
    expect(screen.getByText(/total balance/i)).toBeTruthy();

    // The vault was really written, and it does not contain the plaintext phrase.
    const stored = localStorage.getItem('nexvault.vault.v1');
    expect(stored).toBeTruthy();
    expect(stored).not.toContain(words[0]);
    expect(JSON.parse(stored).kdf).toBe('PBKDF2-SHA256');

    // Balances/prices failed (fetch is stubbed) but the UI stayed up and said so.
    await waitFor(() => expect(screen.getAllByText(/could not load balances|price feed unavailable/i).length).toBeGreaterThan(0), {
      timeout: 15000,
    });
  });

  it('rejects a mistyped backup word', async () => {
    const user = userEvent.setup();
    const { container } = await renderApp();
    await user.click((await screen.findAllByRole('link', { name: /create a new wallet/i }))[0]);
    await user.click(await screen.findByRole('button', { name: /generate phrase/i }));
    await waitFor(() => expect(container.querySelectorAll('.seed-word')).toHaveLength(12));

    const prompts = screen.getAllByRole('textbox');
    for (const input of prompts) await user.type(input, 'zzzzzzzz');

    const next = screen.getByRole('button', { name: /^continue$/i });
    expect(next.disabled).toBe(true);
    expect(screen.getByText(/fill in the three words above/i)).toBeTruthy();
  });

  it('validates an imported phrase before enabling the button', async () => {
    const user = userEvent.setup();
    await renderApp();
    await new Promise(r => setTimeout(r, 120));
    await user.click((await screen.findAllByRole('link', { name: /i have a recovery phrase/i }))[0]);
    expect(await screen.findByRole('heading', { name: /import a wallet/i })).toBeTruthy();

    const textarea = screen.getByRole('textbox');
    const submit = screen.getByRole('button', { name: /import wallet/i });
    expect(submit.disabled).toBe(true);

    await user.type(textarea, 'abandon abandon abandon');
    expect(screen.getByText(/12, 15, 18, 21 or 24/i)).toBeTruthy();
    expect(submit.disabled).toBe(true);

    textarea.value = '';
    await user.clear(textarea);
    await user.type(textarea, 'abandon '.repeat(11).trim() + ' about');
    expect(await screen.findByText(/valid 12-word phrase/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /import wallet/i }).disabled).toBe(false);
  });

  it('keeps the vault locked behind a password on return', async () => {
    const user = userEvent.setup();
    const { container, unmount } = await renderApp();
    await user.click((await screen.findAllByRole('link', { name: /create a new wallet/i }))[0]);
    await user.click(await screen.findByRole('button', { name: /generate phrase/i }));
    await waitFor(() => expect(container.querySelectorAll('.seed-word')).toHaveLength(12));

    for (const input of screen.getAllByRole('textbox')) {
      const index = Number(input.closest('label').querySelector('.field-label').textContent.match(/#(\d+)/)[1]) - 1;
      await user.type(input, readSeedWords(container)[index]);
    }
    await user.click(screen.getByRole('button', { name: /^continue$/i }));
    const passwords = screen.getAllByLabelText(/password/i);
    await user.type(passwords[0], 'a-strong-passphrase');
    await user.type(passwords[1], 'a-strong-passphrase');
    await user.click(screen.getByRole('button', { name: /create wallet/i }));
    await screen.findByRole('heading', { name: /portfolio/i }, { timeout: 20000 });
    unmount();

    // A fresh visit finds the vault and asks for the password.
    await renderApp();
    await user.click(await screen.findByRole('button', { name: /^unlock$/i }));
    expect(await screen.findByRole('heading', { name: /welcome back/i })).toBeTruthy();

    await user.type(await screen.findByPlaceholderText('Your password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /^unlock$/i }));
    expect(await screen.findByText(/incorrect password/i, {}, { timeout: 20000 })).toBeTruthy();
  });
});
