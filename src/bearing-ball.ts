import { Bearing } from "./bearing";
import { Polygon } from "./polygon";
import { revolve } from "./revolve";
import { newXZPoint, Point, Triangle } from "./types";
import { buildCage } from "./cage";
import { shift } from "./meshutil";

// Minimum wall thickness under the bottom of a raceway groove
const minThickness = 1.25;
// Minimum flat land thickness between groove edge and the outer face of a half
const minLand = 0.8;
// Per-side fit of the alignment lip in its recess
const lipMaxHeight = 0.8;
// Minimum gap between adjacent balls
const ballSpacing = 0.3;
// Minimum gap between adjacent balls when a cage is used (leaves room for prongs)
const cageBallSpacing = 1.4;
// The cover sits this far below the outer face inside its seat
const coverRecess = 0.1;
// The ball lands sit this fraction of the ball radius away from the pitch circle
const landFactor = 0.5;
const arcSteps = 24;
const plateGap = 5;

export interface BallBearingParams {
  outerDiameter: number;
  boreDiameter: number;
  width: number;
  ballDiameter: number;
  clearance: number;
  ballCount: number; // 0 = automatic
  cage: boolean; // design: use a crown cage
  covers: boolean; // design: use dust covers
  // Per-part fits (mm)
  lipFit: number; // alignment lip in recess, per side
  cageClearance: number; // cage notch over the ball radius
  cageWallClearance: number; // cage wall to ring lands, per side
  cageThick: number; // radial wall thickness
  cageBand: number; // height of the solid band below the notches
  cageProng: number; // prong top above ball centre, in ball radii
  coverThick: number; // cover thickness (axial)
  coverSeat: number; // cover seat width (radial overlap with the outer ring)
  coverFit: number; // cover edge in its seat, per side
  coverGap: number; // cover inner edge over the inner ring land
  // Which parts go into the STL
  include: PartSelection;
}

export interface PartSelection {
  outer: boolean;
  inner: boolean;
  cage: boolean;
  covers: boolean;
  balls: boolean;
}

type Lip = { xa: number; xb: number } | null;

// An assemblable ball bearing. Both rings are split at mid-width into two
// halves with a half-groove each. The halves are printed with the split face
// up (the groove then widens upward, so no supports are needed) and are
// assembled around the balls.
export class BallBearing implements Bearing {
  outerDiameter: number;
  boreDiameter: number;
  width: number;
  ballDiameter: number;
  clearance: number;
  ballCountSetting: number;
  cage: boolean;
  covers: boolean;
  lipFit: number;
  cageClearance: number;
  cageWallClearance: number;
  cageThickness: number;
  cageBandHeight: number;
  cageProngFactor: number;
  coverThickness: number;
  coverSeatWidth: number;
  coverFit: number;
  coverGap: number;
  include: PartSelection;
  private cageCache: Triangle[] | null = null;

  constructor(p: BallBearingParams) {
    this.outerDiameter = p.outerDiameter;
    this.boreDiameter = p.boreDiameter;
    this.width = p.width;
    this.ballDiameter = p.ballDiameter;
    this.clearance = p.clearance;
    this.ballCountSetting = p.ballCount;
    this.lipFit = p.lipFit;
    this.cageClearance = p.cageClearance;
    this.cageWallClearance = p.cageWallClearance;
    this.cageThickness = p.cageThick;
    this.cageBandHeight = p.cageBand;
    this.cageProngFactor = p.cageProng;
    this.coverThickness = p.coverThick;
    this.coverSeatWidth = p.coverSeat;
    this.coverFit = p.coverFit;
    this.coverGap = p.coverGap;
    this.include = { ...p.include };
    this.cage = p.cage;
    this.covers = p.covers;
  }

