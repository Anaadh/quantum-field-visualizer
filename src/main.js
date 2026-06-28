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

// --- Starfield Background ---
const starCount = 2000;
const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(starCount * 3);
const starColors = new Float32Array(starCount * 3);
const starSizes = new Float32Array(starCount);
for (let i = 0; i < starCount; i++) {
  const radius = 40 + Math.random() * 60;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  starPos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
  starPos[i * 3 + 1] = radius * Math.cos(phi);
  starPos[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  const c = 0.3 + Math.random() * 0.7;
  starColors[i * 3] = c * (0.8 + Math.random() * 0.2);
  starColors[i * 3 + 1] = c * (0.7 + Math.random() * 0.3);
  starColors[i * 3 + 2] = c * (0.6 + Math.random() * 0.4);
  starSizes[i] = 0.1 + Math.random() * 0.5;
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
starGeo.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));

const starMat = new THREE.PointsMaterial({
  size: 0.15,
  vertexColors: true,
  transparent: true,
  opacity: 0.8,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  sizeAttenuation: true,
});
const stars = new THREE.Points(starGeo, starMat);
sceneManager.scene.add(stars);

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
  size: 14, segments: 100, height: 3.5, amplitude: 1.0, logScale: 0.6,
});

// Anti-matter sheets (for annihilation scenario — invisible by default)
const antiUpQuark = new FieldSheet('Anti-Up Quark', 0xff3333, 1, {
  size: 14, segments: 180, height: -3, antiMatter: true,
});
const antiDownQuark = new FieldSheet('Anti-Down Quark', 0x33ff33, 1, {
  size: 14, segments: 180, height: -1.5, antiMatter: true,
});
const positron = new FieldSheet('Positron', 0x3388ff, 2, {
  size: 14, segments: 200, height: 0, antiMatter: true,
});
antiUpQuark.visible = false;
antiDownQuark.visible = false;
positron.visible = false;

const fields = { upQuark, downQuark, electron, gluon, photon, fieldSpace, antiUpQuark, antiDownQuark, positron };

// Register all fields
Object.values(fields).forEach((f) => sceneManager.addField(f));

// Subtle ambient grid for spatial reference
const gridHelper = new THREE.GridHelper(14, 14, 0x222244, 0x111133);
sceneManager.scene.add(gridHelper);

// --- Simulation ---
const sim = new SimulationManager(fields);
sim.onPhaseChange = (phase) => {
  if (ui) ui.updateDisplay(phase);
};

// --- UI ---
const ui = new UI(sceneManager, sim, fields);

// Hide anti-matter sheets unless in annihilation scenario
const hideAntiMatterSheets = () => {
  fields.antiUpQuark.visible = false;
  fields.antiDownQuark.visible = false;
  fields.positron.visible = false;
};
hideAntiMatterSheets();

sim.onScenarioChange = (name) => {
  if (name !== 'annihilation') hideAntiMatterSheets();
};

sim.start(); // Auto-start first scenario

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
