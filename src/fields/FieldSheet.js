import * as THREE from 'three';
import { Field } from './Field.js';

/**
 * FieldSheet — A 2D grid plane that deforms in 3D based on quantum field interactions.
 * Like a spacetime curvature visualization: each field is a sheet that bends/warps
 * at the nucleus position.
 */
export class FieldSheet extends Field {
  constructor(name, color, mode, params = {}) {
    super(name, color, params);
    this.mode = mode; // 1=quark, 2=electron, 3=gluon, 4=photon

    const size = params.size || 12;
    const segments = params.segments || 80;
    const height = params.height || 0;

    // Sheet in XY plane (laid flat), at specified Z height
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2); // Lay flat in XZ plane

    // Store original vertex positions for deformation math
    this._basePositions = geo.attributes.position.array.slice();

    this.uniforms = {
      uTime: { value: 0 },
      uColor: { value: this.color },
      uIntensity: { value: 1.0 },
      uNucleus1: { value: new THREE.Vector3(0, 0, 0) },
      uNucleus2: { value: new THREE.Vector3(3, 0, 0) },
      uMode: { value: mode },
      uPhaseParams: { value: new THREE.Vector4(0, 0, 0, 0) },
      uSheetHeight: { value: height },
    };

    const vertexShader = `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform vec3 uNucleus1;
      uniform vec3 uNucleus2;
      uniform int uMode;
      uniform vec4 uPhaseParams;
      uniform float uSheetHeight;

      varying float vDeformation;
      varying vec3 vColor;

      // --- Deformation functions ---

      float spikeDeformation(vec3 pos, vec3 center) {
        float d = length(pos.xz - center.xz);
        return exp(-d * d * 8.0) * 2.0 * uIntensity;
      }

      float wellDeformation(vec3 pos, vec3 center) {
        float d = length(pos.xz - center.xz);
        // Deep well at center + ring at radius
        float well = -exp(-d * d * 1.5) * 3.0 * uIntensity;
        float ring = exp(-pow(d - 2.0, 2.0) * 4.0) * 1.0 * uIntensity;
        return well + ring;
      }

      float bridgeDeformation(vec3 pos) {
        float d1 = length(pos.xz - uNucleus1.xz);
        float d2 = length(pos.xz - uNucleus2.xz);
        float minD = min(d1, d2);
        // Ridge between nuclei
        vec3 mid = (uNucleus1 + uNucleus2) * 0.5;
        float dMid = length(pos.xz - mid.xz);
        float bridge = exp(-dMid * dMid * 2.0) * 1.5 * uIntensity;
        float spikes = exp(-minD * minD * 6.0) * 1.0 * uIntensity;
        return bridge + spikes;
      }

      float rippleDeformation(vec3 pos, vec3 center) {
        float d = length(pos.xz - center.xz);
        float ripple = sin(d * 4.0 - uTime * 2.0) * exp(-d * 0.3) * 0.5 * uIntensity;
        return ripple;
      }

      float getDeformation(vec3 pos) {
        if (uMode == 1) return spikeDeformation(pos, uNucleus1) + spikeDeformation(pos, uNucleus2);
        if (uMode == 2) return wellDeformation(pos, uNucleus1);
        if (uMode == 3) return bridgeDeformation(pos);
        if (uMode == 4) return rippleDeformation(pos, uNucleus1) + rippleDeformation(pos, uNucleus2);
        return 0.0;
      }

      void main() {
        vec3 pos = position;
        float deform = getDeformation(pos);
        pos.y += deform;

        vDeformation = deform;
        vColor = uColor;

        // Color intensity based on deformation
        float intensity = 0.3 + abs(deform) * 0.3;
        vColor *= intensity;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `;

    const fragmentShader = `
      uniform vec3 uColor;
      uniform float uIntensity;

      varying float vDeformation;
      varying vec3 vColor;

      void main() {
        // Base color from deformation
        vec3 color = vColor;

        // Glow where deformation is high
        float glow = abs(vDeformation) * 0.3;
        color += vec3(1.0) * glow;

        // Transparency based on deformation
        float alpha = 0.4 + abs(vDeformation) * 0.2;
        alpha = clamp(alpha, 0.0, 0.9);

        gl_FragColor = vec4(color, alpha);
      }
    `;

    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this._mesh = new THREE.Mesh(geo, mat);
  }

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
  }

  setSheetHeight(h) {
    this.uniforms.uSheetHeight.value = h;
  }
}
