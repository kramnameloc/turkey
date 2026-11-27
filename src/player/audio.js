import { playerStorage } from './storage.js';

let ctx, master, noiseBuffer, ambience;
let muted = playerStorage.mute.get();
const quiet = 0.0001;
const vary = (low, high) => low + Math.random() * (high - low);

export function isMuted() {
  return muted;
}
export function toggleAudio() {
  muted = !muted;
  playerStorage.mute.set(muted);
  if (muted) {
    stopAmbience();
    // Disconnect even notes scheduled ahead in a fanfare.
    master?.disconnect();
    master = null;
  } else {
    wakeAudio();
    sound('ready');
  }
  return muted;
}
export function wakeAudio() {
  if (muted) return;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      // One shared noise recording supplies feathers, gravel, wind and water.
      noiseBuffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 2.7), ctx.sampleRate);
      const samples = noiseBuffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = vary(-1, 1);
    }
    if (!master) {
      master = ctx.createGain();
      master.gain.value = 0.82;
      master.connect(ctx.destination);
    }
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
  } catch {}
}

function envelope(source, signal, t, duration, level, out, pan, attack) {
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(quiet, t);
  amp.gain.exponentialRampToValueAtTime(Math.max(quiet, level), t + Math.min(duration / 2, attack));
  amp.gain.exponentialRampToValueAtTime(quiet, t + duration);
  signal.connect(amp);
  const stereo = pan && ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (stereo) {
    stereo.pan.value = pan;
    amp.connect(stereo).connect(out);
  } else amp.connect(out);
  source.onended = () => {
    source.disconnect();
    if (signal !== source) signal.disconnect();
    amp.disconnect();
    stereo?.disconnect();
  };
  source.start(t);
  source.stop(t + duration);
}

function note(freq, end, delay, duration, level, type = 'sine', out = master, pan = 0, attack = 0.012) {
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(end, t + duration);
  envelope(osc, osc, t, duration, level, out, pan, attack);
}
function texture(freq, end, delay, duration, level, out = master, pan = 0, attack = 0.008) {
  const t = ctx.currentTime + delay, src = ctx.createBufferSource(), filter = ctx.createBiquadFilter();
  src.buffer = noiseBuffer;
  src.loop = true;
  src.playbackRate.value = vary(0.88, 1.13);
  filter.type = 'bandpass';
  filter.Q.value = 0.68;
  filter.frequency.setValueAtTime(freq, t);
  filter.frequency.exponentialRampToValueAtTime(end, t + duration);
  src.connect(filter);
  envelope(src, filter, t, duration, level, out, pan, attack);
}
export function sound(event, pan = 0) {
  if (muted || ctx?.state !== 'running') return;
  switch (event) {
    case 'cast':
    case 'toss':
      texture(680, 2900, 0, 0.16, 0.17, master, pan, 0.035);
      note(event === 'cast' ? 270 : 475, 75, 0.025, 0.17, 0.073, 'triangle', master, pan);
      break;
    case 'flap':
      texture(1200, 230, 0, 0.21, 0.22);
      texture(1550, 370, 0.19, 0.15, 0.115);
      note(94, 43, 0, 0.16, 0.068);
      break;
    case 'splat':
      note(vary(110, 150), 42, 0, 0.18, 0.1, 'triangle', master, pan);
      texture(1650, 240, 0.008, 0.2, 0.26, master, pan);
      break;
    case 'windup':
      note(250, 440, 0, 0.17, 0.058, 'triangle', master, pan);
      note(390, 620, 0.22, 0.17, 0.053, 'sine', master, pan);
      break;
    case 'harvest':
      note(196, 294, 0, 0.23, 0.085, 'triangle');
      note(392, 587, 0.06, 0.26, 0.06);
      texture(620, 2400, 0, 0.26, 0.085);
      break;
    case 'toot':
      note(99, 62, 0, 0.18, 0.045, 'sawtooth', master, pan);
      note(86, 49, 0.2, 0.12, 0.035, 'sawtooth', master, pan);
      break;
    case 'catch':
    case 'win':
    case 'bonus':
    case 'heal': {
      const phrase = event === 'win' ? [392, 494, 587, 784, 988] :
        event === 'catch' ? [392, 494, 587] : event === 'heal' ? [330, 440, 660] : [440, 554, 740];
      phrase.forEach((n, i) => {
        note(n, n * 1.002, i * 0.085, 0.29, 0.074, 'triangle');
        note(n * 2.01, n * 2, i * 0.085 + 0.009, 0.18, 0.022);
      });
      break;
    }
    case 'ready':
      note(460, 700, 0, 0.12, 0.055);
      break;
  }
}

// Cut the old scene's entire bus, including delayed birds and distant echoes.
export function stopAmbience() {
  if (!ambience) return;
  const { source, filter, bus } = ambience;
  const t = ctx.currentTime;
  bus.gain.cancelScheduledValues(t);
  bus.gain.setTargetAtTime(0, t, 0.016);
  source.onended = () => {
    source.disconnect();
    filter.disconnect();
    bus.disconnect();
  };
  source.stop(t + 0.09);
  ambience = null;
}

