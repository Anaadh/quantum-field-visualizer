import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SceneManager } from './SceneManager.js';

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const sceneManager = new SceneManager(canvas);
const controls = new OrbitControls(sceneManager.camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

function animate(time) {
  requestAnimationFrame(animate);
  controls.update();
  sceneManager.render(time / 1000);
}
animate(0);

window.addEventListener('resize', () => {
  sceneManager.resize(window.innerWidth, window.innerHeight);
});

export { sceneManager };
