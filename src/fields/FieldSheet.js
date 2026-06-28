import * as THREE from 'three';
import { Field } from './Field.js';

function noiseGLSL() {
  return `
    float hash21(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    float valueNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash21(i);
      float b = hash21(i + vec2(1.0, 0.0));
      float c = hash21(i + vec2(0.0, 1.0));
      float d = hash21(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    float fbmWarp(vec2 p, int octs) {
      float v = 0.0;
      float a = 0.5;
      vec2 shift = vec2(100.0);
      mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
      for (int i = 0; i < 6; i++) {
        if (i >= octs) break;
        v += a * valueNoise(p);
        p = rot * p * 2.0 + shift;
        a *= 0.5;
      }
      return v;
    }

    float voronoi(vec2 p) {
      vec2 i = floor(p);
      float md = 8.0;
      for (int dx = -1; dx <= 1; dx++) {
        for (int dy = -1; dy <= 1; dy++) {
          vec2 cell = i + vec2(float(dx), float(dy));
          vec2 cp = cell + vec2(hash21(cell), hash21(cell * 31.7));
          float d = length(p - cp);
          md = min(md, d);
        }
      }
      return md;
    }

    float swirlNoise(vec2 p, float t) {
      float a = atan(p.y, p.x);
      float r = length(p);
      return sin(3.0 * a + r * 2.0 - t * 0.5) * 0.5 + 0.5;
    }
  `;
}

export class FieldSheet extends Field {
  constructor(name, color, mode, params = {}) {
    super(name, color, params);

    const size = params.size || 16;
    const segments = params.segments || 160;
    const height = params.height || 0;
    const amplitude = params.amplitude ?? 1.0;
    const logScale = params.logScale ?? 0.5;
    const antiMatter = params.antiMatter ?? false;

    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);

