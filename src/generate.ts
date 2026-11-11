import { Bearing } from "./bearing";
import { BallBearing, BallBearingParams } from "./bearing-ball";
import { Config } from "./config";
import { makeBinarySTL } from "./stl";
import { Preview3D } from "./preview3d";

let preview3d: Preview3D | null = null;

function el<T extends HTMLElement>(sel: string): T {
  return document.querySelector<T>(sel)!;
}
const num = (sel: string) => parseFloat(el<HTMLInputElement>(sel).value);
const chk = (sel: string) => el<HTMLInputElement>(sel).checked;

export function generate() {
  const bearing = bearingFromForm();
  try {
    bearing.validate();
  } catch (e) {
    alert(e instanceof Error ? e.message : "Invalid parameters");
    return;
  }
  const triangles = bearing.getTriangles();
  if (triangles.length === 0) {
    alert("No parts selected: tick at least one part under \"Parts to include\".");
    return;
  }
  const stl = makeBinarySTL(triangles);
  const link = document.createElement("a");
  link.download = bearing.fileName;
  link.href = URL.createObjectURL(new Blob([stl], { type: "application/octet-stream" }));
  link.click();
}

// Returns true if the current parameters are valid
export function validate(): boolean {
  // An empty or half-typed field gives NaN: wait for a real number
  const incomplete = Object.values(readConfig()).some((v) => typeof v === "number" && !Number.isFinite(v));
  if (incomplete) {
    el("#error").textContent = "Enter a number in every field";
    el("#summary").textContent = "";
    return false;
  }
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
  preview3d.exploded = chk("#exploded");
  preview3d.cutaway = chk("#cutaway");
  preview3d.update(bearing);
}

export function ballDiameterFromForm(): number {
  const sel = el<HTMLSelectElement>("#ball-select").value;
  if (sel === "custom") return num("#ball-custom");
  return parseFloat(sel);
}

export function readConfig(): Config {
  return {
    bore: num("#bore-diameter"),
    outer: num("#outer-diameter"),
    width: num("#width"),
    ball: ballDiameterFromForm(),
    count: Math.round(num("#ball-count")) || 0,
    clearance: num("#clearance"),
    lipFit: num("#lip-fit"),
    landFactor: num("#land-factor"),
    splitInner: chk("#split-inner"),
    splitOuter: chk("#split-outer"),
    cage: chk("#cage"),
    cageClearance: num("#cage-clearance"),
    cageWall: num("#cage-wall"),
    cageThick: num("#cage-thick"),
    cageBand: num("#cage-band"),
    cageProng: num("#cage-prong"),
    covers: chk("#covers"),
    coverThick: num("#cover-thick"),
    coverSeat: num("#cover-seat"),
    coverFit: num("#cover-fit"),
    coverGap: num("#cover-gap"),
    incOuter: chk("#inc-outer"),
    incInner: chk("#inc-inner"),
    incCage: chk("#inc-cage"),
    incCovers: chk("#inc-covers"),
    incBalls: chk("#inc-balls"),
  };
}

export function writeConfig(c: Config) {
  const set = (sel: string, v: number) => (el<HTMLInputElement>(sel).value = String(v));
  const tick = (sel: string, v: boolean) => (el<HTMLInputElement>(sel).checked = v);
  set("#bore-diameter", c.bore);
  set("#outer-diameter", c.outer);
  set("#width", c.width);
  set("#ball-count", c.count);
  set("#clearance", c.clearance);
  set("#lip-fit", c.lipFit);
  set("#land-factor", c.landFactor);
  tick("#split-inner", c.splitInner);
  tick("#split-outer", c.splitOuter);
  set("#cage-clearance", c.cageClearance);
  set("#cage-wall", c.cageWall);
  set("#cage-thick", c.cageThick);
  set("#cage-band", c.cageBand);
  set("#cage-prong", c.cageProng);
  set("#cover-thick", c.coverThick);
  set("#cover-seat", c.coverSeat);
  set("#cover-fit", c.coverFit);
  set("#cover-gap", c.coverGap);
  tick("#cage", c.cage);
  tick("#covers", c.covers);
  tick("#inc-outer", c.incOuter);
  tick("#inc-inner", c.incInner);
  tick("#inc-cage", c.incCage);
  tick("#inc-covers", c.incCovers);
  tick("#inc-balls", c.incBalls);
  // Ball: pick the matching standard size, otherwise use the custom field
  const sel = el<HTMLSelectElement>("#ball-select");
  const match = Array.from(sel.options).find(
    (o) => o.value !== "custom" && Math.abs(parseFloat(o.value) - c.ball) < 0.0005
  );
  if (match) {
    sel.value = match.value;
  } else {
    sel.value = "custom";
    set("#ball-custom", c.ball);
  }
}

export function bearingParamsFor(c: Config): BallBearingParams {
  return {
    outerDiameter: c.outer,
    boreDiameter: c.bore,
    width: c.width,
    ballDiameter: c.ball,
    clearance: c.clearance,
    ballCount: c.count,
    cage: c.cage,
    covers: c.covers,
    landFactor: c.landFactor,
    splitInner: c.splitInner,
    splitOuter: c.splitOuter,
    lipFit: c.lipFit,
    cageClearance: c.cageClearance,
    cageWallClearance: c.cageWall,
    cageThick: c.cageThick,
    cageBand: c.cageBand,
    cageProng: c.cageProng,
    coverThick: c.coverThick,
    coverSeat: c.coverSeat,
    coverFit: c.coverFit,
    coverGap: c.coverGap,
    include: {
      outer: c.incOuter,
      inner: c.incInner,
      cage: c.incCage,
      covers: c.incCovers,
      balls: c.incBalls,
    },
  };
}

export function bearingFromConfig(c: Config): Bearing {
  return new BallBearing(bearingParamsFor(c));
}

export function bearingFromForm(): Bearing {
  return bearingFromConfig(readConfig());
}
