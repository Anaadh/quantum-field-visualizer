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
      uNucleus3: { value: new THREE.Vector3(0, 0, 0) },
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
        vec2 np = p * 0.6 + vec2(17.3, 29.1) + t * 0.03;
        float n1 = fbmWarp(np, 5) * 3.0 - 1.0;
        float n2 = voronoi(np * 2.0 + t * 0.03) * 0.8;
        return n1 * 0.05 + n2 * 0.04;
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
          // Dramatic: each field contributes more strongly
          float eField = orbital1s(pos, uNucleus1) * 0.5
                       + orbital1s(pos, uNucleus2) * hasN2 * 0.5
                       + orbital1s(pos, uNucleus3) * hasN3 * 0.5;
          float qField = quarkWell(pos, uNucleus1) * 0.3
                       + quarkWell(pos, uNucleus2) * hasN2 * 0.3
                       + quarkWell(pos, uNucleus3) * hasN3 * 0.3;
          float pField = coulomb(pos, uNucleus1) * 0.4
                       + coulomb(pos, uNucleus2) * hasN2 * 0.4
                       + coulomb(pos, uNucleus3) * hasN3 * 0.4;
          float gField = 0.0;
          if (hasN2 > 0.5 && length(flatPos(uNucleus1) - flatPos(uNucleus2)) < 6.0) {
            gField = gluonTube(pos, uNucleus1, uNucleus2) * 0.4;
          }
          d = eField + qField + pField + gField;
          nest = fieldSpaceNoise(p, uTime);
          // Extra spacetime ripple from time
          float ripple = sin(length(p) * 2.0 - uTime * 0.8) * 0.15;
          d += ripple;
          // Annihilation energy adds to curvature
          if (uAnnihilation > 0.01) {
            d += annihilationBurst(pos, uAnnihilationCenter, uAnnihilation) * 0.5;
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
      uniform float uTime;

      varying float vDeform;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vFieldId;
      varying float vAntiWeight;

      // Edge fade: 0 at sheet edge, 1 at center
      float edgeFade(vec3 worldPos) {
        // Sheet is ~7 units radius, fade last 2 units
        float dist = length(worldPos.xz);
        return 1.0 - smoothstep(4.5, 6.8, dist);
      }

      // Neon anti-matter palette
      vec3 neonAntiColor(vec3 matterColor, int mode) {
        if (mode == 1) {
          return mix(vec3(0.0, 1.0, 1.0), vec3(1.0, 0.2, 0.6), 0.4);
        } else if (mode == 2) {
          return vec3(1.0, 0.2, 0.8);
        } else if (mode == 4) {
          return vec3(0.2, 1.0, 0.4);
        }
        // Default: vivid inverted with boost
        vec3 inv = vec3(1.0) - matterColor;
        return clamp(inv * 1.5, 0.0, 1.0);
      }

      void main() {
        float deformAbs = abs(vDeform);
        float core = clamp(deformAbs * 1.8, 0.0, 1.0);

        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        vec3 n = normalize(vNormal);
        float fresnel = 1.0 - max(dot(n, viewDir), 0.0);
        fresnel = pow(fresnel, 3.0);
        float steep = 1.0 - max(dot(n, viewDir), 0.0);
        steep = 1.0 - pow(steep, 2.0);

        // Deformation-based heat index
        float heat = pow(core, 1.5);
        float glowIntensity = heat * 0.5;

        // Anti-matter: neon palette
        vec3 baseColor = uColor;
        vec3 antiColor = neonAntiColor(uColor, uMode);
        vec3 fieldColor = mix(baseColor, antiColor, uAntiMatter);

        // Per-field rim glow colors
        vec3 rimColor;
        if (uMode == 1) {
          rimColor = mix(vec3(1.0, 0.3, 0.1), vec3(0.0, 1.0, 1.0), uAntiMatter);
        } else if (uMode == 2) {
          rimColor = mix(vec3(0.2, 0.5, 1.0), vec3(1.0, 0.2, 0.8), uAntiMatter);
        } else if (uMode == 3) {
          rimColor = mix(vec3(1.0, 0.8, 0.0), vec3(0.0, 0.2, 1.0), uAntiMatter);
        } else if (uMode == 4) {
          rimColor = mix(vec3(1.0, 0.1, 0.8), vec3(0.2, 1.0, 0.4), uAntiMatter);
        } else {
          rimColor = vec3(0.3, 0.2, 0.6);
        }

        // Edge fade
        float edge = edgeFade(vWorldPos);
        float edgeMask = edge;  // 1 in center, 0 at edge

        // Glassy specular highlight on steep deformation slopes
        vec3 halfDir = normalize(viewDir + vec3(0.0, 1.0, 0.0));
        float spec = pow(max(dot(n, halfDir), 0.0), 16.0);
        float specIntensity = spec * steep * 0.3;

        vec3 color;
        float alpha;

        if (uMode == 5) {
          // Field Space: spacetime curvature — more dramatic
          float temp = core * 0.85 + steep * 0.15;
          color = mix(vec3(0.02, 0.01, 0.06), vec3(1.0, 0.98, 0.85), temp);
          float rimGlow = pow(fresnel, 2.0) * 0.6;
          color += vec3(0.4, 0.3, 0.7) * rimGlow;
          // Deformation peaks get hot white (dimmed)
          color += vec3(1.0, 0.95, 0.9) * heat * 0.3;
          // Annihilation flash
          if (uAnnihilation > 0.01) {
            float flash = smoothstep(0.0, 0.5, uAnnihilation) * (1.0 - smoothstep(0.5, 1.5, uAnnihilation));
            color += vec3(1.0, 1.0, 0.95) * flash * 2.0;
          }
          alpha = clamp(0.20 + core * 0.35, 0.0, 0.55);
        } else {
          // Core color with heat gradient — reduced intensity for NormalBlending
          color = fieldColor * (0.04 + core * 0.35);
          // Heat glow — peaks go toward white (subtler)
          vec3 heatColor = mix(fieldColor, vec3(1.0), 0.5);
          color += heatColor * heat * 0.25;

          // Rim glow
          float rimPower = pow(fresnel, 2.0);
          color += rimColor * rimPower * 0.4;

          // Steep-face glow
          color += fieldColor * steep * 0.08;

          // Glassy specular highlight
          color += vec3(1.0) * specIntensity;

          // Subtle time-based oscillation
          float pulse = 0.5 + 0.5 * sin(uTime * 0.5 + core * 3.0);
          color += fieldColor * glowIntensity * 0.10 * pulse;

          // Annihilation glow
          if (uAnnihilation > 0.01 && (uMode == 4 || uMode == 1 || uMode == 2)) {
            float flash = smoothstep(0.0, 0.5, uAnnihilation) * (1.0 - smoothstep(0.5, 2.0, uAnnihilation));
            color += vec3(1.0, 0.9, 0.7) * flash * 2.0;
          }

          // Apply edge fade to alpha — sheets fade at borders for glassy look
          alpha = clamp(0.12 + core * 0.33, 0.0, 0.50);
          alpha *= edgeMask;
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
      blending: THREE.NormalBlending,
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
      } else if (phaseData.nuclei && phaseData.nuclei.length >= 1) {
        // Reset uNucleus3 to match uNucleus1 so hasN3 stays 0
        this._uniforms.uNucleus3.value.copy(phaseData.nuclei[0].position);
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
