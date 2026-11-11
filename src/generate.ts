import { Bearing } from "./bearing";
import { BallBearing } from "./bearing-ball";
import { makeBinarySTL } from "./stl";
import { Preview3D } from "./preview3d";

let preview3d: Preview3D | null = null;

function el<T extends HTMLElement>(sel: string): T {
  return document.querySelector<T>(sel)!;
}

export function generate() {
  const bearing = bearingFromForm();
  try {
    bearing.validate();
  } catch (e) {
    alert(e instanceof Error ? e.message : "Invalid parameters");
    return;
  }
  const stl = makeBinarySTL(bearing.getTriangles());
  const link = document.createElement("a");
  link.download = bearing.fileName;
  link.href = URL.createObjectURL(new Blob([stl], { type: "application/octet-stream" }));
  link.click();
}

// Returns true if the current parameters are valid
export function validate(): boolean {
  const bearing = bearingFromForm();
  try {
    bearing.validate();
    el("#error").textContent = "";
    el("#summary").textContent = bearing.summary();
    return true;
  } catch (e) {
    el("#error").textContent = e instanceof Error ? e.message : "Unknown error";
    el("#summary").textContent = "";
    return false;
  }
}

export function generatePreview() {
  if (!validate()) return;
  const bearing = bearingFromForm();
  bearing.drawPreview(el<HTMLCanvasElement>("#preview"));
  if (!preview3d) preview3d = new Preview3D(el<HTMLCanvasElement>("#preview3d"));
  preview3d.exploded = el<HTMLInputElement>("#exploded").checked;
  preview3d.cutaway = el<HTMLInputElement>("#cutaway").checked;
  preview3d.update(bearing);
}

export function ballDiameterFromForm(): number {
  const sel = el<HTMLSelectElement>("#ball-select").value;
  if (sel === "custom") return parseFloat(el<HTMLInputElement>("#ball-custom").value);
  return parseFloat(sel);
}

function num(sel: string): number {
  return parseFloat(el<HTMLInputElement>(sel).value);
}

export function bearingFromForm(): Bearing {
  return new BallBearing({
    outerDiameter: num("#outer-diameter"),
    boreDiameter: num("#bore-diameter"),
    width: num("#width"),
    ballDiameter: ballDiameterFromForm(),
    clearance: num("#clearance"),
    ballCount: Math.round(num("#ball-count")) || 0,
    printBalls: el<HTMLInputElement>("#print-balls").checked,
  });
}
