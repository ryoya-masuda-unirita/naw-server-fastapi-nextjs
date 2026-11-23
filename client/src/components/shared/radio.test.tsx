import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Radio } from './radio';

function RadioGroup({ onHandleChange }: { onHandleChange?: (value: string | number) => void }) {
  const [selected, setSelected] = useState<string | number>('a');
  const handle = (value: string | number) => {
    setSelected(value);
    onHandleChange?.(value);
  };
  return (
    <>
      <Radio name="group" value="a" label="選択肢A" checked={selected === 'a'} onHandleChange={handle} />
      <Radio name="group" value="b" label="選択肢B" checked={selected === 'b'} onHandleChange={handle} />
      <Radio name="group" value="c" label="選択肢C" disabled checked={selected === 'c'} onHandleChange={handle} />
    </>
  );
}

describe('Radio', () => {
  test('選択中のラジオにチェックが付いていること', () => {
    render(<RadioGroup />);
    expect(screen.getByRole('radio', { name: '選択肢A' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '選択肢B' })).not.toBeChecked();
  });

  test('ラベルをクリックすると自分の value を通知すること', async () => {
    const user = userEvent.setup();
    const onHandleChange = vi.fn();
    render(<RadioGroup onHandleChange={onHandleChange} />);

    await user.click(screen.getByText('選択肢B'));

    expect(onHandleChange).toHaveBeenCalledWith('b');
    expect(screen.getByRole('radio', { name: '選択肢B' })).toBeChecked();
  });

  test('disabled のラジオは選べないこと', async () => {
    const user = userEvent.setup();
    const onHandleChange = vi.fn();
    render(<RadioGroup onHandleChange={onHandleChange} />);

    await user.click(screen.getByText('選択肢C'));

    expect(onHandleChange).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: '選択肢C' })).toBeDisabled();
  });

  test('children をラベルの前に表示すること', () => {
    render(
      <Radio name="g" value={1} label="ラベル">
        <strong>前置き</strong>
      </Radio>,
    );
    expect(screen.getByRole('radio', { name: '前置きラベル' })).toBeInTheDocument();
  });
});