  get ri() { return this.boreDiameter / 2; }
  get ro() { return this.outerDiameter / 2; }
  get rp() { return (this.boreDiameter + this.outerDiameter) / 4; }
  get r() { return this.ballDiameter / 2; }
  // Groove radius
  get rg() { return this.r + this.clearance; }
  // Land offset from pitch circle
  get h() {
    const base = this.r * landFactor;
    if (!this.cage) return base;
    // Small balls leave a very narrow gap between the lands; widen it so the
    // cage wall (at least 0.8 mm) still fits, but keep it narrower than the ball.
    const need = (0.8 + 2 * this.cageWallClearance) / 2;
    return Math.max(base, Math.min(need, 0.85 * this.r));
  }
  get half() { return this.width / 2; }
  // Axial half-extent of the groove on the land
  get zg() { return Math.sqrt(Math.max(0, this.rg * this.rg - this.h * this.h)); }
  // Crown cage geometry
  // Radial wall thickness, limited by the gap between the ring lands
  get cageWidth() { return Math.min(this.cageThickness, 2 * this.h - 2 * this.cageWallClearance); }
  // As in a real bearing the whole cage sits inside the bearing width: the
  // solid band lies directly under the balls (between the balls and the lower
  // face / lower cover) and the thin wall runs up between the balls.
  get cageBand() { return this.cageBandHeight; }
  get cageBottom() { return this.half - this.cagePocketRadius - this.cageBand; }
  // Lowest z the cage may reach: the lower face, or the lower cover when fitted
  // Cover geometry (axial thickness, radial seat width, seat depth)
  get seatWidth() { return this.coverSeatWidth; }
  get seatDepth() { return this.coverThickness + coverRecess; }
  get cageFloor() { return this.covers ? this.seatDepth + 0.15 : 0.15; }
  get cageTop() {
    const limit = this.covers ? this.width - this.seatDepth - 0.2 : this.width - 0.3;
    // The prongs must at least clear the notch neck, whatever the setting
    const R = this.cagePocketRadius;
    const neckTop = this.half + Math.sqrt(Math.max(0, R * R - (this.cageNeck / 2) ** 2));
    return Math.min(Math.max(this.half + this.cageProngFactor * this.r, neckTop + 0.3), limit);
  }
  // Width of the neck above each notch (narrower than the ball: snap fit)
  get cageNeck() { return 1.8 * this.r; }
  hasSeat(_kind: "lip" | "recess") { return this.covers; }
  get cagePocketRadius() { return this.r + this.cageClearance; }
  // Dust cover geometry
  get coverInner() { return this.rp - this.h + this.coverGap; }
  get coverOuter() { return this.rp + this.h + this.seatWidth - this.coverFit; }
  get coverZ0() { return coverRecess; }
  get lipHeight() { return Math.min(lipMaxHeight, this.half - 1.1); }

  get maxBalls(): number {
    const gap = this.cage ? cageBallSpacing : ballSpacing;
    const ratio = (this.ballDiameter + gap) / (2 * this.rp);
    if (ratio >= 1) return 0;
    return Math.floor(Math.PI / Math.asin(ratio));
  }

  get ballCount(): number {
    return this.ballCountSetting > 0 ? this.ballCountSetting : this.maxBalls;
  }

  summary(): string {
    return `${this.ballCount} × Ø${this.ballDiameter.toFixed(3).replace(/\.?0+$/, "")} mm balls` +
      (this.include.balls ? " (printed)" : " (steel/glass, bought)") +
      (this.cage ? " + crown cage" : "") + (this.covers ? " + 2 dust covers" : "");
  }

  // Largest ball diameter that satisfies the wall thickness limits
  static maxBallDiameter(bore: number, outer: number, clearance: number): number {
    const rp = (bore + outer) / 4;
    const wall = Math.min(rp - bore / 2, outer / 2 - rp) - minThickness - clearance;
    return 2 * wall;
  }

  validate() {
    if (!(this.ballDiameter > 0)) throw new Error("Ball diameter must be positive");
    if (this.boreDiameter >= this.outerDiameter) {
      throw new Error("Bore diameter must be smaller than outer diameter");
    }
    const wallInner = this.rp - this.rg - this.ri;
    const wallOuter = this.ro - (this.rp + this.rg);
    if (Math.min(wallInner, wallOuter) < minThickness) {
      const max = BallBearing.maxBallDiameter(this.boreDiameter, this.outerDiameter, this.clearance);
      throw new Error(
        `Ball is too large for these diameters (max about ${Math.max(0, max).toFixed(1)} mm)`
      );
    }
    if (this.half - this.zg < minLand) {
      throw new Error("Width is too small for this ball size");
    }
    if (this.cage && this.cageWidth < 0.6) {
      throw new Error("Balls are too small for a crown cage (the wall would be thinner than 0.6 mm)");
    }
    if (this.covers) {
      if (this.ro - (this.rp + this.h) - this.seatWidth < minThickness) {
        throw new Error("Outer ring wall is too thin for the dust cover seat");
      }
      if (this.half - this.zg - this.seatDepth < 0.4) {
        throw new Error("Width is too small for the dust cover seat");
      }
    }
    if (this.cage && this.cageBottom < this.cageFloor) {
      throw new Error(
        "Not enough room for the cage inside the bearing: use smaller balls, a lower cage band height, or a wider bearing"
      );
    }
    if (this.cage) {
      const R = this.cagePocketRadius;
      const neckTop = this.half + Math.sqrt(Math.max(0, R * R - (this.cageNeck / 2) ** 2));
      if (this.cageTop < neckTop + 0.2) {
        throw new Error("Cage prong height is too low for the notch neck; increase prong height");
      }
      const sd = (this.rp * Math.PI) / Math.max(1, this.ballCount);
      if (sd - R < 0.4) {
        throw new Error("Cage prongs between the balls would be thinner than 0.8 mm; use fewer balls or a smaller notch clearance");
      }
    }
    if (this.covers && this.coverInner >= this.coverOuter - 1) {
      throw new Error("Cover gap is too large for the cover width");
    }
    if (this.maxBalls < 3) {
      throw new Error("Not enough room for at least 3 balls");
    }
    if (this.ballCountSetting > this.maxBalls) {
      throw new Error(`Too many balls; at most ${this.maxBalls} fit`);
    }
    if (this.ballCountSetting > 0 && this.ballCountSetting < 3) {
      throw new Error("Use at least 3 balls (or 0 for automatic)");
    }
  }

