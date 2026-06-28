import * as THREE from 'three';
import GUI from 'lil-gui';

export class UI {
  constructor(sceneManager, sim, fields) {
    this.gui = new GUI({ title: 'Quantum Fields', width: 300 });
    this.sim = sim;
    this.fields = fields;

    const state = {
      'Up Quark': true,
      'Down Quark': true,
      'Electron': true,
      'Gluon': true,
      'Photon': true,
      'Field Space': true,
      'Scenario': 'Hydrogen Formation',
      'Playback Speed': 1.0,
      'Phase': 'Starting...',
      '⏵ Start / Resume': () => this._startResume(),
      '⟳ Reset': () => this._reset(),
      'Field Offset': 1.0,
      'Clip Plane': false,
      'Clip Axis': 'X',
      'Clip Position': 0,
    };

    // --- Scenario selector ---
    const scenarioFolder = this.gui.addFolder('Scenario');
    const scenarioNames = ['Hydrogen Formation', 'H₂ Molecular Bonding', 'H + Anti-H Annihilation'];
    const scenarioKeys = ['formation', 'bonding', 'annihilation'];
    scenarioFolder.add(state, 'Scenario', scenarioNames).name('Select').onChange((name) => {
      const idx = scenarioNames.indexOf(name);
      const key = scenarioKeys[idx];
      this.sim.setScenario(key);
      this.sim.start();
      this.state['⏵ Start / Resume'] = 'Pause';
      state['⏵ Start / Resume'] = 'Pause';
    });
    scenarioFolder.open();

    // --- Layer toggles ---
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

    // --- Simulation controls ---
    const simCtrl = this.gui.addFolder('Simulation');
    simCtrl.add(state, 'Playback Speed', 0, 3, 0.1).name('Speed').onChange((v) => {
      this.sim.setSpeed(v);
    });
    simCtrl.add(state, 'Field Offset', 0, 1.5, 0.05).name('Field Offset').onChange((v) => {
      Object.values(this.fields).forEach((f) => {
        if (f._uniforms && f._uniforms.uHeightOffset) {
          f._uniforms.uHeightOffset.value = v;
        }
      });
    });
    this._phaseDisplay = simCtrl.add(state, 'Phase').name('Phase').disable();
    simCtrl.add(state, '⏵ Start / Resume').name('⏵ Play');
    simCtrl.add(state, '⟳ Reset').name('⟳ Reset');
    simCtrl.open();

    // --- Cross-section ---
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

    // Initial display
    this.updateDisplay(sim.phase || 'Ready');
  }

  _startResume() {
    if (!this.sim.active) {
      this.sim.start();
      this.state['⏵ Start / Resume'] = 'Pause';
    } else {
      this.sim.setSpeed(this.sim.speed > 0 ? 0 : 1.0);
      this.state['⏵ Start / Resume'] = this.sim.speed > 0 ? 'Pause' : '▶ Resume';
    }
  }

  _reset() {
    this.sim.reset();
    this.state['Playback Speed'] = 1.0;
    this.state['Phase'] = 'Ready';
    this.state['⏵ Start / Resume'] = '▶ Start';
    if (this._phaseDisplay) this._phaseDisplay.setValue('Ready');
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

  updateDisplay(phaseName) {
    this.state['Phase'] = phaseName;
    if (this._phaseDisplay) {
      this._phaseDisplay.setValue(phaseName);
    }
  }
}
