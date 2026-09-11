let ctx;
let master;
let playing = false;
let nodes = [];

export function audioState() {
  return { playing, volume: master ? master.gain.value : 0.35 };
}

export async function ensureAudio() {
  if (ctx) return ctx;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);
  return ctx;
}

export function setVolume(v) {
  if (master) master.gain.value = Number(v);
}

export async function toggleMusic(on) {
  await ensureAudio();
  if (ctx.state === "suspended") await ctx.resume();
  if (on === playing) return playing;
  if (on) startPad();
  else stopPad();
  playing = on;
  return playing;
}

function startPad() {
  stopPad();
  const t = ctx.currentTime;
  const notes = [110, 138.59, 164.81, 220];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    osc.type = i % 2 ? "triangle" : "sine";
    osc.frequency.value = freq;
    filt.type = "lowpass";
    filt.frequency.value = 600 + i * 80;
    g.gain.value = 0.04;
    osc.connect(filt);
    filt.connect(g);
    g.connect(master);
    osc.start(t);
    nodes.push(osc, g, filt);
  });

  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.15;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  noise.loop = true;
  const ng = ctx.createGain();
  const nf = ctx.createBiquadFilter();
  nf.type = "bandpass";
  nf.frequency.value = 900;
  ng.gain.value = 0.03;
  noise.connect(nf);
  nf.connect(ng);
  ng.connect(master);
  noise.start();
  nodes.push(noise, ng, nf);
}

function stopPad() {
  for (const n of nodes) {
    try {
      if (n.stop) n.stop();
      if (n.disconnect) n.disconnect();
    } catch {}
  }
  nodes = [];
}
