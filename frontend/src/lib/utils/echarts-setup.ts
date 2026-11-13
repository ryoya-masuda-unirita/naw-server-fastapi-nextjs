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
 * ECharts をツリーシェイク可能な形で初期化する（移植元 shared/utils/echarts.setup.ts）。
 * 折れ線・棒・円グラフと、タイトル/ツールチップ/凡例/グリッドだけ登録してバンドルを抑える。
 *
 * レンダラーは SVG。PDF 出力（移植元 printHtmlContent）は描画済み DOM の innerHTML を印刷ウィンドウへ渡すため、
 * canvas だと内容が失われる。SVG なら DOM に描画結果が残り、印刷/PDF にも反映される。
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

/** テストで `init` を差し替えられるよう、名前空間ではなくオブジェクトとして公開する */
export const echarts = {
  init: (...args: Parameters<typeof echartsCore.init>) => echartsCore.init(...args),
};
