import * as THREE from "three";

const cache = new Map();

export function canvasTexture(key, w, h, draw, repeatX = 1, repeatY = 1) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 8;
  cache.set(key, tex);
  return tex;
}

export function tileFloor() {
  return canvasTexture("tile", 128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#6a5344";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#8a6f58";
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);
    ctx.fillStyle = "#7a6250";
    ctx.fillRect(10, 10, w - 20, h - 20);
  }, 40, 40);
}

export function checkFloor() {
  return canvasTexture("check", 64, 64, (ctx, w, h) => {
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#f4efe6";
    ctx.fillRect(0, 0, w / 2, h / 2);
    ctx.fillRect(w / 2, h / 2, w / 2, h / 2);
  }, 8, 8);
}

export function brick() {
  return canvasTexture("brick", 256, 128, (ctx, w, h) => {
    ctx.fillStyle = "#6a3e34";
    ctx.fillRect(0, 0, w, h);
    const bw = 32;
    const bh = 16;
    for (let y = 0, row = 0; y < h; y += bh, row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let x = -bw; x < w; x += bw) {
        ctx.fillStyle = row % 3 === 0 ? "#8a5246" : "#73453b";
        ctx.fillRect(x + off + 1, y + 1, bw - 2, bh - 2);
      }
    }
  }, 4, 2);
}

export function wood() {
  return canvasTexture("wood", 128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#2a1c14";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 10; i++) {
      ctx.strokeStyle = `rgba(0,0,0,${0.08 + (i % 3) * 0.04})`;
      ctx.beginPath();
      ctx.moveTo(0, i * 13);
      ctx.lineTo(w, i * 13 + 4);
      ctx.stroke();
    }
  }, 2, 2);
}

export function awning(a = "#c41e3a", b = "#f4efe6") {
  return canvasTexture(`awn-${a}${b}`, 128, 64, (ctx, w, h) => {
    const stripe = 16;
    for (let x = 0; x < w; x += stripe) {
      ctx.fillStyle = (x / stripe) % 2 === 0 ? a : b;
      ctx.fillRect(x, 0, stripe, h);
    }
  }, 6, 1);
}

export function neonSign(title, sub, bg, fg) {
  return canvasTexture(`sign-${title}-${sub}-${bg}`, 1024, 256, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 8;
    ctx.strokeRect(16, 16, w - 32, h - 32);
    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const maxW = w - 96;
    let size = sub ? 70 : 78;
    ctx.font = `700 ${size}px Georgia, serif`;
    while (size > 26 && ctx.measureText(title).width > maxW) {
      size -= 2;
      ctx.font = `700 ${size}px Georgia, serif`;
    }
    ctx.shadowColor = fg;
    ctx.shadowBlur = 16;
    ctx.fillText(title, w / 2, sub ? h / 2 - 22 : h / 2);
    if (sub) {
      ctx.shadowBlur = 0;
      let subSize = 32;
      ctx.font = `500 ${subSize}px sans-serif`;
      ctx.fillStyle = "#f4efe6";
      while (subSize > 16 && ctx.measureText(sub).width > maxW) {
        subSize -= 1;
        ctx.font = `500 ${subSize}px sans-serif`;
      }
      ctx.fillText(sub, w / 2, h / 2 + 52);
    }
  });
}

export function leasePoster(num, price) {
  return canvasTexture(`lease-${num}`, 512, 640, (ctx, w, h) => {
    ctx.fillStyle = "#f4efe6";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#0c0b0a";
    ctx.fillRect(24, 24, w - 48, h - 48);
    ctx.fillStyle = "#e2b657";
    ctx.font = "600 28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`KITCHEN ${String(num).padStart(2, "0")}`, w / 2, 120);
    ctx.fillStyle = "#f4efe6";
    ctx.font = "700 64px Georgia, serif";
    ctx.fillText("FOR LEASE", w / 2, 240);
    ctx.font = "500 36px sans-serif";
    ctx.fillText(`$${price}/mo`, w / 2, 330);
    ctx.font = "400 22px sans-serif";
    ctx.fillStyle = "#c4b9a8";
    ctx.fillText("Ship food to the door.", w / 2, 400);
    ctx.fillText("Walk in. Claim this spot.", w / 2, 440);
  });
}

export function pizzaTex() {
  return canvasTexture("pizza", 256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#c47a2c";
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e8c14a";
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c41e3a";
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const r = 40 + (i % 3) * 28;
      ctx.beginPath();
      ctx.arc(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r, 14, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function asphalt() {
  return canvasTexture("asphalt", 128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#2a2c30";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 80; i++) {
      ctx.fillStyle = i % 2 ? "#32343a" : "#25262a";
      ctx.fillRect((i * 17) % w, (i * 29) % h, 3, 2);
    }
  }, 18, 18);
}

export function sidewalk() {
  return canvasTexture("sidewalk", 128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#8a8680";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#6e6a64";
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, w - 4, h - 4);
    ctx.fillStyle = "#96928c";
    ctx.fillRect(10, 10, w - 20, h - 20);
  }, 8, 8);
}

export function facade(key, base, lit) {
  return canvasTexture(`facade-${key}`, 256, 512, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    const cols = 4;
    const rows = 8;
    const ww = 28;
    const hh = 36;
    const gx = (w - cols * ww) / (cols + 1);
    const gy = 28;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const on = (r * 3 + c * 7 + key.length) % 5 !== 0;
        ctx.fillStyle = on ? lit : "#1a1e28";
        ctx.fillRect(gx + c * (ww + gx), 40 + r * (hh + 16), ww, hh);
      }
    }
  }, 2, 1);
}

export function crateTex() {
  return canvasTexture("crate", 128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#6b4a2a";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#3a2414";
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.strokeRect(0, h / 2 - 6, w, 12);
  });
}
