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

Both the inner and the outer ring are split at mid-width into two halves, each
holding half of the ball groove. Each pair of halves aligns with a small lip and
recess. Parts are printed with the **split face up**: the groove then widens
upward so no supports are needed.

Assembly: put the balls in the groove of one half-set, close the other halves
over them, and secure each pair with a drop of CA glue (or clamp the outer ring
in a housing and the inner ring on a shaft).

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
