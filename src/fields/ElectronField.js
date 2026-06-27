import { VolumeField } from '../VolumeField.js';

export class ElectronField extends VolumeField {
  constructor() {
    super('Electron', 0x3388ff, 2, {
      scale: 1.5,
      octaves: 3,
    });
  }
}
