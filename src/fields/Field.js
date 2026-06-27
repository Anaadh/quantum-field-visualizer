import * as THREE from 'three';

export class Field {
  constructor(name, color, params = {}) {
    this.name = name;
    this.color = new THREE.Color(color);
    this.params = params;
    this._mesh = null;
    this._intensity = 1.0;
  }

  get mesh() {
    return this._mesh;
  }

  set visible(val) {
    if (this._mesh) this._mesh.visible = val;
  }

  set intensity(val) {
    this._intensity = Math.max(0, Math.min(1, val));
  }

  get intensity() {
    return this._intensity;
  }

  update(time, phaseData) {
    // Override in subclass
  }

  dispose() {
    if (this._mesh) {
      this._mesh.geometry?.dispose();
      if (Array.isArray(this._mesh.material)) {
        this._mesh.material.forEach((m) => m.dispose());
      } else {
        this._mesh.material?.dispose();
      }
    }
  }
}
