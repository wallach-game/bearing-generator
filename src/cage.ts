import type { BallBearing } from "./bearing-ball";
import { Point, Triangle } from "./types";

// Crown cage mesh, built analytically (no boolean operations) so that it is a
// closed, manifold solid that slicers accept.
//
// The cage is a thin cylindrical wall. Unrolled it is a 2D profile in (s, z),
// where s is arc length at the pitch circle: a solid band at the bottom, and
// between the balls prongs that rise to the top edge. Each ball gets a round
// notch with a slightly narrower neck above it, so the ball snaps in.
//
// The profile is split into one sector per ball, centred on the ball, with the
// cuts running down the middle of the prongs. Each sector is triangulated as a
// grid of vertical columns, then wrapped onto the cylinder for the outer and
// inner wall; the profile's boundary edges become the side walls. All vertices
// come from the same grid, so there are no T-junctions.

const ARC_STEP = (4 * Math.PI) / 180; // angular step along the notch circle
const FLAT_STEP = 0.15; // max step (mm) along straight parts

type V2 = { s: number; z: number };

function sub(a: number[], b: number[]) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a: number[], b: number[]) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: number[], b: number[]) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

// Emit a triangle, flipping it if needed so its normal points along `hint`
function emit(out: Triangle[], a: number[], b: number[], c: number[], hint: number[]) {
  const n = cross(sub(b, a), sub(c, a));
  if (dot(n, hint) < 0) [b, c] = [c, b];
  out.push(
    new Triangle({
      a: new Point({ x: a[0], y: a[1], z: a[2] }),
      b: new Point({ x: b[0], y: b[1], z: b[2] }),
      c: new Point({ x: c[0], y: c[1], z: c[2] }),
    })
  );
}

// Triangulate the strip between two vertical vertex lists (ascending z) at
// s = sa (left) and s = sb (right).
function zipper(sa: number, left: number[], sb: number, right: number[]): [V2, V2, V2][] {
  const tris: [V2, V2, V2][] = [];
  let i = 0, j = 0;
  while (i < left.length - 1 || j < right.length - 1) {
    const advanceLeft =
      j === right.length - 1 ? true : i === left.length - 1 ? false : left[i + 1] <= right[j + 1];
    if (advanceLeft) {
      tris.push([
        { s: sa, z: left[i] }, { s: sb, z: right[j] }, { s: sa, z: left[i + 1] },
      ]);
      i++;
    } else {
      tris.push([
        { s: sa, z: left[i] }, { s: sb, z: right[j] }, { s: sb, z: right[j + 1] },
      ]);
      j++;
    }
  }
  return tris;
}

// 2D triangulation of one sector (centred on a ball, s in [-sd, sd])
function sectorTriangles(b: BallBearing, sd: number): [V2, V2, V2][] {
  const R = b.cagePocketRadius;
  const H = b.half;
  const zb = b.cageBottom;
  const zt = b.cageTop;
  const nh = b.cageNeck / 2; // half width of the neck
  const zl = (s: number) => H - Math.sqrt(Math.max(0, R * R - s * s)); // notch lower arc
  const zu = (s: number) => H + Math.sqrt(Math.max(0, R * R - s * s)); // notch upper arc

  // Grid of s values: uniform in angle over the notch, uniform in length outside
  const phiN = Math.asin(nh / R);
  const sValues: number[] = [];
  const steps = Math.ceil(Math.PI / ARC_STEP);
  for (let k = 0; k <= steps; k++) {
    const phi = -Math.PI / 2 + (k * Math.PI) / steps;
    if (Math.abs(Math.abs(phi) - phiN) < ARC_STEP * 0.3) continue; // replaced by exact neck points
    sValues.push(k === 0 ? -R : k === steps ? R : R * Math.sin(phi));
  }
  sValues.push(-nh, nh);
  const grid = new Set<number>(sValues);
  const extra = Math.max(1, Math.ceil((sd - R) / FLAT_STEP));
  for (let k = 0; k <= extra; k++) {
    const s = k === extra ? sd : R + ((sd - R) * k) / extra;
    grid.add(s);
    grid.add(-s);
  }
  const xs = Array.from(grid).sort((p, q) => p - q);

  const tris: [V2, V2, V2][] = [];
  const near = (p: number, q: number) => Math.abs(p - q) < 1e-9;
  for (let k = 0; k < xs.length - 1; k++) {
    const sa = xs[k], sb = xs[k + 1];
    const mid = Math.abs((sa + sb) / 2);
    if (mid >= R) {
      // Outside the notch: full height; add the notch equator vertex where the
      // neighbouring notch column meets this one
      const left = [zb, zt], right = [zb, zt];
      if (near(Math.abs(sa), R)) left.splice(1, 0, H);
      if (near(Math.abs(sb), R)) right.splice(1, 0, H);
      tris.push(...zipper(sa, left, sb, right));
    } else if (mid >= nh) {
      // Shoulders: material below the notch and a hook above it
      tris.push(...zipper(sa, [zb, zl(sa)], sb, [zb, zl(sb)]));
      tris.push(...zipper(sa, [zu(sa), zt], sb, [zu(sb), zt]));
    } else {
      // Under the neck: only the material below the notch
      tris.push(...zipper(sa, [zb, zl(sa)], sb, [zb, zl(sb)]));
    }
  }
  return tris;
}

