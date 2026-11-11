import * as THREE from "three";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";
import type { BallBearing } from "./bearing-ball";
import { revolve } from "./revolve";
import { fromGeometry, toGeometry } from "./meshutil";
import { Triangle } from "./types";

// Crown cage: a thin cylindrical wall at the pitch circle with a solid band
// below the notches (standing proud of the lower face). A round notch is cut
// from the top edge for every ball, with a slightly narrower neck above it so
// the balls snap in. Built in assembled coordinates; the open side faces +Z.
export function buildCage(b: BallBearing): Triangle[] {
  const evaluator = new Evaluator();
  evaluator.attributes = ["position", "normal"];

  let result = new Brush(toGeometry(revolve(b.cageBodyPolygon())));
  result.updateMatrixWorld();

  const R = b.cagePocketRadius;
  const n = b.ballCount;
  const neckLen = b.cageTop - b.half + 1; // reaches past the top edge
  const prep = (g: THREE.BufferGeometry) => {
    const ng = g.index ? g.toNonIndexed() : g;
    ng.deleteAttribute("uv");
    return ng;
  };
  for (let i = 0; i < n; i++) {
    const ang = (2 * Math.PI * i) / n;
    const cx = b.rp * Math.cos(ang);
    const cy = b.rp * Math.sin(ang);

    // Round notch: cylinder along the radial direction, centred on the ball
    const cyl = new THREE.CylinderGeometry(R, R, 6, 40);
    cyl.rotateZ(Math.PI / 2); // axis along X (radial direction before rotation)
    const notch = new Brush(prep(cyl));
    notch.position.set(cx, cy, b.half);
    notch.rotation.z = ang;
    notch.updateMatrixWorld();
    result = evaluator.evaluate(result, notch, SUBTRACTION);
    result.updateMatrixWorld();

    // Neck slot from the ball equator up through the top edge
    const slot = new Brush(prep(new THREE.BoxGeometry(6, b.cageNeck, neckLen)));
    slot.position.set(cx, cy, b.half + neckLen / 2);
    slot.rotation.z = ang;
    slot.updateMatrixWorld();
    result = evaluator.evaluate(result, slot, SUBTRACTION);
    result.updateMatrixWorld();
  }
  return fromGeometry(result.geometry);
}
