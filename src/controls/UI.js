import * as THREE from 'three';
import GUI from 'lil-gui';

export class UI {
  constructor(sceneManager, simulationManager, fields) {
    this.gui = new GUI({ title: 'Quantum Fields', width: 280 });
    this.sim = simulationManager;
    this.fields = fields;

    const state = {
      'Up Quark': true,
      'Down Quark': true,
      'Electron': true,
      'Gluon': true,
      'Photon': true,
      'Field Space': true,
      'Playback Speed': 1.0,
      'Phase': 'Vacuum',
      'Reset': () => this._reset(),
      'Clip Plane': false,
      'Clip Axis': 'X',
      'Clip Position': 0,
      'Bloom Intensity': 0.5,
      'Field Offset': 1.0,
    };

    // Layer toggles
    const layers = this.gui.addFolder('Layers');
    layers.add(state, 'Up Quark').name('Up Quark').onChange((v) => {
      this.fields.upQuark.visible = v;
    });
    layers.add(state, 'Down Quark').name('Down Quark').onChange((v) => {
      this.fields.downQuark.visible = v;
    });
    layers.add(state, 'Electron').name('Electron').onChange((v) => {
      this.fields.electron.visible = v;
    });
    layers.add(state, 'Gluon').name('Gluon').onChange((v) => {
      this.fields.gluon.visible = v;
    });
    layers.add(state, 'Photon').name('Photon').onChange((v) => {
      this.fields.photon.visible = v;
    });
    layers.add(state, 'Field Space').name('Field Space').onChange((v) => {
      this.fields.fieldSpace.visible = v;
    });
    layers.open();

    // Simulation controls
    const sim = this.gui.addFolder('Simulation');
    sim.add(state, 'Playback Speed', 0, 3, 0.1).name('Speed').onChange((v) => {
      this.sim.setSpeed(v);
    });
    sim.add(state, 'Field Offset', 0, 1.5, 0.05).name('Field Offset').onChange((v) => {
      Object.values(this.fields).forEach((f) => {
        if (f._uniforms && f._uniforms.uHeightOffset) {
          f._uniforms.uHeightOffset.value = v;
        }
      });
    });
    this._phaseDisplay = sim.add(state, 'Phase').name('Phase').disable();
    sim.add(state, 'Reset').name('⟳ Reset');
    sim.open();

    // Cross-section controls
    const clip = this.gui.addFolder('Cross-Section');
    const clipToggle = clip.add(state, 'Clip Plane').name('Enabled').onChange((v) => {
      this._updateClip();
    });
    clip.add(state, 'Clip Axis', ['X', 'Y', 'Z']).name('Axis').onChange(() => {
      this._updateClip();
    });
    const clipPos = clip.add(state, 'Clip Position', -5, 5, 0.1).name('Position').onChange(() => {
      this._updateClip();
    });
    clip.open();

    this.state = state;
    this._clipPos = clipPos;
  }

  _updateClip() {
    const enabled = this.state['Clip Plane'];
    const axis = this.state['Clip Axis'];
    const pos = this.state['Clip Position'];

    const normal = new THREE.Vector3(
      axis === 'X' ? 1 : 0,
      axis === 'Y' ? 1 : 0,
      axis === 'Z' ? 1 : 0
    );

    Object.values(this.fields).forEach((field) => {
      if (field.setClipPlane) {
        if (enabled) {
          field.setClipPlane(normal, pos);
        } else {
          field.setClipPlane(null, 0);
        }
      }
    });
  }

  _reset() {
    this.sim.reset();
    this.state['Phase'] = 'Vacuum';
    this.state['Playback Speed'] = 1.0;
  }

  updateDisplay(phaseName) {
    const displayName = phaseName.charAt(0).toUpperCase() + phaseName.slice(1);
    this.state['Phase'] = displayName;
    if (this._phaseDisplay) {
      this._phaseDisplay.setValue(displayName);
    }
  }
}
