import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DateRangeSelect } from './date-range-select';
import type { DateRangeChange, DateRangeOption, DateRangeValue } from './date-range-select';

const FIXTURE_OPTIONS: DateRangeOption[] = [
  { label: 'COMMON.PERIOD_FILTER.ALL_PERIODS', value: 'all' },
  { label: 'COMMON.PERIOD_FILTER.TODAY', value: 'today' },
];

function Harness({
  onHandleChange,
  initialPeriod = 'all',
  initialRange = null,
}: {
  onHandleChange?: (change: DateRangeChange) => void;
  initialPeriod?: string;
  initialRange?: DateRangeValue | null;
}) {
  const [period, setPeriod] = useState(initialPeriod);
  const [customRange, setCustomRange] = useState<DateRangeValue | null>(initialRange);
  return (
    <DateRangeSelect
      options={FIXTURE_OPTIONS}
      period={period}
      customRange={customRange}
      onPeriodChange={setPeriod}
      onCustomRangeChange={setCustomRange}
      onHandleChange={onHandleChange}
    />
  );
}

describe('DateRangeSelect', () => {
  test('選択中の期間の文言を表示すること', () => {
    render(<Harness />);
    expect(screen.getByText('COMMON.PERIOD_FILTER.ALL_PERIODS')).toBeInTheDocument();
  });

  test('プリセットを選ぶと期間が変わりパネルが閉じること', async () => {
    const user = userEvent.setup();
    const onHandleChange = vi.fn();
    render(<Harness onHandleChange={onHandleChange} />);

    await user.click(screen.getByText('COMMON.PERIOD_FILTER.ALL_PERIODS'));
    await user.click(screen.getByText('COMMON.PERIOD_FILTER.TODAY'));

    expect(onHandleChange).toHaveBeenCalledWith({ period: 'today' });
    expect(screen.queryByText('COMMON.SPECIFY_PERIOD')).not.toBeInTheDocument();
    expect(screen.getByText('COMMON.PERIOD_FILTER.TODAY')).toBeInTheDocument();
  });

  test('「期間を指定」にホバーして日付を入れて適用できること', async () => {
    const user = userEvent.setup();
    const onHandleChange = vi.fn();
    render(<Harness onHandleChange={onHandleChange} />);

    await user.click(screen.getByText('COMMON.PERIOD_FILTER.ALL_PERIODS'));
    await user.hover(screen.getByText('COMMON.SPECIFY_PERIOD'));
    const apply = screen.getByRole('button', { name: 'COMMON.APPLY' });
    expect(apply).toBeDisabled();

    fireEvent.change(screen.getByLabelText('COMMON.START_DATE'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('COMMON.END_DATE'), { target: { value: '2026-10-05' } });
    await user.click(apply);

    const customRange = { start: '2026-10-01', end: '2026-10-05' };
    expect(onHandleChange).toHaveBeenCalledWith({ period: 'custom', customRange });
    expect(screen.getByText('2026-10-01 ~ 2026-10-05')).toBeInTheDocument();
  });

  test('期間指定済みでサブメニューを開くと指定中の日付が入っていること', async () => {
    const user = userEvent.setup();
    render(<Harness initialPeriod="custom" initialRange={{ start: '2026-10-01', end: '2026-10-05' }} />);
    await user.click(screen.getByText('2026-10-01 ~ 2026-10-05'));
    await user.hover(screen.getByText('COMMON.SPECIFY_PERIOD'));
    expect(screen.getByLabelText('COMMON.START_DATE')).toHaveValue('2026-10-01');
    expect(screen.getByLabelText('COMMON.END_DATE')).toHaveValue('2026-10-05');
  });

  test('選択をクリアすると全期間（all）に戻ること', async () => {
    const user = userEvent.setup();
    const onHandleChange = vi.fn();
    render(
      <Harness
        initialPeriod="custom"
        initialRange={{ start: '2026-10-01', end: '2026-10-05' }}
        onHandleChange={onHandleChange}
      />,
    );
    await user.click(screen.getByText('2026-10-01 ~ 2026-10-05'));
    await user.hover(screen.getByText('COMMON.SPECIFY_PERIOD'));
    await user.click(screen.getByRole('button', { name: 'COMMON.CLEAR_SELECTION' }));

    expect(onHandleChange).toHaveBeenCalledWith({ period: 'all' });
    expect(screen.getByText('COMMON.PERIOD_FILTER.ALL_PERIODS')).toBeInTheDocument();
  });

  test('ほかの選択肢にホバーするとサブメニューが閉じること', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText('COMMON.PERIOD_FILTER.ALL_PERIODS'));
    await user.hover(screen.getByText('COMMON.SPECIFY_PERIOD'));
    expect(screen.getByLabelText('COMMON.START_DATE')).toBeInTheDocument();

    await user.hover(screen.getByText('COMMON.PERIOD_FILTER.TODAY'));
    expect(screen.queryByLabelText('COMMON.START_DATE')).not.toBeInTheDocument();
  });
});
