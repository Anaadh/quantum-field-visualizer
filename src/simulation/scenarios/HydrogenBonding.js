import * as THREE from 'three';

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * H₂ Molecular Bonding Scenario
 * Timeline:
 *   0-5s   Two separate H atoms at (-4,0,0) and (4,0,0)
 *   5-12s  Atoms approach each other
 *   10-16s Photon fields begin merging
 *   12-18s Electron clouds overlap
 *   14-22s Electron clouds fuse → peanut molecular orbital
 *   22-30s Stable H₂ molecule
 */
export class HydrogenBonding {
  constructor(fields) {
    this.fields = fields;
    this.duration = 30;
    this.name = 'H₂ Molecular Bonding';
    this.nucleus1 = new THREE.Vector3(-4, 0, 0);
    this.nucleus2 = new THREE.Vector3(4, 0, 0);
  }

  update(elapsed, progress) {
    const t = elapsed;

    // Move nuclei from ±4 → ±1.5 over 5-12s
    const approach = smoothstep(5, 12, t);
    const x1 = -4 + approach * 2.5;  // -4 → -1.5
    const x2 = 4 - approach * 2.5;   // 4 → 1.5
    this.nucleus1.set(x1, 0, 0);
    this.nucleus2.set(x2, 0, 0);

    const nuc1 = { position: this.nucleus1 };
    const nuc2 = { position: this.nucleus2 };

    // Quarks active from start
    const quarkIntensity = 0.8 + 0.2 * Math.sin(t * 3);
    // Gluon arcs form as they approach
    const gluonIntensity = smoothstep(4, 10, t) * (0.9 + 0.1 * Math.sin(t * 2));
    // Photon merge: 10-16s
    const photonMerge = smoothstep(10, 16, t);
    // Electron merge: 14-22s
    const electronMerge = smoothstep(14, 22, t);
    // Molecular stability: 22-30s
    const stable = smoothstep(22, 30, t);

    this.fields.upQuark.update(t, {
      intensity: quarkIntensity,
      nuclei: [nuc1, nuc2],
    });
    this.fields.downQuark.update(t, {
      intensity: quarkIntensity,
      nuclei: [nuc1, nuc2],
    });
    this.fields.electron.update(t, {
      intensity: 1.0,
      nuclei: [nuc1, nuc2],
      phaseParams: new THREE.Vector4(electronMerge, 0, 0, 0),
    });
    this.fields.gluon.update(t, {
      intensity: gluonIntensity,
      nuclei: [nuc1, nuc2],
    });
    this.fields.photon.update(t, {
      intensity: 0.5 + photonMerge * 0.5,
      nuclei: [nuc1, nuc2],
    });
    this.fields.fieldSpace.update(t, {
      intensity: 0.3 + approach * 0.5,
      nuclei: [nuc1, nuc2],
    });
  }

  getPhaseName(elapsed) {
    if (elapsed < 5) return 'Two Separate Atoms';
    if (elapsed < 10) return 'Approaching...';
    if (elapsed < 14) return 'Photon Fields Merging';
    if (elapsed < 18) return 'Electron Cloud Overlap';
    if (elapsed < 22) return '👥 Molecular Orbital Forming';
    return '⚛️ Stable H₂ Molecule';
  }
}
