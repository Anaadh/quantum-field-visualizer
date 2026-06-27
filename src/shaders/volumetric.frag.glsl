// Volumetric Raymarching Fragment Shader for Quantum Field Visualization

// --- Uniforms ---
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

// --- Varyings from vertex shader ---
varying vec2 vUv;
varying vec3 vPosition;
varying vec3 vNormal;

// --- Constants ---
#define MAX_STEPS       64
#define MAX_DIST        12.0

// --- Simple procedural density: glowing sphere centered at nucleus ---
float getDensity(vec3 p) {
  vec3 center = uNucleus1;
  float d = length(p - center);

  // Soft sphere: peak at center, fall off with distance
  float sphere = exp(-d * d * 0.5);

  // Add a shell at radius 2.0 for orbital effect
  float shellDist = abs(d - 2.0);
  float shell = exp(-shellDist * shellDist * 2.0) * 0.5;

  float density = (sphere + shell) * uIntensity;
  return max(0.0, density);
}

// --- Main fragment entry point ---
void main() {
  // Ray setup
  vec3 rayOrigin = vPosition;
  vec3 viewDir = normalize(cameraPosition - rayOrigin);

  float stepSize = 0.1;
  float totalDist = 0.0;
  vec4 accumulated = vec4(0.0);

  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 p = rayOrigin + viewDir * totalDist;

    if (totalDist > MAX_DIST) break;

    float density = getDensity(p);
    if (density < 0.005) {
      totalDist += stepSize * 2.0;
      continue;
    }

    vec3 sampleColor = uColor * density * 2.0;

    float alpha = density * stepSize;
    accumulated.rgb += (1.0 - accumulated.a) * sampleColor * alpha;
    accumulated.a += (1.0 - accumulated.a) * alpha;

    if (accumulated.a > 0.95) break;

    totalDist += stepSize;
  }

  gl_FragColor = vec4(accumulated.rgb, accumulated.a);
}
