import * as THREE from 'three';

export class SceneManager {
  constructor(canvas) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 2, 6);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.fields = [];
  }

  addField(field) {
    this.fields.push(field);
    if (field.mesh) this.scene.add(field.mesh);
  }

  removeField(field) {
    const idx = this.fields.indexOf(field);
    if (idx >= 0) {
      this.fields.splice(idx, 1);
      if (field.mesh) this.scene.remove(field.mesh);
    }
  }

  render(time) {
    this.renderer.render(this.scene, this.camera);
  }

  resize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
}
