// Volumetric Raymarching Fragment Shader for Quantum Field Visualization
// Performs front-to-back raymarching through a noise-based density field.
// Supports multiple visualization modes: basic noise, quark spikes,
// electron orbitals, gluon tubes, and photon grids.

#include noise3d.glsl

// --- Uniforms ---

uniform float uTime;
uniform vec3  uColor;
uniform float uIntensity;
uniform float uNoiseScale;
uniform int   uOctaves;
uniform vec4  uClipPlane;       // (nx, ny, nz, d) — if d != 0, clipping is active
uniform vec4  uPhaseParams;     // (densityMod, center1_x, temporalPhase, reserved)
uniform vec3  uNucleus1;
uniform vec3  uNucleus2;
uniform int   uMode;            // 0=basic noise, 1=quark spike, 2=electron orbital,
                                // 3=gluon, 4=photon grid
uniform vec2  uResolution;

// --- Varyings from vertex shader ---

varying vec2 vUv;
varying vec3 vPosition;
varying vec3 vNormal;

// --- Constants ---

#define MODE_BASIC      0
#define MODE_QUARK      1
#define MODE_ELECTRON   2
#define MODE_GLUON      3
#define MODE_PHOTON     4

#define MAX_STEPS       128
#define MAX_DIST        12.0
#define SURFACE_DIST    0.01
#define EPSILON         0.001

// --- Raymarching Density Functions per Mode ---

float densityBasic(vec3 p) {
  float noise = fbm(p * uNoiseScale, uOctaves);
  return max(0.0, noise * 0.5 + 0.5) * uIntensity;
}

float densityQuark(vec3 p) {
  // High-frequency noise with sharp localized spikes at nucleus positions
  float noise = fbm(p * uNoiseScale * 1.5, min(uOctaves + 2, 8));

  // Spikes at nucleus 1
  float d1 = length(p - uNucleus1);
  float spike1 = exp(-d1 * d1 * 8.0) * 3.0;

  // Spikes at nucleus 2
  float d2 = length(p - uNucleus2);
  float spike2 = exp(-d2 * d2 * 8.0) * 3.0;

  float density = (noise * 0.3 + 0.5) * uIntensity + spike1 + spike2;
  return max(0.0, density);
}

float densityElectron(vec3 p) {
  // Smooth low-frequency noise with spherical shell (donut cross-section)
  float noise = fbm(p * uNoiseScale * 0.6, max(uOctaves - 1, 2));

  float dN1 = length(p - uNucleus1);

  // Shell radius and thickness
  float shellRadius = 2.0 + 0.5 * sin(uTime * 0.3 + uPhaseParams.z);
  float shellThickness = 0.8;

  // Radial distance from shell peak
  float shellDist = abs(dN1 - shellRadius);
  float shellDensity = exp(-shellDist * shellDist * (1.0 / (shellThickness * shellThickness)));

  // Angular modulation for orbital shape (px orbital)
  vec3 dir = normalize(p - uNucleus1);
  float angularMod = 0.5 + 0.5 * dir.x;
  shellDensity *= angularMod;

  float density = (noise * 0.2 + 0.3) * uIntensity + shellDensity * 1.5 * uIntensity;
  return max(0.0, density);
}

float densityGluon(vec3 p) {
  // Line-like density along curves between quark positions
  float d1 = length(p - uNucleus1);
  float d2 = length(p - uNucleus2);

  // Distance to the line segment between the two nuclei
  vec3 seg = uNucleus2 - uNucleus1;
  float segLen = length(seg);
  vec3 segDir = seg / segLen;

  vec3 pRel = p - uNucleus1;
  float t = clamp(dot(pRel, segDir), 0.0, segLen);
  vec3 closest = uNucleus1 + t * segDir;

  float distToSegment = length(p - closest);

  // Thin tube
  float tubeRadius = 0.3 + 0.1 * sin(uTime * 2.0 + p.z * 0.5);
  float tube = exp(-distToSegment * distToSegment * (1.0 / (tubeRadius * tubeRadius)));

  // Slight turbulence along the tube
  float turb = snoise(p * 3.0 + uTime) * 0.2;

  float density = (tube + turb) * uIntensity;
  return max(0.0, density);
}

