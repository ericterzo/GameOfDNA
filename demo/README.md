# Robot — rigged walk demo

A static 3D scan of a robot, rigged into an animated humanoid and set walking
through a spaceship corridor in the browser with [three.js](https://threejs.org).
You can **drive it** with WASD / arrow keys, or an on-screen joystick on a phone.

![The rigged robot walking down the spaceship corridor](preview.jpg)

## Two ways to run it

### A) `standalone.html` — just double-click it

`standalone.html` is a **single self-contained file**: three.js, the demo, and
the robot model are all embedded inside it. No server, no Python, no internet —
double-click it (or drag it into any browser) and it runs. It's large (~24 MB)
because the full model is baked in.

### B) `index.html` — served (smaller, loads the model as a file)

`index.html` loads `robot.vrm` separately, so it must be served over HTTP
(browsers block a page from loading a sibling file off `file://`). From the repo
root:

```
python -m http.server 8000      # then open http://localhost:8000/demo/
```

Once the repo is on GitHub Pages it's also live at
`https://ericterzo.github.io/GameOfDNA/demo/`.

## Controls

| | Walk | Turn | Look | Zoom |
| --- | --- | --- | --- | --- |
| Desktop | `W` / `S` or ↑ / ↓ | `A` / `D` or ← / → | drag | scroll |
| Mobile | joystick (bottom-left) | joystick | drag | pinch |

Until you give any input, the robot paces the corridor on its own. Walk
backward and the step cycle runs in reverse; stop and it settles into its
rest pose. A third-person camera follows it.

## Files

| File | What it is |
| --- | --- |
| `robot.vrm` | The rigged robot. A **[VRM 0.x](https://vrm.dev) humanoid avatar** — a skeleton skinned to the mesh, a baked `Walk` clip, and the standard VRM humanoid bone map. Download it and load it in any VRM app or glTF 2.0 viewer. |
| `standalone.html` | The whole demo in one double-clickable file (model embedded). |
| `index.html` | The served version — loads `robot.vrm`, `scene.js` and `vendor/`. |
| `scene.js` | The scene, walk logic and controls (shared by both pages). |
| `vendor/` | three.js r137 (UMD build + `GLTFLoader` + `RoomEnvironment`), vendored so nothing loads from a CDN. The UMD build is what lets `standalone.html` run from `file://`. |

## How the rig was built

The source model was a single, un-rigged, textured scan mesh (~290k triangles,
no skeleton). Rigging it:

1. **Orientation.** The scan faces +X (verified from the feet and hip sockets);
   the mesh is rotated so it faces +Z, matching the walk direction.
2. **Skeleton.** A 21-bone skeleton was placed to the measured silhouette and
   named to the **standard VRM humanoid** bone set, so the result is a true
   humanoid avatar — left/right bones on the correct sides.
3. **Skinning.** Every vertex was weighted to the nearest bone segments
   (distance falloff, up to 4 influences, with a left/right penalty so limbs
   don't bleed across the centre line).
4. **Walk cycle.** A one-second looping clip was hand-authored — opposite-phase
   hip swing with a knee tuck on the swing leg, counter-swinging arms, a
   double-bounce bob and a little hip roll — baked into the VRM as a glTF
   animation named `Walk`.
5. **Export.** Written as a `.vrm` (glTF 2.0 + the `VRM` extension), textures
   transcoded from WebP to JPEG for broad viewer compatibility.
