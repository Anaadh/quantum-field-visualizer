import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SceneManager } from './SceneManager.js';
import { UpQuarkField, DownQuarkField } from './fields/QuarkField.js';
import { ElectronField } from './fields/ElectronField.js';
import { GluonField } from './fields/GluonField.js';
import { PhotonField } from './fields/PhotonField.js';
import { SimulationManager } from './simulation/SimulationManager.js';
import { UI } from './controls/UI.js';

// --- Setup Scene ---
const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const sceneManager = new SceneManager(canvas);

// --- Controls ---
const controls = new OrbitControls(sceneManager.camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 2;
controls.maxDistance = 20;

// Add ambient reference grid for spatial context
const gridHelper = new THREE.GridHelper(10, 10, 0x444466, 0x222244);
gridHelper.position.y = -3;
sceneManager.scene.add(gridHelper);

// --- Create Fields ---
const upQuark = new UpQuarkField();
const downQuark = new DownQuarkField();
const electron = new ElectronField();
const gluon = new GluonField('Gluon', 0xffd700);
const photon = new PhotonField();

const fields = { upQuark, downQuark, electron, gluon, photon };

// Register all fields with scene
Object.values(fields).forEach((f) => sceneManager.addField(f));

// --- Simulation ---
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

  // Update simulation (which updates all fields internally)
  sim.update(deltaTime);

  // Update controls
  controls.update();

  // Render directly to screen
  sceneManager.render(now);
}
animate(0);

// --- Resize ---
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  sceneManager.resize(w, h);
});

export { sceneManager, fields, sim };
