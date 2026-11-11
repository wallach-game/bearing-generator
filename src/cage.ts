import * as THREE from "three";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";
import type { BallBearing } from "./bearing-ball";
import { revolve } from "./revolve";
import { fromGeometry, toGeometry } from "./meshutil";
import { Triangle } from "./types";

// Crown cage: a flat annular band at the pitch circle with prongs reaching up
// past the ball equator. Spherical pockets (slightly larger than the balls)
// are subtracted at every ball position, which leaves the prongs between the
// balls. The cage is built in assembled coordinates; the open side faces +Z.
export function buildCage(b: BallBearing): Triangle[] {
  const bodyTris = revolve(b.cageBodyPolygon());
  const evaluator = new Evaluator();
  evaluator.attributes = ["position", "normal"];

  let result = new Brush(toGeometry(bodyTris));
  result.updateMatrixWorld();

  const R = b.cagePocketRadius;
  const n = b.ballCount;
  for (let i = 0; i < n; i++) {
    const ang = (2 * Math.PI * i) / n;
    const sphereGeo = new THREE.SphereGeometry(R, 32, 20).toNonIndexed();
    sphereGeo.deleteAttribute("uv");
    const sphere = new Brush(sphereGeo);
    sphere.position.set(b.rp * Math.cos(ang), b.rp * Math.sin(ang), b.half);
    sphere.updateMatrixWorld();
    result = evaluator.evaluate(result, sphere, SUBTRACTION);
    result.updateMatrixWorld();
  }
  return fromGeometry(result.geometry);
}
