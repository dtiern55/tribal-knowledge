import { chromium } from 'playwright'
import { readFileSync } from 'fs'
const EXE = '/home/danny/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome'
const asset = 'data:image/png;base64,' + readFileSync('/home/danny/projects/survivor/tribal-knowledge/frontend/public/sole-survivor-flame-halo.png').toString('base64')

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox','--disable-dev-shm-usage'] })
const page = await browser.newPage()
const stats = await page.evaluate(async (src) => {
  const img = new Image()
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src })
  const W = img.naturalWidth, H = img.naturalHeight
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0)
  const d = ctx.getImageData(0, 0, W, H).data
  const alpha = (x, y) => d[(y * W + x) * 4 + 3]
  // alpha centroid
  let sx = 0, sy = 0, sw = 0
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = alpha(x, y); if (a > 40) { sx += x * a; sy += y * a; sw += a }
  }
  const cx = sx / sw, cy = sy / sw
  const half = Math.min(W, H) / 2
  const TH = 110
  // per-angle inner radius (first alpha>TH marching out from centroid) and outer radius
  const inner = [], outer = []
  for (let deg = 0; deg < 360; deg += 2) {
    const a = deg * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a)
    let ri = null, ro = null
    for (let r = 2; r < half; r += 1) {
      const x = Math.round(cx + dx * r), y = Math.round(cy + dy * r)
      if (x < 0 || y < 0 || x >= W || y >= H) break
      const al = alpha(x, y)
      if (ri === null && al > TH) ri = r
      if (al > TH) ro = r
    }
    if (ri !== null) { inner.push(ri); outer.push(ro) }
  }
  inner.sort((a, b) => a - b); outer.sort((a, b) => a - b)
  const pct = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))]
  return {
    W, H, cx: +cx.toFixed(1), cy: +cy.toFixed(1), half,
    innerMin: inner[0], innerMed: pct(inner, 0.5), innerP90: pct(inner, 0.9), innerMax: inner[inner.length - 1],
    outerMed: pct(outer, 0.5), outerMax: outer[outer.length - 1],
    fInnerMax: +(inner[inner.length - 1] / half).toFixed(3),
    fInnerP90: +(pct(inner, 0.9) / half).toFixed(3),
    fInnerMed: +(pct(inner, 0.5) / half).toFixed(3),
    fOuterMed: +(pct(outer, 0.5) / half).toFixed(3),
    offCenterPx: { dx: +(cx - W / 2).toFixed(1), dy: +(cy - H / 2).toFixed(1) },
  }
}, asset)
await browser.close()
console.log(JSON.stringify(stats, null, 2))
// Deterministic halo size: hide the inner edge behind the portrait.
// rendered inner radius = fInner * H/2 ; want the P90 (robust vs a stray tip)
// inner edge to sit at the portrait radius. H = 2*rPortrait / fInner.
for (const [name, rP] of [['md 36px', 18], ['prominent 42px', 21]]) {
  const Hp90 = Math.round(2 * rP / stats.fInnerP90)
  const Hmax = Math.round(2 * rP / stats.fInnerMax)
  console.log(`${name}: H(p90-tuck)=${Hp90}px  H(max-tuck)=${Hmax}px`)
}
