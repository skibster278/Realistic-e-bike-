# Volt Ride

A first-person electric dirt bike and e-bike riding game that runs in the browser (Safari on iPad, Chrome or Edge on a computer) using Three.js and WebGL2. Everything is bundled in the repo, so it works offline.

Open `index.html` through any static server (GitHub Pages, or `python3 -m http.server`).

## Controls

| Key | Action |
| --- | --- |
| W / S | Throttle / brake |
| A / D | Steer |
| Shift | Wheelie (lean back) |
| Ctrl or Q | Lean forward |
| Space | Rear brake |
| C | Switch first / third person |
| E | Look back |
| 1–8 | Switch bike |
| N | Jump between day and night |
| G | Lock golden hour (sunset light) |
| Hold T | Fast-forward time |
| M | Map |
| R | Respawn |
| B | Toggle bloom |
| Esc | Menu |

On a touchscreen without a keyboard, buttons appear on screen.

## What's in it

- **Bikes:** Sur-Ron Light Bee X, Sur-Ron Ultra Bee, Talaria Sting R, Stark Varg MX and SM, a trail e-MTB, a fat-tire e-bike and a city e-bike. Each has its own power, top speed and weight. Wheelies come from real torque, and you can do jumps, crash, and respawn after 3 seconds.
- **World:** forest trails with a dirt jump park, deer, rabbits and foxes; a neighborhood; a city with traffic; and a lit highway for night rides. There's a full day/night cycle.
- **Graphics:**
  - Real HDRI sky and photo-scanned PBR textures.
  - Tree impostors baked from film-quality Poly Haven trees.
  - Scanned rocks, ferns, logs and street props.
  - Wind-swayed grass.
  - Reflective glass towers and lit storefronts.
  - Real-time shadows, bloom and a cinematic color grade.
  - Automatic resolution scaling to hold frame rate.

## Graphics settings

Choose a preset in the menu; your choice is remembered.

| Preset | Ambient occlusion | Shadow map | Grass | Bloom |
| --- | --- | --- | --- | --- |
| Low | Off | 1024 | Short range | Off |
| Medium (iPad default) | Half resolution | 2048 | Medium range | On |
| High (computer default) | Full resolution | 4096 | Long range | On |

If the frame rate still drops, the game lowers its resolution automatically.

## Asset credits

- **Poly Haven** (CC0, polyhaven.com): textures, HDRI sky, trees (baked into impostors), rocks, fern, dead trunk, hydrant, trash can, bench and AC unit.
- **three.js example models**: Ferrari 458 car and the Soldier character used as the rider. Licensing for these follows the three.js repository's model credits.
- **Khronos glTF Sample Assets**: CarConcept and Fox. Each one's license is in the glTF-Sample-Assets repository.
- **three.js** (MIT): `lib/`.
- **N8AO** (ISC, by N8programs): ambient occlusion, in `lib/jsm/n8ao/`.
