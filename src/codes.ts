import QRCode from "qrcode";
import jsQR from "jsqr";
import { Config, configCaption, configToLink } from "./config";

// Printable label: a QR code holding a link with every parameter, plus a
// short human-readable caption.
export async function renderLabel(config: Config): Promise<HTMLCanvasElement> {
  const qrSize = 520;
  const lines = configCaption(config);
  const pad = 40;
  const lineH = 30;
  const canvas = document.createElement("canvas");
  canvas.width = qrSize + pad * 2;
  canvas.height = qrSize + pad * 2 + lines.length * lineH + 10;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const qr = document.createElement("canvas");
  await QRCode.toCanvas(qr, configToLink(config), {
    width: qrSize,
    margin: 0,
    errorCorrectionLevel: "M",
  });
  ctx.drawImage(qr, pad, pad);

  ctx.fillStyle = "#000";
  ctx.font = "22px sans-serif";
  lines.forEach((line, i) => ctx.fillText(line, pad, pad + qrSize + 40 + i * lineH));
  return canvas;
}

export function downloadCanvas(canvas: HTMLCanvasElement, name: string) {
  const a = document.createElement("a");
  a.download = name;
  a.href = canvas.toDataURL("image/png");
  a.click();
}

export function printCanvas(canvas: HTMLCanvasElement) {
  const w = window.open("", "_blank");
  if (!w) {
    alert("Pop-up blocked: allow pop-ups to print, or use Download PNG.");
    return;
  }
  w.document.write(
    `<!doctype html><title>Bearing label</title><body style="margin:0">` +
      `<img src="${canvas.toDataURL("image/png")}" style="width:90mm" onload="window.print()">`
  );
  w.document.close();
}

// Read a QR code out of an image file (photo, screenshot, scan)
export async function decodeQrFromFile(file: File): Promise<string | null> {
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  // Downscale very large photos so decoding stays fast
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const res = jsQR(data.data, data.width, data.height, { inversionAttempts: "attemptBoth" });
  return res ? res.data : null;
}
