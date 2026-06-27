// Volumetric Raymarching Fragment Shader for Quantum Field Visualization
// Performs front-to-back raymarching through a noise-based density field.
// Supports 5 visualization modes: basic noise, quark spikes,
// electron orbitals, gluon tubes, and photon grids.

#include noise3d.glsl

// --- Uniforms ---
uniform float uTime;
uniform vec3  uColor;
uniform float uIntensity;
uniform float uNoiseScale;
uniform int   uOctaves;
uniform vec4  uClipPlane;
uniform vec4  uPhaseParams;     // (densityMod, center1_x, temporalPhase, reserved)
uniform vec3  uNucleus1;
uniform vec3  uNucleus2;
uniform int   uMode;
uniform vec2  uResolution;

// --- Varyings ---
varying vec2 vUv;
varying vec3 vPosition;
varying vec3 vNormal;

// --- Constants ---
#define MODE_BASIC      0
#define MODE_QUARK      1
#define MODE_ELECTRON   2
#define MODE_GLUON      3
#define MODE_PHOTON     4

// --- Density Functions ---

float densityBasic(vec3 p) {
  float noise = fbm(p * uNoiseScale, uOctaves);
  return max(0.0, noise * 0.5 + 0.5) * uIntensity;
}

float densityQuark(vec3 p) {
  float noise = fbm(p * uNoiseScale * 1.5, min(uOctaves + 2, 8));
  // Sharp localized spikes at nucleus positions
  float d1 = length(p - uNucleus1);
  float spike1 = exp(-d1 * d1 * 8.0) * 3.0;
  float d2 = length(p - uNucleus2);
  float spike2 = exp(-d2 * d2 * 8.0) * 3.0;
  float density = (noise * 0.3 + 0.5) * uIntensity + spike1 + spike2;
  return max(0.0, density);
}

float densityElectron(vec3 p) {
  float noise = fbm(p * uNoiseScale * 0.6, max(uOctaves - 1, 2));
  float dN1 = length(p - uNucleus1);
  // Spherical shell (1s orbital)
  float shellRadius = 2.0 + 0.5 * sin(uTime * 0.3 + uPhaseParams.z);
  float shellThickness = 0.8;
  float shellDist = abs(dN1 - shellRadius);
  float shellDensity = exp(-shellDist * shellDist / (shellThickness * shellThickness));
  // Angular modulation for px orbital shape
  vec3 dir = normalize(p - uNucleus1);
  float angularMod = 0.5 + 0.5 * dir.x;
  shellDensity *= angularMod;
  float density = (noise * 0.2 + 0.3) * uIntensity + shellDensity * 1.5 * uIntensity;
  return max(0.0, density);
}

float densityGluon(vec3 p) {
  // Thin tube along the line between nuclei
  vec3 seg = uNucleus2 - uNucleus1;
  float segLen = length(seg);
  vec3 segDir = seg / max(segLen, 0.001);
  vec3 pRel = p - uNucleus1;
  float t = clamp(dot(pRel, segDir), 0.0, segLen);
  vec3 closest = uNucleus1 + t * segDir;
  float distToSegment = length(p - closest);
  float tubeRadius = 0.3 + 0.1 * sin(uTime * 2.0 + p.z * 0.5);
  float tube = exp(-distToSegment * distToSegment / (tubeRadius * tubeRadius));
  float turb = snoise(p * 3.0 + uTime) * 0.2;
  float density = (tube + turb) * uIntensity;
  return max(0.0, density);
}

float densityPhoton(vec3 p) {
  float d1 = length(p - uNucleus1);
  // Radial grid: concentric spherical shells
  float radialGrid = abs(sin(d1 * 3.0 - uTime * 2.0)) * 0.5;
  radialGrid = pow(1.0 - radialGrid, 8.0);
  // Angular grid: lines along spherical coordinate axes
  vec3 dir = normalize(p - uNucleus1);
  float theta = acos(dir.y);
  float phi = atan(dir.z, dir.x);
  float thetaGrid = abs(sin(theta * 12.0 + uTime * 0.5));
  float phiGrid = abs(sin(phi * 8.0 - uTime * 0.7));
  float angularGrid = (1.0 - thetaGrid * phiGrid);
  float gridDensity = radialGrid + angularGrid * 0.5;
  float falloff = exp(-d1 * 0.3);
  return gridDensity * falloff * 2.0 * uIntensity;
}

float getDensity(vec3 p) {
  switch (uMode) {
    case MODE_QUARK:    return densityQuark(p);
    case MODE_ELECTRON: return densityElectron(p);
    case MODE_GLUON:    return densityGluon(p);
    case MODE_PHOTON:   return densityPhoton(p);
    default:            return densityBasic(p);
  }
}

// --- Main ---
void main() {
  vec3 rayOrigin = vPosition;
  vec3 viewDir = normalize(cameraPosition - rayOrigin);

  float totalDist = 0.0;
  vec4 accumulated = vec4(0.0);
  float maxDist = length(cameraPosition - rayOrigin) + 2.0;
  float stepSize = 0.12;

  for (int i = 0; i < 100; i++) {
    vec3 p = rayOrigin + viewDir * totalDist;
    if (totalDist > maxDist) break;

    // Clip plane
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

    // Mode-specific color modulation
    if (uMode == MODE_QUARK) {
      float d1 = length(p - uNucleus1);
      float d2 = length(p - uNucleus2);
      float hotspot = exp(-min(d1, d2) * min(d1, d2) * 12.0);
      sampleColor += vec3(1.0, 0.8, 0.4) * hotspot * 2.0;
    } else if (uMode == MODE_ELECTRON) {
      float dN1 = length(p - uNucleus1);
      float shellDist = abs(dN1 - 2.0);
      float shell = exp(-shellDist * shellDist * 2.0);
      sampleColor += vec3(0.2, 0.6, 1.0) * shell * uIntensity;
    } else if (uMode == MODE_GLUON) {
      sampleColor *= 1.5;
    } else if (uMode == MODE_PHOTON) {
      sampleColor += vec3(1.0, 0.6, 0.2) * density * 0.5;
    }

    // Clip plane edge glow
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