    this._uniforms = {
      uColor: { value: this.color },
      uSheetHeight: { value: height },
      uHeightOffset: { value: 1.0 },
      uIntensity: { value: 1.0 },
      uAmplitude: { value: amplitude },
      uLogScale: { value: logScale },
      uAntiMatter: { value: antiMatter ? 1.0 : 0.0 },
      uAnnihilation: { value: 0.0 },
      uAnnihilationCenter: { value: new THREE.Vector3(0, 0, 0) },
      uTime: { value: 0 },
      uNucleus1: { value: new THREE.Vector3(0, 0, 0) },
      uNucleus2: { value: new THREE.Vector3(5, 0, 0) },
      uNucleus3: { value: new THREE.Vector3(-5, 0, 0) },
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
      uniform float uAntiMatter;
      uniform float uAnnihilation;
      uniform vec3 uAnnihilationCenter;
      uniform float uTime;
      uniform vec3 uNucleus1;
      uniform vec3 uNucleus2;
      uniform vec3 uNucleus3;
      uniform int uMode;
      uniform vec4 uPhaseParams;
      uniform float uBondFormed;
      uniform vec3 uColor;

      varying float vDeform;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vFieldId;
      varying float vAntiWeight;

      vec2 flatPos(vec3 v) { return vec2(v.x, v.z); }

      ${noiseGLSL()}

      // ─── PHYSICS CONSTANTS ───
      const float AO = 1.5;              // Bohr radius (scene units)
      const float STRING_TENSION = 0.6;  // QCD string tension σ (visual scale)

      // Hydrogen 1s probability density: |ψ₁₀₀|² ∝ exp(-2r/a₀)
      float orbital1s(vec3 pos, vec3 center) {
        float r = length(flatPos(pos) - flatPos(center));
        return exp(-2.0 * r / AO) * 2.0;
      }

      // H₂ molecular orbital: |ψ_bonding|² = (ψ₁+ψ₂)² / 2(1+S)
      float orbitalH2(vec3 pos, vec3 c1, vec3 c2) {
        float r1 = length(flatPos(pos) - flatPos(c1));
        float r2 = length(flatPos(pos) - flatPos(c2));
        float psi1 = exp(-r1 / AO);
        float psi2 = exp(-r2 / AO);
        float R = length(flatPos(c1) - flatPos(c2));
        float S = exp(-R / AO) * (1.0 + R / AO + R*R / (3.0*AO*AO));
        return (psi1 + psi2) * (psi1 + psi2) / (2.0 * (1.0 + S)) * 2.5;
      }

      // Linear quark confinement: V(r) = σ·r  (QCD string tension)
      // Creates a cone/funnel shape — minimum at quark, grows linearly away
      float quarkWell(vec3 pos, vec3 center) {
        float r = length(flatPos(pos) - flatPos(center));
        // Linear confinement: peak at quark, ramps down linearly
        // (inverted so it shows as a spike on the sheet)
        return max(0.0, 3.0 - r * STRING_TENSION);
      }

      // Coulomb 1/r potential
      float coulomb(vec3 pos, vec3 center) {
        float r = length(flatPos(pos) - flatPos(center));
        return 1.0 / max(r, 0.15) * 0.4;
      }

      // Gluon flux tube (QCD string between quarks)
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

      // Annihilation burst: Gaussian ring expanding from center
      float annihilationBurst(vec3 pos, vec3 center, float t) {
        float r = length(flatPos(pos) - flatPos(center));
        float ringRadius = 0.5 + t * 2.0;  // expands at 2 units/s
        float width = 0.3 + t * 0.1;       // widens over time
        return exp(-(r - ringRadius) * (r - ringRadius) / (width * width)) * 5.0;
      }

      // Log-scale compression
      float logCompress(float val) {
        float compressed = log(1.0 + val * 5.0) / log(1.0 + 5.0);
        return mix(val, compressed, uLogScale);
      }

      // ─── FIELD-SPECIFIC NOISE ───
      float quarkNoise(vec2 p, float t) {
        vec2 np = p * 4.0 + vec2(13.7, 41.3) + t * 2.0;
        return (fbmWarp(np, 4) - 0.5) * 0.08;
      }

      float electronNoise(vec2 p, float t) {
        vec2 np = p * 1.5 + vec2(92.5, 7.1) + t * 0.15;
        return (fbmWarp(np, 3) * 0.5 + 0.5 - 0.5) * 0.06;
      }

      float gluonNoise(vec2 p, float t) {
        vec2 np = p * 8.0 + vec2(55.3, 88.7) + t * 5.0;
        float n1 = valueNoise(np);
        float n2 = voronoi(np * 2.0);
        return (n1 * 0.7 + n2 * 0.3 - 0.5) * 0.2;
      }

      float photonNoise(vec2 p, float t) {
        vec2 np = p * 2.5 + vec2(33.1, 66.9) + t * 0.8;
        float n = fbmWarp(np, 2) * 0.5 + 0.5;
        float grid = sin(np.x * 3.0) * sin(np.y * 3.0) * 0.03;
        return (n - 0.5) * 0.04 + grid;
      }

      float fieldSpaceNoise(vec2 p, float t) {
        vec2 np = p * 0.8 + vec2(17.3, 29.1) + t * 0.05;
        float n1 = fbmWarp(np, 4) * 2.0 - 1.0;
        float n2 = voronoi(np * 3.0 + t * 0.02) * 0.5;
        return n1 * 0.03 + n2 * 0.02;
      }

      // Core field deformation
      float getDeform(vec3 pos) {
        vec2 p = flatPos(pos);
        float d = 0.0;
        float nest = 0.0;
        float hasN2 = step(0.5, length(flatPos(uNucleus1) - flatPos(uNucleus2)));
        float hasN3 = step(0.5, length(flatPos(uNucleus1) - flatPos(uNucleus3)));

        if (uMode == 1) {
          // ═══ QUARK FIELD (up/down quarks) ═══
          // Linear confinement cone at each nucleus
          d = quarkWell(pos, uNucleus1);
          if (hasN2 > 0.5) d += quarkWell(pos, uNucleus2);
          if (hasN3 > 0.5) d += quarkWell(pos, uNucleus3);
          nest = quarkNoise(p, uTime);
        }
        else if (uMode == 2) {
          // ═══ ELECTRON FIELD ═══
          float twoAtoms = orbital1s(pos, uNucleus1)
                          + orbital1s(pos, uNucleus2) * hasN2
                          + orbital1s(pos, uNucleus3) * hasN3;
          float bonded = orbitalH2(pos, uNucleus1, uNucleus2);
          float blend = smoothstep(0.2, 0.7, uBondFormed);
          d = mix(twoAtoms, bonded, blend);
          // Radial standing waves
          float r1 = length(p - flatPos(uNucleus1));
          float r2 = length(p - flatPos(uNucleus2));
          float r3 = length(p - flatPos(uNucleus3));
          float wave1 = 0.10 * sin(uTime * 1.5 - r1 * 6.0) / max(r1, 0.3) * orbital1s(pos, uNucleus1);
          float wave2 = 0.10 * sin(uTime * 1.5 - r2 * 6.0 + 1.57) / max(r2, 0.3) * orbital1s(pos, uNucleus2) * hasN2;
          float wave3 = 0.10 * sin(uTime * 1.5 - r3 * 6.0 + 3.14) / max(r3, 0.3) * orbital1s(pos, uNucleus3) * hasN3;
          float bondWave = 0.06 * sin(uTime * 2.0 + r1 * 4.0 - r2 * 4.0) * smoothstep(0.2, 1.0, uBondFormed);
          nest = wave1 + wave2 + wave3 + bondWave + electronNoise(p, uTime);
        }
        else if (uMode == 3) {
          // ═══ GLUON FIELD ═══
          if (hasN2 > 0.5 && length(flatPos(uNucleus1) - flatPos(uNucleus2)) < 6.0) {
            d = gluonTube(pos, uNucleus1, uNucleus2);
            vec2 mid = (flatPos(uNucleus1) + flatPos(uNucleus2)) * 0.5;
            float swirl = swirlNoise(p - mid, uTime * 3.0) * 0.2;
            d *= 1.0 + swirl;
          }
          nest = gluonNoise(p, uTime);
        }
        else if (uMode == 4) {
          // ═══ PHOTON FIELD ═══
          d = coulomb(pos, uNucleus1);
          if (hasN2 > 0.5) d += coulomb(pos, uNucleus2);
          if (hasN3 > 0.5) d += coulomb(pos, uNucleus3);
          // Annihilation burst overlay
          if (uAnnihilation > 0.01) {
            d += annihilationBurst(pos, uAnnihilationCenter, uAnnihilation);
          }
          nest = photonNoise(p, uTime);
        }
        else if (uMode == 5) {
          // ═══ FIELD SPACE (spacetime curvature) ═══
          float eField = orbital1s(pos, uNucleus1) * 0.3
                       + orbital1s(pos, uNucleus2) * hasN2 * 0.3
                       + orbital1s(pos, uNucleus3) * hasN3 * 0.3;
          float qField = quarkWell(pos, uNucleus1) * 0.15
                       + quarkWell(pos, uNucleus2) * hasN2 * 0.15
                       + quarkWell(pos, uNucleus3) * hasN3 * 0.15;
          float pField = coulomb(pos, uNucleus1) * 0.2
                       + coulomb(pos, uNucleus2) * hasN2 * 0.2
                       + coulomb(pos, uNucleus3) * hasN3 * 0.2;
          float gField = 0.0;
          if (hasN2 > 0.5 && length(flatPos(uNucleus1) - flatPos(uNucleus2)) < 6.0) {
            gField = gluonTube(pos, uNucleus1, uNucleus2) * 0.25;
          }
          d = eField + qField + pField + gField;
          nest = fieldSpaceNoise(p, uTime);
          // Annihilation energy adds to curvature
          if (uAnnihilation > 0.01) {
            d += annihilationBurst(pos, uAnnihilationCenter, uAnnihilation) * 0.3;
          }
        }
        else {
          nest = (fbmWarp(p * 0.8 + uTime * 0.1, 3) - 0.5) * 0.05;
        }

        // Anti-matter: negate deformation (antiparticles create "negative" curvature)
        float antiNegation = 1.0 - 2.0 * uAntiMatter;
        return (d * antiNegation + nest) * uAmplitude * uIntensity;
      }

      void main() {
        vec3 pos = position;
        float raw = getDeform(pos);
        float deform = logCompress(raw);
        pos.y += deform + uSheetHeight * uHeightOffset;
        vDeform = deform;
        vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
        vFieldId = float(uMode);

        // Anti-matter weighting for fragment shader
        vec2 p = flatPos(pos);
        float d1 = length(p - flatPos(uNucleus1));
        float dA = uAntiMatter > 0.5 ? 1.0 : 0.0;
        vAntiWeight = dA;

        // Approximate normal from deformation gradient
        float eps = 0.03;
        vec3 posR = position + vec3(eps, 0.0, 0.0);
        vec3 posF = position + vec3(0.0, 0.0, eps);
        float dR = getDeform(posR);
        float dF = getDeform(posF);
        float yR = posR.y + logCompress(dR) + uSheetHeight * uHeightOffset;
        float yF = posF.y + logCompress(dF) + uSheetHeight * uHeightOffset;
        vec3 tangent = normalize(vec3(eps, yR - pos.y, 0.0));
        vec3 bitangent = normalize(vec3(0.0, yF - pos.y, eps));
        vNormal = normalize(cross(tangent, bitangent));

        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `;

    const frag = `
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uAntiMatter;
      uniform float uAnnihilation;
      uniform vec3 uAnnihilationCenter;
      uniform int uMode;

      varying float vDeform;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vFieldId;
      varying float vAntiWeight;

      void main() {
        float deformAbs = abs(vDeform);
        float core = clamp(deformAbs * 1.8, 0.0, 1.0);

        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        vec3 n = normalize(vNormal);
        float fresnel = 1.0 - max(dot(n, viewDir), 0.0);
        fresnel = pow(fresnel, 2.0);
        float steep = 1.0 - fresnel;

        // Anti-matter color inversion
        vec3 baseColor = uColor;
        vec3 antiColor = vec3(1.0) - uColor;  // complementary
        // For dark colors, boost the complement
        if (length(uColor) < 0.5) {
          antiColor = vec3(1.0) - uColor * 1.5;
        }
        vec3 fieldColor = mix(baseColor, antiColor, uAntiMatter);

        vec3 color;
        float alpha;

        if (uMode == 5) {
          // Field Space: spacetime curvature
          float temp = core * 0.7 + steep * 0.3;
          color = mix(vec3(0.1, 0.08, 0.15), vec3(1.0, 0.95, 0.8), temp);
          float rimGlow = pow(fresnel, 3.0) * 0.6;
          color += vec3(0.3, 0.2, 0.5) * rimGlow;
          // Annihilation flash: pure white burst
          if (uAnnihilation > 0.01) {
            float flash = smoothstep(0.0, 0.5, uAnnihilation) * (1.0 - smoothstep(0.5, 1.5, uAnnihilation));
            color += vec3(1.0, 0.95, 0.8) * flash * 2.0;
          }
          alpha = clamp(0.30 + core * 0.55, 0.0, 0.80);
        } else {
          color = fieldColor * (0.12 + core * 0.88);
          float glow = smoothstep(0.05, 0.6, deformAbs);
          color += mix(fieldColor, vec3(1.0), 0.6) * glow * 0.30;
          color += fieldColor * fresnel * 0.35;
          // Annihilation glow
          if (uAnnihilation > 0.01 && uMode == 4) {
            float flash = smoothstep(0.0, 0.5, uAnnihilation) * (1.0 - smoothstep(0.5, 2.0, uAnnihilation));
            color += vec3(1.0, 0.9, 0.7) * flash * 3.0;
          }
          alpha = clamp(0.22 + core * 0.63, 0.0, 0.85);
        }

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
      if (phaseData.nuclei && phaseData.nuclei.length >= 3) {
        this._uniforms.uNucleus3.value.copy(phaseData.nuclei[2].position);
      }
      if (phaseData.phaseParams) {
        this._uniforms.uPhaseParams.value.copy(phaseData.phaseParams);
        this._uniforms.uBondFormed.value = phaseData.phaseParams.x;
      }
      if (phaseData.annihilation !== undefined) {
        this._uniforms.uAnnihilation.value = phaseData.annihilation;
      }
      if (phaseData.annihilationCenter) {
        this._uniforms.uAnnihilationCenter.value.copy(phaseData.annihilationCenter);
      }
      if (phaseData.antiMatter !== undefined) {
        this._uniforms.uAntiMatter.value = phaseData.antiMatter ? 1.0 : 0.0;
      }
    }
  }
}
