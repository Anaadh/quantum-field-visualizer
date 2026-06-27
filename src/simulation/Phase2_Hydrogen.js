import * as THREE from 'three';

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export class Phase2_Hydrogen {
  constructor(fields) {
    this.fields = fields;
    this.nucleusPos = new THREE.Vector3(0, 0, 0);
  }

  update(elapsed, progress) {
    const t = elapsed;
    const nucleus = { position: this.nucleusPos };

    // Quark spikes: ramp 0→1 over 0-3s
    const quarkIntensity = smoothstep(0, 3, t) * 0.8 + 0.2;
    
    // Gluon arcs: ramp 0→1 over 2-5s
    const gluonIntensity = smoothstep(2, 5, t);

    // Photon well: ramp 0.05→1 over 4-8s
    const photonIntensity = 0.05 + smoothstep(4, 8, t) * 0.95;

    // Electron: wave enters at 7s, collapses into shell by 12s
    const electronProgress = smoothstep(7, 12, t);
    // phaseParams.x: 0 = diffuse wave, 1 = perfect spherical shell
    // phaseParams.y: intensity guide

    this.fields.upQuark.update(t, {
      intensity: quarkIntensity,
      nuclei: [nucleus],
      phaseParams: new THREE.Vector4(1.0, 0, t * 5.0, 0), // fast vibration on spikes
    });
    this.fields.downQuark.update(t, {
      intensity: quarkIntensity,
      nuclei: [nucleus],
      phaseParams: new THREE.Vector4(1.0, 0, t * 5.0, 0),
    });
    this.fields.electron.update(t, {
      intensity: 0.1 + electronProgress * 0.9,
      nuclei: [nucleus],
      phaseParams: new THREE.Vector4(electronProgress, 0, t * 0.3, 0),
    });
    this.fields.gluon.update(t, {
      intensity: gluonIntensity,
      nuclei: [nucleus],
    });
    this.fields.photon.update(t, {
      intensity: photonIntensity,
      nuclei: [nucleus],
      phaseParams: new THREE.Vector4(1.0, 0, t * 0.5, 0),
    });
  }
}
