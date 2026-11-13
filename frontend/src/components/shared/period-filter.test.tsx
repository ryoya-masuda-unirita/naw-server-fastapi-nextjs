import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PeriodFilter } from './period-filter';
import type { PeriodChange, PeriodRange } from './period-filter';

const FIXTURE_NOW = new Date(2026, 9, 9, 10, 0); // 2026-10-09（金）
const DESKTOP_WIDTH = 1024;
const MOBILE_WIDTH = 375;

/** 親が value / range を持つ制御コンポーネントとして使う */
function Harness({
  onSelectionChange,
  initialValue = null,
  initialRange = null,
}: {
  onSelectionChange?: (change: PeriodChange) => void;
  initialValue?: string | null;
  initialRange?: PeriodRange | null;
}) {
  const [value, setValue] = useState<string | null>(initialValue);
  const [range, setRange] = useState<PeriodRange | null>(initialRange);
  return (
    <div>
      <button type="button">outside</button>
      <PeriodFilter
        testidPrefix="period"
        value={value}
        range={range}
        onValueChange={setValue}
        onRangeChange={setRange}
        onSelectionChange={onSelectionChange}
      />
    </div>
  );
}

function setWindowWidth(width: number) {
  act(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    window.dispatchEvent(new Event('resize'));
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXTURE_NOW);
  setWindowWidth(DESKTOP_WIDTH);
});

afterEach(() => {
  vi.useRealTimers();
  setWindowWidth(DESKTOP_WIDTH);
});

