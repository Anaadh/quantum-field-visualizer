// Volumetric Raymarching Fragment Shader for Quantum Field Visualization
// Each field is spatially gated — density only appears where it physically should.

#include noise3d.glsl

uniform float uTime;
uniform vec3  uColor;
uniform float uIntensity;
uniform float uNoiseScale;
uniform int   uOctaves;
uniform vec4  uClipPlane;
uniform vec4  uPhaseParams;
uniform vec3  uNucleus1;
uniform vec3  uNucleus2;
uniform int   uMode;
uniform vec2  uResolution;

varying vec2 vUv;
varying vec3 vPosition;
varying vec3 vNormal;

#define MODE_QUARK      1
#define MODE_ELECTRON   2
#define MODE_GLUON      3
#define MODE_PHOTON     4

// --- Quark field: 3 tight spikes at nucleus + high-freq noise only near center ---
float densityQuark(vec3 p) {
  float d1 = length(p - uNucleus1);
  float d2 = length(p - uNucleus2);
  float minD = min(d1, d2);

  // Tight spikes — only visible within 0.5 units of nucleus
  float spike1 = exp(-d1 * d1 * 25.0) * 8.0;
  float spike2 = exp(-d2 * d2 * 25.0) * 8.0;

  // High-freq noise gated to nucleus region only
  float gate = 1.0 - smoothstep(0.0, 0.6, minD);
  float noise = fbm(p * uNoiseScale * 2.0, uOctaves) * gate * 0.3;

  return max(0.0, (noise + spike1 + spike2) * uIntensity);
}

// --- Electron field: thin spherical shell at radius 2, noise only on the shell ---
float densityElectron(vec3 p) {
  float d = length(p - uNucleus1);

  // Thin spherical shell (1s orbital)
  float shellRadius = 2.0 + 0.3 * sin(uTime * 0.3 + uPhaseParams.z);
  float shellThickness = 0.5;
  float shellDist = abs(d - shellRadius);
  float shellDensity = exp(-shellDist * shellDist * 6.0);

  // Noise only on the shell surface
  float noiseGate = exp(-shellDist * shellDist * 4.0);
  float noise = fbm(p * uNoiseScale * 0.5, uOctaves) * noiseGate * 0.3;

  // Angular modulation (px orbital shape — lobes along x-axis)
  vec3 dir = normalize(p - uNucleus1);
  float angularMod = 0.5 + 0.5 * abs(dir.x);
  shellDensity *= angularMod;

  return max(0.0, (shellDensity * 2.5 + noise) * uIntensity);
}

// --- Gluon field: thin tubes along nuclear axis ---
float densityGluon(vec3 p) {
  vec3 seg = uNucleus2 - uNucleus1;
  float segLen = length(seg);
  if (segLen < 0.01) {
    // Single nucleus: show small spherical web
    float d = length(p - uNucleus1);
    float web = exp(-d * d * 10.0) * 0.5 + abs(sin(d * 8.0 + uTime * 3.0)) * exp(-d * d * 5.0);
    return max(0.0, web * uIntensity);
  }

  vec3 segDir = seg / segLen;
  vec3 pRel = p - uNucleus1;
  float t = clamp(dot(pRel, segDir), 0.0, segLen);
  vec3 closest = uNucleus1 + t * segDir;
  float distToSegment = length(p - closest);

  float tubeRadius = 0.15 + 0.08 * sin(uTime * 5.0 + t * 3.0);
  float tube = exp(-distToSegment * distToSegment / (tubeRadius * tubeRadius));
  return max(0.0, tube * 3.0 * uIntensity);
}

// --- Photon field: structured spherical coordinate grid ---
float densityPhoton(vec3 p) {
  float d = length(p - uNucleus1);
  if (d < 0.5) return 0.0; // no grid inside nucleus

  // Concentric radial shells
  float radial = abs(sin(d * 3.0 - uTime * 1.5));
  float radialGrid = exp(-radial * radial * 20.0);

  // Angular grid lines
  vec3 dir = normalize(p - uNucleus1);
  float theta = acos(clamp(dir.y, -1.0, 1.0));
  float phi = atan(dir.z, dir.x);

  float thetaGrid = abs(sin(theta * 10.0 + uTime * 0.3));
  float phiGrid = abs(sin(phi * 8.0 - uTime * 0.4));
  float angularGrid = exp(-thetaGrid * phiGrid * 10.0) * 0.6;

  // Falloff with distance
  float falloff = exp(-d * 0.25);

  return max(0.0, (radialGrid + angularGrid) * falloff * 2.0 * uIntensity);
}

float getDensity(vec3 p) {
  switch (uMode) {
    case MODE_QUARK:    return densityQuark(p);
    case MODE_ELECTRON: return densityElectron(p);
    case MODE_GLUON:    return densityGluon(p);
    case MODE_PHOTON:   return densityPhoton(p);
    default:            return densityQuark(p);
  }
}

void main() {
  vec3 rayOrigin = vPosition;
  vec3 viewDir = normalize(cameraPosition - rayOrigin);

  float totalDist = 0.0;
  vec4 accumulated = vec4(0.0);
  float maxDist = length(cameraPosition - rayOrigin) + 2.0;
  float stepSize = 0.12;

  for (int i = 0; i < 100; i++) {
    if (totalDist > maxDist) break;
    vec3 p = rayOrigin + viewDir * totalDist;

    if (uClipPlane.w != 0.0) {
      float clipDist = dot(p, uClipPlane.xyz) - uClipPlane.w;
      if (clipDist > 0.0) break;
    }

    float density = getDensity(p);
    if (density < 0.005) {
      totalDist += stepSize * 2.0;
      continue;
    }

    vec3 sampleColor = uColor * density;

    // Mode-specific enhancements
    if (uMode == MODE_QUARK) {
      float d1 = length(p - uNucleus1);
      float d2 = length(p - uNucleus2);
      float hotspot = exp(-min(d1, d2) * min(d1, d2) * 30.0);
      sampleColor += vec3(1.0, 0.9, 0.6) * hotspot * 3.0;
    } else if (uMode == MODE_ELECTRON) {
      float shellDist = abs(length(p - uNucleus1) - 2.0);
      float glow = exp(-shellDist * shellDist * 4.0);
      sampleColor += vec3(0.3, 0.7, 1.0) * glow * uIntensity;
    }

    if (uClipPlane.w != 0.0) {
      float clipDist = dot(p, uClipPlane.xyz) - uClipPlane.w;
      float edgeGlow = exp(-abs(clipDist) * 20.0) * 0.3;
      sampleColor += vec3(0.5, 0.8, 1.0) * edgeGlow;
    }

    float alpha = density * stepSize;
    accumulated.rgb += (1.0 - accumulated.a) * sampleColor * alpha;
    accumulated.a += (1.0 - accumulated.a) * alpha;
    if (accumulated.a > 0.95) break;

    totalDist += stepSize;
  }

  gl_FragColor = vec4(accumulated.rgb, accumulated.a);
}
