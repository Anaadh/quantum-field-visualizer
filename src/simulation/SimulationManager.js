import { Phase1_Vacuum } from './Phase1_Vacuum.js';
import { Phase2_Hydrogen } from './Phase2_Hydrogen.js';
import { Phase3_Molecule } from './Phase3_Molecule.js';

export class SimulationManager {
  constructor(fields) {
    this.fields = fields;        // { upQuark, downQuark, electron, gluon, photon }
    this.phase = 'vacuum';       // 'vacuum' | 'hydrogen' | 'molecule'
    this.speed = 1.0;            // playback speed multiplier (0-3)
    this.elapsed = 0;            // total simulated time in seconds
    this.phaseElapsed = 0;       // time within current phase
    this.progress = 0;           // 0-1 within current phase
    this.phases = {
      vacuum: new Phase1_Vacuum(fields),
      hydrogen: new Phase2_Hydrogen(fields),
      molecule: new Phase3_Molecule(fields),
    };
    this.onPhaseChange = null;   // callback(phaseName)
  }

  update(deltaTime) {
    const dt = deltaTime * this.speed;
    this.elapsed += dt;
    this.phaseElapsed += dt;

    // Determine current phase
    let newPhase = this.phase;
    if (this.elapsed >= 25) newPhase = 'molecule';
    else if (this.elapsed >= 10) newPhase = 'hydrogen';
    else newPhase = 'vacuum';

    if (newPhase !== this.phase) {
      this.phase = newPhase;
      this.phaseElapsed = this.elapsed - (this.phase === 'molecule' ? 25 : this.phase === 'hydrogen' ? 10 : 0);
      if (this.onPhaseChange) this.onPhaseChange(this.phase);
    }

    this.progress = this.phaseElapsed / this.getPhaseDuration();

    // Let the current phase handle its timeline
    const phase = this.phases[this.phase];
    phase.update(this.phaseElapsed, this.progress);
  }

  getPhaseDuration() {
    switch (this.phase) {
      case 'vacuum': return 10;
      case 'hydrogen': return 15;
      case 'molecule': return 20;
      default: return 10;
    }
  }

  reset() {
    this.elapsed = 0;
    this.phaseElapsed = 0;
    this.phase = 'vacuum';
    this.progress = 0;
    this.speed = 1.0;
    // Reset all fields
    Object.values(this.fields).forEach(f => { f.intensity = 1.0; f.visible = true; });
  }

  setSpeed(val) {
    this.speed = Math.max(0, Math.min(3, val));
  }
}