describe('PeriodFilter', () => {
  describe('初期表示', () => {
    test('未選択のときプレースホルダーを表示すること', () => {
      render(<Harness />);
      expect(screen.getByTestId('period-trigger')).toHaveTextContent('COMMON.PERIOD_FILTER.ALL_PERIODS');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    test('期間指定済みのとき「開始 〜 終了」を表示すること', () => {
      render(<Harness initialValue="custom" initialRange={{ from: '2026/10/01', to: '2026/10/05' }} />);
      expect(screen.getByTestId('period-trigger')).toHaveTextContent('2026/10/01 〜 2026/10/05');
    });

    test('開始日だけ指定済みのとき「開始 以降」を表示すること', () => {
      render(<Harness initialValue="custom" initialRange={{ from: '2026/10/01', to: '' }} />);
      expect(screen.getByTestId('period-trigger')).toHaveTextContent(
        '2026/10/01 COMMON.PERIOD_FILTER.FROM_LABEL',
      );
    });
  });

  describe('プリセットの選択', () => {
    test('プリセットを選ぶと値が変わりパネルが閉じること', async () => {
      const user = userEvent.setup();
      const onSelectionChange = vi.fn();
      render(<Harness onSelectionChange={onSelectionChange} />);

      await user.click(screen.getByTestId('period-trigger'));
      const options = screen.getAllByTestId('period-option');
      expect(options).toHaveLength(4);
      await user.click(options[2]);

      expect(onSelectionChange).toHaveBeenCalledWith({ value: '7days', range: null });
      expect(screen.getByTestId('period-trigger')).toHaveTextContent('COMMON.PERIOD_FILTER.PAST_7_DAYS');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    test('選択中のプリセットに選択済みの印が付くこと', async () => {
      const user = userEvent.setup();
      render(<Harness initialValue="today" />);
      await user.click(screen.getByTestId('period-trigger'));
      expect(screen.getAllByTestId('period-option')[1]).toHaveAttribute('data-selected', 'true');
      expect(screen.getAllByTestId('period-option')[0]).not.toHaveAttribute('data-selected');
    });

    test('クリアボタンで選択を解除できること', async () => {
      const user = userEvent.setup();
      const onSelectionChange = vi.fn();
      render(<Harness initialValue="today" onSelectionChange={onSelectionChange} />);

      const trigger = screen.getByTestId('period-trigger');
      await user.click(trigger.querySelector('button')!);

      expect(onSelectionChange).toHaveBeenCalledWith({ value: '', range: null });
      expect(trigger).toHaveTextContent('COMMON.PERIOD_FILTER.ALL_PERIODS');
      // クリアはトリガーのクリックとして扱わない（パネルを開かない）
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  describe('期間の指定', () => {
    test('カレンダーで開始日と終了日を選んで決定できること', async () => {
      const user = userEvent.setup();
      const onSelectionChange = vi.fn();
      render(<Harness onSelectionChange={onSelectionChange} />);

      await user.click(screen.getByTestId('period-trigger'));
      await user.click(screen.getByTestId('period-custom'));
      expect(screen.getByTestId('period-apply-button')).toBeDisabled();

      await user.click(screen.getByTestId('period-from-input'));
      expect(screen.getByText('COMMON.PERIOD_FILTER.MONTH_FORMAT')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: '3' }));
      expect(screen.getByTestId('period-from-input')).toHaveValue('2026/10/03');

      await user.click(screen.getByTestId('period-to-input'));
      await user.click(screen.getByTestId('period-calendar-today'));
      expect(screen.getByTestId('period-to-input')).toHaveValue('2026/10/09');

      await user.click(screen.getByTestId('period-apply-button'));

      const range = { from: '2026/10/03', to: '2026/10/09' };
      expect(onSelectionChange).toHaveBeenCalledWith({ value: 'custom', range });
      expect(screen.getByTestId('period-trigger')).toHaveTextContent('2026/10/03 〜 2026/10/09');
    });

    test('カレンダーは今月を 1 日の曜日から並べ、月を前後に移動できること', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(screen.getByTestId('period-trigger'));
      await user.click(screen.getByTestId('period-custom'));
      await user.click(screen.getByTestId('period-from-input'));

      // 2026-10-01 は木曜なので、1 行目は空セル 4 つのあとに 1 日が来る
      const firstRowCells = screen.getAllByRole('row')[1].querySelectorAll('td');
      expect(firstRowCells[3]).toHaveTextContent('');
      expect(firstRowCells[4]).toHaveTextContent('1');
      // 今日は強調表示する
      expect(screen.getByRole('button', { name: '9' })).toHaveClass('font-bold', 'text-brand-primary');

      await user.click(screen.getByRole('button', { name: 'COMMON.BACK' }));
      // 2026-09-01 は火曜。30 日まで並ぶ
      expect(screen.getByRole('button', { name: '30' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '31' })).not.toBeInTheDocument();
    });

    test('入力欄のクリアボタンで日付を消せること', async () => {
      const user = userEvent.setup();
      render(<Harness initialValue="custom" initialRange={{ from: '2026/10/01', to: '2026/10/05' }} />);
      await user.click(screen.getByTestId('period-trigger'));
      await user.click(screen.getByTestId('period-custom'));
      expect(screen.getByTestId('period-from-input')).toHaveValue('2026/10/01');

      const fromClear = screen.getByTestId('period-from-input').parentElement!.querySelector('button')!;
      await user.click(fromClear);

      expect(screen.getByTestId('period-from-input')).toHaveValue('');
      expect(screen.getByTestId('period-apply-button')).toBeDisabled();
    });

    test('キャンセルすると入力を捨てて最初の表示に戻ること', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(screen.getByTestId('period-trigger'));
      await user.click(screen.getByTestId('period-custom'));
      await user.click(screen.getByTestId('period-from-input'));
      await user.click(screen.getByTestId('period-calendar-today'));

      await user.click(screen.getByRole('button', { name: 'COMMON.PERIOD_FILTER.CANCEL' }));

      expect(screen.queryByTestId('period-from-input')).not.toBeInTheDocument();
      expect(screen.getAllByTestId('period-option')).toHaveLength(4);
    });

    test('allowCustom が false のとき期間指定を出さないこと', async () => {
      const user = userEvent.setup();
      render(<PeriodFilter testidPrefix="period" allowCustom={false} />);
      await user.click(screen.getByTestId('period-trigger'));
      expect(screen.queryByTestId('period-custom')).not.toBeInTheDocument();
    });
  });

  describe('開閉', () => {
    test('Escape キーで閉じること', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(screen.getByTestId('period-trigger'));
      expect(screen.getByRole('listbox')).toBeInTheDocument();

      fireEvent.keyDown(screen.getByTestId('period-trigger'), { key: 'Escape' });
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    test('部品の外をクリックすると閉じること', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(screen.getByTestId('period-trigger'));
      await user.click(screen.getByRole('button', { name: 'outside' }));
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    test('disabled のとき開かないこと', async () => {
      const user = userEvent.setup();
      render(<PeriodFilter testidPrefix="period" disabled />);
      await user.click(screen.getByTestId('period-trigger'));
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  describe('モバイル表示', () => {
    test('ボトムドロワーで期間指定へ進み、戻るボタンで戻れること', async () => {
      setWindowWidth(MOBILE_WIDTH);
      const user = userEvent.setup();
      render(<Harness />);

      await user.click(screen.getByTestId('period-trigger'));
      await user.click(screen.getByTestId('period-custom'));
      // モバイルはプリセット一覧を消して期間入力だけを出す
      expect(screen.queryByTestId('period-option')).not.toBeInTheDocument();
      expect(screen.getByTestId('period-from-input')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'COMMON.BACK' }));
      expect(screen.getAllByTestId('period-option')).toHaveLength(4);
    });

    test('背景をタップすると閉じること', async () => {
      setWindowWidth(MOBILE_WIDTH);
      const user = userEvent.setup();
      const { container } = render(<Harness />);
      await user.click(screen.getByTestId('period-trigger'));

      await user.click(container.querySelector('.bg-bg-overlay')!);
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });
});
