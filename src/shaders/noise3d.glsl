// 3D Simplex Noise Library
// Based on Ashima Arts / Stefan Gustavson simplex noise implementation
// License: MIT (original by Stefan Gustavson)
//
// This file is standalone GLSL, no #version, uses #ifndef guards for
// multiple inclusion.

#ifndef NOISE3D_GLSL
#define NOISE3D_GLSL

// --- Simplex Noise Helper Functions ---

vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 mod289(vec4 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x) {
  return mod289(((x * 34.0) + 1.0) * x);
}

vec4 taylorInvSqrt(vec4 r) {
  return 1.79284291400159 - 0.85373472095314 * r;
}

// --- 3D Simplex Noise ---
//
// Returns a value in the range [-1, 1].
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  // First corner
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  // Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  // Permutations
  i = mod289(i);
  vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  // Gradients: 7x7 points over a square, mapped onto an octahedron.
  // The ring size 17*17 = 289 is close to a multiple of 49 (49*6 = 294)
  float n_ = 0.142857142857; // 1/7
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * 7.0 * (1.0 / 49.0)); // mod(p, 7*7)

  vec4 x_ = floor(j * 1.0 / 7.0);
  vec4 y_ = floor(j - 7.0 * x_); // mod(j, N)

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  // Normalise gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  // Mix final noise value
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// --- Fractal Brownian Motion ---
//
// Combines snoise at increasing frequencies with decreasing amplitude.
// lacunarity = frequency multiplier per octave (default ~2.0)
// gain = amplitude multiplier per octave (default ~0.5)
// Returns value in approximately [-1, 1] range (depends on octaves).
float fbm(vec3 p, int octaves) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  float maxValue = 0.0;
  float lacunaria = 2.0;
  float gain = 0.5;

  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    value += amplitude * snoise(p * frequency);
    maxValue += amplitude;
    amplitude *= gain;
    frequency *= lacunaria;
  }

  return value / maxValue;
}

// --- Domain Warping ---
//
// Warps the input position using simplex noise before feeding to fbm.
// Creates organic, flowing shapes (like clouds, smoke, or nebulae).
float domainWarp(vec3 p) {
  vec3 q = vec3(
    snoise(p),
    snoise(p + vec3(1.7, 9.2, -3.1)),
    snoise(p + vec3(-5.4, 2.3, 8.8))
  );

  vec3 r = vec3(
    snoise(p + 4.0 * q + vec3(1.7, 9.2, 0.0)),
    snoise(p + 4.0 * q + vec3(8.3, -2.6, -4.5)),
    snoise(p + 4.0 * q + vec3(-1.2, 6.4, 3.7))
  );

  return fbm(p + 4.0 * r, 4);
}

// --- Spherical Gradient ---
//
// Returns 1.0 at the center, smoothly falls to 0.0 at radius and beyond.
// falloff controls the steepness of the exponential falloff curve.
// Uses smoothstep-like Hermite interpolation for a clean gradient.
float sphericalGradient(vec3 p, vec3 center, float radius, float falloff) {
  float dist = length(p - center);
  float t = dist / radius;

  // Exponential falloff: e^(-falloff * t^2) at center=1, at radius ~ e^(-falloff)
  float expFalloff = exp(-falloff * t * t);

  // Hermite smoothstep falloff as backup for the outer region
  float smoothFalloff = 1.0 - smoothstep(0.0, 1.0, t);

  // Blend: use exponential near center, smoothstep near edge
  float blend = smoothstep(0.0, 0.5, t);
  return mix(expFalloff, smoothFalloff, blend);
}

#endif // NOISE3D_GLSL
