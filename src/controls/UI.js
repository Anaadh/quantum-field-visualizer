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
      'Anti-Up Quark': false,
      'Anti-Down Quark': false,
      'Positron': false,
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
      this._updateProgress(0);
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
    layers.add(state, 'Anti-Up Quark').name('Anti-Up Quark').onChange((v) => {
      this.fields.antiUpQuark.visible = v;
    });
    layers.add(state, 'Anti-Down Quark').name('Anti-Down Quark').onChange((v) => {
      this.fields.antiDownQuark.visible = v;
    });
    layers.add(state, 'Positron').name('Positron').onChange((v) => {
      this.fields.positron.visible = v;
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

    // --- Progress Bar (DOM overlay) ---
    this._createProgressBar();

    this.state = state;
    this._clipPos = clipPos;

    // Initial display
    this.updateDisplay(sim.phase || 'Ready');
    this._updateProgress(sim.elapsed / Math.max(sim.duration, 1));
  }

  _createProgressBar() {
    // Container fixed at bottom of screen
    const container = document.createElement('div');
    container.id = 'progress-container';
    container.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      width: 400px;
      max-width: 80vw;
      z-index: 10;
      font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      user-select: none;
    `;

    // Label row
    const labelRow = document.createElement('div');
    labelRow.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2px;
      color: rgba(255,255,255,0.35);
      font-size: 10px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    `;
    this._progressLabel = document.createElement('span');
    this._progressLabel.textContent = '0%';
    this._phaseLabel = document.createElement('span');
    this._phaseLabel.textContent = '';
    labelRow.appendChild(this._progressLabel);
    labelRow.appendChild(this._phaseLabel);
    container.appendChild(labelRow);

    // Track
    const track = document.createElement('div');
    track.style.cssText = `
      width: 100%;
      height: 2px;
      background: rgba(255,255,255,0.05);
      border-radius: 1px;
      overflow: hidden;
      box-shadow: inset 0 0 2px rgba(0,0,0,0.5);
    `;

    // Fill
    this._progressFill = document.createElement('div');
    this._progressFill.style.cssText = `
      width: 0%;
      height: 100%;
      background: linear-gradient(90deg, #4488ff, #ff44dd, #ffdd44);
      border-radius: 1px;
      transition: width 0.3s ease;
      box-shadow: 0 0 4px rgba(68,136,255,0.2);
    `;
    track.appendChild(this._progressFill);
    container.appendChild(track);

    document.body.appendChild(container);
    this._progressContainer = container;
  }

  _updateProgress(progress) {
    const pct = Math.round(progress * 100);
    if (this._progressFill) {
      this._progressFill.style.width = Math.min(pct, 100) + '%';
    }
    if (this._progressLabel) {
      this._progressLabel.textContent = pct + '%';
    }
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
    this._updateProgress(0);
    if (this._progressLabel) this._progressLabel.textContent = '0%';
    if (this._phaseLabel) this._phaseLabel.textContent = '';
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
    if (this._phaseLabel) {
      this._phaseLabel.textContent = phaseName;
    }
    // Update progress bar
    this._updateProgress(
      this.sim.active ? this.sim.elapsed / Math.max(this.sim.duration, 1) : 0
    );
  }
}
