// All user-settable parameters in one flat object, so they can be read from /
// written to the form and round-tripped through a link or QR code.

export interface Config {
  bore: number;
  outer: number;
  width: number;
  ball: number;
  count: number; // 0 = automatic
  clearance: number; // ball groove, per side
  lipFit: number;
  cage: boolean; // design: use crown cage
  cageClearance: number;
  cageWall: number;
  cageThick: number; // radial wall thickness
  cageBand: number; // height of the solid band below the notches
  cageProng: number; // prong top above ball centre, in ball radii
  covers: boolean; // design: use dust covers
  coverFit: number;
  coverGap: number;
  incOuter: boolean;
  incInner: boolean;
  incCage: boolean;
  incCovers: boolean;
  incBalls: boolean;
}

export const defaultConfig: Config = {
  bore: 8,
  outer: 22,
  width: 7,
  ball: 4,
  count: 0,
  clearance: 0.15,
  lipFit: 0.1,
  cage: true,
  cageClearance: 0.2,
  cageWall: 0.25,
  cageThick: 1,
  cageBand: 0.8,
  cageProng: 1,
  covers: false,
  coverFit: 0.1,
  coverGap: 0.4,
  incOuter: true,
  incInner: true,
  incCage: true,
  incCovers: true,
  incBalls: false,
};

const numKeys: (keyof Config)[] = [
  "bore", "outer", "width", "ball", "count", "clearance", "lipFit",
  "cageClearance", "cageWall", "cageThick", "cageBand", "cageProng", "coverFit", "coverGap",
];
const boolKeys: (keyof Config)[] = [
  "cage", "covers", "incOuter", "incInner", "incCage", "incCovers", "incBalls",
];

const PREFIX = "bb1";

// Compact text form, e.g. "bb1&bore=8&outer=22&..."
export function serializeConfig(c: Config): string {
  const p = new URLSearchParams();
  for (const k of numKeys) p.set(k, String(c[k]));
  for (const k of boolKeys) p.set(k, c[k] ? "1" : "0");
  return `${PREFIX}&${p.toString()}`;
}

// A link that opens the app with these settings
export function configToLink(c: Config): string {
  return `${location.origin}${location.pathname}#${serializeConfig(c)}`;
}

// Accepts a raw code, a full link, or just the hash part. Returns null if it
// does not look like one of ours. Unknown / missing keys keep defaults.
export function parseConfig(text: string): Config | null {
  const t = text.trim();
  const i = t.indexOf(PREFIX + "&");
  if (i < 0) return null;
  const p = new URLSearchParams(t.slice(i + PREFIX.length + 1));
  const out: Config = { ...defaultConfig };
  let found = 0;
  for (const k of numKeys) {
    const v = p.get(k);
    if (v === null) continue;
    const n = parseFloat(v);
    if (Number.isFinite(n)) {
      (out as any)[k] = n;
      found++;
    }
  }
  for (const k of boolKeys) {
    const v = p.get(k);
    if (v === null) continue;
    (out as any)[k] = v === "1";
    found++;
  }
  return found > 0 ? out : null;
}

// Short human-readable caption for printed labels
export function configCaption(c: Config): string[] {
  const f = (n: number) => String(Math.round(n * 1000) / 1000);
  const parts: string[] = [];
  if (c.cage) parts.push("cage");
  if (c.covers) parts.push("covers");
  return [
    `Ball bearing ${f(c.bore)} x ${f(c.outer)} x ${f(c.width)} mm`,
    `Balls: ${f(c.ball)} mm${c.count ? " x" + c.count : ""}   Groove clearance ${f(c.clearance)}`,
    `Lip fit ${f(c.lipFit)}   Design: ${parts.length ? parts.join(" + ") : "rings + balls"}`,
    ...(c.cage ? [`Cage: notch +${f(c.cageClearance)}, wall gap ${f(c.cageWall)}, wall ${f(c.cageThick)}, band ${f(c.cageBand)}, prongs ${f(c.cageProng)}r`] : []),
    ...(c.covers ? [`Cover: fit ${f(c.coverFit)}, inner gap ${f(c.coverGap)}`] : []),
  ];
}