// Low-pass cutoff (Hz) and bed amplitude at the listener.
const beds = {
  park: [690, 0.067], dover: [450, 0.052], night: [290, 0.049],
  airport: [390, 0.12], ice: [740, 0.056], springs: [2400, 0.09],
  pearl: [900, 0.064], cottage: [190, 0.033], parade: [1200, 0.086],
};
function enterAmbience(id) {
  stopAmbience();
  const [frequency, level] = beds[id];
  const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), bus = ctx.createGain();
  source.buffer = noiseBuffer;
  source.loop = true;
  filter.type = 'lowpass';
  filter.Q.value = 0.45;
  filter.frequency.value = frequency;
  const bedGain = ctx.createGain();
  bedGain.gain.value = level;
  source.connect(filter).connect(bedGain).connect(bus).connect(master);
  bus.gain.setValueAtTime(quiet, ctx.currentTime);
  bus.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.45);
  source.start();
  ambience = { id, source, filter, bus, beat: 0, next: ctx.currentTime + 0.6, nextStep: 0, nextLocal: 0 };
}
function locationCue(a) {
  const { id, bus, beat } = a, pan = vary(-0.74, 0.74);
  switch (id) {
    case 'airport':
      if (beat % 2) {
        texture(180, 560, 0, 2.6, 0.18, bus, pan, 0.85);
        note(69, 49, 0.2, 2.4, 0.04, 'sine', bus, pan, 0.72);
      } else {
        note(660, 657, 0, 0.42, 0.043, 'sine', bus, pan);
        note(494, 492, 0.32, 0.65, 0.037, 'sine', bus, pan);
      }
      return vary(6, 10);
    case 'parade':
      if (beat % 12 === 5) {
        for (let i = 0; i < 5; i++)
          texture(1500 + i * 120, 750, i * 0.097, 0.07, 0.08, bus, pan);
      }
      if (beat % 4 === 0 || beat % 4 === 2) note(108, 57, 0, 0.19, 0.072, 'sine', bus, pan * 0.35);
      else {
        texture(2300, 700, 0, 0.14, 0.12, bus, pan * 0.35);
        if (beat % 8 === 7) texture(2200, 850, 0.14, 0.1, 0.09, bus, pan * 0.35);
      }
      return 0.48;
    case 'springs': {
      const f = vary(530, 870);
      note(f, f * 1.65, 0, 0.09, 0.032, 'sine', bus, pan);
      note(f * 0.76, f, 0.16, 0.11, 0.022, 'sine', bus, pan);
      return vary(1.4, 3.4);
    }
    case 'ice': {
      const f = [784, 988, 1175][beat % 3];
      note(f, f * 0.998, 0, 0.95, 0.024, 'sine', bus, pan);
      note(f * 2.7, f * 2.69, 0, 0.22, 0.009, 'sine', bus, pan);
      note(f, f, 0.17, 0.8, 0.012, 'sine', bus, -pan);
      return vary(4, 7);
    }
    case 'cottage':
      texture(beat % 2 ? 1300 : 1800, 620, 0, 0.032, 0.055, bus, -0.4);
      return 1;
    case 'night':
      for (let i = 0; i < 3; i++) note(3420, 3610, i * 0.085, 0.045, 0.014, 'sine', bus, pan);
      return vary(1.3, 3.5);
    default:
      if (id === 'pearl' && beat % 2 === 0) {
        note(1580, 1540, 0, 0.13, 0.024, 'sine', bus, pan);
        note(2140, 2110, 0.12, 0.16, 0.017, 'sine', bus, pan);
      } else {
        const f = vary(1830, 2560);
        note(f, f * 1.42, 0, 0.1, 0.026, 'sine', bus, pan);
        note(f * 1.3, f * 0.9, 0.14, 0.16, 0.019, 'sine', bus, pan);
      }
      return vary(3.5, 7.5);
  }
}

export function stereoPosition(source, listener, yaw) {
  const dx = source.x - listener.x, dz = source.z - listener.z;
  return (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / (Math.hypot(dx, dz) || 1);
}

export function updateAmbience(id, speed, grounded, localCue, listener, yaw) {
  if (muted || ctx?.state !== 'running') return;
  if (ambience?.id !== id) enterAmbience(id);
  const a = ambience, t = ctx.currentTime;
  if (t >= a.next) {
    a.next = t + locationCue(a);
    a.beat++;
  }
  const hard = ['airport', 'ice', 'pearl', 'parade', 'dover'].includes(id);
  if (grounded && speed > 0.5 && t >= a.nextStep) {
    a.nextStep = t + Math.max(0.23, 0.44 - speed * 0.014);
    texture(hard ? 1550 : 980, hard ? 540 : 280, 0, hard ? 0.063 : 0.095, id === 'cottage' ? 0.065 : 0.1, a.bus);
    note(vary(94, 120), 53, 0, 0.075, 0.038, 'sine', a.bus);
  }
  if (localCue && (localCue.shutter || t >= a.nextLocal)) {
    const { point, shutter } = localCue;
    const distance = Math.hypot(point.x - listener.x, point.z - listener.z);
    const level = 0.095 * Math.max(0, 1 - distance / 15) ** 1.5;
    const pan = stereoPosition(point, listener, yaw);
    a.nextLocal = t + 0.115;
    if (shutter) {
      texture(3900, 1100, 0, 0.047, level * 1.8, a.bus, pan);
      texture(2300, 800, 0.069, 0.035, level, a.bus, pan);
    } else texture(hard ? 1300 : 860, 310, 0, 0.085, level, a.bus, pan);
  }
}
