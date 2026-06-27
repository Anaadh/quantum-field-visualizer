import * as THREE from 'three';

export class SceneManager {
  constructor(canvas) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

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
      alpha: false,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.toneMapping = THREE.NoToneMapping;

    // Ambient lighting to help visibility
    const ambientLight = new THREE.AmbientLight(0x404060);
    this.scene.add(ambientLight);

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
