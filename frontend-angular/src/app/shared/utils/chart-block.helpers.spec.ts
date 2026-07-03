import { describe, expect, it } from 'vitest';

import { chartTypeFromClassName, parseChartBlock } from './chart-block.helpers';

const LINE_JSON = JSON.stringify({
  version: 1,
  title: '月別売上推移',
  categories: ['1月', '2月', '3月'],
  series: [
    { name: '今期', values: [100, 120, 90] },
    { name: '前期', values: [85, 92, 78] },
  ],
});

const BAR_JSON = JSON.stringify({
  version: 1,
  title: '部門別 予実対比 2025 Q3',
  categories: ['営業1部', '営業2部', '営業3部'],
  series: [
    { name: '予算', values: [100, 120, 90] },
    { name: '実績', values: [85, 92, 78] },
  ],
});

const PIE_JSON = JSON.stringify({
  version: 1,
  title: '製品別売上構成比',
  series: [
    { name: '製品A', value: 35 },
    { name: '製品B', value: 28 },
    { name: '製品C', value: 22 },
    { name: 'その他', value: 15 },
  ],
});

describe('parseChartBlock', () => {
  describe('line', () => {
    it('builds a line chart option from valid JSON', () => {
      const option = parseChartBlock('line', LINE_JSON);
      expect(option).not.toBeNull();
      expect(option?.xAxis).toMatchObject({ type: 'category', data: ['1月', '2月', '3月'] });
      expect(option?.yAxis).toMatchObject({ type: 'value' });
      expect(option?.series).toEqual([
        { name: '今期', type: 'line', data: [100, 120, 90] },
        { name: '前期', type: 'line', data: [85, 92, 78] },
      ]);
      expect(option?.title).toMatchObject({ text: '月別売上推移' });
    });

    it('omits the title when not provided', () => {
      const json = JSON.stringify({
        version: 1,
        categories: ['A'],
        series: [{ name: 'x', values: [1] }],
      });
      expect(parseChartBlock('line', json)?.title).toBeUndefined();
    });
  });

  describe('bar', () => {
    it('builds a bar chart option with series type bar', () => {
      const option = parseChartBlock('bar', BAR_JSON);
      expect(option).not.toBeNull();
      expect(option?.series).toEqual([
        { name: '予算', type: 'bar', data: [100, 120, 90] },
        { name: '実績', type: 'bar', data: [85, 92, 78] },
      ]);
    });
  });

  describe('pie', () => {
    it('builds a pie chart option from valid JSON', () => {
      const option = parseChartBlock('pie', PIE_JSON);
      expect(option).not.toBeNull();
      const series = (option?.series as { type: string; data: unknown[] }[])[0];
      expect(series.type).toBe('pie');
      expect(series.data).toEqual([
        { name: '製品A', value: 35 },
        { name: '製品B', value: 28 },
        { name: '製品C', value: 22 },
        { name: 'その他', value: 15 },
      ]);
    });
  });

  describe('invalid input', () => {
    it('returns null for malformed JSON (e.g. mid-stream)', () => {
      expect(parseChartBlock('line', '{ "version": 1, "categ')).toBeNull();
    });

    it('returns null when required fields are missing', () => {
      expect(parseChartBlock('line', JSON.stringify({ version: 1, categories: ['A'] }))).toBeNull();
      expect(
        parseChartBlock(
          'line',
          JSON.stringify({ version: 1, series: [{ name: 'x', values: [1] }] }),
        ),
      ).toBeNull();
      expect(parseChartBlock('pie', JSON.stringify({ version: 1 }))).toBeNull();
    });

    it('returns null for unsupported version', () => {
      const json = JSON.stringify({
        version: 0,
        categories: ['A'],
        series: [{ name: 'x', values: [1] }],
      });
      expect(parseChartBlock('line', json)).toBeNull();
    });

    it('returns null when values contain non-numbers', () => {
      const json = JSON.stringify({
        version: 1,
        categories: ['A'],
        series: [{ name: 'x', values: ['1'] }],
      });
      expect(parseChartBlock('line', json)).toBeNull();
    });

    it('returns null when a series has empty values', () => {
      const json = JSON.stringify({
        version: 1,
        categories: ['A', 'B'],
        series: [{ name: 'x', values: [] }],
      });
      expect(parseChartBlock('line', json)).toBeNull();
    });

    it('returns null when values length does not match categories', () => {
      const json = JSON.stringify({
        version: 1,
        categories: ['A', 'B', 'C'],
        series: [{ name: 'x', values: [1, 2] }],
      });
      expect(parseChartBlock('line', json)).toBeNull();
    });

    it('returns null when a pie value is not a finite number', () => {
      const json = JSON.stringify({ version: 1, series: [{ name: 'A', value: 'x' }] });
      expect(parseChartBlock('pie', json)).toBeNull();
    });

    it('returns null when a pie value is negative', () => {
      const json = JSON.stringify({
        version: 1,
        series: [
          { name: 'A', value: 35 },
          { name: 'B', value: -10 },
        ],
      });
      expect(parseChartBlock('pie', json)).toBeNull();
    });

    it('returns null when all pie values sum to zero', () => {
      const json = JSON.stringify({
        version: 1,
        series: [
          { name: 'A', value: 0 },
          { name: 'B', value: 0 },
        ],
      });
      expect(parseChartBlock('pie', json)).toBeNull();
    });

    it('returns null when the root is not an object', () => {
      expect(parseChartBlock('line', '[]')).toBeNull();
      expect(parseChartBlock('line', '42')).toBeNull();
    });
  });
});

describe('chartTypeFromClassName', () => {
  it('extracts the chart type from a language class', () => {
    expect(chartTypeFromClassName('language-chart:line')).toBe('line');
    expect(chartTypeFromClassName('hljs language-chart:bar')).toBe('bar');
    expect(chartTypeFromClassName('language-chart:pie')).toBe('pie');
  });

  it('returns null for unrelated or unsupported classes', () => {
    expect(chartTypeFromClassName('language-json')).toBeNull();
    expect(chartTypeFromClassName('language-chart:scatter')).toBeNull();
    expect(chartTypeFromClassName('')).toBeNull();
  });
});
