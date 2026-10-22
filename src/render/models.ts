// 3D characters (KayKit Adventurers + Skeletons, CC0 by Kay Lousberg).
// All characters share one rig, so the animations live in one file and are reused by every model.
// - Actor: an animated model (player, bosses) with a lower-body layer (legs) and an upper-body layer
//   (arms/attacks), so it can run and swing at the same time.
// - Flipbook: for the many normal enemies — a few frames of the run cycle are baked into plain meshes
//   and drawn instanced (one draw call per frame), which is far cheaper than dozens of animated rigs.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import animsUrl from '../assets/models/anims.glb?url';
import propsUrl from '../assets/models/props.glb?url';
import knightUrl from '../assets/models/Knight.glb?url';
import rogueUrl from '../assets/models/Rogue.glb?url';
import hoodUrl from '../assets/models/Rogue_Hooded.glb?url';
import mageUrl from '../assets/models/Mage.glb?url';
import barbUrl from '../assets/models/Barbarian.glb?url';
import skWarUrl from '../assets/models/Skeleton_Warrior.glb?url';
import skRogUrl from '../assets/models/Skeleton_Rogue.glb?url';
import skMinUrl from '../assets/models/Skeleton_Minion.glb?url';
import skMagUrl from '../assets/models/Skeleton_Mage.glb?url';
import dungeonUrl from '../assets/models/dungeon.glb?url';

export type CharName = 'Knight' | 'Rogue' | 'Rogue_Hooded' | 'Mage' | 'Barbarian' | 'Skeleton_Warrior' | 'Skeleton_Rogue' | 'Skeleton_Minion' | 'Skeleton_Mage';
export type PropName = 'Round_Shield' | '1H_Sword' | '2H_Sword' | '1H_Crossbow' | '2H_Crossbow' | 'Knife' | 'Spellbook_open' | '1H_Wand' | '2H_Staff' | '2H_Axe'
  | 'Skeleton_Blade' | 'Skeleton_Shield_Large_A' | 'Skeleton_Crossbow' | 'Skeleton_Staff' | 'Skeleton_Axe';
export interface Look { char: CharName; right?: PropName | null; left?: PropName | null; height: number }

const CHAR_URLS: Record<CharName, string> = {
  Knight: knightUrl, Rogue: rogueUrl, Rogue_Hooded: hoodUrl, Mage: mageUrl, Barbarian: barbUrl,
  Skeleton_Warrior: skWarUrl, Skeleton_Rogue: skRogUrl, Skeleton_Minion: skMinUrl, Skeleton_Mage: skMagUrl,
};
const UPPER = /^(spine|chest|upperarm|lowerarm|wrist|hand|handslot|head)/;

let chars: Partial<Record<CharName, GLTF>> = {};
let props: Record<string, THREE.Object3D> = {};
let dungeon: Record<string, THREE.Object3D> = {};
let dungeonMap: THREE.Texture | null = null;
let clips: Record<string, { full: THREE.AnimationClip; upper: THREE.AnimationClip; lower: THREE.AnimationClip }> = {};
let loading: Promise<boolean> | null = null;
export let modelsReady = false;
/** Why the models didn't load (shown in Settings), or '' while loading / after success. */
export let modelsError = '';
export const setModelsError = (e: unknown) => { modelsError = String((e as Error)?.message ?? e).slice(0, 160); };

/** Inline (data:) URLs are decoded here instead of fetch(), which some page sandboxes block. */
async function loadGlb(loader: GLTFLoader, url: string): Promise<GLTF> {
  let buf: ArrayBuffer;
  if (url.startsWith('data:')) {
    const b64 = url.slice(url.indexOf(',') + 1);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    buf = bytes.buffer;
  } else {
    buf = await (await fetch(url)).arrayBuffer();
  }
  return loader.parseAsync(buf, '');
}

