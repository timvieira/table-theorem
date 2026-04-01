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
const errors = [];
page.on('console', msg => { if (msg.type() === 'error' || msg.type() === 'warning') errors.push(msg.text()); });
page.on('pageerror', err => errors.push(err.message));

await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle0', timeout: 20000 });
await new Promise(r => setTimeout(r, 4000));

await page.select('#table-type-select', 'tripod');
await new Promise(r => setTimeout(r, 500));

let fails = 0;

for (const lumpSlider of [50, 80, 100]) {
  await page.evaluate((v) => {
    document.getElementById('lumpiness-slider').value = String(v);
    document.getElementById('lumpiness-slider').dispatchEvent(new Event('input'));
  }, lumpSlider);
  await new Promise(r => setTimeout(r, 300));

  for (let deg = 0; deg <= 90; deg += 5) {
    await page.evaluate((d) => {
      window._state.theta = d * Math.PI / 180;
      document.getElementById('theta-slider').value = d.toFixed(1);
    }, deg);
    
    const result = await page.evaluate(() => {
      try { window.updateTable(); } catch(e) { return { error: e.message }; }
      const placement = window.placeTable(window._state.theta, window._state.tableRadius);
      if (!placement) return { error: 'null placement' };
      
      const issues = [];
      for (let i = 0; i < placement.length; i++) {
        if (!placement[i].foot) issues.push(`leg ${i}: no foot`);
        if (!placement[i].top) issues.push(`leg ${i}: no top`);
        if (placement[i].foot && placement[i].top) {
          const len = placement[i].foot.distanceTo(placement[i].top);
          if (Math.abs(len - 1.0) > 0.1) issues.push(`leg ${i}: length=${len.toFixed(3)}`);
        }
        if (placement[i].foot && placement[i].foot.y < placement[i].floorY - 0.02) {
          issues.push(`leg ${i}: foot below floor by ${(placement[i].floorY - placement[i].foot.y).toFixed(3)}`);
        }
      }
      return { issues, numLegs: placement.length };
    });
    
    if (result.error) {
      console.error(`FAIL: tripod lump=${lumpSlider} θ=${deg}°: ${result.error}`);
      fails++;
    } else if (result.issues.length > 0) {
      console.error(`FAIL: tripod lump=${lumpSlider} θ=${deg}°: ${result.issues.join(', ')}`);
      fails++;
    }
  }
}

// Check visual: are legs connected to tabletop?
const visualCheck = await page.evaluate(() => {
  window._state.theta = 0;
  try { window.updateTable(); } catch(e) { return { error: e.message }; }
  const tt = window.getTabletop();
  if (!tt) return { error: 'no tabletop' };
  
  // Check leg positions vs tabletop
  // For tripod, the tabletop code uses the else branch (numLegs < 4)
  // which uses position/rotation/scale, not direct matrix
  return {
    tabletopPos: { x: tt.position.x.toFixed(3), y: tt.position.y.toFixed(3), z: tt.position.z.toFixed(3) },
    tabletopScale: { x: tt.scale.x.toFixed(3), y: tt.scale.y.toFixed(3), z: tt.scale.z.toFixed(3) },
    matrixAutoUpdate: tt.matrixAutoUpdate,
  };
});
console.log('\nTripod visual state:', JSON.stringify(visualCheck, null, 2));

if (errors.length > 0) {
  console.log(`\nConsole errors/warnings: ${errors.length}`);
  errors.slice(0, 5).forEach(e => console.log('  ' + e));
}

console.log(`\n${fails === 0 ? 'ALL TRIPOD TESTS PASSED' : fails + ' FAILURES'}`);
await browser.close();
server.close();
