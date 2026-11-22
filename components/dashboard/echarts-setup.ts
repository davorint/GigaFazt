/**
 * ECharts with only what the Tablero uses (tree-shaken: bar, line and heatmap charts, their grid, tooltip, legend, mark
 * lines and areas, the heatmap's scale and SVG output). Imported only by EChart.tsx through a dynamic import, so it never
 * reaches a page's first load.
 */
import * as echarts from "echarts/core"
import { BarChart, HeatmapChart, LineChart } from "echarts/charts"
import { AriaComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent, VisualMapComponent } from "echarts/components"
import { SVGRenderer } from "echarts/renderers"

echarts.use([BarChart, LineChart, HeatmapChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, MarkAreaComponent, VisualMapComponent, AriaComponent, SVGRenderer])

export { echarts }
