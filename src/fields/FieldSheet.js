import * as THREE from 'three';
import { Field } from './Field.js';

export class FieldSheet extends Field {
  constructor(name, color, mode, params = {}) {
    super(name, color, params);

    const size = params.size || 16;
    const segments = params.segments || 120;
    const height = params.height || 0;
    const amplitude = params.amplitude ?? 1.0;
    const logScale = params.logScale ?? 0.5;

    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);

    this._uniforms = {
      uColor: { value: this.color },
      uSheetHeight: { value: height },
      uHeightOffset: { value: 1.0 },
      uIntensity: { value: 1.0 },
      uAmplitude: { value: amplitude },
      uLogScale: { value: logScale },
      uTime: { value: 0 },
      uNucleus1: { value: new THREE.Vector3(0, 0, 0) },
      uNucleus2: { value: new THREE.Vector3(5, 0, 0) },
      uMode: { value: mode },
      uPhaseParams: { value: new THREE.Vector4(0, 0, 0, 0) },
      uBondFormed: { value: 0.0 },
    };

    const vert = `
      uniform float uSheetHeight;
      uniform float uHeightOffset;
      uniform float uIntensity;
      uniform float uAmplitude;
      uniform float uLogScale;
      uniform float uTime;
      uniform vec3 uNucleus1;
      uniform vec3 uNucleus2;
      uniform int uMode;
      uniform vec4 uPhaseParams;
      uniform float uBondFormed;
      uniform vec3 uColor;

      varying float vDeform;
      varying vec3 vWorldPos;
      varying vec3 vNormal;

      // GLSL helper — .xz swizzle not supported in GLSL ES 1.00
      vec2 flatPos(vec3 v) { return vec2(v.x, v.z); }

      // --- Deterministic noise for vacuum fluctuations ---
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise2D(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        vec2 shift = vec2(100.0);
        mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
        for (int i = 0; i < 3; i++) {
          v += a * noise2D(p);
          p = rot * p * 2.0 + shift;
          a *= 0.5;
        }
        return v;
      }

      // --- PHYSICS: Field deformation equations ---

      // Bohr radius in scene units
      const float AO = 1.5;

      // Hydrogen 1s probability density: |ψ₁₀₀|² = exp(-2r/a₀) / πa₀³
      float orbital1s(vec3 pos, vec3 center) {
        float r = length(flatPos(pos) - flatPos(center));
        return exp(-2.0 * r / AO) * 2.0;
      }

      // H₂ bonding: 
      // ψ_bonding = (ψ₁ + ψ₂) / √[2(1+S)]
      // |ψ_bonding|² = (ψ₁ + ψ₂)² / [2(1+S)]
      // where ψ(r) = exp(-r/a₀) / √(πa₀³)  [the wavefunction, NOT the probability density]
      float orbitalH2(vec3 pos, vec3 c1, vec3 c2) {
        float r1 = length(flatPos(pos) - flatPos(c1));
        float r2 = length(flatPos(pos) - flatPos(c2));
        // ψ₁₀₀(r) ∝ exp(-r/a₀)  — wavefunction (not squared)
        float psi1 = exp(-r1 / AO);
        float psi2 = exp(-r2 / AO);
        float R = length(flatPos(c1) - flatPos(c2));
        // Overlap integral S = (1 + R/a₀ + R²/3a₀²) · exp(-R/a₀)
        float S = exp(-R / AO) * (1.0 + R / AO + R*R / (3.0*AO*AO));
        // |ψ_bonding|² = (ψ₁+ψ₂)² / [2(1+S)]
        return (psi1 + psi2) * (psi1 + psi2) / (2.0 * (1.0 + S)) * 2.5;
      }

      // Quark confinement: gaussian spike (visual proxy for linear confinement)
      float quarkWell(vec3 pos, vec3 center) {
        float r = length(flatPos(pos) - flatPos(center));
        return exp(-r * r * 12.0) * 3.0;
      }

      // Coulomb: 1/r potential, clamped and scaled for readability
      float coulomb(vec3 pos, vec3 center) {
        float r = length(flatPos(pos) - flatPos(center));
        return 1.0 / max(r, 0.15) * 0.4;
      }

      // Gluon binding: gaussian flux tube between nuclei (QCD string)
      float gluonTube(vec3 pos, vec3 c1, vec3 c2) {
        vec2 p = flatPos(pos);
        vec2 a = flatPos(c1);
        vec2 b = flatPos(c2);
        vec2 ab = b - a;
        float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
        vec2 closest = a + t * ab;
        float d = length(p - closest);
        float thickness = 0.4 + 0.2 * (1.0 - abs(t - 0.5) * 2.0);
        return exp(-d * d / (thickness * thickness)) * 1.5;
      }

      // Log-scale compression: lets small deformations be visible alongside tall spikes
      float logCompress(float val) {
        float compressed = log(1.0 + val * 5.0) / log(1.0 + 5.0);
        return mix(val, compressed, uLogScale);
      }

      // Combined deformation for this field mode
      float getDeform(vec3 pos) {
        float d = 0.0;
        float nest = 0.0;
        float R = length(flatPos(uNucleus1) - flatPos(uNucleus2));
        float hasSecondNucleus = step(0.5, R);

        if (uMode == 1) {
          // Quark sheet: gaussian spikes at each nucleus
          d = quarkWell(pos, uNucleus1);
          if (hasSecondNucleus > 0.5) d += quarkWell(pos, uNucleus2);
          nest = 0.025 * sin(uTime * 4.0 + flatPos(pos).x * 2.5 + flatPos(pos).y * 1.7);
        }
        else if (uMode == 2) {
          // Electron sheet
          // Before bonding: TWO separate 1s orbitals (one per atom)
          float twoAtoms = orbital1s(pos, uNucleus1) + orbital1s(pos, uNucleus2) * hasSecondNucleus;
          // After bonding: H₂ molecular orbital (peanut shape)
          float bonded = orbitalH2(pos, uNucleus1, uNucleus2);
          d = mix(twoAtoms, bonded, smoothstep(0.2, 0.7, uBondFormed));
          // Standing wave ripple on each 1s orbital
          float r1 = length(flatPos(pos) - flatPos(uNucleus1));
          float r2 = length(flatPos(pos) - flatPos(uNucleus2));
          float ripple1 = 0.12 * sin(uTime * 0.8 - r1 * 5.0) * orbital1s(pos, uNucleus1);
          float ripple2 = 0.12 * sin(uTime * 0.8 - r2 * 5.0 + 1.57) * orbital1s(pos, uNucleus2) * hasSecondNucleus;
          float bondRipple = 0.08 * sin(uTime * 1.2 + r1 * 3.0 - r2 * 3.0) * smoothstep(0.2, 1.0, uBondFormed);
          nest = ripple1 + ripple2 + bondRipple;
        }
        else if (uMode == 3) {
          // Gluon sheet: flux tube between nuclei
          if (hasSecondNucleus > 0.5 && R < 6.0) {
            d = gluonTube(pos, uNucleus1, uNucleus2);
            nest = 0.3 * sin(uTime * 14.0 + flatPos(pos).x * 12.0 + flatPos(pos).y * 9.0)
                   * exp(-length(flatPos(pos) - (flatPos(uNucleus1) + flatPos(uNucleus2)) * 0.5) * 1.5);
          }
        }
        else if (uMode == 4) {
          // Photon sheet: Coulomb potential at each nucleus
          d = coulomb(pos, uNucleus1);
          if (hasSecondNucleus > 0.5) d += coulomb(pos, uNucleus2);
          nest = 0.03 * sin(uTime * 2.0 + flatPos(pos).x * 1.5 + flatPos(pos).y * 1.2);
        }
        else if (uMode == 5) {
          // Field Space: combined stress-energy from ALL fields → spacetime curvature
          // GR analogy: R_μν - ½Rg_μν = 8πG T_μν / c⁴
          // Here we sum energy densities as a proxy for T_μν
          float electronE = orbital1s(pos, uNucleus1) * 0.3
                          + orbital1s(pos, uNucleus2) * hasSecondNucleus * 0.3;
          float quarkE = quarkWell(pos, uNucleus1) * 0.15
                       + quarkWell(pos, uNucleus2) * hasSecondNucleus * 0.15;
          float photonE = coulomb(pos, uNucleus1) * 0.2
                        + coulomb(pos, uNucleus2) * hasSecondNucleus * 0.2;
          float gluonE = gluonTube(pos, uNucleus1, uNucleus2) * hasSecondNucleus * 0.25;
          d = electronE + quarkE + photonE + gluonE;
          // Subtle time-varying background curvature
          nest = 0.02 * sin(uTime * 0.3 + flatPos(pos).x * 1.0 + flatPos(pos).y * 0.8)
               + 0.015 * fbm(flatPos(pos) * 0.3 + uTime * 0.05);
        }
        else {
          // Fallback: vacuum noise
          nest = 0.05 * fbm(flatPos(pos) * 0.8 + uTime * 0.1);
        }
        return (d + nest) * uAmplitude * uIntensity;
      }

      void main() {
        vec3 pos = position;
        float raw = getDeform(pos);
        float deform = logCompress(raw);
        pos.y += deform + uSheetHeight * uHeightOffset;
        vDeform = deform;
        vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
        // Approximate normal from deformation gradient
        float eps = 0.05;
        vec3 posR = position + vec3(eps, 0.0, 0.0);
        vec3 posF = position + vec3(0.0, 0.0, eps);
        float dR = getDeform(posR);
        float dF = getDeform(posF);
        float dL = posR.y + logCompress(dR) + uSheetHeight * uHeightOffset;
        float dB = posF.y + logCompress(dF) + uSheetHeight * uHeightOffset;
        vec3 tangent = normalize(vec3(eps, dL - pos.y, 0.0));
        vec3 bitangent = normalize(vec3(0.0, dB - pos.y, eps));
        vNormal = normalize(cross(tangent, bitangent));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `;

    const frag = `
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform int uMode;

      varying float vDeform;
      varying vec3 vWorldPos;
      varying vec3 vNormal;

      void main() {
        float deformAbs = abs(vDeform);
        float core = clamp(deformAbs * 1.5, 0.0, 1.0);

        // Fresnel rim glow based on view angle
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fresnel = 1.0 - max(dot(normalize(vNormal), viewDir), 0.0);
        fresnel = pow(fresnel, 2.0) * 0.5;

        // Base color
        vec3 color = uColor * (0.15 + core * 0.85);

        // Height-based glow (hotter at peaks)
        float glow = smoothstep(0.05, 0.8, deformAbs);
        vec3 glowColor = uMode == 5
          ? vec3(1.0, 0.95, 0.85)  // warm white for spacetime
          : mix(uColor, vec3(1.0), 0.5);
        color += glowColor * glow * 0.35;

        // Fresnel rim
        color += uColor * fresnel * 0.4;

        // Alpha
        float alpha = clamp(0.25 + core * 0.60, 0.0, 0.85);
        if (alpha < 0.01) discard;

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
