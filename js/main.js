import * as THREE from "three";
import { mergeKitchens, fetchRemoteClaims, applyClaims } from "./data.js";
import { World } from "./world.js";
import { Player } from "./player.js";
import { UI, bindTap } from "./ui.js";
import { toggleMusic, setVolume, ensureAudio } from "./audio.js";
import { missouriLabel } from "./clock.js";

const isTouch = navigator.maxTouchPoints > 0 || matchMedia("(pointer: coarse)").matches;
if (isTouch) document.documentElement.classList.add("is-touch");

const canvas = document.getElementById("c");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !isTouch,
    powerPreference: "high-performance",
  });
} catch (err) {
  document.getElementById("bootTitle").textContent = "This hall needs WebGL.";
  document.getElementById("bootSub").textContent = "Open this page in Chrome or Safari to walk the kitchens.";
  throw err;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.25 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(isTouch ? 75 : 70, innerWidth / innerHeight, 0.1, 200);

const kitchens = mergeKitchens();
const world = new World(scene, { dense: !isTouch });
let player;
const ui = new UI({
  kitchens,
  onClaim: (k) => world.refreshKitchen(k),
  onNeedPointer: (lock) => {
    if (!lock) player?.unlock();
  },
});
player = new Player(camera, renderer.domElement, world, { touch: isTouch });

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2(0, 0);

let musicOn = false;
let firstPerson = false;
let entered = false;
let clock;

function viewportSize() {
  const vv = window.visualViewport;
  return {
    w: Math.round(vv?.width || innerWidth),
    h: Math.round(vv?.height || innerHeight),
    x: Math.round(vv?.offsetLeft || 0),
    y: Math.round(vv?.offsetTop || 0),
  };
}

function resize() {
  const { w, h, x, y } = viewportSize();
  if (isTouch) {
    const app = document.getElementById("app");
    app.style.position = "fixed";
    app.style.left = `${x}px`;
    app.style.top = `${y}px`;
    app.style.width = `${w}px`;
    app.style.height = `${h}px`;
    canvas.style.pointerEvents = "none";
  }
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  canvas.style.width = "100%";
  canvas.style.height = "100%";
}
addEventListener("resize", resize);
visualViewport?.addEventListener("resize", resize);
visualViewport?.addEventListener("scroll", resize);
resize();

bindTap(document.getElementById("btnFirstPerson"), () => setFirstPerson(!firstPerson));
bindTap(document.getElementById("btnEnter"), () => walkIn());
document.getElementById("emailForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("emailInput");
  const status = document.getElementById("emailStatus");
  const email = input.value.trim();
  status.hidden = false;
  try {
    const r = await fetch("/api/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Couldn’t save that email.");
    status.textContent = "You’re on the list. Walk in when you’re ready.";
    input.value = "";
  } catch (err) {
    status.textContent = err.message || "Couldn’t save that email.";
  }
});

async function walkIn() {
  entered = true;
  document.getElementById("enter").hidden = true;
  await ensureAudio();
  musicOn = true;
  await toggleMusic(true);
  document.getElementById("radio").dataset.collapsed = "false";
  if (isTouch) {
    document.getElementById("touch").hidden = false;
    document.getElementById("lookSurface").hidden = false;
  }
  player.spawn();
  setFirstPerson(true);
}
document.getElementById("vol").oninput = (e) => setVolume(e.target.value);
bindTap(document.getElementById("menuMusic"), async () => {
  ui.closeAll();
  await ensureAudio();
  musicOn = !musicOn;
  await toggleMusic(musicOn);
});

addEventListener("keydown", (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable;
  if (e.key === "Escape") {
    ui.closeAll();
    return;
  }
  if (!entered || typing || ui.sheetOpen) return;
  if (e.key === "f" || e.key === "F") setFirstPerson(!firstPerson);
  if (e.key === "e" || e.key === "E") {
    if (ui.active) ui.openKitchen(ui.active);
  }
});

renderer.domElement.addEventListener("click", () => {
  if (ui.sheetOpen || isTouch) return;
  if (firstPerson && !player.locked) {
    player.lock();
    return;
  }
  if (ui.active) ui.openKitchen(ui.active);
});

function setFirstPerson(on) {
  firstPerson = on;
  document.getElementById("btnFirstPerson").setAttribute("aria-pressed", String(on));
  document.getElementById("crosshair").hidden = !on || isTouch;
  player.setMode(on ? "first" : "orbit");
}

