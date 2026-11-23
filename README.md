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
| N | Jump between midday and golden hour |
| G | Lock golden hour (sunset light) |
| Hold T | Fast-forward time |
| M | Map |
| R | Respawn |
| B | Toggle bloom |
| Esc | Menu |

**Touch (iPad/phone):** an analog thumb-stick on the left steers (tap **TILT** to steer by tilting the device instead). On the right are the **GAS** and **BRAKE** pedals plus **WHEELIE** and **LEAN** buttons. The small buttons on the right edge switch camera, look back, toggle tilt and respawn. Everything is multi-touch, so you can steer, hold gas and wheelie at the same time. The on-screen controls only appear while you're playing by touch: pressing any key on a keyboard hides them, and touching the screen again (after a few seconds without typing) brings them back.

## Career, races and multiplayer

- **Start on the slowest bike** (Urban Commuter) and earn cash to buy the others in the Garage (menu). Prices run from $900 (Trail e-MTB) to $42,000 (Stark Varg MX). Every bike you own has 3 levels each of **Motor** (+14% power, +5% top speed) and **Tyre** (+6% grip) upgrades.
- **Earning:** riding pays (faster pays more), **wheelies** pay big while the needle is in the green zone of the wheelie bar, plus **big air** and **near misses** with traffic. Progress saves automatically on the device.
- **Wheelie bar:** there's no auto-balance. Holding WHEELIE keeps lifting the front until you loop out, so feather it (and dab the brake) to keep the needle in the green.
- **Races:** 5 checkpoint races (Downtown Sprint, Highway Blast, Forest Trail Enduro, Suburb Loop, Cross-Country). Ride into a glowing blue beacon (also shown on the minimap) to start. Gold, silver or bronze is based on par time, and best times are saved.
- **Multiplayer:** in the menu, enter a name and **Create room** to get a 4-letter code; friends type the code and press **Join**. You see each other's bikes and name tags. When the host rides into a race beacon, everyone in the room races it together, with shared standings. It's peer-to-peer over WebRTC using the free PeerJS broker, so there's no server to run. Add `?peer=host:port` to the URL to use your own PeerJS server.

## What's in it

- **Bikes:** Sur-Ron Light Bee X, Sur-Ron Ultra Bee, Talaria Sting R, Stark Varg MX and SM, a trail e-MTB, a fat-tire e-bike and a city e-bike. Each has its own power, top speed and weight. Wheelies come from real torque, and you can do jumps, crash, and respawn after 3 seconds.
- **World:** forest trails with a dirt jump park, deer, rabbits and foxes; a neighborhood; a city with traffic; and a lit highway for night rides. Daylight runs from late morning to golden hour and back, with real sky photos blending as the sun drops.
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
