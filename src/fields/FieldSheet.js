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
      void main() {
        vec3 pos = position;
        pos.y += uSheetHeight;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `;

    const fragmentShader = `
      uniform vec3 uColor;

      void main() {
        gl_FragColor = vec4(uColor, 0.8);
      }
    `;

    // TEMP: Use MeshBasicMaterial instead of ShaderMaterial to verify geometry
    const mat = new THREE.MeshBasicMaterial({
      color: this.color,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: true,
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
