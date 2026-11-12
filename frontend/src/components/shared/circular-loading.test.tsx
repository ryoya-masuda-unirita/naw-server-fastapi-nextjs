import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CircularLoading } from './circular-loading';

describe('CircularLoading', () => {
  test('回転するローディング表示を出すこと', () => {
    render(<CircularLoading className="mx-auto" />);
    const spinner = screen.getByLabelText('読み込み中');
    expect(spinner).toHaveClass('animate-spin');
    expect(spinner.closest('.app-circular-loading')).toHaveClass('mx-auto');
  });
});
