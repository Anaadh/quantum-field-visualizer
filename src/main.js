import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SceneManager } from './SceneManager.js';
import { FieldSheet } from './fields/FieldSheet.js';
import { GluonField } from './fields/GluonField.js';
import { SimulationManager } from './simulation/SimulationManager.js';
import { UI } from './controls/UI.js';

// --- Setup Scene ---
const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
const sceneManager = new SceneManager(canvas);
sceneManager.scene.background = new THREE.Color(0x0a0a0f);

// --- Camera positioned to view sheets from above ---
sceneManager.camera.position.set(6, 8, 8);
sceneManager.camera.lookAt(0, 0, 0);

// --- Controls ---
const controls = new OrbitControls(sceneManager.camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 0, 0);
controls.minDistance = 5;
controls.maxDistance = 25;
controls.update();

// --- Create Field Sheets ---
// Each sheet is a 2D grid that deforms based on field interactions.
// Layered at different Y-heights like a stack of quantum field "surfaces."

const upQuark = new FieldSheet('Up Quark', 0xff3333, 1, {
  size: 14, segments: 180, height: -3,
});
const downQuark = new FieldSheet('Down Quark', 0x33ff33, 1, {
  size: 14, segments: 180, height: -1.5,
});
const electron = new FieldSheet('Electron', 0x3388ff, 2, {
  size: 14, segments: 200, height: 0,
});
const photon = new FieldSheet('Photon', 0xff22dd, 4, {
  size: 14, segments: 180, height: 1.5,
});
const gluon = new GluonField('Gluon', 0xffd700);
const fieldSpace = new FieldSheet('Field Space', 0xffffff, 5, {
  size: 14, segments: 100, height: 3.5, amplitude: 0.5, logScale: 0.6,
});

const fields = { upQuark, downQuark, electron, gluon, photon, fieldSpace };

// Register all fields
Object.values(fields).forEach((f) => sceneManager.addField(f));

// Subtle ambient grid for spatial reference
const gridHelper = new THREE.GridHelper(14, 14, 0x222244, 0x111133);
sceneManager.scene.add(gridHelper);

// --- Simulation ---
// Phase1_Vacuum uses FieldSheet's update(), passing intensity and nucleus positions
const sim = new SimulationManager(fields);
sim.onPhaseChange = (phase) => {
  if (ui) ui.updateDisplay(phase);
};

// --- UI ---
const ui = new UI(sceneManager, sim, fields);
ui.updateDisplay('vacuum');

// --- Animation Loop ---
let lastTime = 0;

function animate(time) {
  requestAnimationFrame(animate);
  const now = time / 1000;
  const deltaTime = lastTime ? Math.min(now - lastTime, 0.05) : 0.016;
  lastTime = now;

  sim.update(deltaTime);
  controls.update();
  sceneManager.render(now);
}
animate(0);

window.addEventListener('resize', () => {
  sceneManager.resize(window.innerWidth, window.innerHeight);
});

export { sceneManager, fields, sim };
