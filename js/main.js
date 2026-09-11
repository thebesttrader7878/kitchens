import * as THREE from "three";
import { mergeKitchens, fetchRemoteClaims, applyClaims } from "./data.js";
import { World } from "./world.js";
import { Player } from "./player.js";
import { UI } from "./ui.js";
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
  };
}

function resize() {
  const { w, h } = viewportSize();
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
}
addEventListener("resize", resize);
visualViewport?.addEventListener("resize", resize);
resize();

document.getElementById("btnFirstPerson").onclick = () => setFirstPerson(!firstPerson);
document.getElementById("btnEnter").onclick = () => walkIn();
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
  if (isTouch) document.getElementById("touch").hidden = false;
  player.spawn();
  setFirstPerson(true);
}
document.getElementById("vol").oninput = (e) => setVolume(e.target.value);
document.getElementById("menuMusic")?.addEventListener("click", async () => {
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
  if (ui.sheetOpen) return;
  if (!isTouch && firstPerson && !player.locked) {
    player.lock();
    return;
  }
  if (ui.active) ui.openKitchen(ui.active);
});

function setFirstPerson(on) {
  firstPerson = on;
  document.getElementById("btnFirstPerson").setAttribute("aria-pressed", String(on));
  document.getElementById("crosshair").hidden = !on;
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
  let bestD = 5.5;
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
  const nub = stick.querySelector("i");
  const hint = document.getElementById("lookHint");
  const origin = { x: 0, y: 0 };
  let moveId = null;
  let lookId = null;
  let lastLook = { x: 0, y: 0 };

  const setNub = (x, y) => {
    const s = stick.clientWidth;
    const n = nub.offsetWidth || 52;
    const mid = (s - n) / 2;
    nub.style.left = `${mid + x * (s * 0.28)}px`;
    nub.style.top = `${mid + y * (s * 0.28)}px`;
  };

  const onStick = (t) => {
    const r = stick.getBoundingClientRect();
    return t.clientX >= r.left - 8 && t.clientX <= r.right + 8 && t.clientY >= r.top - 8 && t.clientY <= r.bottom + 8;
  };

  const onHud = (t) => {
    const el = document.elementFromPoint(t.clientX, t.clientY);
    return el && el.closest && el.closest(".hud-brand, .hud-menu-btn, .parcel-inspection, .interact-prompt, .touch-btns, .sheet, .chat-dock, .boot, .enter-gate");
  };

  addEventListener("touchstart", (e) => {
    if (ui.sheetOpen || player.frozen) return;
    for (const t of e.changedTouches) {
      if (onStick(t) && moveId == null) {
        moveId = t.identifier;
        origin.x = t.clientX;
        origin.y = t.clientY;
      } else if (lookId == null && !onHud(t) && !onStick(t)) {
        lookId = t.identifier;
        lastLook.x = t.clientX;
        lastLook.y = t.clientY;
      }
    }
  }, { passive: true });

  addEventListener("touchmove", (e) => {
    let used = false;
    for (const t of e.changedTouches) {
      if (t.identifier === moveId) {
        used = true;
        let x = (t.clientX - origin.x) / 48;
        let y = (t.clientY - origin.y) / 48;
        const m = Math.hypot(x, y) || 1;
        if (m > 1) { x /= m; y /= m; }
        player.stick.x = x;
        player.stick.z = -y;
        setNub(x, y);
      } else if (t.identifier === lookId && firstPerson) {
        used = true;
        player.look(t.clientX - lastLook.x, t.clientY - lastLook.y);
        lastLook.x = t.clientX;
        lastLook.y = t.clientY;
        if (hint) hint.hidden = true;
      }
    }
    if (used) e.preventDefault();
  }, { passive: false });

  const endTouch = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === moveId) {
        moveId = null;
        player.stick.x = 0;
        player.stick.z = 0;
        setNub(0, 0);
      }
      if (t.identifier === lookId) lookId = null;
    }
  };
  addEventListener("touchend", endTouch);
  addEventListener("touchcancel", endTouch);

  document.getElementById("touchJump").onpointerdown = (e) => { e.preventDefault(); player.keys.space = true; };
  document.getElementById("touchJump").onpointerup = () => { player.keys.space = false; };
  document.getElementById("touchUse").onclick = () => { if (ui.active) ui.openKitchen(ui.active); };

  document.body.addEventListener("touchmove", (e) => {
    if (ui.sheetOpen) return;
    if (e.target === canvas || e.target.closest?.(".world-canvas")) e.preventDefault();
  }, { passive: false });
}

boot().catch((err) => {
  console.error(err);
  document.getElementById("bootTitle").textContent = "Couldn’t open the kitchen.";
  document.getElementById("bootSub").textContent = String(err.message || err);
});