  private lipSpan(x0: number, x1: number): Lip {
    const A = x1 - x0;
    if (A < 1.8 || this.lipHeight < 0.3) return null;
    const w = Math.min(1.5, A / 3);
    const xa = x0 + (A - w) / 2;
    return { xa, xb: xa + w };
  }

  // Points of the lip (lower half) or recess (upper half), walking from the
  // larger x to the smaller x along the split face at z = half.
  private faceFeature(lip: Lip, kind: "lip" | "recess"): Point[] {
    if (!lip) return [];
    const H = this.half;
    const lh = this.lipHeight;
    if (kind === "lip") {
      return [
        newXZPoint(lip.xb, H),
        newXZPoint(lip.xb, H + lh),
        newXZPoint(lip.xa, H + lh),
        newXZPoint(lip.xa, H),
      ];
    }
    const f = this.lipFit;
    return [
      newXZPoint(lip.xb + f, H),
      newXZPoint(lip.xb + f, H - lh - f),
      newXZPoint(lip.xa - f, H - lh - f),
      newXZPoint(lip.xa - f, H),
    ];
  }

  // Cross-section polygon of one half of the outer ring. z = 0 is the outer
  // (bed) face, z = half is the split face.
  outerHalfPolygon(kind: "lip" | "recess"): Polygon {
    const { rp, rg, h, ro, half: H, zg } = this;
    const lo = rp + h;
    const seat = this.hasSeat(kind);
    const s = seat ? this.seatWidth : 0;
    const pts: Point[] = [newXZPoint(lo + s, 0), newXZPoint(ro, 0), newXZPoint(ro, H)];
    pts.push(...this.faceFeature(this.lipSpan(rp + rg, ro), kind));
    pts.push(newXZPoint(rp + rg, H));
    const a = Math.acos(h / rg);
    for (let i = 1; i < arcSteps; i++) {
      const phi = -a * (i / arcSteps);
      pts.push(newXZPoint(rp + rg * Math.cos(phi), H + rg * Math.sin(phi)));
    }
    pts.push(newXZPoint(lo, H - zg));
    if (seat) {
      // Counterbore seat for the dust cover
      pts.push(newXZPoint(lo, this.seatDepth), newXZPoint(lo + s, this.seatDepth));
    }
    return new Polygon(pts);
  }

  coverPolygon(): Polygon {
    const z0 = this.coverZ0;
    return new Polygon([
      newXZPoint(this.coverInner, z0),
      newXZPoint(this.coverOuter, z0),
      newXZPoint(this.coverOuter, this.seatDepth),
      newXZPoint(this.coverInner, this.seatDepth),
    ]);
  }

  cageBodyPolygon(): Polygon {
    const a = this.rp - this.cageWidth / 2, c = this.rp + this.cageWidth / 2;
    return new Polygon([
      newXZPoint(a, this.cageBottom),
      newXZPoint(c, this.cageBottom),
      newXZPoint(c, this.cageTop),
      newXZPoint(a, this.cageTop),
    ]);
  }

  // The cage is one solid part (not split); built once via CSG
  cageTriangles(): Triangle[] {
    if (!this.cageCache) this.cageCache = buildCage(this);
    return this.cageCache;
  }

  innerHalfPolygon(kind: "lip" | "recess"): Polygon {
    const { rp, rg, h, ri, half: H, zg } = this;
    const li = rp - h;
    const pts: Point[] = [newXZPoint(ri, 0), newXZPoint(li, 0), newXZPoint(li, H - zg)];
    const phi0 = -Math.PI + Math.acos(h / rg);
    for (let i = 1; i < arcSteps; i++) {
      const phi = phi0 + (-Math.PI - phi0) * (i / arcSteps);
      pts.push(newXZPoint(rp + rg * Math.cos(phi), H + rg * Math.sin(phi)));
    }
    pts.push(newXZPoint(rp - rg, H));
    pts.push(...this.faceFeature(this.lipSpan(ri, rp - rg), kind));
    pts.push(newXZPoint(ri, H));
    return new Polygon(pts);
  }

