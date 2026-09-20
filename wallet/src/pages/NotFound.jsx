import React from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState } from '../components/ui.jsx';

export default function NotFound() {
  return (
    <div className="landing">
      <div style={{ paddingTop: 70 }}>
        <EmptyState
          icon="alert"
          title="Page not found"
          action={
            <Link to="/">
              <Button variant="primary" icon="wallet">
                Back to NexVault
              </Button>
            </Link>
          }
        >
          That route does not exist in this wallet.
        </EmptyState>
      </div>
    </div>
  );
}
