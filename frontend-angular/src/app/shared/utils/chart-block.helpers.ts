import type { EChartsOption } from 'echarts';

/**
 * マークダウン内のチャートコードブロックの種別。
 * フェンス情報文字列 ` ```chart:line ` などの末尾に対応する。
 */
export type ChartBlockType = 'line' | 'bar' | 'pie';

/** 折れ線・棒グラフの系列 */
interface CartesianSeries {
  name: string;
  values: number[];
}

/** 折れ線・棒グラフの設定（` ```chart:line ` / ` ```chart:bar `） */
interface CartesianChartConfig {
  version: number;
  title?: string;
  categories: string[];
  series: CartesianSeries[];
}

/** 円グラフの系列項目 */
interface PieSeriesItem {
  name: string;
  value: number;
}

/** 円グラフの設定（` ```chart:pie `） */
interface PieChartConfig {
  version: number;
  title?: string;
  series: PieSeriesItem[];
}

/** サポートする設定スキーマの最小バージョン */
const MIN_SUPPORTED_VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'number' && Number.isFinite(v));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function hasSupportedVersion(version: unknown): version is number {
  return typeof version === 'number' && version >= MIN_SUPPORTED_VERSION;
}

function optionalTitle(title: unknown): string | undefined {
  return typeof title === 'string' ? title : undefined;
}

function parseCartesianConfig(value: Record<string, unknown>): CartesianChartConfig | null {
  const version = value['version'];
  const categories = value['categories'];
  const rawSeries = value['series'];

  if (!hasSupportedVersion(version)) return null;
  if (!isStringArray(categories) || categories.length === 0) return null;
  if (!Array.isArray(rawSeries) || rawSeries.length === 0) return null;

  const series: CartesianSeries[] = [];
  for (const item of rawSeries) {
    if (!isRecord(item)) return null;
    const name = item['name'];
    const values = item['values'];
    if (typeof name !== 'string') return null;
    if (!isNumberArray(values)) return null;
    // 値が空、または categories と長さが揃わない系列は軸ずれ・空白グラフになるため弾く
    if (values.length !== categories.length) return null;
    series.push({ name, values });
  }

  return {
    version,
    title: optionalTitle(value['title']),
    categories,
    series,
  };
}

function parsePieConfig(value: Record<string, unknown>): PieChartConfig | null {
  const version = value['version'];
  const rawSeries = value['series'];

  if (!hasSupportedVersion(version)) return null;
  if (!Array.isArray(rawSeries) || rawSeries.length === 0) return null;

  const series: PieSeriesItem[] = [];
  for (const item of rawSeries) {
    if (!isRecord(item)) return null;
    const name = item['name'];
    const itemValue = item['value'];
    if (typeof name !== 'string') return null;
    // 円グラフは割合表現のため、負値は表示・tooltip の割合（{d}%）が不正になる。
    // 0 以上の有限数のみ受け付ける。
    if (typeof itemValue !== 'number' || !Number.isFinite(itemValue) || itemValue < 0) return null;
    series.push({ name, value: itemValue });
  }

  // 合計が 0（全て 0）の場合も割合を算出できず空グラフになるため弾く
  if (series.reduce((sum, item) => sum + item.value, 0) <= 0) return null;

  return {
    version,
    title: optionalTitle(value['title']),
    series,
  };
}

function buildTitle(title?: string): EChartsOption['title'] {
  if (!title) return undefined;
  return {
    text: title,
    left: 'center',
    textStyle: { fontSize: 14, fontWeight: 600 },
  };
}

/** タイトルの有無に応じた上部余白を返す */
function gridTop(hasTitle: boolean): number {
  return hasTitle ? 56 : 24;
}

function buildCartesianOption(type: 'line' | 'bar', config: CartesianChartConfig): EChartsOption {
  const hasTitle = Boolean(config.title);
  return {
    title: buildTitle(config.title),
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0, type: 'scroll' },
    grid: { left: 48, right: 24, top: gridTop(hasTitle), bottom: 40, containLabel: true },
    xAxis: { type: 'category', data: config.categories },
    yAxis: { type: 'value' },
    series: config.series.map((s) => ({ name: s.name, type, data: s.values })),
  };
}

function buildPieOption(config: PieChartConfig): EChartsOption {
  const hasTitle = Boolean(config.title);
  return {
    title: buildTitle(config.title),
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, type: 'scroll' },
    series: [
      {
        type: 'pie',
        radius: '60%',
        center: ['50%', hasTitle ? '52%' : '46%'],
        data: config.series.map((item) => ({ name: item.name, value: item.value })),
      },
    ],
  };
}

/**
 * チャートコードブロックの JSON 文字列を ECharts オプションへ変換する。
 *
 * パース失敗・スキーマ不正・未対応バージョンの場合は `null` を返す。
 * （ストリーミング途中の不完全な JSON もここで `null` となり、呼び出し側で
 *  元のコードブロックを残せるようにしている。）
 */
export function parseChartBlock(type: ChartBlockType, jsonText: string): EChartsOption | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;

  if (type === 'pie') {
    const config = parsePieConfig(parsed);
    return config ? buildPieOption(config) : null;
  }

  const config = parseCartesianConfig(parsed);
  return config ? buildCartesianOption(type, config) : null;
}

/** クラス名（例: `language-chart:line`）からチャート種別を判定する */
export function chartTypeFromClassName(className: string): ChartBlockType | null {
  const match = className.match(/language-chart:(\w+)/);
  if (!match) return null;
  const type = match[1];
  if (type === 'line' || type === 'bar' || type === 'pie') return type;
  return null;
}