/** Loads every model once. Resolves false if anything fails (the game keeps its simple shapes). */
export function loadModels(): Promise<boolean> {
  if (loading) return loading;
  loading = (async () => {
    try {
      const loader = new GLTFLoader();
      const names = Object.keys(CHAR_URLS) as CharName[];
      const [anim, prop, dun, ...cs] = await Promise.all([loadGlb(loader, animsUrl), loadGlb(loader, propsUrl), loadGlb(loader, dungeonUrl), ...names.map((n) => loadGlb(loader, CHAR_URLS[n]))]);
      dun.scene.updateMatrixWorld(true);
      for (const o of [...dun.scene.children]) dungeon[o.name] = o;
      names.forEach((n, i) => { chars[n] = cs[i]; });
      for (const c of anim.animations) {
        const nm = c.name.replace(/^.*\|/, '');
        const split = (keep: (bone: string) => boolean) => new THREE.AnimationClip(nm, c.duration, c.tracks.filter((t) => keep(t.name.split('.')[0])));
        clips[nm] = { full: c, upper: split((b) => UPPER.test(b)), lower: split((b) => !UPPER.test(b)) };
      }
      prop.scene.updateMatrixWorld(true);
      for (const o of [...prop.scene.children]) props[o.name] = o;
      for (const g of [prop, dun, ...cs]) g.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (m && m.map) { m.map.colorSpace = THREE.SRGBColorSpace; if (g === dun) dungeonMap = m.map; }
      });
      modelsReady = true;
      return true;
    } catch (err) {
      console.warn('models failed to load', err);
      modelsError = String((err as Error)?.message ?? err).slice(0, 160);
      chars = {}; props = {}; clips = {}; dungeon = {};
      return false;
    }
  })();
  return loading;
}

/** A fresh copy of a character with its hand props attached, scaled so it is `height` tall. */
function build(look: Look): THREE.Group {
  const src = chars[look.char]!;
  const model = skClone(src.scene) as THREE.Group;
  const attach = (slot: string, name: PropName | null | undefined) => {
    if (!name || !props[name]) return;
    const bone = model.getObjectByName(slot);
    if (bone) bone.add(props[name].clone());
  };
  attach('handslotr', look.right);
  attach('handslot.r', look.right);
  attach('handslotl', look.left);
  attach('handslot.l', look.left);
  // KayKit characters are ~2.4 units tall in bind pose
  const s = look.height / 2.4;
  const g = new THREE.Group();
  model.scale.setScalar(s);
  g.add(model);
  return g;
}

const recolorCache = new Map<string, THREE.Texture>();
/** A copy of a texture run through a CSS filter (e.g. 'hue-rotate(150deg) brightness(0.7)'). */
function recolor(tex: THREE.Texture, filter: string): THREE.Texture {
  const key = tex.uuid + filter;
  const hit = recolorCache.get(key);
  if (hit) return hit;
  try {
    const img = tex.image as CanvasImageSource & { width: number; height: number };
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext('2d')!;
    if (filter === 'necro') {
      // only the green cloth turns dark purple; skin, leather and metal keep their colours
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, cv.width, cv.height);
      const px = d.data;
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i], g = px[i + 1], b = px[i + 2];
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        if (max - min < 25 || g !== max) continue; // grey or not green
        const k = (max - min) / max;
        px[i] = Math.round(g * 0.62); px[i + 1] = Math.round(min * 0.6 + g * 0.12 * (1 - k)); px[i + 2] = Math.round(g * 0.78);
      }
      ctx.putImageData(d, 0, 0);
    } else {
      ctx.filter = filter;
      ctx.drawImage(img, 0, 0);
    }
    const out = new THREE.CanvasTexture(cv);
    out.flipY = tex.flipY;
    out.colorSpace = tex.colorSpace;
    out.magFilter = tex.magFilter; out.minFilter = tex.minFilter;
    recolorCache.set(key, out);
    return out;
  } catch { return tex; }
}

type Layer = { cur: THREE.AnimationAction | null; name: string };

/** An animated character: run/idle on the legs, idle/run/attack on the arms. */
export class Actor {
  readonly root: THREE.Group;
  private mixer: THREE.AnimationMixer;
  private lower: Layer = { cur: null, name: '' };
  private upper: Layer = { cur: null, name: '' };
  private oneShot = 0; // seconds left of an attack/hit on the upper layer
  private dead = false;
  private mats: THREE.MeshLambertMaterial[] = [];
  private baseColors: THREE.Color[] = [];

