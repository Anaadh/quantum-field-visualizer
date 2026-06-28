# Quantum Field Visualizer

A real-time 3D browser visualization of quantum field theory. Six overlapping field sheets demonstrate how vacuum fluctuations organize into a stable Hydrogen atom, then how two atoms bond to form an H₂ molecule — complete with spacetime curvature from the combined stress-energy of all fields.

**Live demo → [quantum.kobakae.com](https://quantum.kobakae.com)**

---

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in a modern browser (Chromium, Firefox, Edge).

## The 6 Field Sheets

| Field | Color | Type | Visual |
|-------|-------|------|--------|
| 🔴 Up Quark | Red | Matter | High-frequency crackling gaussian spikes at nucleus positions |
| 🟢 Down Quark | Green | Matter | High-frequency crackling gaussian spikes at nucleus positions |
| 🔵 Electron | Electric Blue | Matter | Smooth 1s orbital → H₂ molecular orbital (peanut-shaped bond) |
| ⚪ Gluon | Gold/White | Force | Vib rating CatmullRom plasma arcs / flux tube sheet between nuclei |
| 🟣 Photon | Magenta | Force | Coulomb 1/r potential well with geometric grid shimmer |
| 🤍 Field Space | White → warm | Spacetime | Combined stress-energy curvature (GR proxy: all fields' energy summed) |

All sheets use **additive blending** — where they overlap, colors mix dynamically. You can adjust the **Field Offset** slider to stack them all on the same plane (offset=0) or spread them apart.

## 3 Scenarios

Select from the dropdown in the UI. Each scenario auto-plays a full timeline:

### 1. ⚛ Hydrogen Formation _(22s)_
Quantum vacuum → quark confinement cones emerge → gluon flux tube locks the nucleus → Coulomb photon well forms → electron wave collapses into a 1s standing orbital.

### 2. ⚛️ H₂ Molecular Bonding _(30s)_
Two separate hydrogen atoms approach each other → photon fields merge → electron clouds overlap and fuse into a peanut-shaped H₂ bonding molecular orbital.

### 3. 💥 H + Anti-H Annihilation _(25s)_
Hydrogen (matter) and antihydrogen (antimatter) approach → fields begin to cancel on contact → **annihilation burst** of pure energy → expanding photon ring → fades back to vacuum.

Anti-matter fields invert to complementary colors with negative sheet deformation. When matter and anti-matter overlap, destructive interference releases a burst of pure photon energy.

## Controls

| Control | Type | Description |
|---------|------|-------------|
| Scenario Selector | Dropdown | Pick between 3 scenarios (Hydrogen Formation / H₂ Bonding / Annihilation) |
| Layer toggles | Checkboxes | Show/hide any of the 6 fields independently |
| Field Offset | Slider (0–1.5) | Vertical spread between sheets. At 0, all sheets overlap on the same plane |
| Playback Speed | Slider (0–3×) | Slow down to observe gluon oscillations or speed through phases |
| Play / Pause | Button | Start or pause the current scenario |
| Phase | Read-only | Current simulation phase indicator |
| Reset | Button | Restart the simulation |
| Cross-Section | Enabled + Axis + Position | Clip plane slices through the volume |
| Orbit Controls | Mouse drag/scroll | Pan, orbit, and zoom around the scene |

## Architecture

```
src/
├── main.js                  # Entry: scene, fields, simulation, UI
├── SceneManager.js          # Three.js scene/camera/renderer
├── fields/
│   ├── Field.js             # Abstract base class
│   ├── FieldSheet.js        # 2D grid sheet with per-field GLSL deformation
│   ├── GluonField.js        # CatmullRom plasma arc lines (geometry-based)
│   ├── QuarkField.js        # (legacy — unused, kept for reference)
│   ├── ElectronField.js     # (legacy — unused, kept for reference)
│   ├── PhotonField.js       # (legacy — unused, kept for reference)
│   └── VolumeField.js       # (legacy volume renderer — unused)
├── simulation/
│   ├── SimulationManager.js # Scenario state machine (play/pause, scenario select)
│   ├── scenarios/
│   │   ├── HydrogenFormation.js  # Hydrogen atom from vacuum (22s timeline)
│   │   ├── HydrogenBonding.js    # H₂ covalent bond formation (30s timeline)
│   │   └── Annihilation.js       # H + anti-H → pure energy (25s timeline)
├── shaders/
│   └── ...                  # Legacy volumetric shaders
└── controls/
    └── UI.js                # lil-gui panel
```

## Rendering Pipeline

1. **2D grid sheets** — each field is a `PlaneGeometry(14, 14, 180–200, 180–200)` laid flat
2. **Custom vertex shaders** — deformation computed from quantum mechanical formulas (1s wavefunction, H₂ molecular orbital, Coulomb potential, QCD flux tube)
3. **Log-scale amplitude compression** — tall Coulomb spikes and small electron ripples all visible
4. **Per-field noise** — each field gets its own noise personality (hash FBM, Voronoi cells, vortex swirl) so patterns never repeat
5. **Additive blending** — `THREE.AdditiveBlending` + `depthWrite: false` for transparent overlap
6. **Fresnel rim lighting** — deformation edges glow for a volumetric feel

## Technical Details

- **Engine**: Three.js r170
- **Shaders**: Custom GLSL vertex/fragment (no raymarching — pure vertex displacement + deformation gradient normals)
- **Build**: Vite 6
- **UI**: lil-gui
- **Deployment**: Vercel
