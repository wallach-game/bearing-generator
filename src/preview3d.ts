import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Bearing } from "./bearing";
import { Triangle } from "./types";

function toGeometry(tris: Triangle[]): THREE.BufferGeometry {
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

export class Preview3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private group = new THREE.Group();
  private clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  private framed = false;
  cutaway = false;
  exploded = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.localClippingEnabled = true;
    this.scene.background = new THREE.Color(0x15171a);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);
    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x333344, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(40, -60, 80);
    this.scene.add(sun);
    this.scene.add(this.group);
    this.resize();
    window.addEventListener("resize", () => this.resize());
    const loop = () => {
      requestAnimationFrame(loop);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  private resize() {
    const w = this.canvas.clientWidth || 600;
    const h = this.canvas.clientHeight || 400;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(bearing: Bearing) {
    const explode = this.exploded ? bearing.width * 0.6 : 0;
    const parts = bearing.getAssembledParts(explode);
    for (const child of [...this.group.children]) {
      (child as THREE.Mesh).geometry.dispose();
      this.group.remove(child);
    }
    const clipping = this.cutaway ? [this.clip] : [];
    const make = (tris: Triangle[], color: number, metal: number, rough: number) => {
      const mat = new THREE.MeshStandardMaterial({
        color,
        metalness: metal,
        roughness: rough,
        side: THREE.DoubleSide,
        clippingPlanes: clipping,
      });
      this.group.add(new THREE.Mesh(toGeometry(tris), mat));
    };
    make(parts.outer, 0xe0a54a, 0.1, 0.6);
    make(parts.inner, 0x4a90d9, 0.1, 0.6);
    // Balls
    make(parts.balls, 0xc8ccd0, 0.9, 0.25);
    // Centre the model
    this.group.position.set(0, 0, -bearing.width / 2);
    if (!this.framed) {
      const d = bearing.outerDiameter;
      this.camera.position.set(d * 0.9, -d * 1.3, d * 0.9);
      this.controls.target.set(0, 0, 0);
      this.framed = true;
    }
  }
}
