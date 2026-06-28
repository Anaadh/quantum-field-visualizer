import { HydrogenFormation } from './scenarios/HydrogenFormation.js';
import { HydrogenBonding } from './scenarios/HydrogenBonding.js';
import { Annihilation } from './scenarios/Annihilation.js';

export class SimulationManager {
  constructor(fields) {
    this.fields = fields;

    // Available scenarios
    this.scenarioMap = {
      'formation': new HydrogenFormation(fields),
      'bonding': new HydrogenBonding(fields),
      'annihilation': new Annihilation(fields),
    };

    this.scenarioName = 'formation';
    this.scenario = this.scenarioMap[this.scenarioName];
    this.speed = 1.0;
    this.elapsed = 0;
    this.duration = this.scenario.duration;
    this.phase = '';

    // Track if we're in the scenario (not reset/stopped)
    this.active = false;

    this.onPhaseChange = null;
    this.onScenarioChange = null;
  }

  setScenario(name) {
    if (!this.scenarioMap[name]) return;
    this.scenarioName = name;
    this.scenario = this.scenarioMap[name];
    this.duration = this.scenario.duration;
    this.reset();
    if (this.onScenarioChange) this.onScenarioChange(name);
    if (this.onPhaseChange) this.onPhaseChange(this.scenario.getPhaseName(0));
  }

  start() {
    this.active = true;
    this.elapsed = 0;
    this.scenario = this.scenarioMap[this.scenarioName];
    this.duration = this.scenario.duration;
    this.phase = this.scenario.getPhaseName(0);
    if (this.onPhaseChange) this.onPhaseChange(this.phase);
  }

  update(deltaTime) {
    if (!this.active) return;
    const dt = deltaTime * this.speed;
    this.elapsed = Math.min(this.elapsed + dt, this.duration);

    this.scenario.update(this.elapsed, this.elapsed / this.duration);

    const newPhase = this.scenario.getPhaseName(this.elapsed);
    if (newPhase !== this.phase) {
      this.phase = newPhase;
      if (this.onPhaseChange) this.onPhaseChange(newPhase);
    }
  }

  reset() {
    this.active = false;
    this.elapsed = 0;
    this.phase = '';

    // Reset all fields
    Object.values(this.fields).forEach(f => {
      f.intensity = 1.0;
      f.visible = true;
    });
  }

  setSpeed(val) {
    this.speed = Math.max(0, Math.min(3, val));
  }
}
