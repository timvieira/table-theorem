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
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', err => errors.push(err.message));

await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle0', timeout: 20000 });
await new Promise(r => setTimeout(r, 5000));

let fails = 0;
function assert(name, cond) { if (!cond) { console.error(`FAIL: ${name}`); fails++; } else { console.log(`PASS: ${name}`); } }

// Test 1: Animation works via button click
console.log('=== Animation Test ===');
await page.evaluate(() => { window._state.theta = 0; document.getElementById('theta-slider').value = '0'; });
await page.click('#btn-animate');
await new Promise(r => setTimeout(r, 100));
assert('Animate button sets animating=true', await page.evaluate(() => window._state.animating));
await new Promise(r => setTimeout(r, 2000));
const theta = await page.evaluate(() => window._state.theta);
assert('theta advances during animation', theta > 0.05);
await page.click('#btn-animate'); // stop

// Test 2: Each table type renders without errors
console.log('\n=== Table Type Tests ===');
for (const type of ['square', 'rectangle', 'tripod', 'eames']) {
  errors.length = 0;
  await page.select('#table-type-select', type);
  await new Promise(r => setTimeout(r, 1000));
  for (let deg = 0; deg <= 90; deg += 15) {
    await page.evaluate((d) => {
      window._state.theta = d * Math.PI / 180;
      document.getElementById('theta-slider').value = d.toFixed(1);
    }, deg);
    await new Promise(r => setTimeout(r, 100));
  }
  const typeErrors = errors.filter(e => !e.includes('favicon') && !e.includes('net::'));
  assert(`${type}: no errors`, typeErrors.length === 0);
  if (typeErrors.length > 0) typeErrors.slice(0,3).forEach(e => console.error(`  ${e}`));
}

// Test 3: High lumpiness no crash
console.log('\n=== High Lumpiness Test ===');
errors.length = 0;
await page.select('#table-type-select', 'square');
await page.evaluate(() => {
  document.getElementById('lumpiness-slider').value = '100';
  document.getElementById('lumpiness-slider').dispatchEvent(new Event('input'));
});
await new Promise(r => setTimeout(r, 500));
for (let deg = 0; deg <= 90; deg += 5) {
  await page.evaluate((d) => { window._state.theta = d * Math.PI / 180; document.getElementById('theta-slider').value = d.toFixed(1); }, deg);
  await new Promise(r => setTimeout(r, 50));
}
assert('high lumpiness: no crashes', errors.filter(e => !e.includes('favicon')).length === 0);

// Test 4: Find Balance
console.log('\n=== Find Balance Test ===');
await page.evaluate(() => {
  document.getElementById('lumpiness-slider').value = '50';
  document.getElementById('lumpiness-slider').dispatchEvent(new Event('input'));
  window._state.theta = 0; document.getElementById('theta-slider').value = '0';
});
await new Promise(r => setTimeout(r, 500));
await page.click('#btn-find-zero');
await new Promise(r => setTimeout(r, 1500));
assert('Find Balance moves theta', await page.evaluate(() => window._state.theta > 0.01));

// Test 5: No object below floor for ALL table types at multiple lumpiness levels
console.log('\n=== Floor Clipping Test ===');
for (const type of ['square', 'rectangle', 'tripod', 'eames']) {
  for (const lumpSlider of [50, 80, 100]) {
    await page.select('#table-type-select', type);
    await new Promise(r => setTimeout(r, 500));
    await page.evaluate((v) => {
      document.getElementById('lumpiness-slider').value = String(v);
      document.getElementById('lumpiness-slider').dispatchEvent(new Event('input'));
    }, lumpSlider);
    await new Promise(r => setTimeout(r, 300));

    // Check floor clipping across all angles
    const clipResult = await page.evaluate(() => {
      const results = [];
      const type = window.TABLE_TYPES[window._state.tableType];
      const R = window._state.tableRadius;
      for (let deg = 0; deg <= 90; deg += 3) {
        const theta = deg * Math.PI / 180;
        window._state.theta = theta;
        const p = window.getLegWorldPos(theta, R);
        const placement = window.placeTable(theta, R);
        if (!placement) continue;
        const numLegs = placement.length;
        for (let i = 0; i < numLegs; i++) {
          if (!placement[i].foot) continue;
          const footY = placement[i].foot.y;
          const floorY = placement[i].floorY;
          if (footY < floorY - 0.02) {
            results.push({ deg, leg: i, footY: footY.toFixed(4), floorY: floorY.toFixed(4), diff: (footY - floorY).toFixed(4) });
          }
        }
      }
      return results;
    });

    if (clipResult.length > 0) {
      console.error(`FAIL: ${type} lump=${lumpSlider}: ${clipResult.length} floor clips`);
      clipResult.slice(0, 3).forEach(c => console.error(`  θ=${c.deg}° leg ${c.leg}: foot=${c.footY} floor=${c.floorY} (${c.diff})`));
      fails++;
    } else {
      console.log(`PASS: ${type} lump=${lumpSlider}: no floor clipping`);
    }
  }
}

// Test 6: For Eames specifically, check the GLB model bounding box vs floor
console.log('\n=== Eames Model vs Floor Test ===');
await page.select('#table-type-select', 'eames');
await new Promise(r => setTimeout(r, 2000)); // wait for GLB load
for (const lumpSlider of [50, 80, 100]) {
  await page.evaluate((v) => {
    document.getElementById('lumpiness-slider').value = String(v);
    document.getElementById('lumpiness-slider').dispatchEvent(new Event('input'));
  }, lumpSlider);
  await new Promise(r => setTimeout(r, 300));

  const eamesClip = await page.evaluate(() => {
    const clips = [];
    const R = window._state.tableRadius;
    for (let deg = 0; deg <= 90; deg += 5) {
      window._state.theta = deg * Math.PI / 180;
      // Force update to get current tabletop position
      try { window.updateTable(); } catch(e) {}
      const tt = window.getTabletop();
      if (!tt) continue;
      tt.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(tt);
      const minY = box.min.y;
      const center = new THREE.Vector3();
      box.getCenter(center);
      const floorAtCenter = window.floor.height(center.x, center.z);
      if (minY < floorAtCenter - 0.05) {
        clips.push({ deg, minY: minY.toFixed(3), floor: floorAtCenter.toFixed(3) });
      }
    }
    return clips;
  });

  if (eamesClip.length > 0) {
    console.error(`FAIL: eames lump=${lumpSlider}: ${eamesClip.length} model-floor clips`);
    eamesClip.slice(0, 3).forEach(c => console.error(`  θ=${c.deg}° model.minY=${c.minY} floor=${c.floor}`));
    fails++;
  } else {
    console.log(`PASS: eames lump=${lumpSlider}: model above floor`);
  }
}

console.log(`\n${'='.repeat(40)}`);
console.log(fails === 0 ? 'ALL BROWSER TESTS PASSED' : `${fails} FAILURES`);
await browser.close();
server.close();
process.exit(fails);
