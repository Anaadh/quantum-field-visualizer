import * as THREE from 'three';
import { Field } from './Field.js';

export class GluonField extends Field {
  /**
   * GluonField visualizes the strong force via 3 CatmullRom curves forming
   * a triangle between 3 quark positions inside the nucleus. Each curve
   * oscillates rapidly (like a plasma arc/lightning) with white/gold
   * additive glow.
   *
   * @param {string} name  Field name
   * @param {number|string} color  Default 0xffd700 (gold)
   * @param {object} params  Optional overrides
   */
  constructor(name, color = 0xffd700, params = {}) {
    super(name, color, params);

    // Root group holds all line objects
    this._group = new THREE.Group();
    this._mesh = this._group;

    // Smoothness of each curve
    this._segments = params.segments || 24;

    // Base quark positions forming a small equilateral triangle (radius ~0.3)
    this._quarkPositions = [
      new THREE.Vector3(0, 0.3, 0),
      new THREE.Vector3(0.2598, -0.15, 0),
      new THREE.Vector3(-0.2598, -0.15, 0),
    ];

    // Triangle center
    this._center = new THREE.Vector3(0, 0, 0);

    // Each curve connects two quarks: quark[a] -> center -> quark[b]
    this._curveIndices = [
      [0, 1],
      [1, 2],
      [2, 0],
    ];

    // Per-curve oscillation frequencies and phase offsets
    this._frequencies = [];
    this._phases = [];
    for (let i = 0; i < 6; i++) {
      this._frequencies.push({
        end: 8.0 + Math.random() * 7.0,    // 8-15 Hz  (endpoint jitter)
        mid1: 10.0 + Math.random() * 5.0,  // 10-15 Hz (mid-point 1)
        center: 12.0 + Math.random() * 3.0,// 12-15 Hz (center)
        mid2: 10.0 + Math.random() * 5.0,  // 10-15 Hz (mid-point 2)
      });
      this._phases.push({
        end: Math.random() * Math.PI * 2,
        mid1: Math.random() * Math.PI * 2,
        center: Math.random() * Math.PI * 2,
        mid2: Math.random() * Math.PI * 2,
      });
    }

    // Oscillation amplitudes
    this._ampEnd = params.ampEnd ?? 0.03;
    this._ampMid = params.ampMid ?? 0.12;
    this._ampCenter = params.ampCenter ?? 0.08;

    // Phase-1 default: invisible
    this._intensity = 0;

    // Create 6 curves + lines (2 triangles × 3 curves) to support
    // phase 2 (1 nucleus) and phase 3 (2 nuclei / molecule).
    this._curves = [];
    this._lines = [];

    for (let n = 0; n < 2; n++) {
      for (let c = 0; c < 3; c++) {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(), new THREE.Vector3(),
          new THREE.Vector3(), new THREE.Vector3(),
          new THREE.Vector3(),
        ]);
        this._curves.push(curve);

        const geometry = new THREE.BufferGeometry();
        const material = new THREE.LineBasicMaterial({
          color: this.color,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          linewidth: 2,
          depthWrite: false,
        });
        const line = new THREE.Line(geometry, material);
        line.visible = false;
        this._lines.push(line);
        this._group.add(line);
      }
    }
  }

  update(time, phaseData) {
    if (!this._mesh) return;

    // ---- resolve visibility / opacity ----
    let opacity = this._intensity;
    let nucleusCount = 0;
    const nuclei = [];

    if (phaseData) {
      if (phaseData.intensity !== undefined) {
        opacity = phaseData.intensity * this._intensity;
      }
      if (phaseData.nuclei && phaseData.nuclei.length > 0) {
        nucleusCount = Math.min(phaseData.nuclei.length, 2);
        for (let i = 0; i < nucleusCount; i++) {
          const nuc = phaseData.nuclei[i];
          nuclei.push(nuc.position ? nuc.position.clone() : new THREE.Vector3());
        }
      }
    }

    // Phase 1 (vacuum) — nothing visible
    if (nucleusCount === 0 || opacity < 0.001) {
      for (const line of this._lines) {
        line.visible = false;
      }
      return;
    }

    // ---- build per-frame rotation for 3D depth ----
    const rotAngle = time * 0.3;
    const rotAxis = new THREE.Vector3(
      Math.sin(time * 0.10 + 1.2),
      Math.cos(time * 0.15 + 0.7),
      Math.sin(time * 0.20 + 2.5)
    ).normalize();
    const rotQuat = new THREE.Quaternion().setFromAxisAngle(rotAxis, rotAngle * 0.12);

    // Helper: rotate a position around a nucleus centre
    const wiggle = (v, centre) => {
      const offset = v.clone().sub(centre);
      offset.applyQuaternion(rotQuat);
      return offset.add(centre);
    };

    // ---- update each active curve ----
    for (let n = 0; n < 2; n++) {
      const haveNucleus = n < nucleusCount;
      const nucleusPos = haveNucleus ? nuclei[n] : new THREE.Vector3();

      for (let c = 0; c < 3; c++) {
        const idx = n * 3 + c;
        const line = this._lines[idx];
        const curve = this._curves[idx];

        if (!haveNucleus) {
          line.visible = false;
          continue;
        }

        line.visible = true;
        line.material.opacity = opacity;

        // Endpoints of this curve (the two quarks it connects)
        const qA = this._quarkPositions[this._curveIndices[c][0]].clone().add(nucleusPos);
        const qB = this._quarkPositions[this._curveIndices[c][1]].clone().add(nucleusPos);
        const centrePos = this._center.clone().add(nucleusPos);

        const f = this._frequencies[idx];
        const p = this._phases[idx];

        // --- endpoint jitter (subtle) ---
        const endOscA = new THREE.Vector3(
          Math.sin(time * f.end + p.end) * this._ampEnd,
          Math.cos(time * f.end * 1.1 + p.end) * this._ampEnd,
          Math.sin(time * f.end * 0.9 + p.end + 0.5) * this._ampEnd * 0.5
        );
        const endOscB = new THREE.Vector3(
          Math.cos(time * f.end * 1.2 + p.end + 1.0) * this._ampEnd,
          Math.sin(time * f.end * 0.8 + p.end + 0.3) * this._ampEnd,
          Math.cos(time * f.end * 1.1 + p.end + 2.0) * this._ampEnd * 0.5
        );

        // --- mid-point oscillation (large amplitude — plasma arc effect) ---
        const midOsc1 = new THREE.Vector3(
          Math.sin(time * f.mid1 + p.mid1) * this._ampMid,
          Math.cos(time * f.mid1 * 1.3 + p.mid1) * this._ampMid,
          Math.sin(time * f.mid1 * 0.7 + p.mid1 + 1.2) * this._ampMid * 0.4
        );
        const midOsc2 = new THREE.Vector3(
          Math.cos(time * f.mid2 * 1.4 + p.mid2) * this._ampMid,
          Math.sin(time * f.mid2 * 0.6 + p.mid2 + 0.8) * this._ampMid,
          Math.cos(time * f.mid2 * 1.2 + p.mid2 + 1.5) * this._ampMid * 0.4
        );

        // --- centre oscillation (moderate) ---
        const centreOsc = new THREE.Vector3(
          Math.sin(time * f.center + p.center) * this._ampCenter,
          Math.cos(time * f.center * 1.5 + p.center) * this._ampCenter,
          Math.sin(time * f.center * 0.5 + p.center + 0.7) * this._ampCenter * 0.3
        );

        // Build the 5 control points for this CatmullRom curve
        const mid1 = new THREE.Vector3().lerpVectors(qA, centrePos, 0.5).add(midOsc1);
        const mid2 = new THREE.Vector3().lerpVectors(qB, centrePos, 0.5).add(midOsc2);
        const centreFinal = centrePos.clone().add(centreOsc);
        const pA = qA.clone().add(endOscA);
        const pB = qB.clone().add(endOscB);

        const pts = [
          wiggle(pA, nucleusPos),
          wiggle(mid1, nucleusPos),
          wiggle(centreFinal, nucleusPos),
          wiggle(mid2, nucleusPos),
          wiggle(pB, nucleusPos),
        ];

        curve.points = pts;

        // Rebuild the line geometry
        const positions = curve.getPoints(this._segments);
        line.geometry.dispose();
        line.geometry = new THREE.BufferGeometry().setFromPoints(positions);
      }
    }
  }

  dispose() {
    for (const line of this._lines) {
      line.geometry?.dispose();
      line.material?.dispose();
    }
    this._curves = [];
    this._lines = [];
    super.dispose();
  }
}
