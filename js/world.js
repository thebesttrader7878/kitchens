import * as THREE from "three";
import {
  checkFloor,
  brick,
  wood,
  awning,
  neonSign,
  leasePoster,
  pizzaTex,
  crateTex,
  asphalt,
  sidewalk,
  facade,
} from "./textures.js";
import { PLAN_PRICE } from "./data.js";
import { missouriSky } from "./clock.js";

const loader = new THREE.TextureLoader();
const PAL = [0xc41e3a, 0xe2b657, 0xf4efe6, 0x4a6fa5, 0x2f4f3a, 0xd4783a, 0x6b5b95, 0x3d7a6a];
const SKIN = [0xe8cbb0, 0xc68642, 0x8d5524, 0xf1c27d, 0xffdbac];

export class World {
  constructor(scene, { dense = true } = {}) {
    this.scene = scene;
    this.dense = dense;
    this.colliders = [];
    this.kitchenColliders = new Map();
    this.kitchenMeshes = [];
    this.people = [];
    this.cars = [];
    this.kitchenById = new Map();
    this.groups = new Map();
    this.lampLights = [];
    this.lampBulbs = [];
    this.accentLights = [];
  }

  build(kitchens) {
    this.kitchens = kitchens;
    this.lights();
    this.ground();
    this.skyline();
    this.streetDressing();
    for (const k of kitchens) this.buildKitchen(k);
    this.spawnPeople();
    this.spawnCars();
    this.applySky();
  }

  lights() {
    this.ambient = new THREE.AmbientLight(0x8899bb, 0.42);
    this.hemi = new THREE.HemisphereLight(0x9bb4d4, 0x2a241c, 0.7);
    this.sun = new THREE.DirectionalLight(0xc5d4ee, 0.45);
    this.sun.position.set(-20, 40, 10);
    this.scene.add(this.ambient, this.hemi, this.sun);
    this.scene.fog = new THREE.Fog(0x151e2e, 40, 130);
    const red = new THREE.PointLight(0xff6a4a, 22, 36, 1.7);
    red.position.set(-10, 6, 12);
    const gold = new THREE.PointLight(0xffe08a, 16, 32, 1.7);
    gold.position.set(4, 6, 2);
    this.scene.add(red, gold);
    this.accentLights.push(red, gold);
    this.applySky(true);
  }

  applySky() {
    const { day, elev, u } = missouriSky();
    const nightBg = new THREE.Color(0x101826);
    const dayBg = new THREE.Color(0x87b4d9);
    const dawnBg = new THREE.Color(0xe8a070);
    let bg = nightBg.clone().lerp(dayBg, day);
    if (day > 0 && day < 1) bg.lerp(dawnBg, 0.45 * (1 - Math.abs(day * 2 - 1)));
    this.scene.background = bg;
    if (this.scene.fog) {
      this.scene.fog.color.copy(bg).multiplyScalar(0.92);
      this.scene.fog.near = 40 + day * 20;
      this.scene.fog.far = 130 + day * 40;
    }
    this.ambient.color.set(day > 0.4 ? 0xfff3dc : 0x8899bb);
    this.ambient.intensity = 0.38 + day * 0.75;
    this.hemi.color.set(day > 0.4 ? 0xfff6e4 : 0x9bb4d4);
    this.hemi.groundColor.set(day > 0.4 ? 0x6d7a4e : 0x2a241c);
    this.hemi.intensity = 0.55 + day * 0.7;
    const az = u * Math.PI;
    this.sun.position.set(Math.cos(az) * 48, 6 + elev * 52, Math.sin(az) * 18);
    this.sun.color.set(elev > 0.55 ? 0xfff5dc : 0xffb070);
    this.sun.intensity = 0.12 + elev * 1.25 + (1 - day) * 0.2;
    const night = 1 - day;
    for (const l of this.lampLights) l.intensity = 5 * night;
    for (const b of this.lampBulbs) {
      b.material.color.set(night > 0.15 ? 0xffe0a0 : 0x6a665c);
    }
    if (this.accentLights[0]) this.accentLights[0].intensity = 8 + 14 * night;
    if (this.accentLights[1]) this.accentLights[1].intensity = 6 + 10 * night;
  }

