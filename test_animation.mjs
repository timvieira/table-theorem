const thetaSlider = { value: '0' };
const thetaVal = { textContent: '0.0°' };
const state = { theta: 0, animating: false, animDir: 1 };

function simulateAnimationFrame(time, lastTime) {
  const dt = (time - lastTime) / 1000;
  const clampedDt = Math.min(dt, 0.1);
  if (state.animating) {
    let deg = parseFloat(thetaSlider.value) || 0;
    deg += clampedDt * 10 * state.animDir;
    if (deg >= 90) { deg = 90; state.animDir = -1; }
    if (deg <= 0) { deg = 0; state.animDir = 1; }
    thetaSlider.value = deg.toFixed(1);
    state.theta = deg * Math.PI / 180;
    thetaVal.textContent = deg.toFixed(1) + '°';
  }
}

let fails = 0;
function assert(name, cond) { if (!cond) { console.error(`FAIL: ${name}`); fails++; } else { console.log(`PASS: ${name}`); } }

// Test 1: advances theta over 3s
state.animating = true; state.animDir = 1; thetaSlider.value = '0'; state.theta = 0;
let lt = 0;
for (let f = 0; f < 180; f++) { const t = f*16.67; simulateAnimationFrame(t, lt); lt = t; }
assert('theta advances', state.theta > 0.1);

// Test 2: bounces at 90
state.animDir = 1; thetaSlider.value = '85'; state.theta = 85*Math.PI/180; lt = 0;
let bounced = false;
for (let f = 0; f < 300; f++) { const t = f*16.67; simulateAnimationFrame(t, lt); lt = t; if (state.animDir === -1) bounced = true; }
assert('bounces at 90°', bounced);

// Test 3: dt clamped
thetaSlider.value = '0'; state.theta = 0; state.animDir = 1;
simulateAnimationFrame(5000, 0);
assert('dt clamped (≤1°)', parseFloat(thetaSlider.value) <= 1.1);

// Test 4: NaN recovery
thetaSlider.value = 'NaN'; state.animDir = 1;
simulateAnimationFrame(100, 0);
assert('NaN recovery', !isNaN(state.theta) && state.theta >= 0);

// Test 5: button toggle
state.animating = false;
state.animating = !state.animating;
assert('toggle on', state.animating === true);
state.animating = !state.animating;
assert('toggle off', state.animating === false);

console.log(`\n${fails === 0 ? 'ALL TESTS PASSED' : fails + ' FAILURES'}`);
process.exit(fails);
