let ctx,
  muted = false;
try {
  muted =
    typeof window !== 'undefined' &&
    window.localStorage.getItem('gobbler-muted') === '1';
} catch {}
export function isMuted() {
  return muted;
}
export function toggleAudio() {
  muted = !muted;
  try {
    localStorage.setItem('gobbler-muted', muted ? '1' : '0');
  } catch {}
  if (!muted) {
    wakeAudio();
    sound('ready');
  }
  return muted;
}
export function wakeAudio() {
  if (muted) return;
  try {
    ctx ??= new AudioContext();
    ctx.resume().catch(() => {});
  } catch {}
}
function note(freq, end, start, duration, volume, type = 'sine') {
  if (!ctx || muted || ctx.state !== 'running') return;
  const t = ctx.currentTime + start,
    osc = ctx.createOscillator(),
    amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(end, t + duration);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(volume, t + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration);
}
export function sound(event) {
  if (event === 'cast') {
    note(278, 62, 0, 0.14, 0.12, 'triangle');
    note(110, 52, 0.05, 0.18, 0.12);
  }
  if (event === 'catch' || event === 'win') {
    [392, 494, 587, ...(event === 'win' ? [784, 988] : [])].forEach((n, i) =>
      note(n, n * 1.004, i * 0.085, 0.23, 0.09)
    );
  }
  if (event === 'windup') {
    note(240, 440, 0, 0.14, 0.035);
    note(360, 590, 0.2, 0.15, 0.03);
  }
  if (event === 'toss') note(480, 260, 0, 0.2, 0.035, 'triangle');
  if (event === 'splat') note(120, 42, 0, 0.2, 0.07, 'triangle');
  if (event === 'toot') {
    note(99, 62, 0, 0.18, 0.045, 'sawtooth');
    note(86, 49, 0.2, 0.12, 0.035, 'sawtooth');
  }
  if (event === 'bonus' || event === 'heal')
    [440, 554, 740].forEach((f, i) => note(f, f * 1.02, i * 0.08, 0.17, 0.045));
  if (event === 'ready') note(460, 700, 0, 0.12, 0.055);
  if (event === 'flap') note(110, 52, 0, 0.12, 0.055, 'triangle');
}
