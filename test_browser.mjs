import puppeteer from 'puppeteer';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { extname } from 'path';

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.glb': 'model/gltf-binary' };
const server = createServer((req, res) => {
  const path = req.url === '/' ? '/index.html' : req.url;
  try {
    const data = readFileSync('.' + path);
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
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
await new Promise(r => setTimeout(r, 5000)); // let startup tests + rendering complete

let fails = 0;
function assert(name, cond) { if (!cond) { console.error(`FAIL: ${name}`); fails++; } else { console.log(`PASS: ${name}`); } }

// Check startup tests passed
const startupLogs = await page.evaluate(() => {
  // Check if tests ran by looking for the global state
  return { animating: window._state?.animating, theta: window._state?.theta };
});
assert('state is accessible', startupLogs.theta !== undefined);

// Test: Animation works via button click
console.log('\n=== Animation Test ===');
await page.evaluate(() => { window._state.theta = 0; document.getElementById('theta-slider').value = '0'; });
await page.click('#btn-animate');
await new Promise(r => setTimeout(r, 100));
const animating = await page.evaluate(() => window._state.animating);
assert('Animate button sets animating=true', animating === true);

await new Promise(r => setTimeout(r, 2000));
const theta = await page.evaluate(() => window._state.theta);
const sliderVal = await page.evaluate(() => document.getElementById('theta-slider').value);
console.log(`  theta after 2s: ${(theta * 180/Math.PI).toFixed(1)}°, slider: ${sliderVal}`);
assert('theta advances during animation', theta > 0.05);
assert('slider updates during animation', parseFloat(sliderVal) > 1);

// Stop animation
await page.click('#btn-animate');

// Test: Each table type renders without errors
console.log('\n=== Table Type Tests ===');
for (const type of ['square', 'rectangle', 'tripod', 'eames']) {
  errors.length = 0;
  await page.select('#table-type-select', type);
  await new Promise(r => setTimeout(r, 1000));
  
  // Rotate through several angles
  for (let deg = 0; deg <= 90; deg += 15) {
    await page.evaluate((d) => {
      window._state.theta = d * Math.PI / 180;
      document.getElementById('theta-slider').value = d.toFixed(1);
    }, deg);
    await new Promise(r => setTimeout(r, 100));
  }
  
  const typeErrors = errors.filter(e => !e.includes('favicon') && !e.includes('net::'));
  assert(`${type}: no errors during rotation`, typeErrors.length === 0);
  if (typeErrors.length > 0) typeErrors.forEach(e => console.error(`  ${e}`));
}

// Test: High lumpiness doesn't crash
console.log('\n=== High Lumpiness Test ===');
errors.length = 0;
await page.select('#table-type-select', 'square');
await page.evaluate(() => {
  window._state.lumpiness = 5.0;
  document.getElementById('lumpiness-slider').value = '100';
  document.getElementById('lumpiness-slider').dispatchEvent(new Event('input'));
});
await new Promise(r => setTimeout(r, 500));

for (let deg = 0; deg <= 90; deg += 5) {
  await page.evaluate((d) => {
    window._state.theta = d * Math.PI / 180;
    document.getElementById('theta-slider').value = d.toFixed(1);
  }, deg);
  await new Promise(r => setTimeout(r, 50));
}
const lumpErrors = errors.filter(e => !e.includes('favicon') && !e.includes('net::'));
assert('high lumpiness: no crashes', lumpErrors.length === 0);
if (lumpErrors.length > 0) lumpErrors.slice(0, 3).forEach(e => console.error(`  ${e}`));

// Test: Find Balance works
console.log('\n=== Find Balance Test ===');
await page.evaluate(() => {
  window._state.lumpiness = 0.5;
  document.getElementById('lumpiness-slider').value = '50';
  document.getElementById('lumpiness-slider').dispatchEvent(new Event('input'));
  window._state.theta = 0;
  document.getElementById('theta-slider').value = '0';
});
await new Promise(r => setTimeout(r, 500));
await page.click('#btn-find-zero');
await new Promise(r => setTimeout(r, 1500));
const balanceTheta = await page.evaluate(() => window._state.theta * 180 / Math.PI);
console.log(`  Balance found at: ${balanceTheta.toFixed(1)}°`);
assert('Find Balance moves theta', balanceTheta > 0.1);

console.log(`\n${'='.repeat(40)}`);
console.log(fails === 0 ? 'ALL BROWSER TESTS PASSED' : `${fails} FAILURES`);

await browser.close();
server.close();
process.exit(fails);
