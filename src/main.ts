import {
  generate,
  generatePreview,
  readConfig,
  validate,
  writeConfig,
} from "./generate";
import { BallBearing } from "./bearing-ball";
import { bearingParamsFor } from "./generate";
import { configToLink, defaultConfig, parseConfig } from "./config";
import { decodeQrFromFile, downloadCanvas, printCanvas, renderLabel } from "./codes";
import "./style.css";

// Common bearing sizes: [name, bore, outer diameter, width] in mm
const standardSizes: [string, number, number, number][] = [
  ["603", 3, 9, 5],
  ["623", 3, 10, 4],
  ["624", 4, 13, 5],
  ["625", 5, 16, 5],
  ["626", 6, 19, 6],
  ["627", 7, 22, 7],
  ["608", 8, 22, 7],
  ["609", 9, 24, 7],
  ["6000", 10, 26, 8],
  ["6001", 12, 28, 8],
  ["6002", 15, 32, 9],
  ["6003", 17, 35, 10],
  ["6200", 10, 30, 9],
  ["6201", 12, 32, 10],
  ["6202", 15, 35, 11],
  ["6203", 17, 40, 12],
  ["6204", 20, 47, 14],
  ["6205", 25, 52, 15],
  ["6900", 10, 22, 6],
  ["6901", 12, 24, 6],
  ["6902", 15, 28, 7],
  ["6903", 17, 30, 7],
  ["6904", 20, 37, 9],
];

// Common ball sizes in mm (label, diameter)
const ballSizes: [string, number][] = [
  ["2 mm", 2],
  ["3/32\" (2.381 mm)", 2.381],
  ["2.5 mm", 2.5],
  ["3 mm", 3],
  ["1/8\" (3.175 mm)", 3.175],
  ["5/32\" (3.969 mm)", 3.969],
  ["4 mm", 4],
  ["3/16\" (4.763 mm)", 4.763],
  ["5 mm", 5],
  ["6 mm", 6],
  ["1/4\" (6.35 mm)", 6.35],
  ["7 mm", 7],
  ["5/16\" (7.938 mm)", 7.938],
  ["8 mm", 8],
];

const sizeOptions = standardSizes
  .map(([n, d, o, w]) => `<option value="${n}">${n} (${d}×${o}×${w})</option>`)
  .join("");
const ballOptions = ballSizes
  .map(([l, d]) => `<option value="${d}"${d === 4 ? " selected" : ""}>${l}</option>`)
  .join("");

const d = defaultConfig;
// One parameter per row: label on the left, input on the right
const row = (label: string, control: string, forId = "") =>
  `<tr><td style="width:55%"><label${forId ? ` for="${forId}"` : ""}>${label}</label></td><td>${control}</td></tr>`;
const field = (id: string, label: string, value: number, step: number, min: number, max: number) =>
  row(label, `<input type="number" id="${id}" value="${value}" step="${step}" min="${min}" max="${max}" required>`, id);
