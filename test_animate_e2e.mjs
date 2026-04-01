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

const allLogs = [];
page.on('console', msg => allLogs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', err => allLogs.push(`[pageerror] ${err.message}`));

await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle0', timeout: 20000 });
await new Promise(r => setTimeout(r, 5000));

console.log('=== Startup logs ===');
allLogs.forEach(l => console.log(l));

// Now test: click the actual Animate button in the page
console.log('\n=== Click Animate button ===');
const btnText1 = await page.evaluate(() => document.getElementById('btn-animate').textContent);
console.log(`Button text before click: "${btnText1}"`);

await page.click('#btn-animate');
await new Promise(r => setTimeout(r, 200));

const btnText2 = await page.evaluate(() => document.getElementById('btn-animate').textContent);
const animState = await page.evaluate(() => window._state.animating);
console.log(`Button text after click: "${btnText2}"`);
console.log(`state.animating: ${animState}`);

// Sample theta every 200ms for 3 seconds
console.log('\n=== Theta over time ===');
const samples = [];
for (let i = 0; i < 15; i++) {
  await new Promise(r => setTimeout(r, 200));
  const theta = await page.evaluate(() => window._state.theta * 180 / Math.PI);
  const slider = await page.evaluate(() => document.getElementById('theta-slider').value);
  const display = await page.evaluate(() => document.getElementById('theta-val').textContent);
  samples.push({ theta: theta.toFixed(1), slider, display });
  console.log(`  t=${(i*0.2).toFixed(1)}s: theta=${theta.toFixed(1)}° slider=${slider} display=${display}`);
}

// Check any errors during animation
const animErrors = allLogs.filter(l => l.includes('error') || l.includes('Error'));
if (animErrors.length > 0) {
  console.log(`\n=== Errors during animation (${animErrors.length}) ===`);
  animErrors.slice(0, 10).forEach(e => console.log(e));
}

const thetaChanged = parseFloat(samples[samples.length-1].theta) > parseFloat(samples[0].theta) + 1;
console.log(`\n${thetaChanged ? 'PASS: animation works' : 'FAIL: theta did not advance'}`);

await browser.close();
server.close();
process.exit(thetaChanged ? 0 : 1);
