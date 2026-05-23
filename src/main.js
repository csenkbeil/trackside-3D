import "./styles.css";
import * as THREE from "three";

const canvas = document.querySelector("#game-canvas");
const distanceEl = document.querySelector("#distance");
const coinsEl = document.querySelector("#coins");
const bestEl = document.querySelector("#best");
const menuEl = document.querySelector("#menu");
const startButton = document.querySelector("#startButton");
const toastEl = document.querySelector("#toast");
const powerStrip = document.querySelector("#powerStrip");
const touchLeft = document.querySelector("#touchLeft");
const touchRight = document.querySelector("#touchRight");

const laneCount = 5;
const laneWidth = 4;
const roadWidth = laneCount * laneWidth + 3;
const laneXs = Array.from({ length: laneCount }, (_, index) => (index - 2) * laneWidth);
const segmentLength = 48;
const segmentCount = 18;
const visibleAhead = segmentLength * segmentCount;
const spawnAhead = -260;
const despawnBehind = 36;
const playerZ = -3;
const worldTypes = ["plains", "desert", "forest", "city"];
const worldLength = 1250;

const state = {
  running: false,
  gameOver: false,
  distance: 0,
  coins: 0,
  speed: 35,
  baseSpeed: 35,
  lane: 2,
  targetX: laneXs[2],
  invincible: 0,
  doubleCoins: 0,
  speedBoost: 0,
  hitFlash: 0,
  spawnTimer: 0,
  coinTimer: 0,
  powerTimer: 0,
  activeWorld: "plains",
  lastWorld: "",
};

const bestKey = "trackside-3d-best-distance";
const storedBest = Number(localStorage.getItem(bestKey) || 0);
bestEl.textContent = `${Math.floor(storedBest)} m`;

const clock = new THREE.Clock();
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 10, 20);
camera.rotation.order = "YXZ";

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const hemiLight = new THREE.HemisphereLight(0xb9e3ff, 0x2b251c, 2.1);
scene.add(hemiLight);