const checkRow = (id: string, label: string, on: boolean) =>
  row(label, `<input type="checkbox" id="${id}"${on ? " checked" : ""}>`, id);

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
    <header style="margin-bottom:0; padding-bottom:0;">
      <h1> Ball Bearing Generator </h1>
    </header>
    <form onsubmit="return false">
    <p>
    STL generator for <strong>assemblable ball bearings</strong>. Instead of printing in place, the inner
    and outer rings are each printed as two halves (split at mid-width, each with half of the ball
    groove). You put the balls in the groove, close the halves around them, and glue or clamp each pair together.
    Optional one-piece crown cage and dust covers are included.
    </p>
    <section>
    <h3>Size</h3>
    <table>
      ${row("Standard size", `<select id="size-select"><option value="custom">Custom</option>${sizeOptions}</select>`, "size-select")}
      ${field("bore-diameter", "Bore diameter (mm)", d.bore, 0.1, 1, 1000)}
      ${field("outer-diameter", "Outer diameter (mm)", d.outer, 0.1, 8, 1000)}
      ${field("width", "Width (mm)", d.width, 0.1, 4, 1000)}
      ${row("Ball diameter", `<select id="ball-select">${ballOptions}<option value="custom">Custom…</option></select>`, "ball-select")}
      ${row("Custom ball diameter (mm)", `<input type="number" id="ball-custom" value="4" step="0.001" min="1" max="50" disabled>`, "ball-custom")}
      ${field("ball-count", "Number of balls (0 = max)", d.count, 1, 0, 100)}
    </table>

    <details id="size-table-box">
      <summary>Table of standard sizes (click a row to use it)</summary>
      <table id="size-table">
        <thead>
          <tr><th>Size</th><th>Bore</th><th>Outer Ø</th><th>Width</th><th>Pitch Ø</th><th>Max ball Ø</th><th>Suggested ball</th><th>Balls</th></tr>
        </thead>
        <tbody></tbody>
      </table>
    </details>

    <h3>Design</h3>
    <table>
      ${checkRow("cage", "Crown cage (one-piece ball retainer)", d.cage)}
      ${checkRow("covers", "Dust covers (2 shields)", d.covers)}
    </table>

    <h3>Clearances (mm)</h3>
    <table>
      ${field("clearance", "Ball in groove (per side)", d.clearance, 0.05, 0, 0.5)}
      ${field("lip-fit", "Ring-half lip fit", d.lipFit, 0.05, 0, 0.5)}
      ${field("cage-clearance", "Cage notch over ball radius", d.cageClearance, 0.05, 0, 0.6)}
      ${field("cage-wall", "Cage wall to ring lands", d.cageWall, 0.05, 0.05, 0.6)}
      ${field("cover-fit", "Cover edge in seat", d.coverFit, 0.05, 0, 0.5)}
      ${field("cover-gap", "Cover gap over inner ring", d.coverGap, 0.05, 0.1, 1.5)}
    </table>

    <h3>Cage size</h3>
    <table>
      ${field("cage-thick", "Wall thickness (mm)", d.cageThick, 0.1, 0.6, 3)}
      ${field("cage-band", "Band height (mm)", d.cageBand, 0.1, 0.4, 3)}
      ${field("cage-prong", "Prong height (× ball radius)", d.cageProng, 0.1, 0.6, 1.6)}
    </table>

    <h3>Parts to include in the STL</h3>
    <p style="margin:0">Untick parts you do not need, e.g. print only a replacement cage.</p>
    <table>
      ${checkRow("inc-outer", "Outer ring (2 halves)", d.incOuter)}
      ${checkRow("inc-inner", "Inner ring (2 halves)", d.incInner)}
      ${checkRow("inc-cage", "Cage", d.incCage)}
      ${checkRow("inc-covers", "Dust covers", d.incCovers)}
      ${checkRow("inc-balls", "Printed balls", d.incBalls)}
    </table>
    <p id="summary" style="margin:0"></p>
    </section>

    <section>
      <figure>
      <figcaption>Cross section <span id="error" style="color:red;font-weight:bold;"></span></figcaption>
      <canvas id="preview" width="600" height="300" style="max-width: 100%"></canvas>
      </figure>
    </section>
    <section>
      <figure>
      <figcaption>
        3D preview (drag to rotate, scroll to zoom)
        <label style="display:inline;margin-left:1em"><input type="checkbox" id="exploded"> Exploded</label>
        <label style="display:inline;margin-left:1em"><input type="checkbox" id="cutaway"> Cutaway</label>
      </figcaption>
      <canvas id="preview3d" style="width:100%;max-width:600px;height:400px;display:block"></canvas>
      </figure>
    </section>
    <section>
    <button type="button" id="generate">Download STL</button>
    </section>

    <section>
      <h3>Replacement code (QR)</h3>
      <p>
        The QR code holds a link with <em>all</em> parameters above. Print it and stick it on the bearing or its
        box; scanning it with a phone opens this page with the same settings, ready to print a replacement part.
      </p>
      <canvas id="qr-label" style="max-width:260px;display:block;border:1px solid #ccc"></canvas>
      <p>
        <button type="button" id="qr-download">Download PNG</button>
        <button type="button" id="qr-print">Print label</button>
        <button type="button" id="qr-copy">Copy link</button>
      </p>
      <h4>Load settings</h4>
      <p>
        Load from a photo / screenshot of a code:
        <input type="file" id="qr-file" accept="image/*">
      </p>
      <p>
        Or paste a link / code:
        <input type="text" id="qr-paste" placeholder="https://…#bb1&amp;bore=8&amp;…" style="width:100%">
        <button type="button" id="qr-load">Load</button>
        <span id="qr-status"></span>
      </p>
    </section>

    <article>
      <h2>Assembly &amp; printing</h2>
      <ul>
        <li>Print all parts as laid out on the plate, split face up. The grooves widen upward, so no supports are needed.</li>
        <li>Easiest order: inner lower half, balls, outer lower half around them, then both upper halves.
            Each pair of halves aligns with a small lip and recess; secure them with a drop of CA glue, or press the outer ring into a housing and the inner ring onto a shaft.</li>
        <li>The crown cage is a single solid piece (not split): snap it over the balls from the open side before closing the top halves.
            Like in a real bearing it sits entirely inside the bearing width (band under the balls); that needs balls clearly smaller than the bearing width. The wall thickness, band height and prong height are adjustable; the cage also reduces the maximum ball count.</li>
        <li>Dust covers are non-contact shields glued into a seat in the outer ring. The cage sits under the lower cover; with covers fitted use somewhat smaller balls (for a 608, 3 mm).</li>
        <li>All clearances are adjustable. Raise the ball clearance if the bearing is tight; 0.15 mm suits most printers.</li>
        <li>Based on <a href="https://github.com/osuushi/bearing-generator">osuushi/bearing-generator</a> (MIT).</li>
      </ul>
    </article>
  </form>
