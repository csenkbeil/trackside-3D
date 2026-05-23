# Trackside 3D

An offline five-lane endless driving game built with Three.js.

## Features

- Five-lane endless road driving with distance and best-run tracking.
- Mustang-inspired red muscle car with white racing stripes.
- Traffic cars, crates, and potholes to avoid.
- Coins plus speed, invincibility, and double-coin power-ups.
- Procedural scenery that cycles through grasslands, desert, forest, and city biomes.
- Keyboard, touch button, and swipe lane controls.

## Run locally

```bash
npm install
npm run dev
```

## Build for offline play

```bash
npm run build
npm run preview
```

The production build is self-contained in `dist` and does not depend on remote assets.

## Verify rendering

```bash
npm run verify:render
```

This launches local Edge through Playwright, starts a run in desktop and mobile viewports, captures screenshots, and checks that the WebGL canvas is nonblank.