  ground() {
    const street = new THREE.Mesh(
      new THREE.PlaneGeometry(140, 16),
      new THREE.MeshLambertMaterial({ map: asphalt() })
    );
    street.rotation.x = -Math.PI / 2;
    street.position.set(8, 0, 0);
    this.scene.add(street);

    const cross = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 90),
      new THREE.MeshLambertMaterial({ map: asphalt() })
    );
    cross.rotation.x = -Math.PI / 2;
    cross.position.set(40, 0.005, 0);
    this.scene.add(cross);

    const walk = new THREE.MeshLambertMaterial({ map: sidewalk() });
    const southWalk = new THREE.Mesh(new THREE.PlaneGeometry(140, 10), walk);
    southWalk.rotation.x = -Math.PI / 2;
    southWalk.position.set(8, 0.01, 13);
    this.scene.add(southWalk);
    const northWalk = new THREE.Mesh(new THREE.PlaneGeometry(140, 10), walk);
    northWalk.rotation.x = -Math.PI / 2;
    northWalk.position.set(8, 0.01, -13);
    this.scene.add(northWalk);

    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 160),
      new THREE.MeshLambertMaterial({ color: 0x1c222c })
    );
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = -0.02;
    this.scene.add(fill);

    // Lane dashes
    const dash = new THREE.MeshLambertMaterial({ color: 0xd4c37a });
    for (let x = -50; x <= 32; x += 6) {
      this.box(2.4, 0.03, 0.18, dash, x, 0.03, 0);
    }
    for (let z = -36; z <= 36; z += 6) {
      if (Math.abs(z) < 9) continue;
      this.box(0.18, 0.03, 2.4, dash, 40, 0.03, z);
    }

    // Crosswalk at the intersection
    const stripe = new THREE.MeshLambertMaterial({ color: 0xe8e4da });
    for (let i = -4; i <= 4; i++) {
      this.box(0.5, 0.04, 7, stripe, 32.5 + i * 0.9, 0.04, 0);
      this.box(7, 0.04, 0.5, stripe, 40, 0.04, 8.4 + i * 0.9);
      this.box(7, 0.04, 0.5, stripe, 40, 0.04, -8.4 - i * 0.9);
    }
  }

  skyline() {
    const blocks = [
      // Behind south restaurant row
      [-28, 32, 18, 12, 18, "#3a2f38"],
      [-8, 34, 16, 14, 26, "#2c3544"],
      [12, 33, 18, 12, 22, "#3e3340"],
      [30, 34, 14, 14, 30, "#2a3342"],
      [54, 30, 20, 16, 24, "#35303a"],
      // Behind north restaurant row
      [-30, -34, 20, 14, 20, "#2f3a48"],
      [-8, -36, 18, 16, 28, "#3a3140"],
      [14, -34, 16, 14, 18, "#2c3646"],
      [32, -36, 14, 16, 32, "#40343c"],
      [56, -32, 18, 14, 22, "#2a3140"],
      // West end
      [-48, 8, 14, 22, 24, "#323844"],
      [-48, -16, 14, 18, 16, "#3c323c"],
      // East of cross street
      [58, 8, 16, 20, 28, "#2e3848"],
      [58, -14, 16, 18, 20, "#3a3038"],
      [40, 42, 22, 16, 26, "#2c3340"],
      [40, -44, 22, 16, 18, "#38323c"],
    ];
    blocks.forEach((b, i) => this.tower(...b, i));
  }

  tower(x, z, w, d, h, hex, i) {
    const mat = new THREE.MeshLambertMaterial({
      map: facade(String(i) + hex, hex, i % 2 ? "#f0d48a" : "#dfe7ff"),
      color: 0xffffff,
    });
    this.box(w, h, d, mat, x, h / 2, z);
    this.colliders.push({
      minX: x - w / 2 + 0.2,
      maxX: x + w / 2 - 0.2,
      minZ: z - d / 2 + 0.2,
      maxZ: z + d / 2 - 0.2,
    });
    if (h > 20) {
      const cap = new THREE.MeshLambertMaterial({ color: 0x1a1e26 });
      this.box(w * 0.4, 3 + (i % 3), d * 0.4, cap, x, h + 1.5, z);
    }
  }

  streetDressing() {
    const lamps = [
      [-28, 9], [0, 9], [14, 9], [26, 9], [36, 9],
      [-28, -9], [0, -9], [14, -9], [26, -9], [36, -9],
      [32, 20], [48, 20], [32, -20], [48, -20],
    ];
    lamps.forEach(([x, z]) => this.lamp(x, z, true));

    // Street signs
    this.streetSign(-22, 8.6, "KITCHEN ST", "SHIP TO YOUR DOOR");
    this.streetSign(32, 8.6, "WILSONS WAY", "KITCHEN #1 →");

    // Trees along sidewalk
    for (const [x, z] of [[-32, 10.5], [16, 10.5], [28, 10.5], [-32, -10.5], [16, -10.5], [48, 12]]) {
      this.tree(x, z);
    }

    // Parked cars on the curb
    this.car(-30, 5.2, 0, 0x3a4a62);
    this.car(-18, 5.2, Math.PI, 0x6a3030);
    this.car(20, -5.2, Math.PI, 0x2e3d32);
    this.car(28, 5.2, 0, 0xd4d0c8);

    // Traffic light at intersection
    this.trafficLight(32.5, 8.2);
    this.trafficLight(47.5, -8.2);
  }

  lamp(x, z, lit) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, 5.2, 8),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a })
    );
    pole.position.set(x, 2.6, z);
    this.scene.add(pole);
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.08, 0.08),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a })
    );
    arm.position.set(x + (z > 0 ? 0.5 : -0.5), 5.1, z);
    this.scene.add(arm);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xffe0a0 })
    );
    bulb.position.set(x + (z > 0 ? 1.1 : -1.1), 4.9, z);
    this.scene.add(bulb);
    this.lampBulbs.push(bulb);
    if (lit) {
      const l = new THREE.PointLight(0xffd19a, 5, 14, 2);
      l.position.set(x, 4.8, z);
      this.scene.add(l);
      this.lampLights.push(l);
    }
  }

  streetSign(x, z, title, sub) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.07, 3.4, 8),
      new THREE.MeshLambertMaterial({ color: 0x888888 })
    );
    pole.position.set(x, 1.7, z);
    this.scene.add(pole);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 0.7),
      new THREE.MeshBasicMaterial({
        map: neonSign(title, sub, "#1a2744", "#e2b657"),
        side: THREE.DoubleSide,
      })
    );
    board.position.set(x, 3.5, z);
    this.scene.add(board);
  }

  tree(x, z) {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.24, 1.6, 6),
      new THREE.MeshLambertMaterial({ color: 0x4a3424 })
    );
    trunk.position.set(x, 0.8, z);
    this.scene.add(trunk);
    const leaf = new THREE.Mesh(
      new THREE.SphereGeometry(1.15, 8, 8),
      new THREE.MeshLambertMaterial({ color: 0x2f4f3a })
    );
    leaf.position.set(x, 2.4, z);
    this.scene.add(leaf);
    this.colliderAround(x, z, 0.5);
  }

  trafficLight(x, z) {
    this.box(0.18, 4.2, 0.18, new THREE.MeshLambertMaterial({ color: 0x222 }), x, 2.1, z);
    this.box(0.35, 1.1, 0.28, new THREE.MeshLambertMaterial({ color: 0x111 }), x, 4.4, z);
    const go = new THREE.Mesh(
      new THREE.CircleGeometry(0.1, 10),
      new THREE.MeshBasicMaterial({ color: 0x3adf5a })
    );
    go.position.set(x, 4.15, z + 0.16);
    this.scene.add(go);
  }

  car(x, z, rot, color) {
    // Local +X is the nose. rot 0 = driving east (+X), π = west (−X).
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    const paint = new THREE.MeshLambertMaterial({ color });
    const dark = new THREE.MeshLambertMaterial({ color: 0x1a1e26 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.55, 1.5), paint);
    body.position.set(0, 0.52, 0);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.28, 1.42), paint);
    hood.position.set(1.05, 0.72, 0);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.62, 1.32), dark);
    cabin.position.set(-0.35, 1.08, 0);
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 1.48), dark);
    bumper.position.set(1.62, 0.42, 0);
    g.add(body, hood, cabin, bumper);
    for (const [lx, lz] of [[1.45, 0.48], [1.45, -0.48]]) {
      const light = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xfff1c0 })
      );
      light.position.set(lx, 0.5, lz);
      g.add(light);
    }
    for (const [lx, lz] of [[-1.55, 0.48], [-1.55, -0.48]]) {
      const tail = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.12, 0.22),
        new THREE.MeshBasicMaterial({ color: 0xff2a2a })
      );
      tail.position.set(lx, 0.55, lz);
      g.add(tail);
    }
    const rubber = new THREE.MeshLambertMaterial({ color: 0x111111 });
    for (const [wx, wz] of [[0.9, 0.78], [0.9, -0.78], [-0.95, 0.78], [-0.95, -0.78]]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.22, 10), rubber);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, 0.28, wz);
      g.add(wheel);
    }
    this.scene.add(g);
    this.colliderAround(x, z, 1.4);
    return g;
  }

  spawnCars() {
    const specs = [
      { x: -40, z: 2.2, dir: 1, color: 0xc41e3a, speed: 7 },
      { x: 10, z: 2.2, dir: 1, color: 0xd8d4cc, speed: 8 },
      { x: 20, z: -2.2, dir: -1, color: 0x355a8a, speed: 7.5 },
      { x: -8, z: -2.2, dir: -1, color: 0x2c2c2c, speed: 6.5 },
    ];
    for (const s of specs) {
      const g = this.car(s.x, s.z, s.dir > 0 ? 0 : Math.PI, s.color);
      this.colliders.pop();
      g.userData = { laneZ: s.z, dir: s.dir, speed: s.speed, minX: -48, maxX: 34 };
      this.cars.push(g);
    }
  }

  spawnPeople() {
    const count = this.dense ? 26 : 14;
    const routes = [
      // south sidewalk, eastbound / westbound
      [ [-42, 10.2], [32, 10.2] ],
      [ [32, 10.8], [-42, 10.8] ],
      // north sidewalk
      [ [-42, -10.2], [32, -10.2] ],
      [ [32, -10.8], [-42, -10.8] ],
      // cross the main street
      [ [-8, 10.2], [-8, -10.2] ],
      [ [8, -10.2], [8, 10.2] ],
      [ [22, 10.2], [22, -10.2] ],
      // around Wilsons
      [ [-16, 10.2], [-10, 12.5], [-4, 10.2] ],
      // cross street
      [ [40, 22], [40, -22] ],
      [ [48, -22], [48, 22] ],
    ];
    for (let i = 0; i < count; i++) {
      const route = routes[i % routes.length].map(([x, z]) => new THREE.Vector3(x, 0, z));
      const p = this.makePerson(route, i);
      this.people.push(p);
      this.scene.add(p);
    }
  }

  makePerson(route, i) {
    const g = new THREE.Group();
    const scale = 0.88 + (i % 5) * 0.05;
    g.scale.setScalar(scale);
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.22, 0.7, 3, 6),
      new THREE.MeshLambertMaterial({ color: PAL[i % PAL.length] })
    );
    body.position.y = 0.95;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 8),
      new THREE.MeshLambertMaterial({ color: SKIN[i % SKIN.length] })
    );
    head.position.y = 1.52;
    const legs = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.55, 0.22),
      new THREE.MeshLambertMaterial({ color: 0x1c1c22 })
    );
    legs.position.y = 0.32;
    g.add(body, head, legs);
    g.userData = {
      route,
      u: Math.random(),
      speed: 1.1 + (i % 7) * 0.12,
      bob: Math.random() * Math.PI,
    };
    this.placeOnRoute(g, 0);
    return g;
  }

  placeOnRoute(g, dt) {
    const { route } = g.userData;
    let dist = 0;
    const segs = [];
    for (let i = 0; i < route.length - 1; i++) {
      const len = route[i].distanceTo(route[i + 1]);
      segs.push({ a: route[i], b: route[i + 1], len, dist });
      dist += len;
    }
    // loop back
    const back = route[0].distanceTo(route[route.length - 1]);
    segs.push({ a: route[route.length - 1], b: route[0], len: back, dist });
    dist += back;
    g.userData.u = (g.userData.u + (g.userData.speed * dt) / dist) % 1;
    const d = g.userData.u * dist;
    const seg = segs.find((s) => d >= s.dist && d <= s.dist + s.len) || segs[0];
    const t = (d - seg.dist) / (seg.len || 1);
    g.position.lerpVectors(seg.a, seg.b, t);
    g.userData.bob += dt * 8;
    g.position.y = Math.abs(Math.sin(g.userData.bob)) * 0.04;
    const dx = seg.b.x - seg.a.x;
    const dz = seg.b.z - seg.a.z;
    g.rotation.y = Math.atan2(dx, dz);
  }

  update(dt) {
    this._skyT = (this._skyT || 0) + dt;
    if (this._skyT > 2) {
      this._skyT = 0;
      this.applySky();
    }
    for (const p of this.people) this.placeOnRoute(p, dt);
    for (const c of this.cars) {
      const u = c.userData;
      c.rotation.y = u.dir > 0 ? 0 : Math.PI;
      c.position.x += u.dir * u.speed * dt;
      if (u.dir > 0 && c.position.x > u.maxX) c.position.x = u.minX;
      if (u.dir < 0 && c.position.x < u.minX) c.position.x = u.maxX;
    }
  }

  buildKitchen(k) {
    const g = new THREE.Group();
    g.position.set(k.x, 0, k.z);
    g.rotation.y = k.facing;
    g.userData.kitchenId = k.id;

    const isWilsons = k.status === "flagship";
    const wallCol = isWilsons ? 0x8a1c28 : k.status === "claimed" ? (k.color || 0x6a5a4e) : 0x6a5a4e;
    const accentCol = isWilsons ? 0xe2b657 : k.accent || 0xf4efe6;
    const wall = new THREE.MeshLambertMaterial({
      color: wallCol,
      map: isWilsons || k.status === "claimed" ? null : brick(),
    });
    const inner = new THREE.MeshLambertMaterial({
      color: isWilsons ? 0x5a242c : 0x4a4038,
    });

    const w = k.w;
    const d = k.d;
    const h = isWilsons ? 7.6 : 6.6;

    this.addBox(g, w, h, 0.4, wall, 0, h / 2, d / 2);
    this.addBox(g, 0.4, h, d, wall, -w / 2, h / 2, 0);
    this.addBox(g, 0.4, h, d, wall, w / 2, h / 2, 0);
    const doorW = Math.min(4.2, w - 2);
    const side = (w - doorW) / 2;
    this.addBox(g, side, h, 0.35, wall, -w / 2 + side / 2, h / 2, -d / 2);
    this.addBox(g, side, h, 0.35, wall, w / 2 - side / 2, h / 2, -d / 2);
    this.addBox(g, w, h - 3.2, 0.35, wall, 0, 3.2 + (h - 3.2) / 2, -d / 2);

    const floorMap = isWilsons ? checkFloor() : wood();
    const fl = new THREE.Mesh(
      new THREE.PlaneGeometry(w - 0.5, d - 0.5),
      new THREE.MeshLambertMaterial({ map: floorMap, color: 0xffffff })
    );
    fl.rotation.x = -Math.PI / 2;
    fl.position.y = 0.03;
    g.add(fl);

    this.addBox(g, w - 1.6, 1.05, 1.1, inner, 0, 0.55, d / 2 - 1.4);

    const awn = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.4, 0.12, 1.6),
      new THREE.MeshLambertMaterial({
        map: awning(
          isWilsons ? "#c41e3a" : k.status === "claimed" ? toCss(wallCol) : "#1a1a1a",
          isWilsons ? "#e2b657" : k.status === "claimed" ? toCss(accentCol) : "#f4efe6"
        ),
      })
    );
    awn.position.set(0, 3.15, -d / 2 - 0.7);
    awn.rotation.x = 0.18;
    g.add(awn);

    this.addNameSign(g, k, w, d, h, isWilsons, accentCol);
    this.addLogoBay(g, k, w, d, h, isWilsons, accentCol);

    if (k.status === "open") {
      const poster = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6, 2),
        new THREE.MeshBasicMaterial({ map: leasePoster(k.number, PLAN_PRICE[k.plan]) })
      );
      poster.position.set(0, 1.55, -d / 2 - 0.18);
      poster.rotation.y = Math.PI;
      g.add(poster);
    }

    if (isWilsons) this.dressWilsons(g, w, d, h);
    else if (k.status === "claimed") this.dressClaimed(g, k, w, d);

    const light = new THREE.PointLight(isWilsons ? 0xffb070 : 0xffe0c0, isWilsons ? 12 : 6, 14, 1.8);
    light.position.set(0, 3.2, 0);
    g.add(light);

    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(doorW, 3, 2.4),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.position.set(0, 1.5, -d / 2 - 0.6);
    hit.userData.kitchenId = k.id;
    g.add(hit);
    this.kitchenMeshes.push(hit);

    this.scene.add(g);
    this.groups.set(k.id, g);
    this.kitchenById.set(k.id, k);

    const halfW = w / 2;
    const halfD = d / 2;
    this.kitchenColliders.set(k.id, {
      minX: k.x - halfW + 0.3,
      maxX: k.x + halfW - 0.3,
      minZ: k.z - halfD + 0.3,
      maxZ: k.z + halfD - 0.3,
    });
  }

  dressWilsons(g, w, d, h) {
    const oven = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 2.2, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.4 })
    );
    oven.position.set(-w / 2 + 2.2, 1.6, d / 2 - 2.4);
    g.add(oven);
    const mouth = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.8, 0.1),
      new THREE.MeshBasicMaterial({ color: 0xff6a18 })
    );
    mouth.position.set(-w / 2 + 2.2, 1.4, d / 2 - 3.1);
    g.add(mouth);

    const pizzaMat = new THREE.MeshStandardMaterial({ map: pizzaTex(), roughness: 0.6 });
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.06, 24), pizzaMat);
      p.position.set(-1 + i * 1.15, 1.16, d / 2 - 1.4);
      g.add(p);
    }

    const crateMat = new THREE.MeshStandardMaterial({ map: crateTex() });
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.5), crateMat);
      c.position.set(w / 2 - 1.2, 0.35 + i * 0.5, -d / 2 - 1.1);
      g.add(c);
    }

    const ship = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 0.55),
      new THREE.MeshBasicMaterial({
        map: neonSign("SHIPS TO YOUR DOOR", "", "#c41e3a", "#f4efe6"),
      })
    );
    ship.position.set(0, 2.55, -d / 2 + 0.35);
    ship.rotation.y = Math.PI;
    g.add(ship);
  }

  dressClaimed(g, k, w, d) {
    const accent = new THREE.MeshStandardMaterial({
      color: k.accent || k.color,
      emissive: k.accent || k.color,
      emissiveIntensity: 0.2,
    });
    this.addBox(g, w - 2, 0.08, 0.08, accent, 0, 2.85, -d / 2 - 0.1);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 1.0),
      new THREE.MeshBasicMaterial({
        map: neonSign("ORDER HERE", "Ships to your door", "#0c0b0a", toCss(k.accent || 0xf4efe6)),
      })
    );
    board.position.set(0, 1.55, -d / 2 - 0.2);
    board.rotation.y = Math.PI;
    g.add(board);
  }

  facadeLayout(h) {
    const signH = 1.05;
    const signY = h - signH / 2 - 0.1;
    const bayBottom = 3.48;
    const bayTop = signY - signH / 2 - 0.22;
    const bayH = Math.max(0.9, bayTop - bayBottom);
    const logoSize = Math.min(1.7, bayH - 0.18);
    return {
      signH,
      signY,
      logoSize,
      logoY: (bayTop + bayBottom) / 2,
    };
  }

  addNameSign(g, k, w, d, h, isWilsons, accentCol) {
    const { signH, signY } = this.facadeLayout(h);
    const title = k.status === "open" ? "FOR LEASE" : k.name.toUpperCase();
    const sub = k.status === "open" ? `$${PLAN_PRICE[k.plan]}/MO` : k.cuisine || k.tagline;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.min(w - 0.5, 8), signH),
      new THREE.MeshBasicMaterial({
        map: neonSign(title.slice(0, 16), String(sub).slice(0, 28), "#0c0b0a", isWilsons ? "#e2b657" : toCss(accentCol)),
      })
    );
    sign.position.set(0, signY, -d / 2 - 0.22);
    sign.rotation.y = Math.PI;
    g.add(sign);
  }

  addLogoBay(g, k, w, d, h, isWilsons, accentCol) {
    const { logoSize, logoY } = this.facadeLayout(h);
    const frameCol = isWilsons ? 0xe2b657 : k.status === "claimed" ? accentCol : 0x2a2622;
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(logoSize + 0.22, logoSize + 0.22, 0.1),
      new THREE.MeshLambertMaterial({ color: frameCol })
    );
    frame.position.set(0, logoY, -d / 2 - 0.18);
    g.add(frame);
    const backing = new THREE.Mesh(
      new THREE.BoxGeometry(logoSize + 0.06, logoSize + 0.06, 0.06),
      new THREE.MeshLambertMaterial({ color: 0x0c0b0a })
    );
    backing.position.set(0, logoY, -d / 2 - 0.22);
    g.add(backing);

    const src = isWilsons ? "assets/wilsons-logo.png" : k.logo;
    if (!src) return;
    const tex = loader.load(src);
    tex.colorSpace = THREE.SRGBColorSpace;
    const logo = new THREE.Mesh(
      new THREE.PlaneGeometry(logoSize, logoSize),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true })
    );
    logo.position.set(0, logoY, -d / 2 - 0.28);
    logo.rotation.y = Math.PI;
    g.add(logo);
  }

  box(w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    this.scene.add(m);
    return m;
  }

  addBox(g, w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  }

  colliderAround(x, z, r) {
    this.colliders.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r });
  }

  resolve(px, pz, radius = 0.38) {
    let x = px;
    let z = pz;
    x = Math.max(-52, Math.min(62, x));
    z = Math.max(-48, Math.min(40, z));
    const colliders = [...this.colliders, ...this.kitchenColliders.values()];
    for (const c of colliders) {
      const nearestX = Math.max(c.minX, Math.min(x, c.maxX));
      const nearestZ = Math.max(c.minZ, Math.min(z, c.maxZ));
      let dx = x - nearestX;
      let dz = z - nearestZ;
      const dist = Math.hypot(dx, dz);
      if (dist === 0) {
        const left = x - c.minX;
        const right = c.maxX - x;
        const back = z - c.minZ;
        const fwd = c.maxZ - z;
        const m = Math.min(left, right, back, fwd);
        if (m === left) x = c.minX - radius;
        else if (m === right) x = c.maxX + radius;
        else if (m === back) z = c.minZ - radius;
        else z = c.maxZ + radius;
        continue;
      }
      if (dist < radius) {
        const push = (radius - dist) / dist;
        x += dx * push;
        z += dz * push;
      }
    }
    return { x, z };
  }

  refreshKitchen(k) {
    const old = this.groups.get(k.id);
    if (old) this.scene.remove(old);
    this.kitchenMeshes = this.kitchenMeshes.filter((m) => m.userData.kitchenId !== k.id);
    this.kitchenColliders.delete(k.id);
    this.buildKitchen(k);
  }
}

function toCss(n) {
  return `#${(n >>> 0).toString(16).padStart(6, "0")}`;
}
