import * as THREE from 'three';

// === Extracted from index.html ===
class LumpyFloor {
  constructor(numTerms = 12, amplitude = 0.5) {
    this.terms = [];
    this.regenerate(numTerms, amplitude);
  }
  regenerate(numTerms, amplitude) {
    this.terms = [];
    for (let i = 0; i < numTerms; i++) {
      this.terms.push({
        ax: (Math.random() - 0.5) * 3,
        ay: (Math.random() - 0.5) * 3,
        phase: Math.random() * Math.PI * 2,
        amp: (Math.random() * 0.5 + 0.5) * amplitude / numTerms,
      });
    }
  }
  height(x, y) {
    let z = 0;
    for (const t of this.terms) z += t.amp * Math.sin(t.ax * x + t.ay * y + t.phase);
    return z;
  }
}

const TABLE_TYPES = {
  square: { legs: [[+1,+1],[-1,+1],[-1,-1],[+1,-1]], labels: ['A','B','C','D'], topAspect: [1,1] },
  rectangle: { legs: [[+1.4,+1],[-1.4,+1],[-1.4,-1],[+1.4,-1]], labels: ['A','B','C','D'], topAspect: [1.4,1] },
};

const LEG_LENGTH = 1.0;
let floor, tableType = 'square';

function getLegWorldPos(theta, R) {
  const localLegs = TABLE_TYPES[tableType].legs;
  const cosT = Math.cos(theta), sinT = Math.sin(theta);
  const half = R / Math.SQRT2;
  return localLegs.map(([lx, ly]) => {
    const x = half * (lx * cosT - ly * sinT);
    const y = half * (lx * sinT + ly * cosT);
    return { x, y, floorZ: floor.height(x, y) };
  });
}

function placeTable(theta, R) {
  const p = getLegWorldPos(theta, R);
  const localLegs = TABLE_TYPES[tableType].legs;
  const half = R / Math.SQRT2;
  const floorPts = p.map(pi => new THREE.Vector3(pi.x, pi.floorZ, pi.y));

  let bestConfig = null;
  for (let skip = 0; skip < 4; skip++) {
    const grounded = [0,1,2,3].filter(i => i !== skip);
    const gpts = grounded.map(i => floorPts[i]);
    const localG = grounded.map(i => localLegs[i]);

    const fv1 = new THREE.Vector3().subVectors(gpts[1], gpts[0]);
    const fv2 = new THREE.Vector3().subVectors(gpts[2], gpts[0]);
    let up = new THREE.Vector3().crossVectors(fv1, fv2).normalize();
    if (up.y < 0) up.negate();

    const tops = gpts.map(g => g.clone().addScaledVector(up, LEG_LENGTH));
    const d01 = new THREE.Vector3().subVectors(tops[1], tops[0]);
    const d02 = new THREE.Vector3().subVectors(tops[2], tops[0]);

    const a00 = (localG[1][0] - localG[0][0]) * half;
    const a01 = (localG[1][1] - localG[0][1]) * half;
    const a10 = (localG[2][0] - localG[0][0]) * half;
    const a11 = (localG[2][1] - localG[0][1]) * half;
    const det = a00 * a11 - a01 * a10;
    if (Math.abs(det) < 1e-10) continue;

    const right = d01.clone().multiplyScalar(a11 / det).addScaledVector(d02, -a01 / det);
    const forward = d01.clone().multiplyScalar(-a10 / det).addScaledVector(d02, a00 / det);

    const tabCenter = tops[0].clone()
      .addScaledVector(right, -localG[0][0] * half)
      .addScaledVector(forward, -localG[0][1] * half);

    const allTops = [], allFeet = [];
    for (let i = 0; i < 4; i++) {
      const ll = localLegs[i];
      const top = tabCenter.clone().addScaledVector(right, ll[0]*half).addScaledVector(forward, ll[1]*half);
      const foot = top.clone().addScaledVector(up, -LEG_LENGTH);
      allTops.push(top); allFeet.push(foot);
    }

    let valid = true;
    for (const gi of grounded) {
      if (Math.abs(allFeet[gi].y - p[gi].floorZ) > 0.01) { valid = false; break; }
    }
    if (!valid) continue;

    const gap = allFeet[skip].y - p[skip].floorZ;
    if (gap >= -1e-4) {
      if (!bestConfig || gap < bestConfig.gap) {
        bestConfig = { skip, gap, up, allFeet, allTops };
      }
    }
  }

  if (!bestConfig) return null;

  const result = [];
  for (let i = 0; i < 4; i++) {
    result.push({
      floorY: p[i].floorZ,
      foot: bestConfig.allFeet[i],
      top: bestConfig.allTops[i],
      gap: Math.max(0, bestConfig.allFeet[i].y - p[i].floorZ),
      onGround: i !== bestConfig.skip,
    });
  }
  return result;
}

// === Tests ===
let totalFails = 0, totalTests = 0;
const R = 1.8;

for (const type of ['square', 'rectangle']) {
  tableType = type;
  for (const lump of [0.1, 0.5, 1.0, 2.0, 5.0]) {
    for (let trial = 0; trial < 5; trial++) {
      floor = new LumpyFloor(14, lump);
      for (let deg = 0; deg <= 90; deg += 2) {
        totalTests++;
        const theta = deg * Math.PI / 180;
        const placement = placeTable(theta, R);
        if (!placement) { totalFails++; console.log(`FAIL [${type} lump=${lump} θ=${deg}] no valid config`); continue; }

        let grounded = 0;
        for (let i = 0; i < 4; i++) {
          // Property 1: no foot below floor
          if (placement[i].foot.y < placement[i].floorY - 0.02) {
            totalFails++;
            console.log(`FAIL [${type} lump=${lump} θ=${deg}] leg ${i} foot ${placement[i].foot.y.toFixed(4)} below floor ${placement[i].floorY.toFixed(4)}`);
          }
          // Property 2: grounded feet match floor
          if (placement[i].onGround) {
            grounded++;
            const err = Math.abs(placement[i].foot.y - placement[i].floorY);
            if (err > 0.02) {
              totalFails++;
              console.log(`FAIL [${type} lump=${lump} θ=${deg}] grounded leg ${i} off floor by ${err.toFixed(4)}`);
            }
          }
          // Property 3: leg length
          const len = placement[i].top.distanceTo(placement[i].foot);
          if (Math.abs(len - LEG_LENGTH) > 0.02) {
            totalFails++;
            console.log(`FAIL [${type} lump=${lump} θ=${deg}] leg ${i} length ${len.toFixed(4)} != ${LEG_LENGTH}`);
          }
        }
        // Property 4: 3+ grounded
        if (grounded < 3) {
          totalFails++;
          console.log(`FAIL [${type} lump=${lump} θ=${deg}] only ${grounded} grounded`);
        }
        // Property 5: tops coplanar
        const tops = placement.map(p => p.top);
        const v1 = new THREE.Vector3().subVectors(tops[1], tops[0]);
        const v2 = new THREE.Vector3().subVectors(tops[2], tops[0]);
        const n = new THREE.Vector3().crossVectors(v1, v2).normalize();
        const v3 = new THREE.Vector3().subVectors(tops[3], tops[0]);
        if (Math.abs(v3.dot(n)) > 0.02) {
          totalFails++;
          console.log(`FAIL [${type} lump=${lump} θ=${deg}] tops not coplanar: ${Math.abs(v3.dot(n)).toFixed(4)}`);
        }
      }
    }
  }
}

console.log(`\n${totalTests} tests, ${totalFails} failures`);
process.exit(totalFails > 0 ? 1 : 0);
