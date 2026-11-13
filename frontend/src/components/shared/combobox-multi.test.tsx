import { describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComboboxMulti } from './combobox-multi';
import type { SelectOption } from './types';

const FIXTURE_OPTIONS: SelectOption[] = [
  { label: '営業チーム', value: 'sales' },
  { label: '開発チーム', value: 'dev', description: 'プロダクト開発', category: '技術' },
  { label: '人事チーム', value: 'hr' },
];

const FIXTURE_ID = 'teams';

function renderCombobox(props: Partial<Parameters<typeof ComboboxMulti<string>>[0]> = {}) {
  return render(
    <ComboboxMulti id={FIXTURE_ID} name="teams" options={FIXTURE_OPTIONS} testidPrefix="team" {...props} />,
  );
}

async function openCombobox() {
  const user = userEvent.setup();
  await user.click(screen.getByTestId('team-trigger'));
  await screen.findByRole('listbox');
  return user;
}

describe('ComboboxMulti', () => {
  describe('初期表示', () => {
    test('見出し・バッジ・補足・エラーが表示されること', () => {
      renderCombobox({ label: '所属チーム', badgeText: '任意', supportText: '補足', errorMessage: '必須です' });
      expect(screen.getByText('所属チーム')).toBeInTheDocument();
      expect(screen.getByText('任意')).toBeInTheDocument();
      expect(screen.getByText('補足')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent('必須です');
    });

    test('未選択なら検索欄にプレースホルダーが表示されること', () => {
      renderCombobox();
      expect(screen.getByRole('combobox')).toHaveAttribute('placeholder', '選択してください');
    });

    test('選択済みの値がチップで表示されること', () => {
      renderCombobox({ value: ['sales'] });
      expect(screen.getByText('営業チーム')).toBeInTheDocument();
      expect(screen.getByRole('combobox')).toHaveAttribute('placeholder', '');
    });
  });

  describe('検索と選択', () => {
    test('トリガーをクリックすると選択肢が開くこと', async () => {
      renderCombobox();
      await openCombobox();
      expect(screen.getAllByTestId('team-option')).toHaveLength(3);
    });

    test('ラベル・説明・カテゴリで絞り込めること', async () => {
      renderCombobox();
      const user = await openCombobox();
      await user.type(screen.getByRole('combobox'), '技術');
      expect(screen.getAllByTestId('team-option')).toHaveLength(1);
      expect(screen.getByTestId('team-option')).toHaveTextContent('開発チーム');
    });

    test('一致する選択肢がなければ空の文言が出ること', async () => {
      renderCombobox();
      const user = await openCombobox();
      await user.type(screen.getByRole('combobox'), 'zzz');
      expect(screen.getByText('表示するデータがありません')).toBeInTheDocument();
    });

    test('選択は確定するまで通知されず、確定すると値と commit が通知されること', async () => {
      const onValueChange = vi.fn();
      const onCommit = vi.fn();
      renderCombobox({ onValueChange, onCommit });
      const user = await openCombobox();
      await user.click(screen.getByRole('option', { name: '人事チーム' }));
      expect(screen.getByRole('option', { name: '人事チーム' })).toHaveAttribute('aria-selected', 'true');
      expect(onValueChange).not.toHaveBeenCalled();
      await user.click(screen.getByTestId('team-confirm-button'));
      expect(onValueChange).toHaveBeenCalledWith(['hr']);
      expect(onCommit).toHaveBeenCalledWith(['hr']);
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(screen.getByText('人事チーム')).toBeInTheDocument();
    });

    test('キャンセルすると仮の選択が捨てられること', async () => {
      const onValueChange = vi.fn();
      const onCommit = vi.fn();
      renderCombobox({ value: ['sales'], onValueChange, onCommit });
      const user = await openCombobox();
      await user.click(screen.getByRole('option', { name: '人事チーム' }));
      await user.click(screen.getByRole('button', { name: 'COMMON.CANCEL' }));
      expect(onValueChange).not.toHaveBeenCalled();
      expect(onCommit).not.toHaveBeenCalled();
      expect(screen.queryByText('人事チーム')).not.toBeInTheDocument();
      expect(screen.getByText('営業チーム')).toBeInTheDocument();
    });

    test('すべて選択は絞り込み中の選択肢だけを対象にすること', async () => {
      const onCommit = vi.fn();
      renderCombobox({ onCommit });
      const user = await openCombobox();
      await user.type(screen.getByRole('combobox'), '営業');
      await user.click(screen.getByRole('button', { name: 'COMMON.SELECT_ALL' }));
      expect(screen.getByRole('button', { name: 'COMMON.RELEASE_ALL' })).toHaveAttribute('data-state', 'true');
      await user.click(screen.getByTestId('team-confirm-button'));
      expect(onCommit).toHaveBeenCalledWith(['sales']);
    });

    test('外側をクリックすると仮の選択を捨てて閉じること', async () => {
      const onCommit = vi.fn();
      render(
        <div>
          <button type="button">outside</button>
          <ComboboxMulti id={FIXTURE_ID} name="teams" options={FIXTURE_OPTIONS} testidPrefix="team" onCommit={onCommit} />
        </div>,
      );
      const user = await openCombobox();
      await user.click(screen.getByRole('option', { name: '営業チーム' }));
      await user.click(screen.getByRole('button', { name: 'outside' }));
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(onCommit).not.toHaveBeenCalled();
    });
  });

  describe('チップの削除', () => {
    test('閉じているときにチップを削除するとすぐに確定されること', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      const onCommit = vi.fn();
      renderCombobox({ value: ['sales', 'hr'], onValueChange, onCommit });
      await user.click(screen.getAllByRole('button', { name: '削除' })[0]);
      expect(onValueChange).toHaveBeenCalledWith(['hr']);
      expect(onCommit).toHaveBeenCalledWith(['hr']);
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  describe('キーボード操作', () => {
    test('Escape キーで閉じること', async () => {
      renderCombobox();
      await openCombobox();
      fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    });
  });

  describe('無効状態', () => {
    test('disabled のときは開かず、検索欄も無効になること', async () => {
      const user = userEvent.setup();
      renderCombobox({ disabled: true });
      expect(screen.getByRole('combobox')).toBeDisabled();
      expect(screen.getByTestId('team-trigger')).toHaveClass('combobox-trigger--disabled');
      await user.click(screen.getByTestId('team-trigger'));
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    test('error のときはエラー枠になること', () => {
      renderCombobox({ error: true });
      expect(screen.getByTestId('team-trigger')).toHaveClass('combobox-trigger--error');
    });
  });
});
