import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Loading } from './loading';

describe('Loading', () => {
  test('ロゴと読み込み中の文言を表示すること', () => {
    render(<Loading />);
    expect(screen.getByRole('img', { name: 'Loading' })).toHaveAttribute('src', '/logo-min.svg');
    expect(screen.getByRole('heading', { name: 'CHAT.LOADING' })).toBeInTheDocument();
  });

  test('showMessage が false のとき文言を出さないこと', () => {
    render(<Loading showMessage={false} />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  test('size に応じてロゴと文言の間隔が変わること', () => {
    render(<Loading size="lg" message="COMMON.LOADING" />);
    expect(screen.getByRole('heading', { name: 'COMMON.LOADING' }).parentElement).toHaveClass('gap-8');
  });
});