  ballPolygon(): Polygon {
    const n = 32;
    const pts: Point[] = [];
    for (let i = 0; i <= n; i++) {
      const t = (Math.PI * i) / n;
      // Exact zero radius at the poles, so the pole fans are clean
      const x = i === 0 || i === n ? 0 : this.r * Math.sin(t);
      pts.push(newXZPoint(x, -this.r * Math.cos(t)));
    }
    return new Polygon(pts);
  }

  // Revolve a polygon and move it. With flipZ the part is mirrored about the
  // mid-width plane (z -> width - z), then shifted by dz.
  private placed(poly: Polygon, dx: number, dy: number, dz = 0, flipZ = false): Triangle[] {
    const out: Triangle[] = [];
    const mv = (p: Point) =>
      new Point({ x: p.x + dx, y: p.y + dy, z: (flipZ ? this.width - p.z : p.z) + dz });
    for (const t of revolve(poly)) {
      // Skip zero-area triangles (from poles / points on the axis)
      const ux = t.b.x - t.a.x, uy = t.b.y - t.a.y, uz = t.b.z - t.a.z;
      const vx = t.c.x - t.a.x, vy = t.c.y - t.a.y, vz = t.c.z - t.a.z;
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      if (cx * cx + cy * cy + cz * cz < 1e-12) continue;
      const a = mv(t.a), b = mv(t.b), c = mv(t.c);
      out.push(flipZ ? new Triangle({ a, b: c, c: b }) : new Triangle({ a, b, c }));
    }
    return out;
  }

  // All parts laid out on one print plate
  getTriangles(): Triangle[] {
    const tris: Triangle[] = [];
    const ro = this.ro;
    const liOuter = this.rp - this.h;
    let y = 0;
    let prevR = 0;
    let first = true;
    // Start a new row of parts with the given radius and return its Y
    const row = (r: number) => {
      if (first) first = false;
      else y -= prevR + r + plateGap;
      prevR = r;
      return y;
    };
    const inc = this.include;
    let ry = 0;
    // Outer ring halves
    if (inc.outer) {
      ry = row(ro);
      tris.push(...this.placed(this.outerHalfPolygon("lip"), -(ro + plateGap / 2), ry));
      tris.push(...this.placed(this.outerHalfPolygon("recess"), ro + plateGap / 2, ry));
    }
    // Inner ring halves
    if (inc.inner) {
      ry = row(liOuter);
      tris.push(...this.placed(this.innerHalfPolygon("lip"), -(liOuter + plateGap / 2), ry));
      tris.push(...this.placed(this.innerHalfPolygon("recess"), liOuter + plateGap / 2, ry));
    }
    // Crown cage: one solid part, printed with the band down
    if (this.cage && inc.cage) {
      ry = row(this.rp + this.cageWidth / 2);
      tris.push(...shift(this.cageTriangles(), 0, ry, -this.cageBottom));
    }
    // Dust covers
    if (this.covers && inc.covers) {
      const co = this.coverOuter;
      ry = row(co);
      tris.push(...this.placed(this.coverPolygon(), -(co + plateGap / 2), ry, -this.coverZ0));
      tris.push(...this.placed(this.coverPolygon(), co + plateGap / 2, ry, -this.coverZ0));
    }
    // Optional printed balls
    if (inc.balls) {
      const pitch = this.ballDiameter + 2;
      const cols = Math.max(1, Math.floor((2 * ro + plateGap) / pitch));
      ry = row(this.r);
      const n = this.ballCount;
      for (let i = 0; i < n; i++) {
        const col = i % cols;
        const rw = Math.floor(i / cols);
        const x = (col - (cols - 1) / 2) * pitch;
        tris.push(...this.placed(this.ballPolygon(), x, ry - rw * pitch, this.r));
      }
    }
    return tris;
  }

