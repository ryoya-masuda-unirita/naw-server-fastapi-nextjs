import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardPage } from './dashboard';

describe('DashboardPage', () => {
  describe('初期表示', () => {
    test('見出しが表示されること', () => {
      render(<DashboardPage />);
      expect(screen.getByRole('heading', { name: 'SIDEBAR.DASHBOARD' })).toBeInTheDocument();
    });
  });
});
