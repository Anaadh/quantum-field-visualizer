import * as THREE from 'three';
import { Field } from './Field.js';

/**
 * FieldSheet — A 2D grid where deformation represents field energy density.
 *
 * Physics basis:
 * - Each quantum field has a ground-state configuration for hydrogen
 * - Electron: |ψ₁₀₀(r)|² ∝ exp(-2r/a₀) — hydrogen 1s probability density
 * - H₂ bond: ψ_bonding = (ψ₁ + ψ₂)/√(2+2S) — molecular orbital
 * - Quark: linear confinement V(r) ∝ r — narrow spike
 * - Photon: Coulomb potential V(r) ∝ 1/r
 * - Sheet deformation = field's contribution to stress-energy curvature
 * - When fields overlap (H₂), TOTAL curvature = Σ all field energies
 */
export class FieldSheet extends Field {
  constructor(name, color, mode, params = {}) {
    super(name, color, params);
    this.mode = mode; // 1=quark, 2=electron, 3=gluon, 4=photon

    const size = params.size || 16;
    const segments = params.segments || 100;
    const height = params.height || 0;

    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2); // Lay flat in XZ plane

    this._basePositions = geo.attributes.position.array.slice();

    this.uniforms = {
      uTime: { value: 0 },
      uColor: { value: this.color },
      uIntensity: { value: 1.0 },
      uNucleus1: { value: new THREE.Vector3(0, 0, 0) },
      uNucleus2: { value: new THREE.Vector3(3, 0, 0) },
      uMode: { value: mode },
      uPhaseParams: { value: new THREE.Vector4(0, 0, 0, 0) },
      uSheetHeight: { value: height },
      uBondFormed: { value: 0.0 },
    };

    const vertexShader = `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform vec3 uNucleus1;
      uniform vec3 uNucleus2;
      uniform int uMode;
      uniform vec4 uPhaseParams;
      uniform float uSheetHeight;
      uniform float uBondFormed;

      varying float vDeformation;
      varying vec3 vColor;

      // --- Physical constants ---
      // Bohr radius a₀ in arbitrary units (~0.53 Å in real units, scaled to ~1.5 in our coordinate system)
      const float AO = 1.5;
      const float AO_INV = 1.0 / 1.5;

      // --- Electron 1s orbital: |ψ₁₀₀(r)|² = exp(-2r/a₀) / (π·a₀³) ---
      // Normalized probability density for hydrogen ground state
      float electronDensity(vec3 pos, vec3 center) {
        float r = length(pos.xz - center.xz);
        float expArg = -2.0 * r * AO_INV;
        // Clamp to prevent underflow
        if (expArg < -20.0) return 0.0;
        float psi_sq = exp(expArg) / (3.14159 * AO * AO * AO);
        // Scale for visual range
        return psi_sq * 20.0;
      }

      // --- H₂ molecular orbital (bonding): ψ_bonding = (ψ₁₀₀(r₁) + ψ₁₀₀(r₂)) / √(2+2S) ---
      // Where S = ∫ ψ₁ψ₂ dV is the overlap integral
      float molecularOrbital(vec3 pos, vec3 c1, vec3 c2) {
        float r1 = length(pos.xz - c1.xz);
        float r2 = length(pos.xz - c2.xz);

        float exp1 = -2.0 * r1 * AO_INV;
        float exp2 = -2.0 * r2 * AO_INV;
        if (exp1 < -20.0 && exp2 < -20.0) return 0.0;

        float psi1 = exp(exp1 > -20.0 ? exp1 : -20.0);
        float psi2 = exp(exp2 > -20.0 ? exp2 : -20.0);

        // Overlap integral S ≈ exp(-R/a₀) × (1 + R/a₀ + R²/3a₀²)
        float R = length(c1.xz - c2.xz);
        float R_over_a0 = R * AO_INV;
        float S = exp(-R_over_a0) * (1.0 + R_over_a0 + R_over_a0 * R_over_a0 / 3.0);

        // Bonding orbital: sum normalized by overlap
        float norm = 2.0 * (1.0 + S);
        if (norm < 0.01) return 0.0;
        float psi_bond_sq = (psi1 + psi2) * (psi1 + psi2) / norm;

        // Normalization constant (from 1s)
        float norm_psi = 1.0 / (3.14159 * AO * AO * AO);
        return psi_bond_sq * norm_psi * 25.0;
      }

      // --- Quark confinement: V(r) = k·r (linear confinement potential) ---
      // Sharp spike at nucleus with linear rise
      float quarkPotential(vec3 pos, vec3 center) {
        float r = length(pos.xz - center.xz);
        // Linear confinement: V ∝ r for large distances, but gaussian for the core
        float core = exp(-r * r * 15.0) * 4.0;
        // Linear tail for confinement visualization
        float tail = r * 0.1;
        return (core + tail) * uIntensity;
      }

      // --- Coulomb potential: V(r) = 1/r ---
      // Electromagnetic potential falls off as inverse distance
      float coulombPotential(vec3 pos, vec3 center) {
        float r = length(pos.xz - center.xz);
        if (r < 0.1) return 10.0; // Prevent singularity
        return (1.0 / r) * uIntensity * 2.0;
      }

      // --- Combined deformation for this mode ---
      float getDeformation(vec3 pos) {
        float deform = 0.0;

        if (uMode == 1) {
          // Quark: sum of individual quark confinement potentials
          deform = quarkPotential(pos, uNucleus1) + quarkPotential(pos, uNucleus2);
        }
        else if (uMode == 2) {
          // Electron:
          // Single atom: 1s orbital density
          // Bonded (uBondFormed > 0.5): molecular orbital
          float single = electronDensity(pos, uNucleus1);
          float bonded = molecularOrbital(pos, uNucleus1, uNucleus2);
          deform = mix(single, bonded, smoothstep(0.3, 0.8, uBondFormed));
          deform *= uIntensity;
        }
        else if (uMode == 3) {
          // Gluon: bridge between nuclei (strong force flux tube)
          float d1 = length(pos.xz - uNucleus1.xz);
          float d2 = length(pos.xz - uNucleus2.xz);
          vec3 mid = (uNucleus1 + uNucleus2) * 0.5;
          float dMid = length(pos.xz - mid.xz);
          // Flux tube between quarks
          float tube = exp(-dMid * dMid * 1.5) * 2.0;
          float corners = exp(-min(d1, d2) * min(d1, d2) * 8.0) * 1.5;
          deform = (tube + corners) * uIntensity;
        }
        else if (uMode == 4) {
          // Photon: EM field from nuclei
          deform = coulombPotential(pos, uNucleus1) + coulombPotential(pos, uNucleus2);
        }

        return deform;
      }

      void main() {
        vec3 pos = position;
        float deform = getDeformation(pos);
        pos.y += deform + uSheetHeight;

        vDeformation = deform;
        // Color intensity scales with deformation
        float intensity = clamp(0.2 + deform * 0.15, 0.0, 1.0);
        vColor = uColor * intensity;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `;