  // Parts for the 3D preview, grouped so they can be coloured separately.
  // explode > 0 separates the halves along Z and lifts the balls out.
  getAssembledParts(explode = 0): {
    inner: Triangle[]; outer: Triangle[]; balls: Triangle[]; cage: Triangle[]; covers: Triangle[];
  } {
    const inner = [
      ...this.placed(this.innerHalfPolygon("lip"), 0, 0, -explode),
      ...this.placed(this.innerHalfPolygon("recess"), 0, 0, explode, true),
    ];
    const outer = [
      ...this.placed(this.outerHalfPolygon("lip"), 0, 0, -explode),
      ...this.placed(this.outerHalfPolygon("recess"), 0, 0, explode, true),
    ];
    const balls: Triangle[] = [];
    const n = this.ballCount;
    const ballPoly = this.ballPolygon();
    // One ball mesh, rotated copies per angle
    const base = this.placed(ballPoly, 0, 0, 0);
    for (let i = 0; i < n; i++) {
      const ang = (2 * Math.PI * i) / n;
      const cs = Math.cos(ang), sn = Math.sin(ang);
      const rot = (p: Point) =>
        new Point({
          x: (p.x + this.rp) * cs - p.y * sn,
          y: (p.x + this.rp) * sn + p.y * cs,
          z: p.z + this.width / 2,
        });
      for (const t of base) {
        balls.push(new Triangle({ a: rot(t.a), b: rot(t.b), c: rot(t.c) }));
      }
    }
    const cage = this.cage ? shift(this.cageTriangles(), 0, 0, -explode * 1.1) : [];
    const covers: Triangle[] = [];
    if (this.covers) {
      covers.push(...this.placed(this.coverPolygon(), 0, 0, -explode * 1.6));
      covers.push(...this.placed(this.coverPolygon(), 0, 0, explode * 1.6, true));
    }
    return { inner, outer, balls, cage, covers };
  }

  drawPreview(canvas: HTMLCanvasElement) {
    const W = this.width;
    const parts: { poly: Polygon; flip: boolean }[] = [
      { poly: this.innerHalfPolygon("lip"), flip: false },
      { poly: this.innerHalfPolygon("recess"), flip: true },
      { poly: this.outerHalfPolygon("lip"), flip: false },
      { poly: this.outerHalfPolygon("recess"), flip: true },
    ];
    if (this.covers) {
      parts.push({ poly: this.coverPolygon(), flip: false });
      parts.push({ poly: this.coverPolygon(), flip: true });
    }
    const cw = canvas.width, ch = canvas.height;
    // Fit to the real extent of all parts (the cover cup hangs below the face)
    let zMin = 0, zMax = W;
    for (const part of parts) {
      for (const p of part.poly.points as Point[]) {
        const z = part.flip ? W - p.z : p.z;
        zMin = Math.min(zMin, z);
        zMax = Math.max(zMax, z);
      }
    }
    const scale = Math.min(cw / (2 * this.ro), ch / (zMax - zMin)) * 0.8;
    const zMid = (zMin + zMax) / 2;
    const tx = (x: number) => cw / 2 + x * scale;
    const ty = (z: number) => ch / 2 - (z - zMid) * scale;

    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, cw, ch);

    // Bore background
    const g = ctx.createLinearGradient(tx(-this.ri), 0, tx(this.ri), 0);
    g.addColorStop(0, "rgb(102,102,69)");
    g.addColorStop(0.45, "rgb(206,207,176)");
    g.addColorStop(0.55, "rgb(206,207,176)");
    g.addColorStop(1, "rgb(102,102,69)");
    ctx.fillStyle = g;
    ctx.fillRect(tx(-this.ri), ty(W), 2 * this.ri * scale, W * scale);

    const draw = (mirror: boolean) => {
      parts.forEach((part, idx) => {
        ctx.fillStyle = idx >= 4 ? "rgb(150,160,170)" : idx % 2 === 0 ? "rgb(240,200,100)" : "rgb(226,170,80)";
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        part.poly.points.forEach((p: Point, i: number) => {
          const x = mirror ? -p.x : p.x;
          const z = part.flip ? W - p.z : p.z;
          if (i === 0) ctx.moveTo(tx(x), ty(z));
          else ctx.lineTo(tx(x), ty(z));
        });
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      });
      // Ball
      const cx = tx(mirror ? -this.rp : this.rp);
      const cy = ty(W / 2);
      const rad = this.r * scale;
      const bg = ctx.createRadialGradient(cx - rad / 3, cy - rad / 3, rad / 8, cx, cy, rad);
      bg.addColorStop(0, "#fafafa");
      bg.addColorStop(1, "#6f7a85");
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, 2 * Math.PI);
      ctx.fill();
    };
    draw(false);
    draw(true);
  }

  get fileName(): string {
    const f = (n: number) => n.toFixed(2).replace(/\.?0*$/, "");
    return `bearing-balls-${f(this.boreDiameter)}-${f(this.outerDiameter)}-${f(this.width)}-ball${f(this.ballDiameter)}.stl`;
  }
}
