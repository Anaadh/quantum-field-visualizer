import * as THREE from 'three';

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * H + Anti-H Annihilation Scenario
 * Timeline:
 *   0-5s   H atom at (-3,0,0) and anti-H at (3,0,0)
 *   5-9s   Both approach each other
 *   9-10s  Contact! Matter and anti-matter fields overlap
 *   10-12s ANNIHILATION BURST — pure energy flash
 *   12-18s Photon ring expands, debris fades
 *   18-25s Back to vacuum
 *
 * Anti-matter: The anti-H nucleus (antiproton) is marked with antiMatter=1
 * When matter and anti-matter overlap, the fields cancel (destructive interference)
 * releasing pure energy as a photon burst.
 */
export class Annihilation {
  constructor(fields) {
    this.fields = fields;
    this.duration = 25;
    this.name = 'H + Anti-H Annihilation';
    this.hPos = new THREE.Vector3(-3, 0, 0);     // hydrogen
    this.antiHPos = new THREE.Vector3(3, 0, 0);  // antihydrogen
    this.annihilationCenter = new THREE.Vector3(0, 0, 0);
  }

  update(elapsed, progress) {
    const t = elapsed;

    // Both approach: 5-9s, meet at origin
    const approach = smoothstep(5, 9, t);
    const hx = -3 + approach * 3;       // -3 → 0
    const ahx = 3 - approach * 3;       // 3 → 0
    this.hPos.set(hx, 0, 0);
    this.antiHPos.set(ahx, 0, 0);

    // Contact at t=9-10
    const contact = smoothstep(9, 10, t);
    // Annihilation burst: 10-12s
    const burst = smoothstep(10, 12, t);
    // Post-burst afterglow + fade: 12-18s
    const afterglow = 1.0 - smoothstep(12, 18, t);
    // Ring expansion time
    const ringTime = Math.max(0, (t - 10) * 0.6);
    // Everything fades to vacuum: 18-25s
    const vacuumFade = 1.0 - smoothstep(18, 25, t);

    // Before contact, both atoms are visible
    // During/after contact, the fields dramatically fade as they cancel
    let hIntensity = 1.0;
    let ahIntensity = 1.0;
    let burstIntensity = 0.0;
    let allIntensity = 1.0;

    if (t < 9) {
      // Both visible, approaching
      hIntensity = 1.0;
      ahIntensity = 1.0;
      burstIntensity = 0.0;
      allIntensity = 1.0;
    } else if (t < 10) {
      // Contact — fields start canceling
      hIntensity = 1.0 - contact * 0.5;
      ahIntensity = 1.0 - contact * 0.5;
      burstIntensity = contact * 0.3;
      allIntensity = 1.0;
    } else if (t < 12) {
      // Annihilation burst
      hIntensity = 0.5 - burst * 0.5;
      ahIntensity = 0.5 - burst * 0.5;
      burstIntensity = burst;
      allIntensity = 1.0;
    } else {
      // Afterglow and fade
      hIntensity = 0;
      ahIntensity = 0;
      burstIntensity = afterglow * 0.5;
      allIntensity = vacuumFade;
    }

    // Hydrogen nucleus (matter)
    const hNuc = { position: this.hPos };
    // Antihydrogen nucleus (anti-matter)
    const ahNuc = { position: this.antiHPos };

    // --- QUARK FIELDS ---
    // During contact, quarks and anti-quarks annihilate via gluon burst
    this.fields.upQuark.update(t, {
      intensity: allIntensity < 0.01 ? 0 : hIntensity * allIntensity,
      nuclei: this.hPos.distanceTo(this.antiHPos) > 0.5
        ? [hNuc, ahNuc]
        : [hNuc],
      antiMatter: false,
      annihilation: t > 9 && t < 12 ? burstIntensity : 0,
      annihilationCenter: this.annihilationCenter,
    });

    this.fields.downQuark.update(t, {
      intensity: allIntensity < 0.01 ? 0 : ahIntensity * allIntensity,
      nuclei: this.hPos.distanceTo(this.antiHPos) > 0.5
        ? [hNuc, ahNuc]
        : [hNuc],
      antiMatter: false,
      annihilation: t > 9 && t < 12 ? burstIntensity : 0,
      annihilationCenter: this.annihilationCenter,
    });

    // --- ELECTRON / POSITRON ---
    // Matter electron at H, anti-electron (positron) at anti-H
    // They annihilate into photons when they meet
    this.fields.electron.update(t, {
      intensity: allIntensity < 0.01 ? 0 : (hIntensity + ahIntensity * 0.5) * allIntensity,
      nuclei: [hNuc, ahNuc],
      phaseParams: new THREE.Vector4(
        this.hPos.distanceTo(this.antiHPos) < 2 ? 1.0 : 0,
        0, 0, 0
      ),
      antiMatter: false,
      annihilation: t > 9 && t < 12 ? burstIntensity : 0,
      annihilationCenter: this.annihilationCenter,
    });

    // --- GLUON ---
    this.fields.gluon.update(t, {
      intensity: t < 10 ? (hIntensity + ahIntensity) * 0.5 * allIntensity : 0,
      nuclei: [hNuc, ahNuc],
    });

    // --- PHOTON ---
    // Photon field carries the annihilation burst
    this.fields.photon.update(t, {
      intensity: Math.max(0.2, (hIntensity + ahIntensity) * 0.5 + burstIntensity * 3) * allIntensity,
      nuclei: [hNuc, ahNuc],
      annihilation: t > 9 ? burstIntensity + afterglow * 0.3 : 0,
      annihilationCenter: this.annihilationCenter,
    });

    // --- FIELD SPACE ---
    this.fields.fieldSpace.update(t, {
      intensity: (0.2 + (hIntensity + ahIntensity) * 0.3 + burstIntensity * 2) * allIntensity,
      nuclei: [hNuc, ahNuc],
      annihilation: t > 9 ? burstIntensity : 0,
      annihilationCenter: this.annihilationCenter,
    });
  }

  getPhaseName(elapsed) {
    if (elapsed < 5) return 'H + Anti-H Approaching';
    if (elapsed < 9) return 'Closing In...';
    if (elapsed < 10) return '⚠️ Contact!';
    if (elapsed < 12) return '💥 Annihilation Burst';
    if (elapsed < 18) return 'Photon Ring Expanding';
    return '☁️ Back to Vacuum';
  }
}
