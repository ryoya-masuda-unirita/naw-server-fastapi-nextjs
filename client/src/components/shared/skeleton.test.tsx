import { describe, expect, test } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton, SkeletonBlock } from './skeleton';

describe('Skeleton', () => {
  test('既定は幅 100%・高さ 1rem の角丸の矩形であること', () => {
    const { container } = render(<Skeleton />);
    const el = container.querySelector('.app-skeleton')!;
    expect(el).toHaveClass('rounded', 'animate-pulse', 'bg-gray-200');
    expect(el).toHaveStyle({ width: '100%', height: '1rem' });
  });

  test('circle は丸、rect は rounded の指定どおりになること', () => {
    const { container } = render(
      <>
        <Skeleton variant="circle" width="2rem" height="2rem" />
        <Skeleton variant="rect" rounded="rounded-lg" />
      </>,
    );
    const [circle, rect] = container.querySelectorAll('.app-skeleton');
    expect(circle).toHaveClass('rounded-full');
    expect(circle).toHaveStyle({ width: '2rem' });
    expect(rect).toHaveClass('rounded-lg');
  });
});

describe('SkeletonBlock', () => {
  test('指定した行数ぶん、3 つのスケルトンを並べた行を出すこと', () => {
    const { container } = render(<SkeletonBlock length={3} />);
    const rows = container.querySelectorAll('.app-skeleton-block > div');
    expect(rows).toHaveLength(3);
    expect(rows[0].querySelectorAll('.app-skeleton')).toHaveLength(3);
  });
});
