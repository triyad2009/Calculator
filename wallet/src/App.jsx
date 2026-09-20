import React from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { WalletProvider, useWallet } from './context/WalletProvider.jsx';
import { Layout, AuthLayout } from './components/Layout.jsx';
import { Loading } from './components/ui.jsx';
import { isCryptoAvailable } from './lib/vault.js';

import Landing from './pages/Landing.jsx';
import CreateWallet from './pages/CreateWallet.jsx';
import ImportWallet from './pages/ImportWallet.jsx';
import Unlock from './pages/Unlock.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Send from './pages/Send.jsx';
import Receive from './pages/Receive.jsx';
import Activity from './pages/Activity.jsx';
import Settings from './pages/Settings.jsx';
import NotFound from './pages/NotFound.jsx';

/** Wraps routes that require an unlocked wallet. */
function Protected({ children }) {
  const { status } = useWallet();
  const location = useLocation();

  if (status === 'checking') return <Loading label="Checking vault…" />;
  if (status === 'empty') return <Navigate to="/" replace />;
  if (status === 'locked') return <Navigate to="/unlock" replace state={{ from: location.pathname }} />;
  return <Layout>{children}</Layout>;
}

/** Wraps the create/import screens: skip them if a wallet is already set up. */
function Onboarding({ children }) {
  const { status } = useWallet();
  if (status === 'checking') return <Loading label="Checking vault…" />;
  if (status === 'unlocked') return <Navigate to="/dashboard" replace />;
  if (status === 'locked') return <Navigate to="/unlock" replace />;
  return <AuthLayout>{children}</AuthLayout>;
}

function CryptoGuard({ children }) {
  if (!isCryptoAvailable()) {
    return (
      <div className="landing">
        <div className="card center" style={{ marginTop: 60, padding: 40 }}>
          <h2 style={{ marginBottom: 10 }}>Secure context required</h2>
          <p className="muted" style={{ maxWidth: 520, margin: '0 auto' }}>
            NexVault derives and encrypts keys with the Web Crypto API, which browsers only expose over
            <strong> HTTPS</strong> or <strong>localhost</strong>. Please open this page on a secure origin.
          </p>
        </div>
      </div>
    );
  }
  return children;
}

function Router() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route
        path="/create"
        element={
          <Onboarding>
            <CreateWallet />
          </Onboarding>
        }
      />
      <Route
        path="/import"
        element={
          <Onboarding>
            <ImportWallet />
          </Onboarding>
        }
      />
      <Route
        path="/unlock"
        element={
          <AuthLayout>
            <Unlock />
          </AuthLayout>
        }
      />
      <Route
        path="/dashboard"
        element={
          <Protected>
            <Dashboard />
          </Protected>
        }
      />
      <Route
        path="/send"
        element={
          <Protected>
            <Send />
          </Protected>
        }
      />
      <Route
        path="/receive"
        element={
          <Protected>
            <Receive />
          </Protected>
        }
      />
      <Route
        path="/activity"
        element={
          <Protected>
            <Activity />
          </Protected>
        }
      />
      <Route
        path="/settings"
        element={
          <Protected>
            <Settings />
          </Protected>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <CryptoGuard>
          <Router />
        </CryptoGuard>
      </HashRouter>
    </WalletProvider>
  );
}
