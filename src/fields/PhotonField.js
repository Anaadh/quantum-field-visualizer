import { VolumeField } from '../VolumeField.js';

export class PhotonField extends VolumeField {
  constructor() {
    super('Photon', 0xff22dd, 4, {
      scale: 2.0,
      octaves: 2,
    });
  }
}
