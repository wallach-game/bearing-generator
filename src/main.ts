import { generate, generatePreview, validate } from "./generate";
import { BallBearing } from "./bearing-ball";
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
  ["4 mm", 4],
  ["5/32\" (3.969 mm)", 3.969],
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

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
    <header style="margin-bottom:0; padding-bottom:0;">
      <h1> Ball Bearing Generator </h1>
    </header>
    <form>
    <p>
    STL generator for <strong>assemblable ball bearings</strong>. Instead of printing in place, the inner
    and outer rings are each printed as two halves (split at mid-width, each with half of the ball
    groove). You put the balls in the groove, close the halves around them, and glue or clamp each pair together.
    </p><p>
    Pick a standard bearing size (or type your own dimensions), pick the ball diameter you have, and download
    one STL with all parts laid out on the build plate.
    </p>
    <section>
    <table>
      <tr>
        <td>
          <label for="size-select">Standard size</label>
          <select id="size-select">
            <option value="custom">Custom</option>
            ${sizeOptions}
          </select>
        </td>
        <td>
          <label for="bore-diameter">Bore diameter (mm)</label>
          <input type="number" id="bore-diameter" value="8" step="0.1" min="1" max="1000" required>
        </td>
        <td>
          <label for="outer-diameter">Outer diameter (mm)</label>
          <input type="number" id="outer-diameter" value="22" step="0.1" min="8" max="1000" required>
        </td>
        <td>
          <label for="width">Width (mm)</label>
          <input type="number" id="width" value="7" step="0.1" min="4" max="1000" required>
        </td>
      </tr>
      <tr>
        <td>
          <label for="ball-select">Ball diameter</label>
          <select id="ball-select">
            ${ballOptions}
            <option value="custom">Custom…</option>
          </select>
        </td>
        <td>
          <label for="ball-custom">Custom ball (mm)</label>
          <input type="number" id="ball-custom" value="4" step="0.001" min="1" max="50" disabled>
        </td>
        <td>
          <label for="ball-count">Number of balls (0 = max)</label>
          <input type="number" id="ball-count" value="0" step="1" min="0" max="100" required>
        </td>
        <td>
          <label for="clearance">Ball clearance (mm)</label>
          <input type="number" id="clearance" value="0.15" step="0.05" min="0" max="0.5" required>
        </td>
      </tr>
    </table>
    <label><input type="checkbox" id="print-balls"> Also print the balls (instead of using steel/glass balls)</label>
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
    <article>
      <h2>Assembly &amp; printing</h2>
      <ul>
        <li>Print all parts as laid out on the plate, split face up. The grooves widen upward, so no supports are needed.</li>
        <li>Lay the lower outer half flat (lip up), place the balls in the groove, and press the matching half on.
            Do the same for the inner ring: one half goes through the bore from each side, so the balls sit between the grooves.
            Easiest order: inner lower half, balls, outer lower half around them, then both upper halves.</li>
        <li>Each pair of halves aligns with a small lip and recess. Secure them with a drop of CA glue, or by pressing the outer ring into a housing and the inner ring onto a shaft.</li>
        <li>Ball clearance is the gap per side between ball and groove. Raise it if the bearing is tight; 0.15 mm suits most printers.</li>
        <li>With "Number of balls" at 0, the maximum number that fits (with a small gap between balls) is used.</li>
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
  const field = $<HTMLInputElement>(id);
  const min = parseFloat(field.min);
  const max = parseFloat(field.max);
  const value = field.valueAsNumber;
  if (value < min) field.value = min.toString();
  else if (value > max) field.value = max.toString();
}

function refresh() {
  ["#outer-diameter", "#bore-diameter", "#width", "#clearance", "#ball-custom", "#ball-count"].forEach(constrainField);
  ballCustom.disabled = ballSelect.value !== "custom";
  validate();
  generatePreview();
}

// Choose the largest standard ball that fits the current dimensions
function suggestBall() {
  const bore = parseFloat($<HTMLInputElement>("#bore-diameter").value);
  const outer = parseFloat($<HTMLInputElement>("#outer-diameter").value);
  const clearance = parseFloat($<HTMLInputElement>("#clearance").value);
  const width = parseFloat($<HTMLInputElement>("#width").value);
  // Width limit: half-width must leave room for the groove plus a land
  const widthLimit = (width / 2 - 0.9) * 2 * 0.95;
  const max = Math.min(BallBearing.maxBallDiameter(bore, outer, clearance), widthLimit);
  let pick = ballSizes[0][1];
  for (const [, d] of ballSizes) if (d <= max) pick = d;
  ballSelect.value = String(pick);
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
  if (input.id === "size-select") return;
  input.addEventListener("change", refresh);
});

$<HTMLButtonElement>("#generate").addEventListener("click", () => generate());

// Start with 608 selected
sizeSelect.value = "608";
suggestBall();
refresh();

export {};
