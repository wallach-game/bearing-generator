import { Bearing } from "./bearing";
import { Polygon } from "./polygon";
import { revolve } from "./revolve";
import { newXZPoint, Point, Triangle } from "./types";

// Minimum wall thickness under the bottom of a raceway groove
const minThickness = 1.25;
// Minimum flat land thickness between groove edge and the outer face of a half
const minLand = 0.8;
// Per-side fit of the alignment lip in its recess
const lipFit = 0.1;
const lipMaxHeight = 0.8;
// Minimum gap between adjacent balls
const ballSpacing = 0.3;
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
  printBalls: boolean;
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
  printBalls: boolean;

  constructor(p: BallBearingParams) {
    this.outerDiameter = p.outerDiameter;
    this.boreDiameter = p.boreDiameter;
    this.width = p.width;
    this.ballDiameter = p.ballDiameter;
    this.clearance = p.clearance;
    this.ballCountSetting = p.ballCount;
    this.printBalls = p.printBalls;
  }

  get ri() { return this.boreDiameter / 2; }
  get ro() { return this.outerDiameter / 2; }
  get rp() { return (this.boreDiameter + this.outerDiameter) / 4; }
  get r() { return this.ballDiameter / 2; }
  // Groove radius
  get rg() { return this.r + this.clearance; }
  // Land offset from pitch circle
  get h() { return this.r * landFactor; }
  get half() { return this.width / 2; }
  // Axial half-extent of the groove on the land
  get zg() { return Math.sqrt(Math.max(0, this.rg * this.rg - this.h * this.h)); }
  get lipHeight() { return Math.min(lipMaxHeight, this.half - 1.1); }

  get maxBalls(): number {
    const ratio = (this.ballDiameter + ballSpacing) / (2 * this.rp);
    if (ratio >= 1) return 0;
    return Math.floor(Math.PI / Math.asin(ratio));
  }

  get ballCount(): number {
    return this.ballCountSetting > 0 ? this.ballCountSetting : this.maxBalls;
  }

  summary(): string {
    return `${this.ballCount} × Ø${this.ballDiameter.toFixed(3).replace(/\.?0+$/, "")} mm balls` +
      (this.printBalls ? " (printed)" : " (steel/glass, bought)");
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
    const f = lipFit;
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
    const pts: Point[] = [newXZPoint(lo, 0), newXZPoint(ro, 0), newXZPoint(ro, H)];
    pts.push(...this.faceFeature(this.lipSpan(rp + rg, ro), kind));
    pts.push(newXZPoint(rp + rg, H));
    const a = Math.acos(h / rg);
    for (let i = 1; i < arcSteps; i++) {
      const phi = -a * (i / arcSteps);
      pts.push(newXZPoint(rp + rg * Math.cos(phi), H + rg * Math.sin(phi)));
    }
    pts.push(newXZPoint(lo, H - zg));
    return new Polygon(pts);
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
      pts.push(newXZPoint(this.r * Math.sin(t), -this.r * Math.cos(t)));
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
    // Row 1: outer ring halves
    tris.push(...this.placed(this.outerHalfPolygon("lip"), -(ro + plateGap / 2), y));
    tris.push(...this.placed(this.outerHalfPolygon("recess"), ro + plateGap / 2, y));
    // Row 2: inner ring halves
    y -= ro + liOuter + plateGap;
    tris.push(...this.placed(this.innerHalfPolygon("lip"), -(liOuter + plateGap / 2), y));
    tris.push(...this.placed(this.innerHalfPolygon("recess"), liOuter + plateGap / 2, y));
    // Row 3: optional printed balls
    if (this.printBalls) {
      const pitch = this.ballDiameter + 2;
      const cols = Math.max(1, Math.floor((2 * ro + plateGap) / pitch));
      y -= liOuter + this.r + plateGap;
      const n = this.ballCount;
      for (let i = 0; i < n; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = (col - (cols - 1) / 2) * pitch;
        tris.push(...this.placed(this.ballPolygon(), x, y - row * pitch, this.r));
      }
    }
    return tris;
  }

  // Parts for the 3D preview, grouped so they can be coloured separately.
  // explode > 0 separates the halves along Z and lifts the balls out.
  getAssembledParts(explode = 0): { inner: Triangle[]; outer: Triangle[]; balls: Triangle[] } {
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
    return { inner, outer, balls };
  }

  drawPreview(canvas: HTMLCanvasElement) {
    const W = this.width;
    const parts: { poly: Polygon; flip: boolean }[] = [
      { poly: this.innerHalfPolygon("lip"), flip: false },
      { poly: this.innerHalfPolygon("recess"), flip: true },
      { poly: this.outerHalfPolygon("lip"), flip: false },
      { poly: this.outerHalfPolygon("recess"), flip: true },
    ];
    const cw = canvas.width, ch = canvas.height;
    const scale = Math.min(cw / (2 * this.ro), ch / W) * 0.8;
    const tx = (x: number) => cw / 2 + x * scale;
    const ty = (z: number) => ch / 2 - (z - W / 2) * scale;

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
        ctx.fillStyle = idx % 2 === 0 ? "rgb(240,200,100)" : "rgb(226,170,80)";
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
