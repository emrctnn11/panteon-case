import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App.tsx';

describe('App', () => {
  beforeEach(() => {
    // No live server in this test — keep the query hooks deterministic
    // instead of letting them fire real network requests.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network disabled in tests'))),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mounts and renders the heading', () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
    );
    expect(
      screen.getByRole('heading', { name: /weekly leaderboard/i }),
    ).toBeInTheDocument();
  });
});
