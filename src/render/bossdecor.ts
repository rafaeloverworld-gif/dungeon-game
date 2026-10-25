// Boss looks: on top of the KayKit character, procedural extras (horns, crowns, spikes, wings, glowing eyes,
// orbiting crystals), a ground aura that flares when the boss winds up, and embers rising around it.
import * as THREE from 'three';
import type { Look } from './models';

export type BossStyle = {
  look: Omit<Look, 'height'>;
  tint?: number; hue?: string;
  aura: number; // ground ring colour
  eyes: number;
  horns?: { color: number; size: number };
  crown?: { color: number; n: number; glow?: boolean; y?: number };
  spikes?: { color: number; n: number };
  wings?: { color: number; edge: number };
  orbit?: { color: number; n: number; shape: 'shard' | 'skull' | 'ember' };
  embers?: number;
  hide?: string[]; // model parts to hide (e.g. a hat under a crown)
};

/** Mini bosses: three looks picked by id; bosses: by biome; world bosses: their own. */
export function bossStyle(kind: 'miniboss' | 'boss' | 'worldboss', id: number, theme: number, wb: string | null): BossStyle {
  if (kind === 'worldboss') {
    if (wb === 'frostQueen') return { look: { char: 'Mage', right: '2H_Staff' }, tint: 0xc8e6ff, aura: 0x7fd8ff, eyes: 0xbff4ff,
      crown: { color: 0x9fe8ff, n: 7, glow: true, y: 0.8 }, orbit: { color: 0xbff4ff, n: 6, shape: 'shard' }, embers: 0xdff6ff, hide: ['Mage_Hat'] };
    if (wb === 'lavaDragon') return { look: { char: 'Barbarian', right: '2H_Axe' }, hue: 'hue-rotate(-25deg) saturate(1.6) brightness(0.55)', aura: 0xff6a1a, eyes: 0xffb21a,
      horns: { color: 0x2a1410, size: 1.5 }, wings: { color: 0x5a1408, edge: 0xff6a1a }, orbit: { color: 0xff8a2a, n: 5, shape: 'ember' }, embers: 0xff7a2a, hide: ['Barbarian_Hat'] };
    return { look: { char: 'Skeleton_Warrior', right: 'Skeleton_Axe', left: 'Skeleton_Shield_Large_A' }, tint: 0xf2ead8, aura: 0x8fe36b, eyes: 0x8fff5a,
      crown: { color: 0xe8dcc0, n: 9 }, spikes: { color: 0xe8dcc0, n: 7 }, orbit: { color: 0xd8f0c0, n: 4, shape: 'skull' }, embers: 0x9fff7a, hide: ['Skeleton_Warrior_Helmet'] };
  }
  if (kind === 'boss') {
    const v = theme % 3;
    if (v === 1) return { look: { char: 'Knight', right: '2H_Sword' }, tint: 0x6a5a78, aura: 0xd8304a, eyes: 0xff3a3a, horns: { color: 0x1a1418, size: 1.1 }, spikes: { color: 0x2a2228, n: 5 }, embers: 0xff4a3a };
    if (v === 2) return { look: { char: 'Barbarian', right: '2H_Axe' }, tint: 0x9a6a6a, aura: 0xd8304a, eyes: 0xff3a3a, horns: { color: 0xeadfc8, size: 1.3 }, wings: { color: 0x2a0d12, edge: 0xd8304a }, embers: 0xff4a3a, hide: ['Barbarian_Hat'] };
    return { look: { char: 'Skeleton_Warrior', right: 'Skeleton_Axe', left: 'Skeleton_Shield_Large_A' }, tint: 0xff9a9a, aura: 0xd8304a, eyes: 0xff3a3a, crown: { color: 0xffc23a, n: 5, glow: true }, spikes: { color: 0xd8c8b0, n: 5 }, embers: 0xff4a3a };
  }
  const v = id % 3;
  if (v === 1) return { look: { char: 'Knight', right: '2H_Sword' }, aura: 0xffb23a, eyes: 0xffd86b, spikes: { color: 0x8a7a6a, n: 3 } };
  if (v === 2) return { look: { char: 'Rogue_Hooded', right: 'Knife', left: 'Knife' }, tint: 0x8a8aa8, aura: 0xffb23a, eyes: 0xffd86b, orbit: { color: 0xffd86b, n: 3, shape: 'ember' } };
  return { look: { char: 'Barbarian', right: '2H_Axe' }, aura: 0xffb23a, eyes: 0xffd86b, horns: { color: 0xe8dcc0, size: 0.9 } };
}

