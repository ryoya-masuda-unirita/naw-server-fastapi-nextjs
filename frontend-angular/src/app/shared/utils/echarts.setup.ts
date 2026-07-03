import * as echartsCore from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

/**
 * ECharts をツリーシェイク可能な形で初期化する。
 *
 * 折れ線・棒・円グラフと、タイトル/ツールチップ/凡例/グリッドのみを登録し、
 * バンドルサイズの肥大を抑える。
 *
 * レンダラーは SVG を採用している。PDF 出力（`printHtmlContent`）は描画済み DOM の
 * `innerHTML` をシリアライズして印刷ウィンドウへ渡すため、canvas 描画では内容が
 * 失われてしまう。SVG であれば DOM に描画結果が残り、印刷/PDF にも反映される。
 */
echartsCore.use([
  LineChart,
  BarChart,
  PieChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  SVGRenderer,
]);

/** テストで `init` を差し替え可能にするため、名前空間ではなくオブジェクトとして公開する */
export const echarts = {
  init: (...args: Parameters<typeof echartsCore.init>) => echartsCore.init(...args),
};
