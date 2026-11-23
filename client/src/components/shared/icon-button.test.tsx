import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { IconButton } from './icon-button';

describe('IconButton', () => {
  test('variant と size のクラスが付いたボタンになること', () => {
    render(
      <IconButton variant="secondary-gray" size="large" ariaLabel="編集">
        <span>i</span>
      </IconButton>,
    );
    expect(screen.getByRole('button', { name: '編集' })).toHaveClass(
      'icon-button',
      'icon-button-secondary-gray',
      'w-9',
      'h-9',
    );
  });

  test('クリックで onClick が呼ばれ、無効のときは呼ばれないこと', async () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <IconButton ariaLabel="削除" onClick={onClick}>
        <span>i</span>
      </IconButton>,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <IconButton ariaLabel="削除" onClick={onClick} disabled>
        <span>i</span>
      </IconButton>,
    );
    expect(screen.getByRole('button')).toBeDisabled();
  });

  test('link を指定するとリンクになること', () => {
    render(
      <MemoryRouter>
        <IconButton link="/admin/users" ariaLabel="ユーザー">
          <span>i</span>
        </IconButton>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'ユーザー' })).toHaveAttribute('href', '/admin/users');
  });

  test('file タイプでファイルを選ぶと onFileChange が呼ばれること', async () => {
    const onFileChange = vi.fn();
    const { container } = render(
      <IconButton type="file" multiple onFileChange={onFileChange}>
        <span>i</span>
      </IconButton>,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['a'], 'a.txt', { type: 'text/plain' });
    await userEvent.upload(input, file);
    expect(onFileChange).toHaveBeenCalledTimes(1);
    expect(onFileChange.mock.calls[0][0][0]).toBe(file);
  });
});