    const fragmentShader = `
      uniform vec3 uColor;
      uniform float uIntensity;

      varying float vDeformation;
      varying vec3 vColor;

      void main() {
        vec3 color = vColor;
        // White glow at high deformation
        float glow = abs(vDeformation) * 0.15;
        color += vec3(1.0, 0.9, 0.8) * glow;

        // Grid line effect using screen-space derivatives
        // (makes the sheet look like a technical/scientific visualization)
        vec2 grid = abs(fract(vDeformation * 0.5) - 0.5);
        float gridLine = 1.0 - smoothstep(0.0, 0.02, min(grid.x, grid.y));
        color += vec3(0.5, 0.5, 0.7) * gridLine * 0.1;

        float alpha = clamp(0.3 + vDeformation * 0.15, 0.0, 0.9);
        gl_FragColor = vec4(color, alpha);
      }
    `;

    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this._mesh = new THREE.Mesh(geo, mat);
  }

  update(time, phaseData) {
    this.uniforms.uTime.value = time;
    if (phaseData) {
      if (phaseData.intensity !== undefined) {
        this.uniforms.uIntensity.value = phaseData.intensity * this._intensity;
      }
      if (phaseData.nuclei && phaseData.nuclei.length >= 1) {
        this.uniforms.uNucleus1.value.copy(phaseData.nuclei[0].position);
      }
      if (phaseData.nuclei && phaseData.nuclei.length >= 2) {
        this.uniforms.uNucleus2.value.copy(phaseData.nuclei[1].position);
      }
      if (phaseData.phaseParams) {
        this.uniforms.uPhaseParams.value.copy(phaseData.phaseParams);
        // phaseParams.x = bond formation progress (0→1)
        this.uniforms.uBondFormed.value = phaseData.phaseParams.x;
      }
    }
  }

  setSheetHeight(h) {
    this.uniforms.uSheetHeight.value = h;
  }
}
