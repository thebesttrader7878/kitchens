import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export class Player {
  constructor(camera, dom, world, { touch = false } = {}) {
    this.camera = camera;
    this.world = world;
    this.touch = touch;
    this.mode = "orbit";
    this.velocity = new THREE.Vector3();
    this.keys = { w: false, a: false, s: false, d: false, shift: false, space: false };
    this.onGround = true;
    this.stick = { x: 0, z: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.frozen = false;

    this.fp = new PointerLockControls(camera, dom);
    this.orbit = new OrbitControls(camera, dom);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.08;
    this.orbit.target.set(-8, 1.8, 12);
    this.orbit.minDistance = 4;
    this.orbit.maxDistance = 55;
    this.orbit.maxPolarAngle = 1.35;
    this.orbit.minPolarAngle = 0.25;
    this.orbit.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    if (touch) {
      this.orbit.enabled = false;
      this.orbit.enableRotate = false;
      this.orbit.enablePan = false;
      this.orbit.enableZoom = false;
    }
    camera.position.set(8, 10, -6);

    addEventListener("keydown", (e) => this.onKey(e, true));
    addEventListener("keyup", (e) => this.onKey(e, false));
  }

  onKey(e, down) {
    if (down && (this.frozen || isTyping(e.target))) return;
    const k = e.key.toLowerCase();
    if (k === "w" || k === "arrowup") this.keys.w = down;
    if (k === "s" || k === "arrowdown") this.keys.s = down;
    if (k === "a" || k === "arrowleft") this.keys.a = down;
    if (k === "d" || k === "arrowright") this.keys.d = down;
    if (k === "shift") this.keys.shift = down;
    if (k === " ") {
      this.keys.space = down;
      if (down) e.preventDefault();
    }
  }

  clearMotion() {
    this.keys.w = this.keys.a = this.keys.s = this.keys.d = false;
    this.keys.shift = this.keys.space = false;
    this.stick.x = 0;
    this.stick.z = 0;
    this.velocity.set(0, 0, 0);
  }

  setFrozen(on) {
    if (on && !this.frozen) {
      this.clearMotion();
      this.orbit.enabled = false;
      this.fp.unlock();
    } else if (!on && this.frozen) {
      this.orbit.enabled = this.mode !== "first";
    }
    this.frozen = on;
  }

  syncLookFromCamera() {
    const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, "YXZ");
    this.pitch = e.x;
    this.yaw = e.y;
  }

  look(dx, dy) {
    this.yaw -= dx * 0.0045;
    this.pitch = Math.max(-1.15, Math.min(1.15, this.pitch - dy * 0.0035));
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === "first") {
      this.orbit.enabled = false;
      const p = this.camera.position;
      this.camera.position.set(p.x, 1.65, p.z);
      this.syncLookFromCamera();
      this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
      if (!this.touch) this.fp.lock();
    } else {
      this.fp.unlock();
      this.orbit.enabled = true;
    }
  }

  lock() {
    if (this.touch) {
      this.setMode("first");
      return;
    }
    if (this.mode !== "first") this.setMode("first");
    else this.fp.lock();
  }

  unlock() {
    this.fp.unlock();
  }

  get locked() {
    return this.touch ? this.mode === "first" : this.fp.isLocked;
  }

  spawn() {
    this.camera.position.set(-8, 1.65, 8);
    this.camera.lookAt(-10, 1.7, 16);
    this.syncLookFromCamera();
    this.velocity.set(0, 0, 0);
  }

  update(dt) {
    if (this.frozen) return;
    if (this.mode !== "first") {
      this.orbit.update();
      return;
    }
    const speed = (this.keys.shift ? 8.2 : 5.0) * dt;
    let fwd = 0;
    let side = 0;
    if (this.keys.w) fwd += 1;
    if (this.keys.s) fwd -= 1;
    if (this.keys.a) side -= 1;
    if (this.keys.d) side += 1;
    fwd += this.stick.z;
    side += this.stick.x;

    if (this.touch || !this.fp.isLocked) {
      if (fwd || side) {
        const len = Math.hypot(fwd, side) || 1;
        fwd /= len;
        side /= len;
        const sin = Math.sin(this.yaw);
        const cos = Math.cos(this.yaw);
        this.camera.position.x += (-fwd * sin + side * cos) * speed;
        this.camera.position.z += (-fwd * cos - side * sin) * speed;
      }
    } else if (fwd || side) {
      const len = Math.hypot(fwd, side) || 1;
      this.fp.moveForward((fwd / len) * speed);
      this.fp.moveRight((side / len) * speed);
    }

    if (this.keys.space && this.onGround) {
      this.velocity.y = 6.2;
      this.onGround = false;
    }
    this.velocity.y -= 18 * dt;
    this.camera.position.y += this.velocity.y * dt;
    if (this.camera.position.y <= 1.65) {
      this.camera.position.y = 1.65;
      this.velocity.y = 0;
      this.onGround = true;
    }
    const r = this.world.resolve(this.camera.position.x, this.camera.position.z);
    this.camera.position.x = r.x;
    this.camera.position.z = r.z;
  }
}

function isTyping(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}
