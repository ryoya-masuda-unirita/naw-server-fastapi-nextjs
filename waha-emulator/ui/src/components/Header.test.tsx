import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Busy, Message } from '../editor/useEditor';
import { Header } from './Header';

function setup(overrides: { busy?: Busy; dirty?: boolean; message?: Message | null } = {}) {
  const handlers = {
    onNameChange: vi.fn(),
    onServiceIdsChange: vi.fn(),
    onValidate: vi.fn(),
    onSave: vi.fn(),
  };
  render(
    <Header
      name="社内QA"
      serviceIds={['a']}
      dirty={overrides.dirty ?? false}
      busy={overrides.busy ?? 'idle'}
      message={overrides.message ?? null}
      {...handlers}
    />,
  );
  return handlers;
}

describe('Header', () => {
  it('名前を変えると通知する', async () => {
    const { onNameChange } = setup();

    await userEvent.type(screen.getByLabelText('名前'), '!');

    expect(onNameChange).toHaveBeenLastCalledWith('社内QA!');
  });

  it('サービス ID を、Enter で追加できる。重複は足さない', async () => {
    const { onServiceIdsChange } = setup();
    const input = screen.getByLabelText('サービス ID を追加');

    await userEvent.type(input, 'b{Enter}');
    await userEvent.type(input, 'a{Enter}');

    expect(onServiceIdsChange).toHaveBeenCalledTimes(1);
    expect(onServiceIdsChange).toHaveBeenCalledWith(['a', 'b']);
  });

  it('サービス ID を削除できる', async () => {
    const { onServiceIdsChange } = setup();

    await userEvent.click(screen.getByRole('button', { name: 'サービス ID aを削除' }));

    expect(onServiceIdsChange).toHaveBeenCalledWith([]);
  });

  it('検証・保存のボタンで通知する', async () => {
    const { onValidate, onSave } = setup();

    await userEvent.click(screen.getByRole('button', { name: '検証' }));
    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(onValidate).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('処理中は、検証・保存を押せない', () => {
    setup({ busy: 'saving' });

    expect(screen.getByRole('button', { name: '検証' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '保存中…' })).toBeDisabled();
  });

  it('未保存のときだけ、未保存の印を出す', () => {
    setup({ dirty: true });

    expect(screen.getByText('● 未保存')).toBeInTheDocument();
  });

  it('未保存でなければ、印を出さない', () => {
    setup({ dirty: false });

    expect(screen.queryByText('● 未保存')).not.toBeInTheDocument();
  });

  it('エラーは alert で、成功は status で出す', () => {
    setup({ message: { kind: 'error', text: 'つなぎ方が不正です' } });

    expect(screen.getByRole('alert')).toHaveTextContent('つなぎ方が不正です');
  });

  it('成功の表示は status になる', () => {
    setup({ message: { kind: 'success', text: '保存しました' } });

    expect(screen.getByRole('status')).toHaveTextContent('保存しました');
  });
});
