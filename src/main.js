import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
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

// --- Post-Processing: Bloom ---
const composer = new EffectComposer(sceneManager.renderer);
const renderPass = new RenderPass(sceneManager.scene, sceneManager.camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.5,  // strength
  0.4,  // radius
  0.85  // threshold
);
composer.addPass(bloomPass);
sceneManager.bloomPass = bloomPass;

// Override SceneManager.render to use composer
sceneManager._origRender = sceneManager.render;
sceneManager.render = function (time) {
  composer.render();
};

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
  ui.updateDisplay(phase);
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

  // Update simulation
  sim.update(deltaTime);

  // Fields are updated internally by their phases via sim.update()

  // Update controls
  controls.update();

  // Render with bloom
  sceneManager.render(now);
}
animate(0);

// --- Resize ---
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  sceneManager.resize(w, h);
  composer.setSize(w, h);
});

export { sceneManager, fields, sim };