function nearbyKitchen() {
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(world.kitchenMeshes, false);
  if (hits[0]) {
    const id = hits[0].object.userData.kitchenId;
    return kitchens.find((k) => k.id === id);
  }
  // fallback: distance to kitchen fronts
  const p = camera.position;
  let best = null;
  let bestD = 8;
  for (const k of kitchens) {
    const frontZ = k.facing === 0 ? k.z - k.d / 2 : k.z + k.d / 2;
    const d = Math.hypot(p.x - k.x, p.z - frontZ);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

function tickClock() {
  const el = document.getElementById("kcClock");
  if (el) el.textContent = `Kansas City · ${missouriLabel()}`;
}

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  player.setFrozen(ui.sheetOpen);
  world.update(dt);
  player.update(dt);
  if (!ui.sheetOpen) ui.inspect(nearbyKitchen());
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

async function boot() {
  ui.setProgress(0.15);
  const remote = await fetchRemoteClaims();
  applyClaims(kitchens, remote);
  ui.setProgress(0.45);
  world.build(kitchens);
  ui.setProgress(0.8);
  await flyIn();
  player.orbit.target.set(-8, 1.8, 12);
  player.camera.position.set(8, 10, -6);
  player.orbit.update();
  ui.setProgress(1);
  ui.hideBoot();
  ui.goLive(18 + Math.floor(Math.random() * 10));
  ui.showEnter();
  clock = new THREE.Clock();
  tickClock();
  setInterval(tickClock, 1000);
  tick();
}

async function flyIn() {
  const start = new THREE.Vector3(18, 38, -30);
  const end = new THREE.Vector3(8, 10, -6);
  const look = new THREE.Vector3(-8, 1.8, 12);
  const dur = isTouch ? 1200 : 2200;
  const t0 = performance.now();
  camera.position.copy(start);
  await new Promise((resolve) => {
    function step(now) {
      const t = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(start, end, e);
      camera.lookAt(look);
      renderer.render(scene, camera);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
}

if (isTouch) setupTouch();

function setupTouch() {
  const stick = document.getElementById("stick");
  const lookSurface = document.getElementById("lookSurface");
  const nub = stick.querySelector("i");
  const origin = { x: 0, y: 0 };
  let moveId = null;
  let lookId = null;
  let lastLook = { x: 0, y: 0 };

  const setNub = (x, y) => {
    const s = stick.clientWidth;
    const n = nub.offsetWidth || 48;
    const mid = (s - n) / 2;
    nub.style.left = `${mid + x * (s * 0.28)}px`;
    nub.style.top = `${mid + y * (s * 0.28)}px`;
  };

  const applyStick = (t) => {
    let x = (t.clientX - origin.x) / 48;
    let y = (t.clientY - origin.y) / 48;
    const m = Math.hypot(x, y) || 1;
    if (m > 1) { x /= m; y /= m; }
    player.stick.x = x;
    player.stick.z = -y;
    setNub(x, y);
  };

  const stopStick = () => {
    moveId = null;
    player.stick.x = 0;
    player.stick.z = 0;
    setNub(0, 0);
  };

  stick.addEventListener("touchstart", (e) => {
    if (ui.sheetOpen) return;
    const t = e.changedTouches[0];
    if (!t) return;
    e.preventDefault();
    e.stopPropagation();
    moveId = t.identifier;
    origin.x = t.clientX;
    origin.y = t.clientY;
    applyStick(t);
  }, { passive: false });

  lookSurface.addEventListener("touchstart", (e) => {
    if (ui.sheetOpen || player.frozen || !firstPerson) return;
    const t = e.changedTouches[0];
    if (!t || t.identifier === moveId) return;
    lookId = t.identifier;
    lastLook.x = t.clientX;
    lastLook.y = t.clientY;
  }, { passive: true });

  lookSurface.addEventListener("touchmove", (e) => {
    if (lookId == null) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== lookId) continue;
      player.look(t.clientX - lastLook.x, t.clientY - lastLook.y);
      lastLook.x = t.clientX;
      lastLook.y = t.clientY;
    }
  }, { passive: false });

  addEventListener("touchmove", (e) => {
    if (moveId == null) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== moveId) continue;
      e.preventDefault();
      applyStick(t);
    }
  }, { passive: false });

  const endTouch = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === moveId) stopStick();
      if (t.identifier === lookId) lookId = null;
    }
  };
  addEventListener("touchend", endTouch);
  addEventListener("touchcancel", endTouch);

  const jump = document.getElementById("touchJump");
  const jumpOn = (e) => {
    e.preventDefault();
    e.stopPropagation();
    player.keys.space = true;
  };
  const jumpOff = (e) => {
    e.stopPropagation();
    player.keys.space = false;
  };
  jump.addEventListener("touchstart", jumpOn, { passive: false });
  jump.addEventListener("touchend", jumpOff);
  jump.addEventListener("touchcancel", jumpOff);
  jump.addEventListener("pointerdown", jumpOn);
  jump.addEventListener("pointerup", jumpOff);
  jump.addEventListener("pointercancel", jumpOff);
  bindTap(document.getElementById("touchUse"), () => ui.useNearby());
}

boot().catch((err) => {
  console.error(err);
  document.getElementById("bootTitle").textContent = "Couldn’t open the kitchen.";
  document.getElementById("bootSub").textContent = String(err.message || err);
});
