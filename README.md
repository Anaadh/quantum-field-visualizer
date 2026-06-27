# Quantum Field Visualizer

A real-time 3D browser visualization of quantum field theory. Five overlapping volumetric fields demonstrate how vacuum fluctuations organize into a stable Hydrogen atom, then how two atoms bond to form an H₂ molecule with a shared molecular orbital.

Built with **Three.js**, custom **GLSL raymarching shaders**, and orchestrated by **Hermes Agent** (orchestrator), **Codex CLI** (primary coder), and **Claude Code** (fallback/complex shader debugging).

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173 in a Chromium/Firefox browser.

## The 5 Quantum Fields

| Field | Color | Type | Visual Technique |
|-------|-------|------|------------------|
| 🔴 Up Quark | Red | Matter | High-frequency volumetric noise with localized spikes |
| 🟢 Down Quark | Green | Matter | High-frequency volumetric noise with localized spikes |
| 🔵 Electron | Electric Blue | Matter | Smooth spherical shell with donut cross-section (1s orbital) |
| ⚪ Gluon | Gold/White | Force | 3 animated CatmullRom plasma arcs connecting quarks |
| 🟣 Photon | Magenta | Force | Glowing radial grid with spherical coordinate lines |

All fields use **additive blending** — where they overlap, colors mix dynamically.

## Simulation Phases

| Phase | Duration | Description |
|-------|----------|-------------|
| **Vacuum** | 0–10s | All 5 fields show only low-intensity noise (vacuum fluctuations) |
| **Hydrogen** | 10–25s | Quark spikes converge → gluon arcs lock nucleus → photon well forms → electron wave collapses into spherical orbital |
| **Molecule** | 25–45s | Second atom enters → both nuclei move to bond distance → photon fields merge → electron clouds fuse into peanut-shaped covalent orbital |

## Controls

| Control | Type | Description |
|---------|------|-------------|
| Layer toggles | Checkboxes | Show/hide any of the 5 fields independently |
| Playback Speed | Slider (0–3x) | Slow down to observe gluon oscillations or speed through phases |
| Phase | Read-only | Current simulation phase display |
| Reset | Button | Restart the simulation from Phase 1 |
| Cross-Section | Enabled + Axis + Position | Clip plane to slice through the volume revealing internal density gradient |
| Bloom Intensity | Slider (0–2) | Adjust the UnrealBloomPass post-processing glow |
| Orbit Controls | Mouse drag/scroll | Pan, orbit, and zoom around the scene |

## Architecture

```
src/
├── main.js                  # Entry: scene, fields, simulation, UI wiring
├── SceneManager.js          # Three.js scene/camera/renderer manager
├── VolumeField.js           # Volumetric ShaderMaterial wrapper class
├── fields/
│   ├── Field.js             # Abstract base class
│   ├── QuarkField.js        # Up/Down quark (mode 1)
│   ├── ElectronField.js     # Electron orbital (mode 2)
│   ├── GluonField.js        # Plasma arcing lines (geometry-based)
│   └── PhotonField.js       # Photon grid (mode 4)
├── shaders/
│   ├── noise3d.glsl         # 3D simplex noise, FBM, domain warping
│   ├── volumetric.vert.glsl # Pass-through vertex shader
│   └── volumetric.frag.glsl # Custom raymarching with 5 density modes
├── simulation/
│   ├── SimulationManager.js # State machine driving the 3 phases
│   ├── Phase1_Vacuum.js     # Disorganized noise (0–10s)
│   ├── Phase2_Hydrogen.js   # Atom assembly (10–25s)
│   └── Phase3_Molecule.js   # H₂ binding (25–45s)
└── controls/
    └── UI.js                # lil-gui control panel
```

## Rendering Pipeline

1. **Proxy geometry**: Each volumetric field renders on a `BoxGeometry(12,12,12)` with `THREE.BackSide`
2. **Raymarching**: The fragment shader marches rays through a noise-based density field defined by 3D simplex noise + FBM
3. **5 density modes**: Mode-specific functions create quark spikes, electron shells, gluon tubes, and photon grids
4. **Additive blending**: `THREE.AdditiveBlending` + `depthWrite: false` so fields overlap transparently
5. **Bloom**: `UnrealBloomPass` adds the ethereal glow effect
6. **Cross-section**: A configurable clip plane slices through the volume with an edge glow

## Technical Details

- **Engine**: Three.js r170
- **Shaders**: Custom GLSL (raymarching, 3D simplex noise, FBM)
- **Post-processing**: UnrealBloomPass
- **Build**: Vite 6 + vite-plugin-glsl
- **UI**: lil-gui
- **No external 3D software required** — all volumetric rendering happens in-browser

## Multi-Agent Build

This project was built by three AI agents working together:

| Agent | Role | Tasks |
|-------|------|-------|
| **Hermes** | Orchestrator | Architecture, planning, task dispatch, integration, verification |
| **Codex CLI** | Primary coder | Scaffolding, field classes, simulation logic, UI controls |
| **Claude Code** | Fallback | Complex GLSL debugging, shader optimization |
