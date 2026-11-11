# bearing-generator (assemblable ball bearing fork)

A small standalone web app written in TypeScript which generates STL files for
**assemblable ball bearings** — printed as separate parts (not print-in-place)
and assembled around real (or printed) balls.

Fork of [osuushi/bearing-generator](https://github.com/osuushi/bearing-generator),
which generated print-in-place sliding-ring bearings. This version replaces
those with a ball bearing design.

It is fully client-side; there is no server.

## Features

- **Standard size picker** (603, 623, 624, 625, 626, 627, 608, 609, 6000–6003,
  6200–6205, 6900–6904). Picking one fills in bore / outer diameter / width and
  suggests the largest standard ball that fits. Everything remains editable.
- **Ball diameter selector** with common metric and imperial ball sizes, or a
  custom value. Optional manual ball count (0 = as many as fit).
- Optional **printed balls** if you don't have steel/glass ones.
- **Cross-section preview** and an interactive **3D preview** (assembled,
  exploded, cutaway).
- One STL download containing all parts laid out on the build plate.

## Design

Like a real deep-groove bearing, the inner and the outer ring are each **one
piece**. The balls are loaded with the **Conrad method** and locked in place by
a one-piece crown cage:

1. Put the inner ring inside the outer ring and push it against one side. A
   crescent-shaped gap opens on the opposite side.
2. Drop the balls into the crescent, centre the rings, spread the balls evenly.
3. Snap the crown cage on from the lower face.

**Maximum number of balls.** With shoulder radii Ro (outer ring) and Ri (inner
ring) the inner ring is pushed over by e = Ro - Ri. Balls of radius r rest on the
outer shoulder at Rc = Ro - r with neighbours touching (2*asin(r/Rc) apart), and
a ball fits where Rc^2 + e^2 + 2*Rc*e*cos(a) >= (Ri + r)^2 (a measured from the
widest point of the gap). The generator counts the most balls that fit this
way (`loadLimit` in `src/bearing-ball.ts`) and compares it with the limit for the
full circle, Z = floor(pi / asin((Dw + gap) / Dpw)); the smaller one is used. A
higher shoulder ("Ring shoulder height") opens a wider crescent, so more balls
can be loaded, at the cost of a shallower groove.

The upper side of each ring groove is limited to a 45 degree slope, so the rings
print without supports. Either ring can optionally be **split at mid-width** into
two halves (each pair aligns with a small lip and recess and is glued); then any
number of balls fits.

"Ball clearance" is the gap per side between ball and groove (default 0.15 mm).

## Development

Requires node 18+. Run `npm install` (or `yarn install`), then `npm run dev`
for a development server, or `npm run build` to produce a static build in
`dist/`. Uses [vite](https://vitejs.dev/), [three.js](https://threejs.org/) for
the 3D preview, and [mvp.css](https://andybrewer.github.io/mvp/) for styles.

## STL generation

Rings are simple polygons revolved around the Z axis, turned into rings of
triangles (constant point count per circle, see `revolve.ts` / `strip.ts`). The
same polygons drive the cross-section preview. `bearing-ball.ts` builds the
half-ring profiles and the plate layout; `stl.ts` writes binary STL.

## License

MIT, see LICENSE.
