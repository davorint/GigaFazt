// d3-voronoi-treemap 1.1.2 ships no types: the part Mapa de ingresos uses (lib/interno/tablero2-tree.ts).
declare module "d3-voronoi-treemap" {
  import type { HierarchyNode } from "d3-hierarchy"

  type Point = [number, number]
  interface VoronoiTreemap {
    <T>(root: HierarchyNode<T>): void
    clip(polygon: Point[]): VoronoiTreemap
    prng(random: () => number): VoronoiTreemap
    convergenceRatio(ratio: number): VoronoiTreemap
    maxIterationCount(count: number): VoronoiTreemap
    minWeightRatio(ratio: number): VoronoiTreemap
  }
  export function voronoiTreemap(): VoronoiTreemap
}
