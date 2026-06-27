import * as THREE from 'three';

export class Phase1_Vacuum {
  constructor(fields) { this.fields = fields; }
  
  update(elapsed, progress) {
    const t = elapsed;
    this.fields.upQuark.update(t, {
      intensity: 0.15 + Math.sin(t * 0.5) * 0.05,
      nuclei: [{ position: new THREE.Vector3(0, 0, 0) }],
      phaseParams: new THREE.Vector4(0.3, 0, t * 0.5, 0),
    });
    this.fields.downQuark.update(t, {
      intensity: 0.15 + Math.cos(t * 0.7) * 0.05,
      nuclei: [{ position: new THREE.Vector3(0, 0, 0) }],
      phaseParams: new THREE.Vector4(0.3, 0, t * 0.5, 0),
    });
    this.fields.electron.update(t, {
      intensity: 0.1 + Math.sin(t * 0.3) * 0.05,
      nuclei: [{ position: new THREE.Vector3(0, 0, 0) }],
      phaseParams: new THREE.Vector4(0.2, 0, t * 0.3, 0),
    });
    this.fields.gluon.update(t, {
      intensity: 0,
      nuclei: [],
    });
    this.fields.photon.update(t, {
      intensity: 0.05 + Math.sin(t * 0.4) * 0.03,
      nuclei: [{ position: new THREE.Vector3(0, 0, 0) }],
      phaseParams: new THREE.Vector4(0.1, 0, t * 0.2, 0),
    });
  }
}
