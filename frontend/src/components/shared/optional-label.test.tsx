import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OptionalLabel } from './optional-label';

describe('OptionalLabel', () => {
  test('「任意」ラベルを表示すること', () => {
    render(<OptionalLabel />);
    expect(screen.getByText('CHAT.VIEWER.SAVE_LIBRARY_DIALOG.OPTIONAL')).toHaveClass('bg-bg-secondary');
  });
});
