import * as THREE from 'three';
import { Field } from './Field.js';

// ─── Deterministic noise helpers (shared, but each field samples differently) ───

function noiseGLSL() {
  return `
    // --- Individual 2D noise per field (all use same base, different sampling) ---
    float hash21(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }
    float hash21alt(vec2 p) {
      return fract(sin(dot(p, vec2(269.5, 183.3))) * 73758.5493);
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

    // FBM with domain rotation per octave for richer detail
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

    // Voronoi-like: distance to nearest cell centre (gives organic "web" / cell patterns)
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

    // Smooth turbine noise — swirling patterns
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
    const segments = params.segments || 140;
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
      varying float vFieldId;

      vec2 flatPos(vec3 v) { return vec2(v.x, v.z); }

      ${noiseGLSL()}

      // --- PHYSICS: Field deformation equations ---

      const float AO = 1.5; // Bohr radius in scene units

      // Hydrogen 1s: |ψ₁₀₀|² ∝ exp(-2r/a₀)
      float orbital1s(vec3 pos, vec3 center) {
        float r = length(flatPos(pos) - flatPos(center));
        return exp(-2.0 * r / AO) * 2.0;
      }

      // H₂ bonding molecular orbital: |ψ_bonding|² = (ψ₁+ψ₂)² / [2(1+S)]
      float orbitalH2(vec3 pos, vec3 c1, vec3 c2) {
        float r1 = length(flatPos(pos) - flatPos(c1));
        float r2 = length(flatPos(pos) - flatPos(c2));
        float psi1 = exp(-r1 / AO);
        float psi2 = exp(-r2 / AO);
        float R = length(flatPos(c1) - flatPos(c2));
        float S = exp(-R / AO) * (1.0 + R / AO + R*R / (3.0*AO*AO));
        return (psi1 + psi2) * (psi1 + psi2) / (2.0 * (1.0 + S)) * 2.5;
      }

      // Quark: gaussian spike
      float quarkWell(vec3 pos, vec3 center) {
        float r = length(flatPos(pos) - flatPos(center));
        return exp(-r * r * 12.0) * 3.0;
      }

      // Coulomb: 1/r potential
      float coulomb(vec3 pos, vec3 center) {
        float r = length(flatPos(pos) - flatPos(center));
        return 1.0 / max(r, 0.15) * 0.4;
      }

      // Gluon flux tube: gaussian perpendicular to line between nuclei
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

      // Log-scale compression
      float logCompress(float val) {
        float compressed = log(1.0 + val * 5.0) / log(1.0 + 5.0);
        return mix(val, compressed, uLogScale);
      }

      // ─── FIELD‑SPECIFIC NOISE — each field has its own character ───

      float quarkNoise(vec2 p, float t) {
        // Sharp, high-frequency crackle (up/down quarks fluctuate fast)
        vec2 np = p * 4.0 + vec2(13.7, 41.3) + t * 2.0;
        float n = fbmWarp(np, 4);
        return (n - 0.5) * 0.08;
      }

      float electronNoise(vec2 p, float t) {
        // Smooth, oceanic undulations
        vec2 np = p * 1.5 + vec2(92.5, 7.1) + t * 0.15;
        float n = fbmWarp(np, 3) * 0.5 + 0.5;
        return (n - 0.5) * 0.06;
      }

      float gluonNoise(vec2 p, float t) {
        // Frantic high-velocity plasma
        vec2 np = p * 8.0 + vec2(55.3, 88.7) + t * 5.0;
        float n1 = valueNoise(np);
        float n2 = voronoi(np * 2.0);
        return (n1 * 0.7 + n2 * 0.3 - 0.5) * 0.2;
      }

      float photonNoise(vec2 p, float t) {
        // Gentle radiant shimmer + geometric grid
        vec2 np = p * 2.5 + vec2(33.1, 66.9) + t * 0.8;
        float n = fbmWarp(np, 2) * 0.5 + 0.5;
        float grid = sin(np.x * 3.0) * sin(np.y * 3.0) * 0.03;
        return (n - 0.5) * 0.04 + grid;
      }

      float fieldSpaceNoise(vec2 p, float t) {
        // Deep, slow gravitational waves + cosmic web
        vec2 np = p * 0.8 + vec2(17.3, 29.1) + t * 0.05;
        float n1 = fbmWarp(np, 4) * 2.0 - 1.0;
        float n2 = voronoi(np * 3.0 + t * 0.02) * 0.5;
        return n1 * 0.03 + n2 * 0.02;
      }

      // Core field deformation (mode-dependent)
      float getDeform(vec3 pos) {
        vec2 p = flatPos(pos);
        float d = 0.0;
        float nest = 0.0;
        float hasN2 = step(0.5, length(flatPos(uNucleus1) - flatPos(uNucleus2)));

        if (uMode == 1) {
          // ═══ QUARK FIELD (up/down) ═══
          // Two gaussian spikes with crackling noise
          d = quarkWell(pos, uNucleus1);
          if (hasN2 > 0.5) d += quarkWell(pos, uNucleus2);
          // Anisotropic distortion: stretch along axis between nuclei
          vec2 axis = normalize(flatPos(uNucleus2) - flatPos(uNucleus1) + vec2(0.001));
          float stretch = 1.0 + 0.15 * dot(p - flatPos(uNucleus1), axis);
          d *= 1.0 + 0.04 * sin(uTime * 2.5 + p.x * 3.0 + p.y * 2.0);
          nest = quarkNoise(p, uTime);
        }
        else if (uMode == 2) {
          // ═══ ELECTRON FIELD ═══
          // Two 1s orbitals → H₂ molecular orbital (peanut)
          float twoAtoms = orbital1s(pos, uNucleus1)
                          + orbital1s(pos, uNucleus2) * hasN2;
          float bonded = orbitalH2(pos, uNucleus1, uNucleus2);
          float blend = smoothstep(0.2, 0.7, uBondFormed);
          d = mix(twoAtoms, bonded, blend);
          // Radial standing wave on each atom
          float r1 = length(p - flatPos(uNucleus1));
          float r2 = length(p - flatPos(uNucleus2));
          // Outgoing spherical wave: sin(ωt - kr) decaying with 1/r
          float wave1 = 0.10 * sin(uTime * 1.5 - r1 * 6.0) / max(r1, 0.3) * orbital1s(pos, uNucleus1);
          float wave2 = 0.10 * sin(uTime * 1.5 - r2 * 6.0 + 1.57) / max(r2, 0.3) * orbital1s(pos, uNucleus2) * hasN2;
          float bondWave = 0.06 * sin(uTime * 2.0 + r1 * 4.0 - r2 * 4.0) * smoothstep(0.2, 1.0, uBondFormed);
          nest = wave1 + wave2 + bondWave + electronNoise(p, uTime);
        }
        else if (uMode == 3) {
          // ═══ GLUON FIELD ═══
          // Flux tube between nuclei + plasma arc vibration
          if (hasN2 > 0.5) {
            d = gluonTube(pos, uNucleus1, uNucleus2);
            // Vortex swirl around the tube
            vec2 mid = (flatPos(uNucleus1) + flatPos(uNucleus2)) * 0.5;
            float swirl = swirlNoise(p - mid, uTime * 3.0) * 0.2;
            d *= 1.0 + swirl;
          }
          nest = gluonNoise(p, uTime);
        }
        else if (uMode == 4) {
          // ═══ PHOTON FIELD ═══
          // Coulomb 1/r potential + radiant shimmer
          d = coulomb(pos, uNucleus1);
          if (hasN2 > 0.5) d += coulomb(pos, uNucleus2);
          nest = photonNoise(p, uTime);
        }
        else if (uMode == 5) {
          // ═══ FIELD SPACE (spacetime curvature) ═══
          // Sum of ALL field energy densities → GR stress-energy proxy
          float eField = orbital1s(pos, uNucleus1) * 0.3
                       + orbital1s(pos, uNucleus2) * hasN2 * 0.3;
          float qField = quarkWell(pos, uNucleus1) * 0.15
                       + quarkWell(pos, uNucleus2) * hasN2 * 0.15;
          float pField = coulomb(pos, uNucleus1) * 0.2
                       + coulomb(pos, uNucleus2) * hasN2 * 0.2;
          float gField = gluonTube(pos, uNucleus1, uNucleus2) * hasN2 * 0.25;
          d = eField + qField + pField + gField;
          nest = fieldSpaceNoise(p, uTime);
        }
        else {
          // Fallback vacuum
          nest = (fbmWarp(p * 0.8 + uTime * 0.1, 3) - 0.5) * 0.05;
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
        vFieldId = float(uMode);

        // Approximate normal from deformation gradient
        float eps = 0.03;
        vec3 posR = position + vec3(eps, 0.0, 0.0);
        vec3 posF = position + vec3(0.0, 0.0, eps);
        vec3 posP = position;
        float dR = getDeform(posR);
        float dF = getDeform(posF);
        float dP = getDeform(posP);
        float yR = posR.y + logCompress(dR) + uSheetHeight * uHeightOffset;
        float yF = posF.y + logCompress(dF) + uSheetHeight * uHeightOffset;
        float yP = posP.y + logCompress(dP) + uSheetHeight * uHeightOffset;
        vec3 tangent = normalize(vec3(eps, yR - yP, 0.0));
        vec3 bitangent = normalize(vec3(0.0, yF - yP, eps));
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
      varying float vFieldId;

      void main() {
        float deformAbs = abs(vDeform);
        float core = clamp(deformAbs * 1.8, 0.0, 1.0);

        // Fresnel rim
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fresnel = 1.0 - max(dot(normalize(vNormal), viewDir), 0.0);
        fresnel = pow(fresnel, 2.0);

        // Curvature-based color (steepness glow)
        float steep = 1.0 - fresnel;

        // Per-field color shaping
        vec3 color;
        float alpha;

        if (uMode == 5) {
          // Field Space: white → warm where curved, cool where flat
          float temp = core * 0.7 + steep * 0.3;
          color = mix(vec3(0.1, 0.08, 0.15), vec3(1.0, 0.95, 0.8), temp);
          float rimGlow = pow(fresnel, 3.0) * 0.6;
          color += vec3(0.3, 0.2, 0.5) * rimGlow;
          alpha = clamp(0.30 + core * 0.55, 0.0, 0.80);
        } else {
          // Field sheets
          color = uColor * (0.12 + core * 0.88);
          float glow = smoothstep(0.05, 0.6, deformAbs);
          color += mix(uColor, vec3(1.0), 0.6) * glow * 0.30;
          color += uColor * fresnel * 0.35;
          alpha = clamp(0.22 + core * 0.63, 0.0, 0.85);
        }

        // Edge fade for all fields
        float edgeFade = 1.0;
        if (uMode == 5) {
          edgeFade = 1.0; // full sheet visible
        }

        if (alpha < 0.01) discard;
        gl_FragColor = vec4(color * edgeFade, alpha * edgeFade);
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
