import * as THREE from 'three';

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export class Phase3_Molecule {
  constructor(fields) {
    this.fields = fields;
    this.nucleus1 = new THREE.Vector3(-4, 0, 0);
    this.nucleus2 = new THREE.Vector3(4, 0, 0);
  }

  update(elapsed, progress) {
    const t = elapsed;

    // Move nuclei from (±4,0,0) to (±1.5,0,0) over 2-6s
    const moveProgress = smoothstep(2, 6, t);
    const x1 = -4 + moveProgress * 2.5;  // -4 → -1.5
    const x2 = 4 - moveProgress * 2.5;   // 4 → 1.5
    this.nucleus1.set(x1, 0, 0);
    this.nucleus2.set(x2, 0, 0);

    const nucleus1 = { position: this.nucleus1 };
    const nucleus2 = { position: this.nucleus2 };

    // Quark spikes at both nuclei
    const quarkIntensity = 0.8 + 0.2 * Math.sin(t * 3);
    // Gluon: 2 sets of arcs
    const gluonIntensity = 0.9 + 0.1 * Math.sin(t * 2);
    // Photon: merge from 2 separate wells → 1 oval (4-10s)
    // Electron: merge from 2 separate clouds → peanut (8-14s)

    const photonMerge = smoothstep(4, 10, t);
    const electronMerge = smoothstep(8, 14, t);

    this.fields.upQuark.update(t, {
      intensity: quarkIntensity,
      nuclei: [nucleus1, nucleus2],
      phaseParams: new THREE.Vector4(1.0, 0, t * 5.0, 0),
    });
    this.fields.downQuark.update(t, {
      intensity: quarkIntensity,
      nuclei: [nucleus1, nucleus2],
      phaseParams: new THREE.Vector4(1.0, 0, t * 5.0, 0),
    });
    this.fields.electron.update(t, {
      intensity: 1.0,
      nuclei: [nucleus1, nucleus2],
      phaseParams: new THREE.Vector4(1.0 + electronMerge, 0, t * 0.3, 0),
    });
    this.fields.gluon.update(t, {
      intensity: gluonIntensity,
      nuclei: [nucleus1, nucleus2],
    });
    this.fields.photon.update(t, {
      intensity: 0.5 + photonMerge * 0.5,
      nuclei: [nucleus1, nucleus2],
      phaseParams: new THREE.Vector4(1.0 + photonMerge, 0, t * 0.5, 0),
    });
  }
}
