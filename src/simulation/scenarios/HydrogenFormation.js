import * as THREE from 'three';

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Hydrogen Formation Scenario
 * Timeline:
 *   0-5s   Vacuum fluctuations
 *   5-10s  Quark spikes emerge at origin
 *   8-12s  Gluon arcs lock nucleus
 *   10-16s Photon well forms
 *   12-18s Electron wave descends into 1s orbital
 *   18-22s Stable hydrogen atom
 */
export class HydrogenFormation {
  constructor(fields) {
    this.fields = fields;
    this.duration = 22;
    this.name = 'Hydrogen Formation';
    this.nucleus = new THREE.Vector3(0, 0, 0);
  }

  update(elapsed, progress) {
    const t = elapsed;
    const nuc = { position: this.nucleus };

    // Quark spikes: emerge 5-10s
    const quarkIntensity = smoothstep(5, 10, t);
    // Gluon arcs: 8-12s
    const gluonIntensity = smoothstep(8, 12, t);
    // Photon well: 10-16s
    const photonIntensity = 0.05 + smoothstep(10, 16, t) * 0.95;
    // Electron: wave enters at 12s, collapses into orbital by 18s
    const electronProgress = smoothstep(12, 18, t);
    // Atom stable after 18s
    const stableFade = smoothstep(18, 22, t);

    this.fields.upQuark.update(t, {
      intensity: Math.min(quarkIntensity, 1.0),
      nuclei: [nuc],
    });
    this.fields.downQuark.update(t, {
      intensity: Math.min(quarkIntensity, 1.0),
      nuclei: [nuc],
    });
    this.fields.electron.update(t, {
      intensity: 0.1 + electronProgress * 0.9,
      nuclei: [nuc],
      phaseParams: new THREE.Vector4(0, 0, 0, 0), // no bonding
    });
    this.fields.gluon.update(t, {
      intensity: gluonIntensity,
      nuclei: [nuc],
    });
    this.fields.photon.update(t, {
      intensity: photonIntensity,
      nuclei: [nuc],
    });
    this.fields.fieldSpace.update(t, {
      intensity: 0.2 + quarkIntensity * 0.6,
      nuclei: [nuc],
    });
  }

  getPhaseName(elapsed) {
    if (elapsed < 5) return 'Quantum Vacuum';
    if (elapsed < 10) return 'Nucleus Formation';
    if (elapsed < 12) return 'Gluon Confinement';
    if (elapsed < 16) return 'Photon Well';
    if (elapsed < 18) return 'Electron Capture';
    return '⚛ Stable Hydrogen';
  }
}
