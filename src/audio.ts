import { tr } from './i18n';
// Sound: every effect is synthesized with WebAudio (no files to download), plus a small procedural
// dungeon loop. Settings (sound / music / damage numbers) live in localStorage, like the language.
type Sfx = 'hit' | 'crit' | 'kill' | 'bigKill' | 'explode' | 'coin' | 'levelup' | 'boss' | 'hurt' | 'chest' | 'zap' | 'wave' | 'warn' | 'win' | 'lose' | 'click';

const KEY = 'website-game-fx';
interface FxPrefs { sfx: boolean; music: boolean; numbers: boolean; sfxVol: number; musicVol: number }
export const prefs: FxPrefs = (() => {
  const d = { sfx: true, music: true, numbers: true, sfxVol: 0.8, musicVol: 0.8 };
  try { return { ...d, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return d; }
})();
const savePrefs = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* blocked */ } };
export function setPref(k: 'sfx' | 'music' | 'numbers', v: boolean): void {
  prefs[k] = v;
  savePrefs();
  if (k === 'music') { if (v) startMusic(); else stopMusic(); }
}
/** Volume 0..1 for effects or music (0 also switches it off, anything above switches it on). */
export function setVolume(k: 'sfxVol' | 'musicVol', v: number): void {
  prefs[k] = Math.max(0, Math.min(1, v));
  const on = prefs[k] > 0;
  if (k === 'musicVol') { if (musicBus) musicBus.gain.value = 0.16 * prefs.musicVol; if (on !== prefs.music) setPref('music', on); }
  else { if (sfxBus) sfxBus.gain.value = prefs.sfxVol; if (on !== prefs.sfx) prefs.sfx = on; }
  savePrefs();
}

/** Sound settings block (sliders + mute buttons), used on the Settings tab, the home screen and the pause menu. */
export function audioControlsHtml(): string {
  const row = (k: 'sfxVol' | 'musicVol', icon: string, name: string) => `<label class="volrow"><span>${icon} ${name}</span><input type="range" min="0" max="100" step="5" value="${Math.round(prefs[k] * 100)}" data-vol="${k}"><b>${Math.round(prefs[k] * 100)}</b></label>`;
  return `<div class="audioctl">${row('musicVol', '🎵', tr('音樂', 'Music'))}${row('sfxVol', '🔊', tr('音效', 'Effects'))}</div>`;
}
export function wireAudioControls(root: HTMLElement): void {
  root.addEventListener('input', (ev) => {
    const t = ev.target as HTMLInputElement;
    if (!t.dataset.vol) return;
    unlockAudio();
    setVolume(t.dataset.vol as 'sfxVol' | 'musicVol', Number(t.value) / 100);
    const b = t.parentElement?.querySelector('b'); if (b) b.textContent = t.value;
    if (t.dataset.vol === 'sfxVol') play('click');
  });
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
let sfxBus: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

/** Browsers only allow sound after a tap: call this from the first pointer event. */
export function unlockAudio(): void {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      musicBus = ctx.createGain(); musicBus.gain.value = 0.16 * prefs.musicVol; musicBus.connect(master);
      sfxBus = ctx.createGain(); sfxBus.gain.value = prefs.sfxVol; sfxBus.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { ctx = null; }
}

const last: Partial<Record<Sfx, number>> = {};
const GAP: Partial<Record<Sfx, number>> = { hit: 0.05, crit: 0.06, kill: 0.04, coin: 0.06, explode: 0.08, zap: 0.08, hurt: 0.15 };

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0): void {
  if (!ctx || !sfxBus) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(sfxBus);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number, freq: number, q = 1, delay = 0): void {
  if (!ctx || !sfxBus || !noiseBuf) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.2), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(sfxBus);
  s.start(t); s.stop(t + dur + 0.02);
}

export function play(s: Sfx): void {
  if (!prefs.sfx || !ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  if (now - (last[s] ?? -1) < (GAP[s] ?? 0.02)) return;
  last[s] = now;
  switch (s) {
    case 'hit': noise(0.05, 0.12, 2400); break;
    case 'crit': noise(0.07, 0.18, 4000); tone(880, 0.08, 'square', 0.05, 1320); break;
    case 'kill': tone(520, 0.07, 'triangle', 0.08, 260); break;
    case 'bigKill': noise(0.6, 0.4, 900); tone(140, 0.6, 'sawtooth', 0.15, 50); tone(660, 0.4, 'triangle', 0.1, 990, 0.1); break;
    case 'explode': noise(0.35, 0.28, 1200); tone(90, 0.3, 'sine', 0.2, 40); break;
    case 'coin': tone(1320, 0.06, 'square', 0.035); tone(1760, 0.08, 'square', 0.035, undefined, 0.05); break;
    case 'levelup': [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'triangle', 0.1, undefined, i * 0.07)); break;
    case 'boss': tone(110, 0.9, 'sawtooth', 0.14, 82); tone(165, 0.9, 'sawtooth', 0.08, 123); break;
    case 'hurt': tone(180, 0.15, 'square', 0.12, 90); noise(0.1, 0.1, 600); break;
    case 'chest': [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.2, 'sine', 0.09, undefined, i * 0.06)); break;
    case 'zap': noise(0.12, 0.12, 6000, 8); tone(1600, 0.1, 'sawtooth', 0.04, 400); break;
    case 'wave': noise(0.8, 0.25, 3000); tone(220, 0.7, 'sine', 0.12, 880); break;
    case 'warn': tone(440, 0.12, 'square', 0.05); tone(440, 0.12, 'square', 0.05, undefined, 0.18); break;
    case 'win': [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.3, 'triangle', 0.1, undefined, i * 0.1)); break;
    case 'lose': [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'triangle', 0.09, undefined, i * 0.15)); break;
    case 'click': tone(900, 0.03, 'square', 0.03); break;
  }
}

// ---------- music: a slow minor loop (bass + arpeggio), a bit tenser during boss fights ----------
let musicTimer: number | null = null;
let step = 0;
let tense = false;
export const setTense = (v: boolean) => { tense = v; };
const ROOTS = [57, 53, 55, 52]; // A F G E (midi)
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

function musicNote(freq: number, dur: number, type: OscillatorType, vol: number): void {
  if (!ctx || !musicBus) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(musicBus);
  o.start(t); o.stop(t + dur + 0.05);
}

export function startMusic(): void {
  if (!prefs.music || musicTimer !== null || !ctx) return;
  const beat = () => {
    if (!ctx || ctx.state !== 'running') return;
    const bar = Math.floor(step / 8) % ROOTS.length, i = step % 8;
    const root = ROOTS[bar];
    if (i === 0 || (tense && i === 4)) musicNote(midi(root - 24), 0.9, 'triangle', 0.5);
    const arp = [0, 3, 7, 12, 7, 3, 7, 10];
    if (tense || i % 2 === 0) musicNote(midi(root + arp[i]), 0.35, tense ? 'sawtooth' : 'sine', tense ? 0.12 : 0.18);
    step++;
  };
  musicTimer = window.setInterval(beat, 260);
}
export function stopMusic(): void {
  if (musicTimer !== null) { clearInterval(musicTimer); musicTimer = null; }
}
