// Volumetric Raymarching Fragment Shader for Quantum Field Visualization

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

void main() {
  // Simple raymarch: march from surface toward camera
  vec3 rayOrigin = vPosition;
  vec3 viewDir = normalize(cameraPosition - rayOrigin);

  float stepSize = 0.2;
  float totalDist = 0.0;
  vec4 accumulated = vec4(0.0);
  float maxDist = length(cameraPosition - rayOrigin) + 2.0;

  for (int i = 0; i < 32; i++) {
    vec3 p = rayOrigin + viewDir * totalDist;
    if (totalDist > maxDist) break;

    // Simple sphere at origin
    float d = length(p);
    float density = exp(-d * d * 0.3) * uIntensity * 2.0;

    if (density > 0.01) {
      vec3 sampleColor = uColor * density;
      float alpha = density * stepSize;
      accumulated.rgb += (1.0 - accumulated.a) * sampleColor * alpha;
      accumulated.a += (1.0 - accumulated.a) * alpha;
      if (accumulated.a > 0.95) break;
    }
    totalDist += stepSize;
  }

  gl_FragColor = vec4(accumulated.rgb, accumulated.a);
}
