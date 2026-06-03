// Monta i PNG in demo_frames/ in una GIF animata in loop. Pure JS (gifenc + pngjs).
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');

const framesDir = path.join(__dirname, 'demo_frames');
const out = path.join(__dirname, 'timetracker-demo.gif');
const MAX_W = parseInt(process.env.GIF_W || '460', 10);
const DELAY = parseInt(process.env.GIF_DELAY || '120', 10);
const COLORS = parseInt(process.env.GIF_COLORS || '160', 10);

const files = fs.readdirSync(framesDir).filter(f => f.endsWith('.png')).sort();
if (!files.length) { console.error('Nessun frame in', framesDir); process.exit(1); }

// Downscale nearest-neighbor a larghezza MAX_W (mantiene proporzioni).
function downscale(src, sw, sh, dw, dh) {
  const dst = new Uint8Array(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, (y * sh / dh) | 0);
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, (x * sw / dw) | 0);
      const si = (sy * sw + sx) * 4, di = (y * dw + x) * 4;
      dst[di] = src[si]; dst[di + 1] = src[si + 1]; dst[di + 2] = src[si + 2]; dst[di + 3] = 255;
    }
  }
  return dst;
}

const first = PNG.sync.read(fs.readFileSync(path.join(framesDir, files[0])));
const sw = first.width, sh = first.height;
const dw = Math.min(MAX_W, sw);
const dh = Math.round(sh * dw / sw);
console.log(`Sorgente ${sw}x${sh} -> GIF ${dw}x${dh}, ${files.length} frame, ${COLORS} colori, ${DELAY}ms/frame`);

const gif = GIFEncoder();
for (const f of files) {
  const png = PNG.sync.read(fs.readFileSync(path.join(framesDir, f)));
  const src = new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length);
  const rgba = (dw === sw && dh === sh) ? src : downscale(src, png.width, png.height, dw, dh);
  const palette = quantize(rgba, COLORS);
  const index = applyPalette(rgba, palette);
  gif.writeFrame(index, dw, dh, { palette, delay: DELAY });
}
gif.finish();
fs.writeFileSync(out, gif.bytes());
const kb = (fs.statSync(out).size / 1024).toFixed(0);
console.log(`GIF creata: ${out} (${kb} KB)`);