// Building is cheap now, but the preview rebuilds often: remember recent results
const cache = new Map<string, Triangle[]>();

export function buildCage(b: BallBearing): Triangle[] {
  const key = JSON.stringify([
    b.rp, b.r, b.h, b.half, b.cageWidth, b.cageBottom, b.cageTop,
    b.cagePocketRadius, b.cageNeck, b.ballCount,
  ]);
  const hit = cache.get(key);
  if (hit) return hit;
  const result = buildCageMesh(b);
  cache.set(key, result);
  if (cache.size > 6) cache.delete(cache.keys().next().value as string);
  return result;
}

function buildCageMesh(b: BallBearing): Triangle[] {
  const n = b.ballCount;
  const rp = b.rp;
  const half = b.cageWidth / 2;
  const rOut = rp + half;
  const rIn = rp - half;
  const sd = (rp * Math.PI) / n; // half sector width in arc length

  const flat = sectorTriangles(b, sd);

  // Boundary edges of the sector profile: edges used by exactly one triangle,
  // except the cuts through the prongs (|s| = sd, shared with the next sector)
  const vkey = (v: V2) => `${v.s.toFixed(9)},${v.z.toFixed(9)}`;
  const edges = new Map<string, { a: V2; b: V2; n: number }>();
  const bump = (a: V2, c: V2) => {
    const rev = edges.get(vkey(c) + ">" + vkey(a));
    if (rev) { rev.n++; return; }
    const k = vkey(a) + ">" + vkey(c);
    const cur = edges.get(k);
    if (cur) cur.n++;
    else edges.set(k, { a, b: c, n: 1 });
  };
  for (const t of flat) {
    // make each 2D triangle counter-clockwise in (s, z)
    const area = (t[1].s - t[0].s) * (t[2].z - t[0].z) - (t[2].s - t[0].s) * (t[1].z - t[0].z);
    if (area < 0) [t[1], t[2]] = [t[2], t[1]];
    bump(t[0], t[1]); bump(t[1], t[2]); bump(t[2], t[0]);
  }
  const boundary: { a: V2; b: V2 }[] = [];
  edges.forEach((e) => {
    if (e.n !== 1) return;
    const onCut =
      Math.abs(Math.abs(e.a.s) - sd) < 1e-9 &&
      Math.abs(Math.abs(e.b.s) - sd) < 1e-9 &&
      Math.abs(e.a.s - e.b.s) < 1e-9;
    if (!onCut) boundary.push({ a: e.a, b: e.b });
  });

  const out: Triangle[] = [];
  for (let i = 0; i < n; i++) {
    const thetaC = (2 * Math.PI * i) / n;
    // Vertices on the cut between two sectors must be bit-identical in both
    // sectors, so compute their angle from the shared cut index, not from
    // each sector centre.
    const angle = (v: V2) => {
      if (Math.abs(Math.abs(v.s) - sd) < 1e-9) {
        const cut = (i + (v.s > 0 ? 0.5 : -0.5) + n) % n;
        return (2 * Math.PI * cut) / n;
      }
      return thetaC + v.s / rp;
    };
    const pos = (v: V2, r: number) => {
      const th = angle(v);
      return [r * Math.cos(th), r * Math.sin(th), v.z];
    };
    const radial = (v: V2) => {
      const th = thetaC + v.s / rp;
      return [Math.cos(th), Math.sin(th), 0];
    };

    // Outer and inner wall
    for (const t of flat) {
      const ho = radial(t[0]);
      emit(out, pos(t[0], rOut), pos(t[1], rOut), pos(t[2], rOut), ho);
      emit(out, pos(t[0], rIn), pos(t[1], rIn), pos(t[2], rIn), ho.map((x) => -x));
    }

    // Side walls along the profile boundary (bottom, prong tops, neck, notch)
    for (const e of boundary) {
      const ds = e.b.s - e.a.s, dz = e.b.z - e.a.z;
      const th = thetaC + (e.a.s + e.b.s) / 2 / rp;
      const tangent = [-Math.sin(th), Math.cos(th), 0];
      // The region lies left of a CCW boundary edge, so outward is to its right
      const hint = [tangent[0] * dz, tangent[1] * dz, -ds];
      const ao = pos(e.a, rOut), bo = pos(e.b, rOut), ai = pos(e.a, rIn), bi = pos(e.b, rIn);
      emit(out, ao, bo, bi, hint);
      emit(out, ao, bi, ai, hint);
    }
  }
  return out;
}