float densityPhoton(vec3 p) {
  // Grid of glowing lines radiating from nucleus
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

  // Combine: bright along both radial and angular grid lines
  float gridDensity = radialGrid + angularGrid * 0.5;

  // Falloff with distance from nucleus
  float falloff = exp(-d1 * 0.3);

  float density = gridDensity * falloff * 2.0 * uIntensity;
  return max(0.0, density);
}

// --- Get density from the current mode ---

float getDensity(vec3 p) {
  switch (uMode) {
    case MODE_QUARK:    return densityQuark(p);
    case MODE_ELECTRON: return densityElectron(p);
    case MODE_GLUON:    return densityGluon(p);
    case MODE_PHOTON:   return densityPhoton(p);
    default:            return densityBasic(p);
  }
}

// --- Apply clip plane ---

vec4 applyClip(vec3 p, vec4 color) {
  if (uClipPlane.w == 0.0) return color;

  float clipDist = dot(p, uClipPlane.xyz) - uClipPlane.w;
  if (clipDist > 0.0) {
    // Behind clip plane — discard
    discard;
    return vec4(0.0);
  }

  // Glow at clip boundary
  float glow = exp(-abs(clipDist) * 10.0) * 0.5;
  color.rgb += glow * uColor;
  return color;
}

// --- Main fragment entry point ---

void main() {
  // Ray setup
  vec3 rayOrigin = vPosition;
  vec3 viewDir = normalize(rayOrigin - cameraPosition);

  // Step size: adaptive base
  float stepSize = 0.08;
  float totalDist = 0.0;
  vec4 accumulated = vec4(0.0);

  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 p = rayOrigin + viewDir * totalDist;

    // Check bounds
    if (totalDist > MAX_DIST) break;

    // Clip plane
    if (uClipPlane.w != 0.0) {
      float clipDist = dot(p, uClipPlane.xyz) - uClipPlane.w;
      if (clipDist > 0.0) break;
    }

    // Sample density
    float density = getDensity(p);
    if (density < 0.01) {
      // Adaptive step: larger steps in empty areas
      totalDist += stepSize * 2.0;
      continue;
    }

    // Color from density and uniforms
    vec3 sampleColor = uColor * density;

    // Mode-specific color modulation
    if (uMode == MODE_QUARK) {
      // Spikes get white-hot centers
      float d1 = length(p - uNucleus1);
      float d2 = length(p - uNucleus2);
      float hotspot = exp(-min(d1, d2) * min(d1, d2) * 12.0);
      sampleColor += vec3(1.0, 0.8, 0.4) * hotspot * 2.0;
    } else if (uMode == MODE_ELECTRON) {
      // Orbital shells get a slight cyan tint
      float dN1 = length(p - uNucleus1);
      float shellDist = abs(dN1 - 2.0);
      float shell = exp(-shellDist * shellDist * 2.0);
      sampleColor += vec3(0.2, 0.6, 1.0) * shell * uIntensity;
    } else if (uMode == MODE_GLUON) {
      // Gluon tubes are intense and bright
      sampleColor *= 1.5;
    } else if (uMode == MODE_PHOTON) {
      // Photon grids have a warm glow
      sampleColor += vec3(1.0, 0.6, 0.2) * density * 0.5;
    }

    // Alpha from density (additive blending uses alpha for compositing)
    float alpha = density * stepSize * 0.8;

    // Front-to-back compositing (Porter-Duff over operator)
    accumulated.rgb += (1.0 - accumulated.a) * sampleColor * alpha;
    accumulated.a += (1.0 - accumulated.a) * alpha;

    // Apply clip plane glow (thin bright edge at clip boundary)
    if (uClipPlane.w != 0.0) {
      float clipDist = dot(p, uClipPlane.xyz) - uClipPlane.w;
      float edgeGlow = exp(-abs(clipDist) * 20.0) * 0.3;
      accumulated.rgb += vec3(0.5, 0.8, 1.0) * edgeGlow * (1.0 - accumulated.a);
    }

    // Early termination
    if (accumulated.a > 0.95) {
      accumulated.a = 1.0;
      break;
    }

    // Adaptive step based on density
    float adaptiveStep = stepSize / max(density, 0.1);
    totalDist += min(adaptiveStep, stepSize * 3.0);
  }

  // Final output — additive blending via alpha compositing
  gl_FragColor = vec4(1.0, 0.0, 0.0, 0.5); // DIAGNOSTIC RED
}
