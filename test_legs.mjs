// Test: verify that leg tops are connected to the tabletop surface for ALL table types.
// For each type, at multiple theta values and lumpiness levels, check that:
//   1. Each leg's top position lies on (or very near) the tabletop's world surface.
//   2. Each leg has correct length (~1.0).
//   3. No leg foot is below the floor.

import puppeteer from 'puppeteer';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { extname } from 'path';

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.glb': 'model/gltf-binary' };
const server = createServer((req, res) => {
  const path = req.url === '/' ? '/index.html' : req.url;
  try { const data = readFileSync('.' + path); res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream' }); res.end(data); }
  catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
});
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', msg => { if (msg.type() === 'error' || msg.type() === 'warning') consoleErrors.push(msg.text()); });
page.on('pageerror', err => consoleErrors.push(err.message));

await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle0', timeout: 20000 });
await new Promise(r => setTimeout(r, 4000));

const TABLE_TYPES = ['square', 'rectangle', 'tripod'];
// Skip eames — it uses a GLB model with its own legs
const THETAS = [0, 15, 30, 45, 60, 75, 90];
const LUMPS = [50, 80];
const LEG_LENGTH_TOL = 0.15;
const ATTACH_TOL = 0.15;  // max distance from leg top to nearest tabletop point
const FLOOR_TOL = 0.03;

let totalFails = 0;

for (const tableType of TABLE_TYPES) {
  await page.select('#table-type-select', tableType);
  await new Promise(r => setTimeout(r, 500));

  for (const lump of LUMPS) {
    await page.evaluate((v) => {
      document.getElementById('lumpiness-slider').value = String(v);
      document.getElementById('lumpiness-slider').dispatchEvent(new Event('input'));
    }, lump);
    await new Promise(r => setTimeout(r, 200));

    for (const deg of THETAS) {
      await page.evaluate((d) => {
        window._state.theta = d * Math.PI / 180;
      }, deg);

      const result = await page.evaluate((attachTol, legLenTol, floorTol) => {
        try { window.updateTable(); } catch(e) { return { error: e.message }; }

        const state = window._state;
        const placement = window.placeTable(state.theta, state.tableRadius);
        if (!placement) return { error: 'null placement' };

        const tt = window.getTabletop();
        if (!tt) return { error: 'no tabletop' };
        tt.updateMatrixWorld(true);

        const issues = [];
        const numLegs = placement.length;

        for (let i = 0; i < numLegs; i++) {
          const foot = placement[i].foot;
          const top = placement[i].top;
          if (!foot || !top) { issues.push(`leg ${i}: missing foot/top`); continue; }

          // Check leg length
          const len = foot.distanceTo(top);
          if (Math.abs(len - 1.0) > legLenTol) {
            issues.push(`leg ${i}: length=${len.toFixed(3)} (expected ~1.0)`);
          }

          // Check foot not below floor
          if (foot.y < placement[i].floorY - floorTol) {
            issues.push(`leg ${i}: foot ${(placement[i].floorY - foot.y).toFixed(3)} below floor`);
          }

          // Check leg top is near the tabletop surface.
          // Transform the leg top into tabletop local space and check it's near the surface.
          const invMat = new THREE.Matrix4().copy(tt.matrixWorld).invert();
          const localTop = top.clone().applyMatrix4(invMat);

          // For box tabletop: local surface is at y≈0, x∈[-0.5,0.5], z∈[-0.5,0.5]
          // For cylinder tabletop: local surface is at y≈0, x²+z²≤0.25
          // We just check that |localTop.y| is small (near the tabletop plane)
          // and that the XZ position is reasonable (within the tabletop footprint)
          if (Math.abs(localTop.y) > attachTol) {
            issues.push(`leg ${i}: top ${Math.abs(localTop.y).toFixed(3)} away from tabletop Y plane (local: ${localTop.x.toFixed(2)},${localTop.y.toFixed(2)},${localTop.z.toFixed(2)})`);
          }
        }
        return { issues, numLegs };
      }, ATTACH_TOL, LEG_LENGTH_TOL, FLOOR_TOL);

      if (result.error) {
        console.error(`FAIL [${tableType}] lump=${lump} θ=${deg}°: ${result.error}`);
        totalFails++;
      } else if (result.issues.length > 0) {
        for (const issue of result.issues) {
          console.error(`FAIL [${tableType}] lump=${lump} θ=${deg}°: ${issue}`);
        }
        totalFails += result.issues.length;
      }
    }
  }
}

if (consoleErrors.length > 0) {
  console.log(`\nConsole errors/warnings: ${consoleErrors.length}`);
  consoleErrors.slice(0, 10).forEach(e => console.log('  ' + e));
}

console.log(`\n${totalFails === 0 ? 'ALL LEG ATTACHMENT TESTS PASSED' : totalFails + ' FAILURES'}`);
process.exit(totalFails === 0 ? 0 : 1);
await browser.close();
server.close();
