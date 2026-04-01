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
await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle0', timeout: 20000 });

// Switch to eames and wait for GLB to load
await page.select('#table-type-select', 'eames');
await new Promise(r => setTimeout(r, 3000));

const result = await page.evaluate(() => {
  const tt = window.getTabletop();
  if (!tt) return 'tabletop is null';
  
  // Collect all vertices in world space (model is already normalized to height ~1)
  const allPoints = [];
  tt.traverse(child => {
    if (child.isMesh) {
      const geo = child.geometry;
      const pos = geo.attributes.position;
      child.updateMatrixWorld(true);
      for (let i = 0; i < pos.count; i++) {
        const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
        v.applyMatrix4(child.matrixWorld);
        allPoints.push({ x: v.x, y: v.y, z: v.z });
      }
    }
  });
  
  // But we need the LOCAL model space coordinates (before scene transforms)
  // Reset to identity transform first
  const savedPos = tt.position.clone();
  const savedRot = tt.quaternion.clone();
  const savedScale = tt.scale.clone();
  tt.position.set(0, 0, 0);
  tt.quaternion.identity();
  tt.scale.set(1, 1, 1);
  tt.updateMatrixWorld(true);
  
  const localPoints = [];
  tt.traverse(child => {
    if (child.isMesh) {
      const geo = child.geometry;
      const pos = geo.attributes.position;
      child.updateMatrixWorld(true);
      for (let i = 0; i < pos.count; i++) {
        const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
        v.applyMatrix4(child.matrixWorld);
        localPoints.push({ x: v.x, y: v.y, z: v.z });
      }
    }
  });
  
  // Restore
  tt.position.copy(savedPos);
  tt.quaternion.copy(savedRot);
  tt.scale.copy(savedScale);
  
  // Sort by Y
  localPoints.sort((a, b) => a.y - b.y);
  
  // Find clusters at the bottom
  const minY = localPoints[0].y;
  const bottomPts = localPoints.filter(p => p.y < minY + 0.015);
  
  // Cluster by XZ distance
  const clusters = [];
  for (const pt of bottomPts) {
    let found = false;
    for (const c of clusters) {
      const dx = pt.x - c.x, dz = pt.z - c.z;
      if (Math.sqrt(dx*dx + dz*dz) < 0.03) {
        c.points.push(pt);
        c.x = c.points.reduce((s,p) => s+p.x, 0) / c.points.length;
        c.z = c.points.reduce((s,p) => s+p.z, 0) / c.points.length;
        c.y = Math.min(c.y, pt.y);
        found = true;
        break;
      }
    }
    if (!found) {
      clusters.push({ x: pt.x, y: pt.y, z: pt.z, points: [pt] });
    }
  }
  
  clusters.sort((a, b) => b.points.length - a.points.length);
  
  return {
    totalVerts: localPoints.length,
    bottomCount: bottomPts.length,
    minY: minY,
    lowest10: localPoints.slice(0, 10).map(p => `(${p.x.toFixed(4)}, ${p.y.toFixed(4)}, ${p.z.toFixed(4)})`),
    clusters: clusters.map(c => ({ x: c.x.toFixed(4), y: c.y.toFixed(4), z: c.z.toFixed(4), count: c.points.length }))
  };
});

console.log(JSON.stringify(result, null, 2));

await browser.close();
server.close();
