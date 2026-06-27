import * as THREE from 'three';
import { Field } from './fields/Field.js';
import volumetricVert from './shaders/volumetric.vert.glsl';
import volumetricFrag from './shaders/volumetric.frag.glsl';

/**
 * VolumeField — A Three.js Field subclass that renders a volumetric
 * quantum field visualization via GLSL raymarching.
 *
 * Supports multiple visualization modes:
 *   0 = basic noise
 *   1 = quark spikes
 *   2 = electron orbital shell
 *   3 = gluon tubes
 *   4 = photon grid
 */
export class VolumeField extends Field {
  /**
   * @param {string} name  Human-readable field identifier
   * @param {THREE.Color|string|number} color  Base color of the field
   * @param {number} mode  Visualization mode (0-4)
   * @param {object} params  Optional parameters:
   *   - scale:   noise frequency scale (default 2.0)
   *   - octaves: FBM octave count (default 4)
   */
  constructor(name, color, mode, params = {}) {
    super(name, color, params);

    this.mode = mode; // 0=basic, 1=quark, 2=electron, 3=gluon, 4=photon

    // Proxy geometry — a large sphere that encloses the volume to render.
    // Sphere has no silhouette gaps from any angle (unlike a box with BackSide).
    const geo = new THREE.SphereGeometry(6, 32, 24);

    this.uniforms = {
      uTime:        { value: 0 },
      uColor:       { value: this.color },
      uIntensity:   { value: 1.0 },
      uNoiseScale:  { value: params.scale || 2.0 },
      uOctaves:     { value: params.octaves || 4 },
      uClipPlane:   { value: new THREE.Vector4(0, 0, 0, 0) },
      uPhaseParams: { value: new THREE.Vector4(0, 0, 0, 0) },
      uNucleus1:    { value: new THREE.Vector3(0, 0, 0) },
      uNucleus2:    { value: new THREE.Vector3(3, 0, 0) },
      uMode:        { value: mode },
      uResolution:  { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms:       this.uniforms,
      vertexShader:   volumetricVert,
      fragmentShader: volumetricFrag,
      transparent:    true,
      blending:       THREE.AdditiveBlending,
      depthWrite:     false,
      depthTest:      true,
      side:           THREE.BackSide,
    });

    this._mesh = new THREE.Mesh(geo, mat);
  }

  /**
   * Update uniforms each frame.
   *
   * @param {number} time  Current scene time in seconds
   * @param {object} phaseData  Optional phase-specific data:
   *   - intensity:    density multiplier (0-1)
   *   - nuclei:       array of { position: THREE.Vector3 } objects
   *   - phaseParams:  THREE.Vector4 for custom phase parameters
   */
  update(time, phaseData) {
    this.uniforms.uTime.value = time;

    if (phaseData) {
      if (phaseData.intensity !== undefined) {
        this.uniforms.uIntensity.value = phaseData.intensity * this._intensity;
      }

      if (phaseData.nuclei && phaseData.nuclei.length >= 1) {
        this.uniforms.uNucleus1.value.copy(phaseData.nuclei[0].position);
      }

      if (phaseData.nuclei && phaseData.nuclei.length >= 2) {
        this.uniforms.uNucleus2.value.copy(phaseData.nuclei[1].position);
      }

      if (phaseData.phaseParams) {
        this.uniforms.uPhaseParams.value.copy(phaseData.phaseParams);
      }
    }

    // Update resolution (handles window resize)
    if (this._mesh.material.uniforms.uResolution) {
      this._mesh.material.uniforms.uResolution.value.set(
        window.innerWidth,
        window.innerHeight
      );
    }
  }

  /**
   * Set an optional clip plane.
   *
   * @param {THREE.Vector3|null} normal  Plane normal (null disables clipping)
   * @param {number} distance  Plane distance from origin along normal
   */
  setClipPlane(normal, distance) {
    if (normal) {
      this.uniforms.uClipPlane.value.set(normal.x, normal.y, normal.z, distance);
    } else {
      this.uniforms.uClipPlane.value.set(0, 0, 0, 0);
    }
  }

  /**
   * Set the noise frequency scale.
   *
   * @param {number} scale  Noise frequency multiplier
   */
  setScale(scale) {
    this.uniforms.uNoiseScale.value = scale;
  }

  /**
   * Set the number of FBM octaves. Recreates the material's shader
   * since branching on uniforms is expensive in GLSL.
   *
   * @param {number} octaves  Number of FBM octaves (1-8)
   */
  setOctaves(octaves) {
    this.uniforms.uOctaves.value = Math.max(1, Math.min(8, octaves));
  }

  /**
   * Switch visualization mode at runtime by updating the uniform.
   *
   * @param {number} mode  0=basic, 1=quark, 2=electron, 3=gluon, 4=photon
   */
  setMode(mode) {
    this.mode = mode;
    this.uniforms.uMode.value = mode;
  }
}
