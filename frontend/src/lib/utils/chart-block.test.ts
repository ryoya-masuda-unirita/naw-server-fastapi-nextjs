import { describe, expect, test } from 'vitest';
import { chartTypeFromClassName, parseChartBlock } from './chart-block';

const FIXTURE_LINE_JSON = JSON.stringify({
  version: 1,
  title: '月別売上推移',
  categories: ['1月', '2月', '3月'],
  series: [
    { name: '今期', values: [100, 120, 90] },
    { name: '前期', values: [85, 92, 78] },
  ],
});

const FIXTURE_PIE_JSON = JSON.stringify({
  version: 1,
  title: '製品別売上構成比',
  series: [
    { name: '製品A', value: 35 },
    { name: '製品B', value: 28 },
  ],
});

describe('parseChartBlock', () => {
  describe('line / bar', () => {
    test('折れ線グラフのオプションを作れること', () => {
      const option = parseChartBlock('line', FIXTURE_LINE_JSON);
      expect(option?.xAxis).toMatchObject({ type: 'category', data: ['1月', '2月', '3月'] });
      expect(option?.series).toEqual([
        { name: '今期', type: 'line', data: [100, 120, 90] },
        { name: '前期', type: 'line', data: [85, 92, 78] },
      ]);
      expect(option?.title).toMatchObject({ text: '月別売上推移' });
    });

    test('棒グラフは series の type が bar になること', () => {
      const option = parseChartBlock('bar', FIXTURE_LINE_JSON);
      expect((option?.series as { type: string }[])[0].type).toBe('bar');
    });

    test('タイトルが無ければ title を付けないこと', () => {
      const json = JSON.stringify({
        version: 1,
        categories: ['A'],
        series: [{ name: 'x', values: [1] }],
      });
      expect(parseChartBlock('line', json)?.title).toBeUndefined();
    });

    test('系列の長さが categories と合わなければ null になること', () => {
      const json = JSON.stringify({
        version: 1,
        categories: ['A', 'B'],
        series: [{ name: 'x', values: [1] }],
      });
      expect(parseChartBlock('line', json)).toBeNull();
    });

    test('未対応のバージョンは null になること', () => {
      const json = JSON.stringify({
        version: 0,
        categories: ['A'],
        series: [{ name: 'x', values: [1] }],
      });
      expect(parseChartBlock('bar', json)).toBeNull();
    });
  });

  describe('pie', () => {
    test('円グラフのオプションを作れること', () => {
      const option = parseChartBlock('pie', FIXTURE_PIE_JSON);
      const series = (option?.series as { type: string; data: unknown[] }[])[0];
      expect(series.type).toBe('pie');
      expect(series.data).toEqual([
        { name: '製品A', value: 35 },
        { name: '製品B', value: 28 },
      ]);
    });

    test('負の値を含むと null になること', () => {
      const json = JSON.stringify({ version: 1, series: [{ name: 'a', value: -1 }] });
      expect(parseChartBlock('pie', json)).toBeNull();
    });

    test('合計が 0 だと null になること', () => {
      const json = JSON.stringify({ version: 1, series: [{ name: 'a', value: 0 }] });
      expect(parseChartBlock('pie', json)).toBeNull();
    });
  });

  test('ストリーミング途中の不完全な JSON は null になること', () => {
    expect(parseChartBlock('line', '{"version":1,"categories":["A"')).toBeNull();
  });

  test('JSON がオブジェクトでなければ null になること', () => {
    expect(parseChartBlock('line', '[1,2]')).toBeNull();
  });
});

describe('chartTypeFromClassName', () => {
  test('language-chart:xxx から種別を判定できること', () => {
    expect(chartTypeFromClassName('language-chart:line')).toBe('line');
    expect(chartTypeFromClassName('language-chart:bar')).toBe('bar');
    expect(chartTypeFromClassName('language-chart:pie')).toBe('pie');
  });

  test('未対応の種別・無関係なクラスは null になること', () => {
    expect(chartTypeFromClassName('language-chart:radar')).toBeNull();
    expect(chartTypeFromClassName('language-js')).toBeNull();
  });
});