  constructor(look: Look, opts: { tint?: number; emissive?: number; hue?: string } = {}) {
    this.root = build(look);
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      const src = mesh.material as THREE.MeshStandardMaterial;
      // Lambert: cheaper on phones and matches the baked crowd models
      const m = new THREE.MeshLambertMaterial({ map: opts.hue && src.map ? recolor(src.map, opts.hue) : src.map, color: src.color.clone() });
      if (opts.tint !== undefined) m.color.multiply(new THREE.Color(opts.tint));
      if (opts.emissive !== undefined) m.emissive.setHex(opts.emissive);
      mesh.material = m;
      this.mats.push(m);
      this.baseColors.push(m.emissive.clone());
    });
    this.mixer = new THREE.AnimationMixer(this.root.children[0]);
    this.setLayer(this.lower, 'Idle', 'lower', 0);
    this.setLayer(this.upper, 'Idle', 'upper', 0);
  }

  private setLayer(layer: Layer, name: string, part: 'upper' | 'lower', fade = 0.15, once = false, speed = 1): void {
    const c = clips[name];
    if (!c) return;
    if (layer.name === name && !once) return;
    const act = this.mixer.clipAction(c[part]);
    act.reset();
    act.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    act.clampWhenFinished = once;
    act.timeScale = speed;
    act.play();
    if (layer.cur && layer.cur !== act) layer.cur.crossFadeTo(act, fade, false);
    layer.cur = act;
    layer.name = name;
  }

  /** Attack / cast / shoot on the arms (legs keep running). */
  attack(kind: 'chop' | 'shoot' | 'cast' | 'spin' | 'punch', interval = 0.6): void {
    if (this.dead) return;
    const name = kind === 'chop' ? '1H_Melee_Attack_Chop' : kind === 'shoot' ? '1H_Ranged_Shoot' : kind === 'cast' ? 'Spellcast_Shoot' : kind === 'spin' ? '2H_Melee_Attack_Spin' : 'Unarmed_Melee_Attack_Punch_A';
    const c = clips[name];
    if (!c) return;
    // play the swing fast enough to fit the attack speed (never slower than the clip)
    const dur = Math.min(c.full.duration, Math.max(0.25, interval * 0.95));
    const speed = c.full.duration / dur;
    this.setLayer(this.upper, name, 'upper', 0.06, true, speed);
    this.oneShot = dur;
  }

  hit(): void {
    if (this.dead || this.oneShot > 0) return;
    this.setLayer(this.upper, 'Hit_A', 'upper', 0.05, true, 1.6);
    this.oneShot = (clips.Hit_A?.full.duration ?? 0.5) / 1.6;
  }

  die(): void {
    if (this.dead) return;
    this.dead = true;
    this.setLayer(this.lower, 'Death_A', 'lower', 0.1, true);
    this.setLayer(this.upper, 'Death_A', 'upper', 0.1, true);
  }

  cheer(): void {
    this.setLayer(this.lower, 'Cheer', 'lower', 0.2);
    this.setLayer(this.upper, 'Cheer', 'upper', 0.2);
    this.oneShot = 99;
  }

  revive(): void {
    this.dead = false;
    this.oneShot = 0;
    this.lower.name = ''; this.upper.name = '';
    this.setLayer(this.lower, 'Idle', 'lower', 0.1);
    this.setLayer(this.upper, 'Idle', 'upper', 0.1);
  }

  /** Hang a prop on a bone (e.g. a third sword in the mouth, a crossbow on the back). */
  attach(bone: string, prop: PropName, o: { pos?: [number, number, number]; rot?: [number, number, number]; scale?: number } = {}): THREE.Object3D | null {
    const b = this.root.getObjectByName(bone) ?? this.root.getObjectByName(bone.replace('.', ''));
    const src = props[prop];
    if (!b || !src) return null;
    const c = src.clone();
    c.position.set(...(o.pos ?? [0, 0, 0]));
    c.rotation.set(...(o.rot ?? [0, 0, 0]));
    c.scale.setScalar(o.scale ?? 1);
    c.traverse((x) => { const m = x as THREE.Mesh; if (m.isMesh) { m.frustumCulled = false; m.material = new THREE.MeshLambertMaterial({ map: (m.material as THREE.MeshStandardMaterial).map }); } });
    b.add(c);
    return c;
  }

  /** A plain copy of a prop (for floating extras). */
  static prop(name: PropName): THREE.Object3D | null {
    const src = props[name];
    if (!src) return null;
    const c = src.clone();
    c.position.set(0, 0, 0); c.rotation.set(0, 0, 0);
    c.traverse((x) => { const m = x as THREE.Mesh; if (m.isMesh) { m.frustumCulled = false; m.material = new THREE.MeshLambertMaterial({ map: (m.material as THREE.MeshStandardMaterial).map }); } });
    return c;
  }

  /** Flash / glow: hex color added as emissive (0 = back to normal). */
  flash(hex: number): void {
    this.mats.forEach((m, i) => { if (hex) m.emissive.setHex(hex); else m.emissive.copy(this.baseColors[i]); });
  }

  update(dt: number, moving: boolean, runSpeed = 1): void {
    if (!this.dead) {
      const base = moving ? 'Running_A' : 'Idle';
      this.setLayer(this.lower, base, 'lower');
      if (this.lower.cur) this.lower.cur.timeScale = moving ? runSpeed : 1;
      if (this.oneShot > 0) { this.oneShot -= dt; if (this.oneShot <= 0) this.setLayer(this.upper, base, 'upper', 0.12); }
      else this.setLayer(this.upper, base, 'upper');
    }
    this.mixer.update(dt);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    for (const m of this.mats) m.dispose();
  }
}