/** 熔岩魔龍 with the real dragon model: the model has its own wings and horns; add the lava aura, embers and fireballs. */
export function dragonStyle(): BossStyle {
  return { look: { char: 'Barbarian' }, tint: 0xffc0a0, aura: 0xff6a1a, eyes: 0xffb21a, orbit: { color: 0xff8a2a, n: 5, shape: 'ember' }, embers: 0xff7a2a };
}

const glow = (color: number, op = 1) => new THREE.MeshBasicMaterial({ color, transparent: op < 1, opacity: op, depthWrite: op >= 1 });
const solid = (color: number) => new THREE.MeshLambertMaterial({ color });

export class BossDecor {
  readonly ground = new THREE.Group();
  private ring1: THREE.Mesh; private ring2: THREE.Mesh; private rune: THREE.Mesh;
  private orbit = new THREE.Group();
  private wingL: THREE.Object3D | null = null; private wingR: THREE.Object3D | null = null;
  private embers: THREE.Points | null = null; private emberV: Float32Array | null = null;
  private eyes: THREE.MeshBasicMaterial | null = null;
  private auraCol: THREE.Color; private t = Math.random() * 10;
  private disposables: { dispose(): void }[] = [];

  constructor(model: THREE.Object3D, private style: BossStyle, private height: number, radius: number) {
    const keep = <T extends { dispose(): void }>(x: T) => { this.disposables.push(x); return x; };
    this.auraCol = new THREE.Color(style.aura);
    for (const n of style.hide ?? []) { const o = model.getObjectByName(n); if (o) o.visible = false; }
    const bone = (n: string) => model.getObjectByName(n) ?? model.getObjectByName(n.replace('.', ''));
    const head = bone('head'), chest = bone('chest');
    // glowing eyes (head bone space: KayKit heads are about 1 unit wide, face towards +z)
    if (head && !style.look.char.startsWith('Skeleton')) {
      this.eyes = keep(glow(style.eyes));
      const g = keep(new THREE.SphereGeometry(0.07, 8, 6));
      for (const sx of [-0.2, 0.2]) { const e = new THREE.Mesh(g, this.eyes); e.position.set(sx, 0.55, 0.52); head.add(e); }
    } else if (head) { // skeletons: light up the eye sockets
      this.eyes = keep(glow(style.eyes));
      const g = keep(new THREE.SphereGeometry(0.11, 8, 6));
      for (const sx of [-0.19, 0.19]) { const e = new THREE.Mesh(g, this.eyes); e.position.set(sx, 0.5, 0.42); head.add(e); }
    }
    if (head && style.horns) {
      const m = keep(solid(style.horns.color)), s = style.horns.size;
      const g = keep(new THREE.ConeGeometry(0.16 * s, 0.9 * s, 8));
      for (const sx of [-1, 1]) {
        const h = new THREE.Mesh(g, m);
        h.position.set(0.45 * sx, 1.05, 0.05); h.rotation.set(-0.25, 0, -0.75 * sx);
        const tip = new THREE.Mesh(g, m); tip.scale.setScalar(0.55); tip.position.set(0.12 * sx, 0.55, -0.1); tip.rotation.set(-0.5, 0, 0.7 * sx);
        h.add(tip); head.add(h);
      }
    }
    if (head && style.crown) {
      const m = keep(style.crown.glow ? glow(style.crown.color) : solid(style.crown.color));
      const band = new THREE.Mesh(keep(new THREE.TorusGeometry(0.5, 0.06, 6, 24)), m);
      const cy = style.crown.y ?? 1.05;
      band.rotation.x = Math.PI / 2; band.position.y = cy; head.add(band);
      const g = keep(new THREE.ConeGeometry(0.09, 0.42, 5));
      for (let i = 0; i < style.crown.n; i++) {
        const a = (i / style.crown.n) * Math.PI * 2, tall = i % 2 ? 0.75 : 1.15;
        const p = new THREE.Mesh(g, m); p.scale.set(1, tall, 1);
        p.position.set(Math.sin(a) * 0.5, cy + 0.2 * tall, Math.cos(a) * 0.5); p.rotation.set(Math.cos(a) * -0.2, 0, Math.sin(a) * 0.2); head.add(p);
      }
    }
    if (chest && style.spikes) {
      const m = keep(solid(style.spikes.color)), g = keep(new THREE.ConeGeometry(0.12, 0.7, 6));
      for (let i = 0; i < style.spikes.n; i++) {
        const k = i - (style.spikes.n - 1) / 2;
        const sp = new THREE.Mesh(g, m); sp.position.set(k * 0.22, 0.55 + Math.abs(k) * -0.06, -0.45); sp.rotation.set(-1.0, 0, -k * 0.25); sp.scale.setScalar(1 - Math.abs(k) * 0.12); chest.add(sp);
      }
      // shoulder spikes
      for (const sx of [-1, 1]) { const sp = new THREE.Mesh(g, m); sp.position.set(0.62 * sx, 0.62, 0); sp.rotation.set(0, 0, -0.9 * sx); chest.add(sp); }
    }
    if (chest && style.wings) {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0); shape.lineTo(1.9, 0.9); shape.lineTo(1.6, 0.2); shape.lineTo(2.1, -0.3); shape.lineTo(1.3, -0.35); shape.lineTo(1.5, -0.9); shape.lineTo(0.6, -0.5); shape.lineTo(0, -0.3);
      const g = keep(new THREE.ShapeGeometry(shape));
      const m = keep(new THREE.MeshLambertMaterial({ color: style.wings.color, side: THREE.DoubleSide }));
      const edge = keep(new THREE.LineBasicMaterial({ color: style.wings.edge }));
      const eg = keep(new THREE.EdgesGeometry(g));
      for (const sx of [-1, 1]) {
        const pivot = new THREE.Group(); pivot.position.set(0.18 * sx, 0.5, -0.4);
        const w = new THREE.Mesh(g, m); w.scale.set(sx, 1, 1); w.rotation.y = 0.35 * sx;
        w.add(new THREE.LineSegments(eg, edge));
        pivot.add(w); chest.add(pivot);
        if (sx < 0) this.wingL = pivot; else this.wingR = pivot;
      }
    }
    // ground aura: two rings and a slowly turning rune
    const r = radius * 1.6 + 0.6;
    const ringMat = (op: number) => keep(new THREE.MeshBasicMaterial({ color: style.aura, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    const rg = keep(new THREE.RingGeometry(r * 0.9, r, 48)); rg.rotateX(-Math.PI / 2);
    this.ring1 = new THREE.Mesh(rg, ringMat(0.55)); this.ring1.position.y = 0.12;
    const rg2 = keep(new THREE.RingGeometry(r * 1.12, r * 1.18, 48)); rg2.rotateX(-Math.PI / 2);
    this.ring2 = new THREE.Mesh(rg2, ringMat(0.35)); this.ring2.position.y = 0.11;
    const ru = keep(new THREE.RingGeometry(r * 0.55, r * 0.62, 6, 1)); ru.rotateX(-Math.PI / 2);
    this.rune = new THREE.Mesh(ru, ringMat(0.4)); this.rune.position.y = 0.13;
    const pool = keep(new THREE.CircleGeometry(r, 32)); pool.rotateX(-Math.PI / 2);
    const shadow = new THREE.Mesh(pool, keep(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }))); shadow.position.y = 0.1;
    this.ground.add(shadow, this.ring1, this.ring2, this.rune);
    // orbiting crystals / skulls / embers
    if (style.orbit) {
      const o = style.orbit;
      const g = keep(o.shape === 'shard' ? new THREE.OctahedronGeometry(0.28, 0) : o.shape === 'skull' ? new THREE.DodecahedronGeometry(0.3, 0) : new THREE.IcosahedronGeometry(0.2, 0));
      const m = keep(glow(o.color, 0.9));
      for (let i = 0; i < o.n; i++) {
        const c = new THREE.Mesh(g, m); const a = (i / o.n) * Math.PI * 2;
        c.position.set(Math.sin(a) * r * 0.95, height * (0.45 + 0.15 * (i % 2)), Math.cos(a) * r * 0.95); if (o.shape === 'shard') c.scale.set(0.7, 1.6, 0.7);
        this.orbit.add(c);
      }
      this.ground.add(this.orbit);
    }
    // embers rising around the boss
    if (style.embers !== undefined) {
      const n = 28, pos = new Float32Array(n * 3); this.emberV = new Float32Array(n);
      for (let i = 0; i < n; i++) this.respawn(pos, i, r, Math.random() * height);
      const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.embers = new THREE.Points(g, keep(new THREE.PointsMaterial({ color: style.embers, size: 0.18, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending })));
      this.embers.frustumCulled = false;
      this.ground.add(this.embers);
    }
    this.r = r;
  }
  private r: number;

