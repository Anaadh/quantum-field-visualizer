import * as THREE from 'three';
import { Field } from './Field.js';

export class FieldSheet extends Field {
  constructor(name, color, mode, params = {}) {
    super(name, color, params);
    this.mode = mode;

    const size = params.size || 16;
    const segments = params.segments || 80;
    const height = params.height || 0;

    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);

    // Store uniforms on instance so update() can modify them
    this._uniforms = {
      uColor: { value: this.color },
      uSheetHeight: { value: height },
      uIntensity: { value: 1.0 },
      uTime: { value: 0 },
      uNucleus1: { value: new THREE.Vector3(0, 0, 0) },
      uNucleus2: { value: new THREE.Vector3(3, 0, 0) },
      uMode: { value: mode },
      uPhaseParams: { value: new THREE.Vector4(0, 0, 0, 0) },
      uBondFormed: { value: 0.0 },
    };

    const vert = `
      uniform float uSheetHeight;
      uniform float uIntensity;
      uniform float uTime;
      uniform vec3 uNucleus1;
      uniform vec3 uNucleus2;
      uniform int uMode;
      uniform vec4 uPhaseParams;
      uniform float uBondFormed;
      uniform vec3 uColor;

      varying float vDeform;

      // GLSL helper — .xz swizzle not supported in GLSL ES 1.00
      vec2 flat(vec3 v) { return vec2(v.x, v.z); }

      // --- PHYSICS: Field deformation equations ---

      // Bohr radius in scene units
      const float AO = 1.5;

      // Hydrogen 1s: |ψ₁₀₀|² = exp(-2r/a₀) / πa₀³
      float orbital1s(vec3 pos, vec3 center) {
        float r = length(flat(pos) - flat(center));
        return exp(-2.0 * r / AO) * 2.0;
      }

      // H₂ bonding: (ψ₁+ψ₂)² / 2(1+S)
      float orbitalH2(vec3 pos, vec3 c1, vec3 c2) {
        float r1 = length(flat(pos) - flat(c1));
        float r2 = length(flat(pos) - flat(c2));
        float psi1 = exp(-2.0 * r1 / AO);
        float psi2 = exp(-2.0 * r2 / AO);
        float R = length(flat(c1) - flat(c2));
        float S = exp(-R / AO) * (1.0 + R / AO + R*R / (3.0*AO*AO));
        return (psi1 + psi2) * (psi1 + psi2) / (2.0 * (1.0 + S)) * 2.5;
      }

      // Quark confinement: gaussian spike
      float quarkWell(vec3 pos, vec3 center) {
        float r = length(flat(pos) - flat(center));
        return exp(-r * r * 15.0) * 4.0;
      }

      // Coulomb: 1/r potential
      float coulomb(vec3 pos, vec3 center) {
        float r = length(flat(pos) - flat(center));
        return 1.0 / max(r, 0.1) * 2.0;
      }

      // Combined deformation for this field mode
      float getDeform(vec3 pos) {
        float d = 0.0;
        if (uMode == 1) d = quarkWell(pos, uNucleus1) + quarkWell(pos, uNucleus2);
        else if (uMode == 2) {
          float single = orbital1s(pos, uNucleus1);
          float bonded = orbitalH2(pos, uNucleus1, uNucleus2);
          d = mix(single, bonded, smoothstep(0.3, 0.8, uBondFormed));
        }
        else if (uMode == 3) {
          float d1 = length(flat(pos) - flat(uNucleus1));
          float d2 = length(flat(pos) - flat(uNucleus2));
          vec3 mid = (uNucleus1 + uNucleus2) * 0.5;
          float dM = length(flat(pos) - flat(mid));
          d = (exp(-dM*dM*1.5) * 2.0 + exp(-min(d1,d2)*min(d1,d2)*8.0) * 1.5) * uIntensity;
        }
        else if (uMode == 4) d = coulomb(pos, uNucleus1) + coulomb(pos, uNucleus2);
        return d * uIntensity;
      }

      void main() {
        vec3 pos = position;
        float deform = getDeform(pos);
        pos.y += deform + uSheetHeight;
        vDeform = deform;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `;

    const frag = `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying float vDeform;

      void main() {
        float intensity = clamp(0.3 + abs(vDeform) * 0.2, 0.0, 1.0);
        vec3 color = uColor * intensity;
        float glow = abs(vDeform) * 0.2;
        color += vec3(1.0, 0.9, 0.8) * glow;
        float alpha = clamp(0.35 + abs(vDeform) * 0.15, 0.0, 0.85);
        gl_FragColor = vec4(color, alpha);
      }
    `;

    const mat = new THREE.ShaderMaterial({
      uniforms: this._uniforms,
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this._mesh = new THREE.Mesh(geo, mat);
  }

  update(time, phaseData) {
    this._uniforms.uTime.value = time;
    if (phaseData) {
      this._uniforms.uIntensity.value = (phaseData.intensity ?? 1.0) * this._intensity;
      if (phaseData.nuclei && phaseData.nuclei.length >= 1) {
        this._uniforms.uNucleus1.value.copy(phaseData.nuclei[0].position);
      }
      if (phaseData.nuclei && phaseData.nuclei.length >= 2) {
        this._uniforms.uNucleus2.value.copy(phaseData.nuclei[1].position);
      }
      if (phaseData.phaseParams) {
        this._uniforms.uPhaseParams.value.copy(phaseData.phaseParams);
        this._uniforms.uBondFormed.value = phaseData.phaseParams.x;
      }
    }
  }
}
