import * as THREE from "three";
import { Point, Triangle } from "./types";

export function toGeometry(tris: Triangle[]): THREE.BufferGeometry {
  const pos = new Float32Array(tris.length * 9);
  tris.forEach((t, i) => {
    [t.a, t.b, t.c].forEach((p, j) => {
      pos[i * 9 + j * 3] = p.x;
      pos[i * 9 + j * 3 + 1] = p.y;
      pos[i * 9 + j * 3 + 2] = p.z;
    });
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function fromGeometry(g: THREE.BufferGeometry): Triangle[] {
  const pos = g.getAttribute("position");
  const index = g.getIndex();
  const count = index ? index.count : pos.count;
  const pt = (i: number) => {
    const k = index ? index.getX(i) : i;
    return new Point({ x: pos.getX(k), y: pos.getY(k), z: pos.getZ(k) });
  };
  const out: Triangle[] = [];
  for (let i = 0; i < count; i += 3) {
    out.push(new Triangle({ a: pt(i), b: pt(i + 1), c: pt(i + 2) }));
  }
  return out;
}

export function shift(tris: Triangle[], dx: number, dy: number, dz: number): Triangle[] {
  const mv = (p: Point) => new Point({ x: p.x + dx, y: p.y + dy, z: p.z + dz });
  return tris.map((t) => new Triangle({ a: mv(t.a), b: mv(t.b), c: mv(t.c) }));
}
