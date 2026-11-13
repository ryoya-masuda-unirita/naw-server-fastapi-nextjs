import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CircularProgress } from './circular-progress';

const CIRCUMFERENCE = 2 * Math.PI * 50;

function progressCircle(container: HTMLElement): SVGCircleElement {
  return container.querySelectorAll('circle')[1] as SVGCircleElement;
}

describe('CircularProgress', () => {
  test('使用量と上限を 3 桁区切りで表示すること', () => {
    render(<CircularProgress current={12345} limit={100000} />);
    expect(screen.getByText('今月の使用量')).toBeInTheDocument();
    expect(screen.getByText('12,345')).toBeInTheDocument();
    expect(screen.getByText('上限100,000')).toBeInTheDocument();
  });

  test('使用率に応じて円の長さが決まること', () => {
    const { container } = render(<CircularProgress current={25} limit={100} />);
    expect(progressCircle(container)).toHaveAttribute(
      'stroke-dasharray',
      `${0.25 * CIRCUMFERENCE} ${CIRCUMFERENCE}`,
    );
  });

  test('上限を超えても円は 100% で止まること', () => {
    const { container } = render(<CircularProgress current={300} limit={100} />);
    expect(progressCircle(container)).toHaveAttribute('stroke-dasharray', `${CIRCUMFERENCE} ${CIRCUMFERENCE}`);
  });

  test('上限が 0 のときは 0% にすること', () => {
    const { container } = render(<CircularProgress current={10} limit={0} label="ラベル" />);
    expect(progressCircle(container)).toHaveAttribute('stroke-dasharray', `0 ${CIRCUMFERENCE}`);
    expect(screen.getByText('ラベル')).toBeInTheDocument();
  });
});