// ---------- flipbook (baked run cycle for crowds) ----------
export interface Flipbook { frames: THREE.BufferGeometry[]; material: THREE.Material[]; duration: number }
const FRAMES = 8;
const flipCache = new Map<string, Flipbook>();

/** Bakes `frames` poses of an animation into static meshes (one group per texture). */
export function flipbook(look: Look, clipName = 'Running_A', frames = FRAMES): Flipbook | null {
  const key = `${look.char}|${look.right}|${look.left}|${look.height}|${clipName}|${frames}`;
  const hit = flipCache.get(key);
  if (hit) return hit;
  if (!chars[look.char] || !clips[clipName]) return null;
  const g = build(look);
  const model = g.children[0];
  const mixer = new THREE.AnimationMixer(model);
  mixer.clipAction(clips[clipName].full).play();
  const dur = clips[clipName].full.duration;
  const maps: (THREE.Texture | null)[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const v = new THREE.Vector3(), n = new THREE.Vector3(), acc = new THREE.Vector3(), accN = new THREE.Vector3(), tv = new THREE.Vector3();
  const skinIdx = new THREE.Vector4(), skinW = new THREE.Vector4();
  const nm = new THREE.Matrix3();
  for (let f = 0; f < frames; f++) {
    mixer.setTime((f / frames) * dur);
    g.updateMatrixWorld(true);
    const buckets = new Map<THREE.Texture | null, { pos: number[]; nor: number[]; uv: number[] }>();
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      const tex = mat.map ?? null;
      if (!buckets.has(tex)) buckets.set(tex, { pos: [], nor: [], uv: [] });
      const b = buckets.get(tex)!;
      const geo = mesh.geometry;
      const P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv;
      const SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight;
      const sk = (mesh as THREE.SkinnedMesh).isSkinnedMesh ? (mesh as THREE.SkinnedMesh) : null;
      // per-bone matrices straight to world space
      let mats: THREE.Matrix4[] = [];
      if (sk) {
        sk.skeleton.update();
        mats = sk.skeleton.bones.map((bone, j) => new THREE.Matrix4()
          .multiplyMatrices(sk.matrixWorld, sk.bindMatrixInverse)
          .multiply(bone.matrixWorld).multiply(sk.skeleton.boneInverses[j]).multiply(sk.bindMatrix));
      }
      const idx = geo.index;
      const cnt = idx ? idx.count : P.count;
      nm.getNormalMatrix(mesh.matrixWorld);
      for (let k = 0; k < cnt; k++) {
        const i = idx ? idx.getX(k) : k;
        v.fromBufferAttribute(P, i);
        if (N) n.fromBufferAttribute(N, i); else n.set(0, 1, 0);
        if (sk && SI && SW) {
          skinIdx.fromBufferAttribute(SI as THREE.BufferAttribute, i); skinW.fromBufferAttribute(SW as THREE.BufferAttribute, i);
          acc.set(0, 0, 0); accN.set(0, 0, 0);
          for (let c = 0; c < 4; c++) {
            const w = skinW.getComponent(c);
            if (w === 0) continue;
            const m = mats[skinIdx.getComponent(c)];
            acc.addScaledVector(tv.copy(v).applyMatrix4(m), w);
            accN.addScaledVector(tv.copy(n).transformDirection(m), w);
          }
          v.copy(acc); n.copy(accN).normalize();
        } else {
          v.applyMatrix4(mesh.matrixWorld);
          n.applyMatrix3(nm).normalize();
        }
        b.pos.push(v.x, v.y, v.z);
        b.nor.push(n.x, n.y, n.z);
        if (U) b.uv.push(U.getX(i), U.getY(i)); else b.uv.push(0, 0);
      }
    });
    const pos: number[] = [], nor: number[] = [], uv: number[] = [];
    const out = new THREE.BufferGeometry();
    let start = 0;
    for (const [tex, b] of buckets) {
      let mi = maps.indexOf(tex);
      if (mi < 0) { maps.push(tex); mi = maps.length - 1; }
      for (const x of b.pos) pos.push(x);
      for (const x of b.nor) nor.push(x);
      for (const x of b.uv) uv.push(x);
      out.addGroup(start, b.pos.length / 3, mi);
      start += b.pos.length / 3;
    }
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    out.computeBoundingSphere();
    geos.push(out);
  }
  mixer.stopAllAction();
  const material = maps.map((map) => new THREE.MeshLambertMaterial({ map, color: 0xffffff }));
  const fb = { frames: geos, material, duration: dur };
  flipCache.set(key, fb);
  return fb;
}

