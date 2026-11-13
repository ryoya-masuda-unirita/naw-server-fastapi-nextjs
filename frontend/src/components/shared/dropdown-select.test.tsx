import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { queryMatIcon } from './icons/test-helpers';
import { DropdownSelect } from './dropdown-select';
import type { DropdownOption } from './dropdown-select';

const FIXTURE_OPTIONS: DropdownOption[] = [
  { label: 'COMMON.ALL', value: 'all' },
  { label: 'COMMON.ACTIVE', value: 'active', icon: 'check_circle' },
];

function Harness({ onValueChange }: { onValueChange?: (value: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <DropdownSelect
      options={FIXTURE_OPTIONS}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange?.(next);
      }}
    />
  );
}

describe('DropdownSelect', () => {
  test('未選択でプレースホルダーもないとき先頭の選択肢を表示すること', () => {
    render(<Harness />);
    expect(screen.getByText('COMMON.ALL')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  test('選択肢を選ぶと値が変わりパネルが閉じること', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Harness onValueChange={onValueChange} />);

    await user.click(screen.getByText('COMMON.ALL'));
    expect(screen.getAllByRole('option')).toHaveLength(2);
    await user.click(screen.getByRole('option', { name: /COMMON\.ACTIVE/ }));

    expect(onValueChange).toHaveBeenCalledWith('active');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByText('COMMON.ACTIVE')).toBeInTheDocument();
  });

  test('選択中の選択肢にチェックが付くこと', async () => {
    const user = userEvent.setup();
    render(<DropdownSelect options={FIXTURE_OPTIONS} value="active" />);
    await user.click(screen.getByText('COMMON.ACTIVE'));
    const selected = screen.getByRole('option', { name: /COMMON\.ACTIVE/ });
    expect(selected).toHaveAttribute('aria-selected', 'true');
    expect(queryMatIcon(selected, 'check')).not.toBeNull();
  });

  test('背景をクリックすると選ばずに閉じること', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Harness onValueChange={onValueChange} />);
    await user.click(screen.getByText('COMMON.ALL'));

    await user.click(document.querySelector('.cdk-overlay-backdrop')!);

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  test('translateLabels が false のとき文言をそのまま表示すること', () => {
    render(<DropdownSelect options={[{ label: '生の文言', value: 'raw' }]} value="raw" translateLabels={false} />);
    expect(screen.getByText('生の文言')).toBeInTheDocument();
  });
});