  private respawn(pos: Float32Array, i: number, r: number, y = 0): void {
    const a = Math.random() * Math.PI * 2, d = r * (0.3 + Math.random() * 0.8);
    pos[i * 3] = Math.sin(a) * d; pos[i * 3 + 1] = y; pos[i * 3 + 2] = Math.cos(a) * d;
    this.emberV![i] = 0.8 + Math.random() * 1.4;
  }

  /** windUp: the boss is about to charge / cast (aura flares red); enraged: world boss last phase. */
  update(dt: number, windUp: boolean, enraged: boolean): void {
    this.t += dt;
    const t = this.t, pulse = 0.5 + 0.5 * Math.sin(t * 3);
    const hot = windUp || enraged;
    const col = hot ? new THREE.Color(0xff2a2a).lerp(this.auraCol, windUp ? 0.15 * pulse : 0.45) : this.auraCol;
    for (const m of [this.ring1, this.ring2, this.rune]) (m.material as THREE.MeshBasicMaterial).color.copy(col);
    (this.ring1.material as THREE.MeshBasicMaterial).opacity = (windUp ? 0.8 : 0.4) + 0.2 * pulse;
    this.ring1.scale.setScalar(windUp ? 1 + 0.12 * Math.sin(t * 18) : 1 + 0.04 * pulse);
    this.ring2.rotation.y = -t * 0.4;
    this.rune.rotation.y = t * (windUp ? 2.5 : 0.6);
    this.orbit.rotation.y = t * 1.1;
    this.orbit.children.forEach((c, i) => { c.rotation.y = t * 2 + i; c.position.y = this.height * (0.45 + 0.12 * Math.sin(t * 2 + i)); });
    if (this.eyes) this.eyes.color.setHex(windUp && pulse > 0.5 ? 0xffffff : this.style.eyes);
    if (this.wingL && this.wingR) { const f = Math.sin(t * (enraged ? 7 : 3.5)) * 0.35; this.wingL.rotation.y = -f; this.wingR.rotation.y = f; }
    if (this.embers && this.emberV) {
      const pos = this.embers.geometry.getAttribute('position') as THREE.BufferAttribute, a = pos.array as Float32Array;
      for (let i = 0; i < this.emberV.length; i++) {
        a[i * 3 + 1] += this.emberV[i] * dt * (enraged ? 2 : 1);
        a[i * 3] += Math.sin(t * 2 + i) * dt * 0.2;
        if (a[i * 3 + 1] > this.height * 1.3) this.respawn(a, i, this.r);
      }
      pos.needsUpdate = true;
    }
  }

  dispose(): void { for (const d of this.disposables) d.dispose(); }
}
