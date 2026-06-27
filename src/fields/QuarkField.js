import { VolumeField } from '../VolumeField.js';

export class QuarkField extends VolumeField {
  constructor(name, color, isUp = true) {
    super(name, color, 1, {
      scale: 3.0,
      octaves: 6,
    });
  }
}

// Convenience constructors
export class UpQuarkField extends QuarkField {
  constructor() {
    super('Up Quark', 0xff3333, true);
  }
}

export class DownQuarkField extends QuarkField {
  constructor() {
    super('Down Quark', 0x33ff33, false);
  }
}
