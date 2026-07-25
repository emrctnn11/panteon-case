import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App.tsx';

describe('App', () => {
  it('mounts and renders the heading', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: /weekly leaderboard/i }),
    ).toBeInTheDocument();
  });
});
