import * as THREE from 'three';

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export class Phase4_Annihilation {
  constructor(fields) {
    this.fields = fields;
    // H nucleus starts left, anti-H nucleus starts right
    this.nucleus1 = new THREE.Vector3(-3, 0, 0);
    this.nucleus2 = new THREE.Vector3(3, 0, 0);
  }

  update(elapsed, progress) {
    const t = elapsed;

    // ─── Phase timeline ───
    // 0-3s:   Approach — both atoms drift toward center
    // 3-5s:   Contact — fields begin overlapping
    // 5-7s:   ANNIHILATION — matter vanishes, energy burst
    // 7-12s:  Aftermath — photon glow fades, spacetime rings

    const approachProgress = smoothstep(0, 3, t);
    const contactBegin = smoothstep(3, 5, t);
    const annihilationPeak = smoothstep(5, 7, t);
    const aftermath = smoothstep(7, 12, t);

    // Nuclei converge toward origin
    const x1 = -3 + approachProgress * 3;  // -3 → 0
    const x2 = 3 - approachProgress * 3;   // 3 → 0
    this.nucleus1.set(x1, 0, 0);
    this.nucleus2.set(x2, 0, 0);

    // At contact (t=5), they meet at origin and annihilate
    // From 5s onwards both nuclei stay at origin (or one slightly offset)
    const postContact = Math.max(0, (t - 5) / 2);
    if (t >= 5) {
      // Nuclei vanish — but keep them at origin for field reference
      this.nucleus1.set(0, 0, 0);
      this.nucleus2.set(0, 0, 0);
    }

    const nucleus1 = { position: this.nucleus1 };
    const nucleus2 = { position: this.nucleus2 };

    // ─── Field intensities ───

    // Quarks: strong during approach, vanish at annihilation
    const preQuarkIntensity = 0.8 + 0.2 * Math.sin(t * 3);
    const quarkIntensity = preQuarkIntensity * (1 - annihilationPeak);

    // Electron: present during approach, vanishes at annihilation
    const electronIntensity = (0.1 + contactBegin * 0.9) * (1 - annihilationPeak);

    // Gluon: present during approach, chaotic at contact, vanishes
    const gluonBase = 0.9 * (1 - annihilationPeak);
    const gluonChaos = contactBegin * (1 - aftermath) * 0.5;
    const gluonIntensity = Math.max(0, Math.min(1, gluonBase + gluonChaos));

    // Photon: builds during approach, MASSIVE spike at annihilation, then decays
    const prePhoton = 0.3 + contactBegin * 1.0;
    const annihilatePhoton = annihilationPeak * 3.0 * (1 - aftermath * 0.7);
    const photonIntensity = prePhoton + annihilatePhoton;

    // Annihilation flash value
    const annihilate = annihilationPeak * (1 - aftermath * 0.6);

    // Field Space: curvature from all fields + annihilation shockwave
    const fieldSpaceBase = 0.3 + approachProgress * 0.3;
    const annihilateCurve = annihilationPeak * 1.5 * (1 - aftermath * 0.5);
    const fieldSpaceIntensity = fieldSpaceBase + annihilateCurve;

    // ─── Update each field ───

    // Normal H quarks at nucleus1
    this.fields.upQuark.update(t, {
      intensity: quarkIntensity,
      nuclei: [nucleus1],
      phaseParams: new THREE.Vector4(1.0, 0, t * 5.0 + contactBegin * 10, 0),
      antiMatter: 0.0,
      annihilate: annihilate * 0.5,
    });

    // Down quark at nucleus2 (stands in for anti-up anti-quark)
    // Use antiMatter flag for color inversion
    this.fields.downQuark.update(t, {
      intensity: quarkIntensity,
      nuclei: [nucleus2],
      phaseParams: new THREE.Vector4(1.0, 0, t * 5.0 + contactBegin * 10, 0),
      antiMatter: 1.0,
      annihilate: annihilate * 0.5,
    });

    // Electron field: 1s orbitals at both atoms, vanishes at annihilation
    this.fields.electron.update(t, {
      intensity: electronIntensity,
      nuclei: [nucleus1, nucleus2],
      phaseParams: new THREE.Vector4(contactBegin, 0, t * 0.3, 0),
      antiMatter: 0.0,
      annihilate: annihilate * 0.6,
    });

    // Gluon: arcs around each nucleus + chaotic flicker at contact
    this.fields.gluon.update(t, {
      intensity: gluonIntensity,
      nuclei: [nucleus1, nucleus2],
    });

    // Photon: 1/r wells + huge annihilation burst
    this.fields.photon.update(t, {
      intensity: photonIntensity,
      nuclei: [nucleus1, nucleus2],
      phaseParams: new THREE.Vector4(1.0 + annihilationPeak * 3, 0, t * 0.8, 0),
      antiMatter: 0.0,
      annihilate: annihilate,
    });

    // Field Space: spacetime curvature from all fields + annihilation shockwave
    this.fields.fieldSpace.update(t, {
      intensity: fieldSpaceIntensity,
      nuclei: [nucleus1, nucleus2],
      phaseParams: new THREE.Vector4(0.5 + approachProgress * 0.5, 0, t * 0.2, 0),
      antiMatter: 0.0,
      annihilate: annihilate * 0.8,
    });
  }
}
