import { Triangle } from "./types";

export interface Bearing {
  validate(): unknown;
  summary(): string;
  getAssembledParts(explode?: number): { inner: Triangle[]; outer: Triangle[]; balls: Triangle[] };
  fileName: string;
  outerDiameter: number;
  width: number;
  getTriangles(): Triangle[];
  drawPreview(canvas: HTMLCanvasElement): void;
}