// ---------- dungeon pieces (floor, walls, pillars, decor) ----------
export type DungeonPiece = 'floor_tile_large' | 'floor_tile_large_rocks' | 'floor_dirt_large' | 'floor_dirt_large_rocky' | 'wall' | 'wall_cracked' | 'wall_window_closed' | 'wall_corner'
  | 'barrier_column' | 'pillar' | 'pillar_decorated' | 'torch_mounted' | 'barrel_large' | 'barrel_small' | 'crates_stacked' | 'box_small' | 'rubble_half'
  | 'banner_red' | 'banner_blue' | 'banner_green' | 'banner_white' | 'banner_yellow' | 'candle_triple';
const pieceCache = new Map<string, THREE.BufferGeometry>();
/** One dungeon piece as a single plain geometry (position / normal / uv), ready for instancing. */
export function dungeonGeo(name: DungeonPiece): THREE.BufferGeometry | null {
  const hit = pieceCache.get(name);
  if (hit) return hit;
  const root = dungeon[name];
  if (!root) return null;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const m = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
    nm.getNormalMatrix(m);
    const g = mesh.geometry, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, idx = g.index;
    const n = idx ? idx.count : P.count;
    for (let k = 0; k < n; k++) {
      const i = idx ? idx.getX(k) : k;
      v.fromBufferAttribute(P, i).applyMatrix4(m); pos.push(v.x, v.y, v.z);
      if (N) { v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z); } else nor.push(0, 1, 0);
      if (U) uv.push(U.getX(i), U.getY(i)); else uv.push(0, 0);
    }
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  pieceCache.set(name, out);
  return out;
}
export const dungeonTexture = () => dungeonMap;
