import { afterEach, describe, expect, test, vi } from 'vitest';
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


/** 1 行に並べられるチップ（と +N バッジ）の数 */
const CHIPS_PER_LINE = 4;
const LINE_HEIGHT_PX = 24;
/** 1 行に収まると、欄の中で上下中央に寄って offsetTop がずれる分 */
const CENTERING_OFFSET_PX = 8;
const ROW_CLIENT_WIDTH_PX = 300;

const MANY_OPTIONS: SelectOption[] = Array.from({ length: 7 }, (_, i) => ({
  label: `チーム${i + 1}`,
  value: `t${i + 1}`,
}));
const MANY_VALUES = MANY_OPTIONS.map((o) => o.value);

/**
 * jsdom はレイアウトを計算せず offsetTop が常に 0 になるため、チップの折り返しを模す。
 * 見えているチップ・バッジを CHIPS_PER_LINE 個ずつ並べ、1 行に収まったときは全体を上下中央に寄せる
 * （移植元の不具合の条件。隠した結果 1 行になると、1 つ目のチップの位置が変わる）。
 */
function mockChipLayout() {
  vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
    const row = this.closest('[data-cmulti-chips]');
    if (!row) return 0;
    const items = Array.from(row.querySelectorAll<HTMLElement>('[data-chip-el], [data-overflow-badge-el]')).filter(
      (el) => !el.hasAttribute('hidden'),
    );
    const index = items.indexOf(this);
    if (index < 0) return 0;
    const oneLine = items.length <= CHIPS_PER_LINE;
    return Math.floor(index / CHIPS_PER_LINE) * LINE_HEIGHT_PX + (oneLine ? CENTERING_OFFSET_PX : 0);
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(ROW_CLIENT_WIDTH_PX);
}

function chipsRow(container: HTMLElement): HTMLElement {
  return container.querySelector<HTMLElement>('[data-cmulti-chips]')!;
}

function visibleChipCount(container: HTMLElement): number {
  return Array.from(container.querySelectorAll('[data-chip-el]')).filter((el) => !el.hasAttribute('hidden')).length;
}

function overflowBadgeText(container: HTMLElement): string | null {
  return container.querySelector('[data-overflow-badge-el]')?.textContent ?? null;
}