const sun = new THREE.DirectionalLight(0xfff1c0, 4.8);
sun.position.set(-16, 28, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 120;
sun.shadow.camera.left = -50;
sun.shadow.camera.right = 50;
sun.shadow.camera.top = 55;
sun.shadow.camera.bottom = -40;
scene.add(sun);

const fillLight = new THREE.DirectionalLight(0x9fd2ff, 0.7);
fillLight.position.set(18, 14, -20);
scene.add(fillLight);

const root = new THREE.Group();
scene.add(root);

const roadGroup = new THREE.Group();
const sceneryGroup = new THREE.Group();
const entitiesGroup = new THREE.Group();
root.add(roadGroup, sceneryGroup, entitiesGroup);

function createAsphaltTexture() {
  const size = 512;
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = size;
  textureCanvas.height = size;
  const ctx = textureCanvas.getContext("2d");
  ctx.fillStyle = "#17191a";
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 9000; i += 1) {
    const shade = 18 + Math.random() * 38;
    ctx.fillStyle = `rgba(${shade}, ${shade + 2}, ${shade + 2}, ${0.08 + Math.random() * 0.1})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }

  for (let i = 0; i < 70; i += 1) {
    ctx.strokeStyle = `rgba(230, 230, 220, ${0.025 + Math.random() * 0.035})`;
    ctx.lineWidth = 0.6 + Math.random() * 1.4;
    ctx.beginPath();
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(
      x + (Math.random() - 0.5) * 80,
      y + Math.random() * 40,
      x + (Math.random() - 0.5) * 110,
      y + Math.random() * 90,
      x + (Math.random() - 0.5) * 140,
      y + Math.random() * 140
    );
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.2, 38);
  texture.anisotropy = 8;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createGroundTexture(base, fleck, highlight) {
  const size = 512;
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = size;
  textureCanvas.height = size;
  const ctx = textureCanvas.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 7600; i += 1) {
    ctx.fillStyle = Math.random() > 0.18 ? fleck : highlight;
    ctx.globalAlpha = 0.12 + Math.random() * 0.2;
    const w = 1 + Math.random() * 5;
    const h = 1 + Math.random() * 5;
    ctx.fillRect(Math.random() * size, Math.random() * size, w, h);
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(26, 64);
  texture.anisotropy = 8;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const textures = {
  asphalt: createAsphaltTexture(),
  ground: {
    plains: createGroundTexture("#4f8d3b", "#6ead52", "#d5cf73"),
    desert: createGroundTexture("#bb8a4a", "#d9ad63", "#8e6234"),
    forest: createGroundTexture("#1c5537", "#2e7746", "#6d8f58"),
    city: createGroundTexture("#4e565c", "#646f76", "#363d42"),
  },
};

const materials = {
  asphalt: new THREE.MeshStandardMaterial({
    color: 0x17191a,
    map: textures.asphalt,
    bumpMap: textures.asphalt,
    bumpScale: 0.018,
    roughness: 0.82,
    metalness: 0.02,
  }),
  asphaltDark: new THREE.MeshStandardMaterial({
    color: 0x101213,
    roughness: 0.9,
    metalness: 0.01,
  }),
  shoulder: new THREE.MeshStandardMaterial({
    color: 0x2c2c2a,
    roughness: 0.88,
  }),
  line: new THREE.MeshStandardMaterial({
    color: 0xf3f0dd,
    roughness: 0.5,
    emissive: 0x151208,
    emissiveIntensity: 0.1,
  }),
  coin: new THREE.MeshStandardMaterial({
    color: 0xffc93f,
    metalness: 0.85,
    roughness: 0.22,
    emissive: 0x6d4200,
    emissiveIntensity: 0.3,
  }),
  redPaint: new THREE.MeshPhysicalMaterial({
    color: 0xb91519,
    metalness: 0.45,
    roughness: 0.28,
    clearcoat: 0.9,
    clearcoatRoughness: 0.18,
  }),
  stripe: new THREE.MeshStandardMaterial({
    color: 0xf4f2e8,
    roughness: 0.26,
    metalness: 0.08,
  }),
  glass: new THREE.MeshPhysicalMaterial({
    color: 0x18242f,
    transmission: 0.2,
    opacity: 0.74,
    transparent: true,
    roughness: 0.05,
    metalness: 0.1,
    clearcoat: 0.8,
  }),
  tire: new THREE.MeshStandardMaterial({
    color: 0x050606,
    roughness: 0.78,
    metalness: 0.02,
  }),
  chrome: new THREE.MeshStandardMaterial({
    color: 0xb7bec3,
    roughness: 0.2,
    metalness: 0.88,
  }),
  headlight: new THREE.MeshStandardMaterial({
    color: 0xfff2c4,
    emissive: 0xffe4a8,
    emissiveIntensity: 1.4,
    roughness: 0.15,
  }),
  tailLight: new THREE.MeshStandardMaterial({
    color: 0xff1b1b,
    emissive: 0xbd0808,
    emissiveIntensity: 1.2,
    roughness: 0.24,
  }),
  crate: new THREE.MeshStandardMaterial({
    color: 0x8b5a2b,
    roughness: 0.78,
    metalness: 0.02,
  }),
  crateBand: new THREE.MeshStandardMaterial({
    color: 0x4a3018,
    roughness: 0.84,
  }),
  pothole: new THREE.MeshStandardMaterial({
    color: 0x030303,
    roughness: 1,
  }),
  shield: new THREE.MeshStandardMaterial({
    color: 0x49ddff,
    metalness: 0.25,
    roughness: 0.2,
    emissive: 0x0c7891,
    emissiveIntensity: 0.85,
  }),
  speed: new THREE.MeshStandardMaterial({
    color: 0xff5f2d,
    metalness: 0.32,
    roughness: 0.24,
    emissive: 0xb12b08,
    emissiveIntensity: 0.7,
  }),
  double: new THREE.MeshStandardMaterial({
    color: 0xc7f45d,
    metalness: 0.25,
    roughness: 0.24,
    emissive: 0x4b7a10,
    emissiveIntensity: 0.6,
  }),
};

const palette = {
  plains: {
    sky: 0x83c8ed,
    fog: 0xb8dcf0,
    ground: 0x4f8d3b,
    shoulder: 0x31522b,
    accent: 0xe6d47b,
    sun: 0xfff1c4,
  },
  desert: {
    sky: 0xe7b46a,
    fog: 0xe8c78d,
    ground: 0xbb8a4a,
    shoulder: 0x9b6b34,
    accent: 0xd5a95a,
    sun: 0xffd18c,
  },
  forest: {
    sky: 0x7fb1ce,
    fog: 0x8fb7b7,
    ground: 0x1c5537,
    shoulder: 0x23482f,
    accent: 0x6b8c52,
    sun: 0xf1e7b4,
  },
  city: {
    sky: 0x9db6c4,
    fog: 0xaab8c0,
    ground: 0x4e565c,
    shoulder: 0x343a3d,
    accent: 0x6c7880,
    sun: 0xf6e3bb,
  },
};

const scratchColor = new THREE.Color();
const currentSky = new THREE.Color();
const targetSky = new THREE.Color(palette.plains.sky);
const currentFog = new THREE.Color();
const targetFog = new THREE.Color(palette.plains.fog);
const groundMaterial = new THREE.MeshStandardMaterial({
  color: palette.plains.ground,
  map: textures.ground.plains,
  roughness: 0.9,
});
scene.background = currentSky.setHex(palette.plains.sky);
scene.fog = new THREE.Fog(currentFog.setHex(palette.plains.fog), 55, 260);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 1600, 1, 1), groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.position.z = -420;
ground.receiveShadow = true;
sceneryGroup.add(ground);

const roadSegments = [];
const dashSegments = [];
const roadsideSegments = [];
const roadGeometry = new THREE.BoxGeometry(roadWidth, 0.16, segmentLength + 0.4);
const shoulderGeometry = new THREE.BoxGeometry(2.2, 0.18, segmentLength + 0.4);
const dashGeometry = new THREE.BoxGeometry(0.14, 0.025, 6.8);
const centerLineGeometry = new THREE.BoxGeometry(0.18, 0.028, segmentLength * segmentCount);

for (let i = 0; i < segmentCount; i += 1) {
  const z = -i * segmentLength;
  const road = new THREE.Mesh(roadGeometry, materials.asphalt);
  road.position.set(0, 0, z);
  road.receiveShadow = true;
  roadGroup.add(road);
  roadSegments.push(road);

  [-1, 1].forEach((side) => {
    const shoulder = new THREE.Mesh(shoulderGeometry, materials.shoulder);
    shoulder.position.set(side * (roadWidth / 2 + 1.15), 0.02, z);
    shoulder.receiveShadow = true;
    roadGroup.add(shoulder);
    roadsideSegments.push(shoulder);
  });

  for (let lane = 1; lane < laneCount; lane += 1) {
    const x = (lane - laneCount / 2) * laneWidth + laneWidth / 2;
    for (let dash = 0; dash < 4; dash += 1) {
      const marker = new THREE.Mesh(dashGeometry, materials.line);
      marker.position.set(x, 0.13, z - segmentLength / 2 + dash * 12 + 6);
      marker.receiveShadow = true;
      roadGroup.add(marker);
      dashSegments.push(marker);
    }
  }
}

[-roadWidth / 2, roadWidth / 2].forEach((x) => {
  const line = new THREE.Mesh(centerLineGeometry, materials.line);
  line.position.set(x, 0.15, -visibleAhead / 2 + segmentLength / 2);
  line.receiveShadow = true;
  roadGroup.add(line);
});

const player = createPlayerCar();
player.position.set(state.targetX, 0.34, playerZ);
entitiesGroup.add(player);

const shieldRing = new THREE.Mesh(
  new THREE.TorusGeometry(2.35, 0.055, 12, 96),
  new THREE.MeshBasicMaterial({ color: 0x6eeeff, transparent: true, opacity: 0 })
);
shieldRing.rotation.x = Math.PI / 2;
shieldRing.position.y = 1.35;
player.add(shieldRing);

const obstacles = [];
const collectables = [];
const sceneryItems = [];
const sparks = [];

let toastTimer = 0;
let mobileSteerTimer = 0;

function makeMesh(geometry, material, cast = true, receive = false) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

function createPlayerCar() {
  const car = new THREE.Group();
  car.userData.radius = 1.45;
  car.userData.height = 1.2;

  const body = makeMesh(new THREE.BoxGeometry(2.45, 0.72, 4.75), materials.redPaint);
  body.position.y = 0.76;
  car.add(body);

  const hood = makeMesh(new THREE.BoxGeometry(2.35, 0.42, 1.62), materials.redPaint);
  hood.position.set(0, 1.04, -1.3);
  hood.rotation.x = -0.035;
  car.add(hood);

  const rearDeck = makeMesh(new THREE.BoxGeometry(2.3, 0.36, 1.28), materials.redPaint);
  rearDeck.position.set(0, 1, 1.52);
  rearDeck.rotation.x = 0.028;
  car.add(rearDeck);

  const cabin = makeMesh(new THREE.BoxGeometry(1.85, 0.84, 1.7), materials.glass);
  cabin.position.set(0, 1.38, 0.26);
  cabin.scale.z = 0.9;
  car.add(cabin);

  const roof = makeMesh(new THREE.BoxGeometry(1.62, 0.16, 1.25), materials.redPaint);
  roof.position.set(0, 1.86, 0.22);
  car.add(roof);

  const frontBumper = makeMesh(new THREE.BoxGeometry(2.58, 0.24, 0.28), materials.chrome);
  frontBumper.position.set(0, 0.65, -2.52);
  car.add(frontBumper);

  const rearBumper = makeMesh(new THREE.BoxGeometry(2.58, 0.22, 0.28), materials.chrome);
  rearBumper.position.set(0, 0.62, 2.52);
  car.add(rearBumper);

  const grille = makeMesh(new THREE.BoxGeometry(1.24, 0.3, 0.08), materials.asphaltDark);
  grille.position.set(0, 0.88, -2.68);
  car.add(grille);

  [-0.68, 0.68].forEach((x) => {
    const stripe = makeMesh(new THREE.BoxGeometry(0.28, 0.045, 4.95), materials.stripe, true, false);
    stripe.position.set(x, 1.135, -0.05);
    car.add(stripe);

    const roofStripe = makeMesh(new THREE.BoxGeometry(0.25, 0.035, 1.4), materials.stripe, true, false);
    roofStripe.position.set(x, 1.955, 0.18);
    car.add(roofStripe);
  });

  [-0.78, 0.78].forEach((x) => {
    const head = makeMesh(new THREE.BoxGeometry(0.42, 0.18, 0.08), materials.headlight);
    head.position.set(x, 0.9, -2.72);
    car.add(head);

    const tail = makeMesh(new THREE.BoxGeometry(0.42, 0.18, 0.08), materials.tailLight);
    tail.position.set(x, 0.82, 2.72);
    car.add(tail);
  });

  const wheelGeometry = new THREE.CylinderGeometry(0.48, 0.48, 0.38, 32);
  const rimGeometry = new THREE.CylinderGeometry(0.27, 0.27, 0.42, 32);
  [
    [-1.28, 0.48, -1.55],
    [1.28, 0.48, -1.55],
    [-1.28, 0.48, 1.52],
    [1.28, 0.48, 1.52],
  ].forEach(([x, y, z]) => {
    const wheel = makeMesh(wheelGeometry, materials.tire);
    wheel.position.set(x, y, z);
    wheel.rotation.z = Math.PI / 2;
    car.add(wheel);

    const rim = makeMesh(rimGeometry, materials.chrome);
    rim.position.set(x + Math.sign(x) * 0.02, y, z);
    rim.rotation.z = Math.PI / 2;
    car.add(rim);
  });

  const splitter = makeMesh(new THREE.BoxGeometry(2.3, 0.08, 0.28), materials.asphaltDark);
  splitter.position.set(0, 0.34, -2.36);
  car.add(splitter);

  return car;
}

function createTrafficCar(color = 0x284f81) {
  const group = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.34,
    roughness: 0.32,
    clearcoat: 0.68,
    clearcoatRoughness: 0.18,
  });
  const body = makeMesh(new THREE.BoxGeometry(2.28, 0.72, 4.2), paint);
  body.position.y = 0.74;
  group.add(body);

  const cabin = makeMesh(new THREE.BoxGeometry(1.58, 0.78, 1.52), materials.glass);
  cabin.position.set(0, 1.3, -0.1);
  group.add(cabin);

  const bumperFront = makeMesh(new THREE.BoxGeometry(2.38, 0.2, 0.26), materials.chrome);
  bumperFront.position.set(0, 0.58, -2.2);
  group.add(bumperFront);

  const bumperRear = makeMesh(new THREE.BoxGeometry(2.38, 0.2, 0.26), materials.chrome);
  bumperRear.position.set(0, 0.58, 2.2);
  group.add(bumperRear);

  [-1.16, 1.16].forEach((x) => {
    [-1.36, 1.33].forEach((z) => {
      const wheel = makeMesh(new THREE.CylinderGeometry(0.42, 0.42, 0.34, 24), materials.tire);
      wheel.position.set(x, 0.44, z);
      wheel.rotation.z = Math.PI / 2;
      group.add(wheel);
    });
  });

  [-0.62, 0.62].forEach((x) => {
    const head = makeMesh(new THREE.BoxGeometry(0.36, 0.16, 0.06), materials.headlight);
    head.position.set(x, 0.82, -2.36);
    group.add(head);
  });

  group.userData.radius = 1.35;
  group.userData.kind = "traffic";
  return group;
}

function createCrate() {
  const group = new THREE.Group();
  const crate = makeMesh(new THREE.BoxGeometry(2.2, 1.45, 2.2), materials.crate);
  crate.position.y = 0.78;
  group.add(crate);

  const bandGeometry = new THREE.BoxGeometry(2.34, 0.12, 0.14);
  [-0.72, 0.72].forEach((z) => {
    const band = makeMesh(bandGeometry, materials.crateBand);
    band.position.set(0, 1.05, z);
    group.add(band);
  });

  const crossA = makeMesh(new THREE.BoxGeometry(0.14, 0.12, 2.8), materials.crateBand);
  crossA.position.set(-0.02, 0.82, 0);
  crossA.rotation.y = 0.72;
  group.add(crossA);

  const crossB = makeMesh(new THREE.BoxGeometry(0.14, 0.12, 2.8), materials.crateBand);
  crossB.position.set(0.02, 0.82, 0);
  crossB.rotation.y = -0.72;
  group.add(crossB);

  group.userData.radius = 1.25;
  group.userData.kind = "crate";
  return group;
}

function createPothole() {
  const group = new THREE.Group();
  const hole = makeMesh(new THREE.CylinderGeometry(1.15, 1.45, 0.08, 36), materials.pothole, false, true);
  hole.scale.z = 0.58;
  hole.position.y = 0.18;
  hole.rotation.x = Math.PI / 2;
  group.add(hole);

  const rim = makeMesh(
    new THREE.TorusGeometry(1.28, 0.08, 8, 36),
    new THREE.MeshStandardMaterial({ color: 0x2b2924, roughness: 0.96 }),
    false,
    true
  );
  rim.scale.y = 0.58;
  rim.position.y = 0.22;
  rim.rotation.x = Math.PI / 2;
  group.add(rim);

  group.userData.radius = 1.18;
  group.userData.kind = "pothole";
  return group;
}

function createCoin() {
  const coin = makeMesh(new THREE.CylinderGeometry(0.48, 0.48, 0.12, 36), materials.coin);
  coin.rotation.x = Math.PI / 2;
  coin.userData.radius = 0.75;
  coin.userData.kind = "coin";
  return coin;
}

function createPowerUp(type) {
  const material = type === "speed" ? materials.speed : type === "invincible" ? materials.shield : materials.double;
  const group = new THREE.Group();
  const core = makeMesh(new THREE.OctahedronGeometry(0.62, 2), material);
  core.position.y = 0.82;
  group.add(core);
  const ring = makeMesh(new THREE.TorusGeometry(0.86, 0.045, 8, 42), material);
  ring.position.y = 0.82;
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  group.userData.radius = 0.95;
  group.userData.kind = "power";
  group.userData.type = type;
  return group;
}

function createTree(style = "broadleaf") {
  const group = new THREE.Group();
  const trunk = makeMesh(
    new THREE.CylinderGeometry(0.18, 0.28, 2.1, 9),
    new THREE.MeshStandardMaterial({ color: 0x6d4424, roughness: 0.86 })
  );
  trunk.position.y = 1.05;
  group.add(trunk);

  if (style === "pine") {
    const pineMat = new THREE.MeshStandardMaterial({ color: 0x1f5f38, roughness: 0.82 });
    for (let i = 0; i < 3; i += 1) {
      const cone = makeMesh(new THREE.ConeGeometry(1.2 - i * 0.22, 1.8, 12), pineMat);
      cone.position.y = 2.25 + i * 0.72;
      group.add(cone);
    }
  } else {
    const leaf = makeMesh(
      new THREE.DodecahedronGeometry(1.1, 1),
      new THREE.MeshStandardMaterial({ color: 0x2f813d, roughness: 0.82 })
    );
    leaf.position.y = 2.65;
    leaf.scale.set(1.08, 0.9, 1.08);
    group.add(leaf);
  }
  return group;
}

function createCactus() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x3f8041, roughness: 0.74 });
  const trunk = makeMesh(new THREE.CylinderGeometry(0.34, 0.42, 2.8, 10), mat);
  trunk.position.y = 1.4;
  group.add(trunk);

  [-1, 1].forEach((side) => {
    const arm = makeMesh(new THREE.CylinderGeometry(0.16, 0.18, 1.2, 10), mat);
    arm.position.set(side * 0.58, 1.65, 0);
    arm.rotation.z = side * 0.92;
    group.add(arm);
  });
  return group;
}

function createRock() {
  const rock = makeMesh(
    new THREE.DodecahedronGeometry(0.8 + Math.random() * 0.8, 0),
    new THREE.MeshStandardMaterial({ color: 0x777063, roughness: 0.94 })
  );
  rock.scale.y = 0.45 + Math.random() * 0.4;
  rock.position.y = 0.24;
  rock.rotation.set(Math.random(), Math.random(), Math.random());
  return rock;
}

function createBuilding() {
  const height = 8 + Math.random() * 22;
  const width = 5 + Math.random() * 4;
  const depth = 5 + Math.random() * 5;
  const building = makeMesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({
      color: scratchColor.setHSL(0.58 + Math.random() * 0.08, 0.08, 0.28 + Math.random() * 0.2),
      roughness: 0.58,
      metalness: 0.12,
    })
  );
  building.position.y = height / 2;

  const windows = new THREE.Group();
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0xd3ecff,
    emissive: 0x375a71,
    emissiveIntensity: 0.22,
    roughness: 0.35,
  });
  for (let row = 0; row < Math.floor(height / 3); row += 1) {
    for (let col = -1; col <= 1; col += 1) {
      const pane = makeMesh(new THREE.BoxGeometry(0.55, 0.75, 0.04), windowMat, false, false);
      pane.position.set(col * 1.05, 2 + row * 2.5, -depth / 2 - 0.035);
      windows.add(pane);
    }
  }
  building.add(windows);
  return building;
}

function createStreetLamp() {
  const group = new THREE.Group();
  const pole = makeMesh(
    new THREE.CylinderGeometry(0.08, 0.1, 4.8, 12),
    new THREE.MeshStandardMaterial({ color: 0x555d60, roughness: 0.42, metalness: 0.6 })
  );
  pole.position.y = 2.4;
  group.add(pole);

  const head = makeMesh(new THREE.BoxGeometry(0.85, 0.18, 0.36), materials.headlight);
  head.position.set(0.34, 4.75, 0);
  group.add(head);
  return group;
}

function createSceneryItem(world) {
  if (world === "city") {
    return Math.random() < 0.78 ? createBuilding() : createStreetLamp();
  }
  if (world === "desert") {
    return Math.random() < 0.62 ? createCactus() : createRock();
  }
  if (world === "forest") {
    return Math.random() < 0.82 ? createTree("pine") : createRock();
  }
  return Math.random() < 0.62 ? createTree("broadleaf") : createRock();
}

function resetGame() {
  state.running = true;
  state.gameOver = false;
  state.distance = 0;
  state.coins = 0;
  state.speed = state.baseSpeed;
  state.lane = 2;
  state.targetX = laneXs[2];
  state.invincible = 0;
  state.doubleCoins = 0;
  state.speedBoost = 0;
  state.hitFlash = 0;
  state.spawnTimer = 0.45;
  state.coinTimer = 0.2;
  state.powerTimer = 7.5;
  state.activeWorld = "plains";
  state.lastWorld = "";
  player.position.set(state.targetX, 0.34, playerZ);
  player.rotation.set(0, 0, 0);

  for (const item of [...obstacles, ...collectables, ...sceneryItems, ...sparks]) {
    entitiesGroup.remove(item);
    sceneryGroup.remove(item);
  }
  obstacles.length = 0;
  collectables.length = 0;
  sceneryItems.length = 0;
  sparks.length = 0;

  seedScenery();
  updateHud();
  menuEl.classList.add("is-hidden");
  showToast("GO");
}

function endGame() {
  state.running = false;
  state.gameOver = true;
  const previousBest = Number(localStorage.getItem(bestKey) || 0);
  if (state.distance > previousBest) {
    localStorage.setItem(bestKey, String(Math.floor(state.distance)));
    bestEl.textContent = `${Math.floor(state.distance)} m`;
  }
  startButton.textContent = "Restart Run";
  menuEl.querySelector(".tagline").textContent = `${Math.floor(state.distance)} m  |  ${state.coins} coins`;
  menuEl.classList.remove("is-hidden");
  showToast("Crash");
}

function seedScenery() {
  for (let z = -30; z > -visibleAhead; z -= 16) {
    spawnSceneryAt(z, state.activeWorld);
  }
}

function spawnSceneryAt(z, world) {
  [-1, 1].forEach((side) => {
    const count = world === "city" ? 2 : 1;
    for (let i = 0; i < count; i += 1) {
      if (Math.random() < (world === "plains" ? 0.55 : 0.82)) {
        const item = createSceneryItem(world);
        const minOffset = roadWidth / 2 + (world === "city" ? 8 : 9);
        const x = side * (minOffset + Math.random() * (world === "city" ? 18 : 55));
        item.position.set(x, 0, z - Math.random() * 12);
        item.rotation.y = Math.random() * Math.PI * 2;
        item.scale.multiplyScalar(0.85 + Math.random() * 0.55);
        sceneryGroup.add(item);
        sceneryItems.push(item);
      }
    }
  });
}

function shiftLane(direction) {
  if (!state.running) return;
  const nextLane = THREE.MathUtils.clamp(state.lane + direction, 0, laneCount - 1);
  if (nextLane !== state.lane) {
    state.lane = nextLane;
    state.targetX = laneXs[state.lane];
  }
}

function spawnObstacle() {
  const blocked = new Set();
  const attempts = 1 + Math.floor(Math.random() * 2) + (state.distance > 900 ? 1 : 0);
  const colors = [0x254b7a, 0x0f735e, 0xc9a227, 0xeeeeee, 0x25282b, 0x7b3a92];
  for (let i = 0; i < attempts; i += 1) {
    const lane = Math.floor(Math.random() * laneCount);
    if (blocked.has(lane)) continue;
    blocked.add(lane);

    const roll = Math.random();
    let obstacle;
    if (roll < 0.14) {
      obstacle = createPothole();
    } else if (roll < 0.28) {
      obstacle = createCrate();
    } else {
      obstacle = createTrafficCar(colors[Math.floor(Math.random() * colors.length)]);
      obstacle.rotation.y = Math.random() < 0.2 ? Math.PI : 0;
    }
    obstacle.position.set(laneXs[lane], 0.06, spawnAhead - i * 13 - Math.random() * 12);
    obstacle.userData.lane = lane;
    obstacle.userData.passed = false;
    entitiesGroup.add(obstacle);
    obstacles.push(obstacle);
  }
}

function spawnCoinLine() {
  const lane = Math.floor(Math.random() * laneCount);
  const length = 4 + Math.floor(Math.random() * 5);
  const zStart = spawnAhead - Math.random() * 14;
  for (let i = 0; i < length; i += 1) {
    const coin = createCoin();
    coin.position.set(laneXs[lane], 1.15, zStart - i * 5.5);
    entitiesGroup.add(coin);
    collectables.push(coin);
  }
}

function spawnPowerUp() {
  const lane = Math.floor(Math.random() * laneCount);
  const types = ["speed", "invincible", "double"];
  const power = createPowerUp(types[Math.floor(Math.random() * types.length)]);
  power.position.set(laneXs[lane], 1.0, spawnAhead - Math.random() * 32);
  entitiesGroup.add(power);
  collectables.push(power);
}

function applyPower(type) {
  if (type === "speed") {
    state.speedBoost = 6.5;
    showToast("Speed Boost");
  } else if (type === "invincible") {
    state.invincible = 7.2;
    showToast("Invincible");
  } else {
    state.doubleCoins = 9.5;
    showToast("Double Coins");
  }
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("is-visible");
  toastTimer = 1.35;
}

function updateWorld() {
  const worldIndex = Math.floor(state.distance / worldLength) % worldTypes.length;
  const world = worldTypes[worldIndex];
  state.activeWorld = world;
  if (state.lastWorld !== world) {
    const colors = palette[world];
    targetSky.setHex(colors.sky);
    targetFog.setHex(colors.fog);
    groundMaterial.color.setHex(colors.ground);
    groundMaterial.map = textures.ground[world];
    groundMaterial.needsUpdate = true;
    materials.shoulder.color.setHex(colors.shoulder);
    sun.color.setHex(colors.sun);
    state.lastWorld = world;
    const label = world === "plains" ? "Grasslands" : world[0].toUpperCase() + world.slice(1);
    if (state.distance > 12) showToast(label);
  }

  currentSky.lerp(targetSky, 0.018);
  currentFog.lerp(targetFog, 0.018);
  scene.background = currentSky;
  scene.fog.color.copy(currentFog);
}

function updateRoad(delta) {
  const movement = state.speed * delta;
  for (const segment of roadSegments) {
    segment.position.z += movement;
    if (segment.position.z > segmentLength) {
      segment.position.z -= segmentLength * segmentCount;
    }
  }

  for (const shoulder of roadsideSegments) {
    shoulder.position.z += movement;
    if (shoulder.position.z > segmentLength) {
      shoulder.position.z -= segmentLength * segmentCount;
    }
  }

  for (const dash of dashSegments) {
    dash.position.z += movement;
    if (dash.position.z > segmentLength) {
      dash.position.z -= segmentLength * segmentCount;
    }
  }
}

function updateScenery(delta) {
  const movement = state.speed * delta;
  ground.position.z += movement * 0.35;
  if (ground.position.z > 70) ground.position.z -= 140;

  for (let i = sceneryItems.length - 1; i >= 0; i -= 1) {
    const item = sceneryItems[i];
    item.position.z += movement;
    if (item.position.z > despawnBehind) {
      sceneryGroup.remove(item);
      sceneryItems.splice(i, 1);
    }
  }

  const farthest = sceneryItems.reduce((min, item) => Math.min(min, item.position.z), 0);
  if (farthest > spawnAhead) {
    spawnSceneryAt(spawnAhead - Math.random() * 20, state.activeWorld);
  }
}

function updateEntities(delta) {
  const movement = state.speed * delta;
  for (let i = obstacles.length - 1; i >= 0; i -= 1) {
    const obstacle = obstacles[i];
    obstacle.position.z += movement;
    if (obstacle.position.z > despawnBehind) {
      entitiesGroup.remove(obstacle);
      obstacles.splice(i, 1);
    }
  }

  for (let i = collectables.length - 1; i >= 0; i -= 1) {
    const item = collectables[i];
    item.position.z += movement;
    item.rotation.y += delta * 3.1;
    item.rotation.z += item.userData.kind === "coin" ? delta * 0.7 : delta * 1.4;
    item.position.y += Math.sin(performance.now() * 0.004 + i) * delta * 0.18;
    if (item.position.z > despawnBehind) {
      entitiesGroup.remove(item);
      collectables.splice(i, 1);
    }
  }

  for (let i = sparks.length - 1; i >= 0; i -= 1) {
    const spark = sparks[i];
    spark.userData.life -= delta;
    spark.position.z += movement * 0.5;
    spark.position.addScaledVector(spark.userData.velocity, delta);
    spark.material.opacity = Math.max(spark.userData.life, 0) / spark.userData.maxLife;
    if (spark.userData.life <= 0) {
      entitiesGroup.remove(spark);
      sparks.splice(i, 1);
    }
  }
}

function updateSpawning(delta) {
  const speedFactor = THREE.MathUtils.clamp(state.distance / 2000, 0, 1.2);
  state.spawnTimer -= delta;
  state.coinTimer -= delta;
  state.powerTimer -= delta;

  if (state.spawnTimer <= 0) {
    spawnObstacle();
    state.spawnTimer = THREE.MathUtils.clamp(1.05 - speedFactor * 0.22 + Math.random() * 0.65, 0.58, 1.55);
  }

  if (state.coinTimer <= 0) {
    spawnCoinLine();
    state.coinTimer = 1.45 + Math.random() * 2.1;
  }

  if (state.powerTimer <= 0) {
    spawnPowerUp();
    state.powerTimer = 7.5 + Math.random() * 7.5;
  }
}

function updatePlayer(delta) {
  const laneDelta = state.targetX - player.position.x;
  player.position.x += laneDelta * Math.min(1, delta * 10.5);
  player.rotation.z = THREE.MathUtils.lerp(player.rotation.z, -laneDelta * 0.04, delta * 8);
  player.rotation.x = Math.sin(performance.now() * 0.012) * 0.012;

  const boosted = state.speedBoost > 0;
  const targetSpeed = boosted ? state.baseSpeed * 1.38 : state.baseSpeed + Math.min(state.distance / 180, 28);
  state.speed += (targetSpeed - state.speed) * Math.min(1, delta * 1.7);

  if (state.invincible > 0) state.invincible = Math.max(0, state.invincible - delta);
  if (state.doubleCoins > 0) state.doubleCoins = Math.max(0, state.doubleCoins - delta);
  if (state.speedBoost > 0) state.speedBoost = Math.max(0, state.speedBoost - delta);
  if (state.hitFlash > 0) state.hitFlash = Math.max(0, state.hitFlash - delta);

  shieldRing.material.opacity = state.invincible > 0 ? 0.36 + Math.sin(performance.now() * 0.014) * 0.16 : 0;
  shieldRing.rotation.z += delta * 2.4;
}

function checkCollisions() {
  const px = player.position.x;
  const pz = player.position.z;

  for (let i = obstacles.length - 1; i >= 0; i -= 1) {
    const obstacle = obstacles[i];
    const dz = Math.abs(obstacle.position.z - pz);
    const dx = Math.abs(obstacle.position.x - px);
    const radius = obstacle.userData.radius + player.userData.radius;
    if (dz < 2.3 && dx < radius * 0.68) {
      if (state.invincible > 0) {
        burst(obstacle.position, 0xffe35a, 16);
        entitiesGroup.remove(obstacle);
        obstacles.splice(i, 1);
        state.hitFlash = 0.28;
        continue;
      }
      burst(player.position, 0xff4b35, 24);
      endGame();
      return;
    }
  }

  for (let i = collectables.length - 1; i >= 0; i -= 1) {
    const item = collectables[i];
    const dz = Math.abs(item.position.z - pz);
    const dx = Math.abs(item.position.x - px);
    if (dz < 2.25 && dx < player.userData.radius + item.userData.radius * 0.5) {
      if (item.userData.kind === "coin") {
        state.coins += state.doubleCoins > 0 ? 2 : 1;
        burst(item.position, 0xffd447, 8);
      } else {
        applyPower(item.userData.type);
        burst(item.position, 0x70f0ff, 12);
      }
      entitiesGroup.remove(item);
      collectables.splice(i, 1);
      updateHud();
    }
  }
}

function burst(position, color, count) {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.9,
  });
  for (let i = 0; i < count; i += 1) {
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.08 + Math.random() * 0.07, 8, 8), material.clone());
    spark.position.copy(position);
    spark.position.y += 1.1;
    spark.userData.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 7,
      Math.random() * 5,
      (Math.random() - 0.5) * 7
    );
    spark.userData.life = 0.45 + Math.random() * 0.3;
    spark.userData.maxLife = spark.userData.life;
    entitiesGroup.add(spark);
    sparks.push(spark);
  }
}

function updateHud() {
  distanceEl.textContent = `${Math.floor(state.distance)} m`;
  coinsEl.textContent = String(state.coins);
  const best = Math.max(Number(localStorage.getItem(bestKey) || 0), state.distance);
  bestEl.textContent = `${Math.floor(best)} m`;

  const powers = [
    ["Speed", state.speedBoost, 6.5],
    ["Shield", state.invincible, 7.2],
    ["2x", state.doubleCoins, 9.5],
  ].filter(([, time]) => time > 0);

  powerStrip.innerHTML = powers
    .map(
      ([name, time, max]) => `
        <div class="power-pill">
          <span>${name}</span>
          <progress value="${time.toFixed(2)}" max="${max}"></progress>
        </div>
      `
    )
    .join("");
}

function updateCamera(delta) {
  const targetCameraX = player.position.x * 0.28;
  camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetCameraX, delta * 3);
  camera.position.y = THREE.MathUtils.lerp(camera.position.y, 9.2 + state.speed * 0.028, delta * 2.4);
  camera.position.z = THREE.MathUtils.lerp(camera.position.z, 23.5 + state.speed * 0.06, delta * 2.4);
  camera.lookAt(player.position.x * 0.38, 1.05, -17);
}

function tick() {
  const delta = Math.min(clock.getDelta(), 0.033);
  requestAnimationFrame(tick);

  if (state.running) {
    state.distance += state.speed * delta;
    updateWorld();
    updateRoad(delta);
    updateScenery(delta);
    updateSpawning(delta);
    updateEntities(delta);
    updatePlayer(delta);
    checkCollisions();
    updateHud();
  } else {
    player.rotation.y = Math.sin(performance.now() * 0.001) * 0.04;
    updateWorld();
    updateRoad(delta * 0.35);
    updateScenery(delta * 0.35);
  }

  if (toastTimer > 0) {
    toastTimer = Math.max(0, toastTimer - delta);
    if (toastTimer === 0) toastEl.classList.remove("is-visible");
  }

  if (mobileSteerTimer > 0) mobileSteerTimer -= delta;

  renderer.render(scene, camera);
}

function onResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.fov = width < 720 ? 66 : 58;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
}

function onKeyDown(event) {
  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
    shiftLane(-1);
  } else if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
    shiftLane(1);
  } else if (event.key === " " || event.key === "Enter") {
    if (!state.running) resetGame();
  }
}

let touchStartX = null;
function onPointerDown(event) {
  touchStartX = event.clientX;
}

function onPointerUp(event) {
  if (touchStartX === null || mobileSteerTimer > 0) return;
  const diff = event.clientX - touchStartX;
  if (Math.abs(diff) > 28) {
    shiftLane(diff > 0 ? 1 : -1);
    mobileSteerTimer = 0.08;
  }
  touchStartX = null;
}

startButton.addEventListener("click", resetGame);
touchLeft.addEventListener("click", () => shiftLane(-1));
touchRight.addEventListener("click", () => shiftLane(1));
window.addEventListener("keydown", onKeyDown);
window.addEventListener("resize", onResize);
canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointerup", onPointerUp);

seedScenery();
onResize();
tick();