`;

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const sizeSelect = $<HTMLSelectElement>("#size-select");
const ballSelect = $<HTMLSelectElement>("#ball-select");
const ballCustom = $<HTMLInputElement>("#ball-custom");

function constrainField(id: string) {
  const f = $<HTMLInputElement>(id);
  const min = parseFloat(f.min);
  const max = parseFloat(f.max);
  const value = f.valueAsNumber;
  if (value < min) f.value = min.toString();
  else if (value > max) f.value = max.toString();
}

const numericIds = [
  "#outer-diameter", "#bore-diameter", "#width", "#clearance", "#ball-custom", "#ball-count",
  "#lip-fit", "#cage-clearance", "#cage-wall", "#cover-fit", "#cover-gap", "#cage-thick", "#cage-band", "#cage-prong",
];

let labelTimer: number | undefined;
function scheduleLabel() {
  window.clearTimeout(labelTimer);
  labelTimer = window.setTimeout(async () => {
    const label = await renderLabel(readConfig());
    const target = $<HTMLCanvasElement>("#qr-label");
    target.width = label.width;
    target.height = label.height;
    target.getContext("2d")!.drawImage(label, 0, 0);
  }, 200);
}

function refresh() {
  numericIds.forEach(constrainField);
  ballCustom.disabled = ballSelect.value !== "custom";
  $<HTMLInputElement>("#inc-cage").disabled = !$<HTMLInputElement>("#cage").checked;
  $<HTMLInputElement>("#inc-covers").disabled = !$<HTMLInputElement>("#covers").checked;
  validate();
  generatePreview();
  scheduleLabel();
  fillSizeTable();
}

// Largest ball (mm) that fits the given dimensions, limited by wall thickness and width
function maxBallFor(bore: number, outer: number, width: number, clearance: number): number {
  const widthLimit = (width / 2 - 0.9) * 2 * 0.95;
  return Math.min(BallBearing.maxBallDiameter(bore, outer, clearance), widthLimit);
}

// Largest standard ball that fits
function pickBall(max: number): number {
  let pick = ballSizes[0][1];
  for (const [, dia] of ballSizes) if (dia <= max) pick = dia;
  return pick;
}

function suggestBall() {
  const c = readConfig();
  ballSelect.value = String(pickBall(maxBallFor(c.bore, c.outer, c.width, c.clearance)));
}

// Fill the size table; ball count is the maximum with the current cage setting
function fillSizeTable() {
  const c = readConfig();
  const body = $<HTMLTableSectionElement>("#size-table tbody");
  const f = (n: number) => String(Math.round(n * 100) / 100);
  body.innerHTML = standardSizes
    .map(([name, bore, outer, width]) => {
      const max = maxBallFor(bore, outer, width, c.clearance);
      const ball = pickBall(max);
      const balls = new BallBearing({
        ...bearingParamsFor(c), boreDiameter: bore, outerDiameter: outer, width, ballDiameter: ball, ballCount: 0,
      }).maxBalls;
      const selected = c.bore === bore && c.outer === outer && c.width === width;
      return `<tr data-size="${name}" style="cursor:pointer${selected ? ";font-weight:bold" : ""}">
        <td>${name}</td><td>${bore}</td><td>${outer}</td><td>${width}</td>
        <td>${f((bore + outer) / 2)}</td><td>${max > 0 ? f(max) : "–"}</td>
        <td>${max >= ballSizes[0][1] ? ball : "–"}</td><td>${max >= ballSizes[0][1] ? balls : "–"}</td></tr>`;
    })
    .join("");
}
$<HTMLTableSectionElement>("#size-table tbody").addEventListener("click", (e) => {
  const tr = (e.target as HTMLElement).closest("tr");
  if (!tr) return;
  sizeSelect.value = tr.dataset.size!;
  sizeSelect.dispatchEvent(new Event("change"));
});

// Make the size picker show a matching standard size, or "Custom"
function syncSizeSelect() {
  const c = readConfig();
  const m = standardSizes.find(([, b, o, w]) => b === c.bore && o === c.outer && w === c.width);
  sizeSelect.value = m ? m[0] : "custom";
}

sizeSelect.addEventListener("change", () => {
  const entry = standardSizes.find(([n]) => n === sizeSelect.value);
  if (entry) {
    $<HTMLInputElement>("#bore-diameter").value = String(entry[1]);
    $<HTMLInputElement>("#outer-diameter").value = String(entry[2]);
    $<HTMLInputElement>("#width").value = String(entry[3]);
    suggestBall();
  }
  refresh();
});

// Editing a dimension by hand switches the picker to "Custom"
["#bore-diameter", "#outer-diameter", "#width"].forEach((id) =>
  $<HTMLInputElement>(id).addEventListener("input", () => {
    sizeSelect.value = "custom";
  })
);

document.querySelectorAll<HTMLElement>("#app input, #app select").forEach((input) => {
  if (["size-select", "qr-file", "qr-paste"].includes(input.id)) return;
  input.addEventListener("change", refresh);
});

$<HTMLButtonElement>("#generate").addEventListener("click", () => generate());

// QR label actions
$<HTMLButtonElement>("#qr-download").addEventListener("click", async () => {
  downloadCanvas(await renderLabel(readConfig()), "bearing-code.png");
});
$<HTMLButtonElement>("#qr-print").addEventListener("click", async () => {
  printCanvas(await renderLabel(readConfig()));
});
$<HTMLButtonElement>("#qr-copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(configToLink(readConfig()));
    $("#qr-status").textContent = "Link copied.";
  } catch {
    $<HTMLInputElement>("#qr-paste").value = configToLink(readConfig());
    $("#qr-status").textContent = "Copy the link from the box above.";
  }
});

function loadFromText(text: string): boolean {
  const cfg = parseConfig(text);
  if (!cfg) return false;
  writeConfig(cfg);
  syncSizeSelect();
  refresh();
  return true;
}

$<HTMLButtonElement>("#qr-load").addEventListener("click", () => {
  const ok = loadFromText($<HTMLInputElement>("#qr-paste").value);
  $("#qr-status").textContent = ok ? "Settings loaded." : "Not a bearing code.";
});
$<HTMLInputElement>("#qr-file").addEventListener("change", async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  $("#qr-status").textContent = "Reading…";
  try {
    const text = await decodeQrFromFile(file);
    if (!text) $("#qr-status").textContent = "No QR code found in that image.";
    else $("#qr-status").textContent = loadFromText(text) ? "Settings loaded." : "Not a bearing code.";
  } catch {
    $("#qr-status").textContent = "Could not read that image.";
  }
});

// Start: a code in the URL wins, otherwise 608 with a suggested ball
if (!(location.hash && loadFromText(location.hash))) {
  sizeSelect.value = "608";
  suggestBall();
  refresh();
}

export {};