/** 欄（トリガー）の位置を差し替えられるようにする。bottom を変えて、一覧の付け直しを確かめる */
function mockTriggerRect(trigger: HTMLElement, initialBottom: number) {
  const rect = { bottom: initialBottom };
  trigger.getBoundingClientRect = () =>
    ({ top: 0, bottom: rect.bottom, left: 0, right: 300, width: 300, height: rect.bottom, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  return rect;
}

function nextFrames(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
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
  describe('閉じている欄のチップ', () => {
    afterEach(() => vi.restoreAllMocks());

    test('1 行に入るだけのチップを出し、残りを +N で出すこと（2 つ目以降をすべて +N にしない）', async () => {
      mockChipLayout();
      const { container } = renderCombobox({ options: MANY_OPTIONS, value: MANY_VALUES });
      await waitFor(() => expect(overflowBadgeText(container)).toBe('+4'));
      expect(visibleChipCount(container)).toBe(3);
    });

    test('一覧を開いて［決定］で閉じても、同じだけチップを出し、残りを +N で出すこと', async () => {
      mockChipLayout();
      const { container } = renderCombobox({ options: MANY_OPTIONS, value: MANY_VALUES });
      await waitFor(() => expect(overflowBadgeText(container)).toBe('+4'));
      const user = await openCombobox();
      await user.click(screen.getByTestId('team-confirm-button'));
      await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
      await waitFor(() => expect(overflowBadgeText(container)).toBe('+4'));
      expect(visibleChipCount(container)).toBe(3);
    });

    test('+N が折り返すときは、収まるまで末尾のチップを隠すこと', async () => {
      mockChipLayout();
      const { container } = renderCombobox({ options: MANY_OPTIONS, value: MANY_VALUES.slice(0, 5) });
      await waitFor(() => expect(overflowBadgeText(container)).toBe('+2'));
      expect(visibleChipCount(container)).toBe(3);
    });

    test('全部が 1 行に入るときは、すべて出し、+N を出さないこと', async () => {
      mockChipLayout();
      const { container } = renderCombobox({ options: MANY_OPTIONS, value: MANY_VALUES.slice(0, 3) });
      await waitFor(() => expect(visibleChipCount(container)).toBe(3));
      expect(overflowBadgeText(container)).toBeNull();
    });
  });

  describe('一覧を開き直したときのチップの欄', () => {
    afterEach(() => vi.restoreAllMocks());

    test('+N になった後に開くと、すべてのチップと入力欄を出し、+N を消し、名前で絞り込めること', async () => {
      mockChipLayout();
      const { container } = renderCombobox({ options: MANY_OPTIONS, value: MANY_VALUES });
      await waitFor(() => expect(overflowBadgeText(container)).toBe('+4'));
      // 閉じている間は、1 行に収めるために入力欄を隠している
      expect(screen.getByRole('combobox', { hidden: true })).toHaveAttribute('hidden');

      const user = await openCombobox();

      expect(overflowBadgeText(container)).toBeNull();
      expect(visibleChipCount(container)).toBe(7);
      expect(screen.getByRole('combobox')).not.toHaveAttribute('hidden');
      await user.type(screen.getByRole('combobox'), 'チーム3');
      expect(screen.getAllByTestId('team-option')).toHaveLength(1);
    });
  });

  describe('一覧を開いている間のチップの欄', () => {
    afterEach(() => vi.restoreAllMocks());

    test('高さの上限を指定すると、開いている間だけ欄の高さに上限を付けて中でスクロールさせること', async () => {
      const { container } = renderCombobox({ scrollChipsWhenOpen: true, value: ['sales'] });
      expect(chipsRow(container)).not.toHaveClass('max-h-24');
      const user = await openCombobox();
      expect(chipsRow(container)).toHaveClass('max-h-24', 'overflow-y-auto');
      await user.keyboard('{Escape}');
      await waitFor(() => expect(chipsRow(container)).not.toHaveClass('max-h-24'));
      expect(chipsRow(container)).not.toHaveClass('overflow-y-auto');
    });

    test('高さの上限を指定しなければ、開いても欄の高さに上限を付けないこと', async () => {
      const { container } = renderCombobox({ value: ['sales'] });
      await openCombobox();
      expect(chipsRow(container)).not.toHaveClass('max-h-24');
      expect(chipsRow(container)).not.toHaveClass('overflow-y-auto');
    });

    test('高さの上限を指定すると、候補を選ぶたびに欄を末尾までスクロールすること', async () => {
      const SCROLL_HEIGHT_PX = 500;
      vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(SCROLL_HEIGHT_PX);
      const { container } = renderCombobox({ scrollChipsWhenOpen: true });
      const assigned: number[] = [];
      Object.defineProperty(chipsRow(container), 'scrollTop', {
        configurable: true,
        get: () => 0,
        set: (value: number) => assigned.push(value),
      });
      const user = await openCombobox();
      assigned.length = 0;

      await user.click(screen.getByRole('option', { name: '営業チーム' }));
      expect(assigned[assigned.length - 1]).toBe(SCROLL_HEIGHT_PX);
      assigned.length = 0;
      await user.click(screen.getByRole('option', { name: '人事チーム' }));
      expect(assigned[assigned.length - 1]).toBe(SCROLL_HEIGHT_PX);
    });

    test('高さの上限を指定すると、候補を選んで欄が高くなったら、一覧を欄の下端に付け直すこと', async () => {
      renderCombobox({ scrollChipsWhenOpen: true });
      const rect = mockTriggerRect(screen.getByTestId('team-trigger'), 100);
      const user = await openCombobox();
      await waitFor(() => expect(screen.getByRole('listbox')).toHaveStyle({ top: '100px' }));

      rect.bottom = 180; // 選んでチップが増え、欄が高くなった
      await user.click(screen.getByRole('option', { name: '営業チーム' }));

      await waitFor(() => expect(screen.getByRole('listbox')).toHaveStyle({ top: '180px' }));
    });

    test('高さの上限を指定しなければ、候補を選んでも一覧の位置を付け直さないこと', async () => {
      renderCombobox();
      const rect = mockTriggerRect(screen.getByTestId('team-trigger'), 100);
      const user = await openCombobox();
      await waitFor(() => expect(screen.getByRole('listbox')).toHaveStyle({ top: '100px' }));

      rect.bottom = 180;
      await user.click(screen.getByRole('option', { name: '営業チーム' }));
      await nextFrames();

      expect(screen.getByRole('listbox')).toHaveStyle({ top: '100px' });
    });
  });
});
