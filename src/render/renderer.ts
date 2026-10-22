// Draws the simulation with Three.js. Reads Sim state, never changes it.
// Characters are KayKit models (see models.ts); simple shapes are the fallback while they load.
import * as THREE from 'three';
import { ARENA_HALF, isBigKind, SMALL_KINDS, type SmallKind } from '../sim/config';
import type { Enemy, FxKind, Sim, SimEvent } from '../sim/sim';

/** Merge simple non-indexed geometries into one (for instanced shapes made of parts). */
function mergeGeos(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const pos: number[] = [], nor: number[] = [];
  for (const g of parts) { pos.push(...(g.getAttribute('position').array as Float32Array)); nor.push(...(g.getAttribute('normal').array as Float32Array)); }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}

const ENEMY_COLORS: Record<SmallKind, number> = { grunt: 0xc0563f, shooter: 0x9a5cd6, swarm: 0x9ccf3f, bomber: 0xff7a2a, shield: 0x7d8aa6, healer: 0x5fd08a };
const HALF_HEIGHT: Record<SmallKind, number> = { grunt: 0.48, shooter: 0.6, swarm: 0.3, bomber: 0.45, shield: 0.53, healer: 0.55 };
/** Elites: gold, with a hint of their trait. */
const ELITE_COLORS = { swift: 0xffe066, armored: 0xd9b45a, enraged: 0xffa040, regen: 0xc8e070 } as const;
const FX_COLORS: Record<FxKind, number> = { fire: 0xff8a2a, frost: 0x7fd8ff, holy: 0xfff2a8, arcane: 0xc58aff, physical: 0xffe2a8, shadow: 0x9b4dff, heal: 0x5fd08a };
import type { ClassId } from '../sim/classes';
import { weaponReq, WEAPONS, type WeaponType } from '../sim/gear';
import { ULT } from '../sim/ultimates';
import { value } from '../sim/stats';
import { prefs as fxPrefs } from '../audio';
import { Actor, dungeonGeo, dungeonTexture, flipbook, loadModels, setModelsError, type DungeonPiece, type Look, type PropName } from './models';

/** How each biome dresses the dungeon pieces (stone tint, floor kind, banner colour, torch flame). */
const BIOME_LOOKS: { floor: DungeonPiece; floorRough: DungeonPiece; floorTint: number; stone: number; banner: DungeonPiece; flame: number }[] = [
  { floor: 'floor_tile_large', floorRough: 'floor_tile_large_rocks', floorTint: 0x7c7a78, stone: 0xb8b4ae, banner: 'banner_red', flame: 0xffa040 }, // catacombs
  { floor: 'floor_dirt_large', floorRough: 'floor_dirt_large_rocky', floorTint: 0x7a9068, stone: 0x9aae8c, banner: 'banner_green', flame: 0xffc060 }, // dark forest
  { floor: 'floor_tile_large', floorRough: 'floor_tile_large_rocks', floorTint: 0x7890b8, stone: 0xa8c0e8, banner: 'banner_blue', flame: 0x9fe0ff }, // frost caverns
  { floor: 'floor_dirt_large', floorRough: 'floor_dirt_large_rocky', floorTint: 0x8a5040, stone: 0x9a6a5a, banner: 'banner_yellow', flame: 0xff6020 }, // lava depths
  { floor: 'floor_tile_large', floorRough: 'floor_tile_large_rocks', floorTint: 0x8a5a5a, stone: 0xc09090, banner: 'banner_red', flame: 0xff4040 }, // blood temple
  { floor: 'floor_tile_large', floorRough: 'floor_tile_large_rocks', floorTint: 0x645a8c, stone: 0x9a8ad0, banner: 'banner_white', flame: 0xc080ff }, // void halls
];

// ---------- model looks ----------
const ENEMY_LOOKS: Record<SmallKind, Look> = {
  grunt: { char: 'Skeleton_Warrior', right: 'Skeleton_Blade', height: 2.05 },
  shooter: { char: 'Skeleton_Rogue', right: 'Skeleton_Crossbow', height: 2.0 },
  swarm: { char: 'Skeleton_Minion', height: 1.35 },
  bomber: { char: 'Skeleton_Minion', height: 1.6 },
  shield: { char: 'Skeleton_Warrior', right: 'Skeleton_Blade', left: 'Skeleton_Shield_Large_A', height: 2.3 },
  healer: { char: 'Skeleton_Mage', right: 'Skeleton_Staff', height: 2.1 },
};
/** Multiplied over the texture (white = as painted). */
const ENEMY_TINTS: Record<SmallKind, number> = { grunt: 0xffffff, shooter: 0xffd8ff, swarm: 0xd8ffb0, bomber: 0xff9a5a, shield: 0xb8c8ff, healer: 0xb0ffc8 };
type UndeadKind = 'skeleton' | 'grunt' | 'shooter' | 'swarm';
const UNDEAD_LOOKS: Record<UndeadKind, Look> = {
  skeleton: { char: 'Skeleton_Minion', right: 'Skeleton_Blade', height: 1.75 },
  grunt: { char: 'Skeleton_Warrior', right: 'Skeleton_Blade', height: 2.0 },
  shooter: { char: 'Skeleton_Rogue', right: 'Skeleton_Crossbow', height: 1.95 },
  swarm: { char: 'Skeleton_Minion', height: 1.3 },
};
const WEAPON_PROPS: Partial<Record<WeaponType, PropName>> = {
  sword: '1H_Sword', dagger: 'Knife', bow: '1H_Crossbow', shortbow: '1H_Crossbow', longbow: '2H_Crossbow',
  staff: '2H_Staff', greatstaff: '2H_Staff', scythe: 'Skeleton_Axe', greatscythe: '2H_Axe', shield: 'Round_Shield', orb: 'Spellbook_open',
};
const PLAYER_CHARS = { warrior: 'Knight', archer: 'Rogue', mage: 'Mage', necro: 'Rogue_Hooded' } as const;
const PLAYER_HEIGHT = 2.5;
/** A lance / javelin along +z: wooden shaft, steel tip. */
function lanceGeo(len: number): THREE.BufferGeometry {
  const shaft = new THREE.CylinderGeometry(0.035, 0.035, len, 6); shaft.rotateX(Math.PI / 2);
  const tip = new THREE.ConeGeometry(0.09, 0.32, 6); tip.rotateX(Math.PI / 2); tip.translate(0, 0, len / 2 + 0.14);
  return mergeGeos([shaft, tip]);
}
interface PlayerLook { id: ClassId; sub: ClassId | null; sub2: ClassId | null; main: WeaponType | null; off: WeaponType | null; custom: boolean }
/** Where third-class props sit on the bones (bone space, KayKit units). */
const THIRD: Record<string, { pos: [number, number, number]; rot: [number, number, number]; scale?: number }> = {
  mouth: { pos: [0, 0.22, 0.6], rot: [0, 0, Math.PI / 2] },
  back: { pos: [0, 0.3, -0.45], rot: [0, 0, Math.PI * 0.8] },
  backBow: { pos: [0, 0.4, -0.5], rot: [0, Math.PI, Math.PI * 0.75] },
};

const VIEW_HEIGHT = 32; // world units visible top-to-bottom
const CAM_OFFSET = new THREE.Vector3(12, 15, 12);

const THEMES = [
  { floorA: '#3a4152', floorB: '#343a4a', wall: 0x262b38, pillar: 0x6b7385, bg: 0x10131a },
  { floorA: '#33473a', floorB: '#2e4034', wall: 0x1f2c23, pillar: 0x6f8a6a, bg: 0x0e1510 },
  { floorA: '#4a3333', floorB: '#422d2d', wall: 0x2b1b1b, pillar: 0x8a6262, bg: 0x170d0d },
  { floorA: '#3b4f63', floorB: '#34475a', wall: 0x1e2c3a, pillar: 0x9fc6e0, bg: 0x0c141c }, // frost arena
  { floorA: '#4a2a1e', floorB: '#3f231a', wall: 0x2a120a, pillar: 0x8a4a2a, bg: 0x160904 }, // lava arena
  { floorA: '#2c2442', floorB: '#261f3a', wall: 0x15102a, pillar: 0x6a5aa8, bg: 0x08061a }, // void halls
];

const MAX_INST = 260;
const FLIP_FPS = 1; // run-cycle speed multiplier for crowds

export class Renderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private mapGroup = new THREE.Group();
  private mapIndex = -1;
  private themeIndex = -1;

  private player: THREE.Group;
  private playerBody: THREE.Mesh;
  private weaponGroup = new THREE.Group();
  private fx: { mesh: THREE.Mesh; life: number; max: number; grow: number }[] = [];
  private fireballs!: THREE.InstancedMesh;
  private zoneMeshes: THREE.Mesh[] = [];
  private autoRing: THREE.Mesh;
  private enemyMeshes: Record<SmallKind, THREE.InstancedMesh>;
  private bossMeshes = new Map<number, THREE.Group>();
  private arrows: THREE.InstancedMesh;
  private bolts: THREE.InstancedMesh;
  private javelins!: THREE.InstancedMesh;
  private meteorMesh!: THREE.InstancedMesh;
  private meteorMarks!: THREE.InstancedMesh;
  private batMesh!: THREE.InstancedMesh;
  private totemMesh!: THREE.InstancedMesh;
  private totemOrbs!: THREE.InstancedMesh;
  private shieldBubble!: THREE.Mesh;
  private skeletons: THREE.InstancedMesh;
  private skeletonHeads: THREE.InstancedMesh;
  private undead!: Record<'grunt' | 'shooter' | 'swarm', THREE.InstancedMesh>;
  // 終極技
  private orbMesh!: THREE.InstancedMesh;
  private missileMesh!: THREE.InstancedMesh;
  private mineMesh!: THREE.InstancedMesh;
  private holeMeshes: THREE.Group[] = [];
  private chrono!: THREE.Mesh;
  private warnMeshes: THREE.Mesh[] = [];
  // models (null until loaded)
  private actor: Actor | null = null;
  private look: PlayerLook | null = null;
  private floater: THREE.Object3D | null = null; // third-class extra that floats beside the player
  private lastAtk = 0;
  private flips: Record<SmallKind, THREE.InstancedMesh[]> | null = null;
  private undeadFlips: Record<UndeadKind, THREE.InstancedMesh[]> | null = null;
  private bossActors = new Map<number, { actor: Actor; x: number; z: number; atk: number }>();
  private lastWarnCount = 0;
  private primitiveLook: THREE.Object3D[] = [];
  private dungeonMat: THREE.MeshLambertMaterial | null = null;
  private torchFlames: THREE.InstancedMesh | null = null;
  private torchSpots: { x: number; y: number; z: number }[] = [];
  // floating damage numbers (DOM overlay projected from the 3D position)
  private dmgLayer: HTMLDivElement;
  private dmgNums: { el: HTMLDivElement; x: number; z: number; life: number; max: number; drift: number }[] = [];
  private dmgPool: HTMLDivElement[] = [];
  private projV = new THREE.Vector3();
  private canvasEl: HTMLCanvasElement;
  private bullets: THREE.InstancedMesh;
  private coins: THREE.InstancedMesh;
  private shadows: THREE.InstancedMesh;
  private sparks: THREE.InstancedMesh;
  private sparkData: { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; color: THREE.Color }[] = [];

  private shake = 0;
  private hurtFlash = 0;
  private camTarget = new THREE.Vector3();
  private tmp = new THREE.Object3D();
  private tmpColor = new THREE.Color();

  constructor(canvas: HTMLCanvasElement) {
    this.canvasEl = canvas;
    this.dmgLayer = document.createElement('div');
    this.dmgLayer.className = 'dmglayer';
    canvas.parentElement?.appendChild(this.dmgLayer);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.scene.add(this.mapGroup);

    this.scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x2a2018, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(8, 20, 4);
    this.scene.add(sun);

    // player (body + weapons are rebuilt per class in reset())
    this.player = new THREE.Group();
    this.playerBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.7, 4, 10), new THREE.MeshLambertMaterial({ color: 0x3fd0b0 }));
    this.playerBody.position.y = 0.75;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), new THREE.MeshLambertMaterial({ color: 0xffd9b0 }));
    head.position.y = 1.55;
    this.player.add(this.playerBody, head, this.weaponGroup);
    this.autoRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.78, 32), new THREE.MeshBasicMaterial({ color: 0x5aa9ff, transparent: true, opacity: 0.8 }));
    this.autoRing.rotation.x = -Math.PI / 2;
    this.autoRing.position.y = 0.03;
    this.player.add(this.autoRing);
    this.scene.add(this.player);

    const inst = (geo: THREE.BufferGeometry, color: number, basic = false) => {
      const mat = basic ? new THREE.MeshBasicMaterial({ color: 0xffffff }) : new THREE.MeshLambertMaterial({ color: 0xffffff });
      const m = new THREE.InstancedMesh(geo, mat, MAX_INST);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < MAX_INST; i++) m.setColorAt(i, new THREE.Color(color));
      m.count = 0;
      m.frustumCulled = false;
      this.scene.add(m);
      return m;
    };
    this.enemyMeshes = {
      grunt: inst(new THREE.BoxGeometry(0.85, 0.95, 0.85), 0xc0563f),
      shooter: inst(new THREE.ConeGeometry(0.45, 1.2, 6), 0x9a5cd6),
      swarm: inst(new THREE.TetrahedronGeometry(0.38), 0x9ccf3f),
      bomber: inst(new THREE.SphereGeometry(0.42, 12, 10), 0xff7a2a),
      shield: inst(new THREE.BoxGeometry(1.15, 1.05, 0.55), 0x7d8aa6),
      healer: inst(new THREE.CylinderGeometry(0.22, 0.42, 1.1, 8), 0x5fd08a),
    };
    const arrowGeo = new THREE.BoxGeometry(0.09, 0.09, 0.8);
    this.arrows = inst(arrowGeo, 0xffe08a, true);
    this.bullets = inst(new THREE.SphereGeometry(0.28, 8, 6), 0xff4f7a, true);
    this.fireballs = inst(new THREE.SphereGeometry(0.38, 10, 8), 0xff7a1a, true);
    this.bolts = inst(new THREE.IcosahedronGeometry(0.3, 0), 0xa65cff, true);
    this.javelins = inst(lanceGeo(1.6), 0xd8c49a);
    // 隕石雨: falling rocks + shrinking target rings
    this.meteorMesh = inst(new THREE.DodecahedronGeometry(0.55, 0), 0xff7a2a, true);
    const mark = new THREE.RingGeometry(0.85, 1, 28); mark.rotateX(-Math.PI / 2);
    this.meteorMarks = inst(mark, 0xff9a3a, true);
    (this.meteorMarks.material as THREE.MeshBasicMaterial).transparent = true;
    (this.meteorMarks.material as THREE.MeshBasicMaterial).opacity = 0.7;
    // 吸血蝙蝠: two flat wings
    const wingL = new THREE.BufferGeometry();
    wingL.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.15, -0.55, 0.1, -0.05, 0, 0, -0.2, 0, 0, 0.15, 0, 0, -0.2, 0.55, 0.1, -0.05], 3));
    wingL.computeVertexNormals();
    const body = new THREE.SphereGeometry(0.12, 6, 4).toNonIndexed(); body.deleteAttribute('uv');
    this.batMesh = inst(mergeGeos([wingL, body]), 0x3a1838);
    (this.batMesh.material as THREE.MeshLambertMaterial).side = THREE.DoubleSide;
    (this.batMesh.material as THREE.MeshLambertMaterial).emissive = new THREE.Color(0x400010);
    // 雷霆圖騰: a stone pillar with a glowing top
    const pillar = new THREE.CylinderGeometry(0.22, 0.3, 1.6, 6); pillar.translate(0, 0.8, 0);
    this.totemMesh = inst(pillar, 0x6a7380);
    this.totemOrbs = inst(new THREE.OctahedronGeometry(0.28, 0), 0xbfe8ff, true);
    // 聖光壁壘: a golden bubble
    this.shieldBubble = new THREE.Mesh(new THREE.SphereGeometry(1.25, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.22, depthWrite: false }));
    this.shieldBubble.position.y = 1.1;
    this.shieldBubble.visible = false;
    this.player.add(this.shieldBubble);
    this.skeletons = inst(new THREE.BoxGeometry(0.42, 0.8, 0.3), 0xe8e2d0);
    this.skeletonHeads = inst(new THREE.SphereGeometry(0.22, 8, 6), 0xf3eedd);
    // raised enemies: same shapes as the enemies, ghostly green and see-through
    const ghost = (geo: THREE.BufferGeometry) => {
      const m = inst(geo, 0x7dffc4);
      const mat = m.material as THREE.MeshLambertMaterial;
      mat.transparent = true; mat.opacity = 0.72; mat.emissive = new THREE.Color(0x1d6b4a);
      return m;
    };
    // 守護精靈: small glowing spirits
    this.orbMesh = inst(new THREE.OctahedronGeometry(0.26, 1), 0xc8ffe6, true);
    // 御劍術: flying swords (blade + cross-guard, pointing along +z)
    const blade = new THREE.BoxGeometry(0.09, 0.05, 1.0);
    blade.translate(0, 0, 0.25);
    const guard = new THREE.BoxGeometry(0.42, 0.07, 0.08);
    guard.translate(0, 0, -0.25);
    const hilt = new THREE.BoxGeometry(0.07, 0.07, 0.3);
    hilt.translate(0, 0, -0.42);
    this.missileMesh = inst(mergeGeos([blade, guard, hilt]), 0xbfe8ff, true);
    // 符文陷阱: glowing rune circles on the floor
    const rune = new THREE.RingGeometry(0.32, 0.5, 6);
    rune.rotateX(-Math.PI / 2);
    this.mineMesh = inst(rune, 0xc58aff, true);
    const cGeo = new THREE.CircleGeometry(1, 48);
    cGeo.rotateX(-Math.PI / 2);
    this.chrono = new THREE.Mesh(cGeo, new THREE.MeshBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.08, depthWrite: false }));
    const cRing = new THREE.RingGeometry(0.97, 1, 48);
    cRing.rotateX(-Math.PI / 2);
    this.chrono.add(new THREE.Mesh(cRing, new THREE.MeshBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.55, depthWrite: false })));
    // clock-face ticks
    const tickParts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 12; i++) {
      const g = new THREE.PlaneGeometry(0.025, i % 3 === 0 ? 0.12 : 0.07);
      g.rotateX(-Math.PI / 2);
      g.translate(0, 0, 0.9);
      g.rotateY((i / 12) * Math.PI * 2);
      tickParts.push(g);
    }
    this.chrono.add(new THREE.Mesh(mergeGeos(tickParts), new THREE.MeshBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide })));
    this.chrono.visible = false;
    this.scene.add(this.chrono);
    this.undead = {
      grunt: ghost(new THREE.BoxGeometry(0.85, 0.95, 0.85)),
      shooter: ghost(new THREE.ConeGeometry(0.45, 1.2, 6)),
      swarm: ghost(new THREE.TetrahedronGeometry(0.38)),
    };
    this.coins = inst(new THREE.CylinderGeometry(0.22, 0.22, 0.07, 12), 0xffc23a);
    (this.coins.material as THREE.MeshLambertMaterial).emissive = new THREE.Color(0x553300);

    const shadowGeo = new THREE.CircleGeometry(1, 16);
    shadowGeo.rotateX(-Math.PI / 2);
    this.shadows = new THREE.InstancedMesh(shadowGeo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }), 400);
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = 1;
    this.scene.add(this.shadows);

    this.sparks = inst(new THREE.BoxGeometry(0.14, 0.14, 0.14), 0xffffff, true);
    this.primitiveLook = [this.playerBody, head, this.weaponGroup];
    void loadModels().then((ok) => {
      if (!ok) return;
      try { this.onModels(); } catch (err) {
        console.warn('model setup failed', err);
        setModelsError(err);
        this.flips = null; this.undeadFlips = null;
        for (const m of Object.values(this.enemyMeshes)) m.visible = true;
        for (const m of Object.values(this.undead)) m.visible = true;
        this.skeletons.visible = true; this.skeletonHeads.visible = true;
      }
    });
  }

  /** Models arrived: build the crowd flipbooks and swap the player to the real model. */
  private onModels(): void {
    const flipSet = <K extends string>(looks: Record<K, Look>, ghost: boolean): Record<K, THREE.InstancedMesh[]> | null => {
      const out = {} as Record<K, THREE.InstancedMesh[]>;
      for (const k of Object.keys(looks) as K[]) {
        const fb = flipbook(looks[k]);
        if (!fb) return null;
        const mats = fb.material.map((m) => {
          if (!ghost) return m;
          const g = (m as THREE.MeshLambertMaterial).clone();
          g.transparent = true; g.opacity = 0.75; g.emissive = new THREE.Color(0x1d6b4a);
          return g;
        });
        out[k] = fb.frames.map((geo) => {
          const im = new THREE.InstancedMesh(geo, mats, MAX_INST);
          im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          im.setColorAt(0, new THREE.Color(0xffffff));
          im.count = 0;
          im.frustumCulled = false;
          this.scene.add(im);
          return im;
        });
      }
      return out;
    };
    this.flips = flipSet(ENEMY_LOOKS, false);
    this.undeadFlips = flipSet(UNDEAD_LOOKS, true);
    if (this.flips) for (const m of Object.values(this.enemyMeshes)) m.visible = false;
    if (this.undeadFlips) {
      for (const m of Object.values(this.undead)) m.visible = false;
      this.skeletons.visible = false; this.skeletonHeads.visible = false;
    }
    if (this.look) this.buildClassLook(this.look);
    this.mapIndex = -1; // rebuild the arena with the dungeon models
  }

  /** Puts instance i of a flipbook kind on the right frame (others in the set get nothing this frame). */
  private flipCounts = new Map<THREE.InstancedMesh, number>();
  private flipPut(set: THREE.InstancedMesh[], phase: number, color: number): void {
    const n = set.length;
    const f = ((Math.floor(phase * n) % n) + n) % n;
    const m = set[f];
    const i = this.flipCounts.get(m) ?? 0;
    if (i >= MAX_INST) return;
    this.flipCounts.set(m, i + 1);
    m.setMatrixAt(i, this.tmp.matrix);
    m.setColorAt(i, this.tmpColor.setHex(color));
  }
  private flipFlush(): void {
    const all = [...Object.values(this.flips ?? {}), ...Object.values(this.undeadFlips ?? {})] as THREE.InstancedMesh[][];
    for (const set of all) for (const m of set) {
      m.count = this.flipCounts.get(m) ?? 0;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.flipCounts.clear();
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.top = VIEW_HEIGHT / 2;
    this.camera.bottom = -VIEW_HEIGHT / 2;
    this.camera.left = (-VIEW_HEIGHT * aspect) / 2;
    this.camera.right = (VIEW_HEIGHT * aspect) / 2;
    this.camera.updateProjectionMatrix();
  }

  private buildMap(sim: Sim): void {
    this.mapGroup.clear();
    this.torchFlames = null;
    const t = THEMES[sim.theme % THEMES.length];
    this.scene.background = new THREE.Color(t.bg);
    if (this.buildModelMap(sim)) { this.mapIndex = sim.map; this.themeIndex = sim.theme; return; }

    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const g = cv.getContext('2d')!;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      g.fillStyle = (x + y) % 2 ? t.floorA : t.floorB;
      g.fillRect(x * 32, y * 32, 32, 32);
      g.strokeStyle = 'rgba(0,0,0,0.25)';
      g.strokeRect(x * 32 + 0.5, y * 32 + 0.5, 31, 31);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(ARENA_HALF / 4, ARENA_HALF / 4);
    tex.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2), new THREE.MeshLambertMaterial({ map: tex }));
    floor.rotation.x = -Math.PI / 2;
    this.mapGroup.add(floor);

    const wallMat = new THREE.MeshLambertMaterial({ color: t.wall });
    const L = ARENA_HALF * 2 + 2;
    for (const [x, z, w, d] of [[0, -ARENA_HALF - 0.5, L, 1], [0, ARENA_HALF + 0.5, L, 1], [-ARENA_HALF - 0.5, 0, 1, L], [ARENA_HALF + 0.5, 0, 1, L]]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 1.6, d), wallMat);
      wall.position.set(x, 0.8, z);
      this.mapGroup.add(wall);
    }
    const pMat = new THREE.MeshLambertMaterial({ color: t.pillar });
    for (const p of sim.pillars) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r * 1.1, 1.8, 10), pMat);
      col.position.set(p.x, 0.9, p.z);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(p.r * 2.3, 0.3, p.r * 2.3), pMat);
      cap.position.set(p.x, 1.9, p.z);
      this.mapGroup.add(col, cap);
    }
    this.mapIndex = sim.map;
    this.themeIndex = sim.theme;
  }

  handleEvents(events: SimEvent[]): void {
    for (const ev of events) {
      if (ev.type === 'hit') { this.burst(ev.x, ev.z, ev.crit ? 0xfff27a : 0xffffff, ev.crit ? 5 : 2); this.addNumber(ev.x, ev.z, ev.dmg, ev.crit); }
      else if (ev.type === 'kill') this.burst(ev.x, ev.z, isBigKind(ev.kind) ? 0xffc23a : 0xd0d0d0, ev.kind === 'boss' || ev.kind === 'worldboss' ? 40 : ev.kind === 'miniboss' ? 24 : 6);
      else if (ev.type === 'hurt') { this.shake = Math.max(this.shake, 0.25); this.hurtFlash = 0.15; }
      else if (ev.type === 'boss') this.shake = 0.5;
      else if (ev.type === 'swing') this.addSwing(ev.x, ev.z, ev.angle, ev.reach, ev.arc, ev.fx);
      else if (ev.type === 'explode') this.addExplosion(ev.x, ev.z, ev.r, ev.fx);
      else if (ev.type === 'dash') this.addDash(ev.x1, ev.z1, ev.x2, ev.z2);
      else if (ev.type === 'wave') this.addWave(ev.x, ev.z, ev.r);
      else if (ev.type === 'lightning') this.addLightning(ev.pts);
      else if (ev.type === 'lastStand') { this.burst(this.player.position.x, this.player.position.z, 0xfff2a8, 30); this.shake = 0.4; }
    }
  }

  private burst(x: number, z: number, color: number, n: number): void {
    for (let i = 0; i < n && this.sparkData.length < MAX_INST; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 5;
      this.sparkData.push({ x, y: 0.8, z, vx: Math.sin(a) * s, vy: 3 + Math.random() * 4, vz: Math.cos(a) * s, life: 0.35 + Math.random() * 0.3, color: new THREE.Color(color) });
    }
  }

  render(sim: Sim, dt: number): void {
    if (sim.map !== this.mapIndex || sim.theme !== this.themeIndex) this.buildMap(sim);
    const p = sim.player;
    const t = performance.now() / 1000;

    // player
    this.player.position.set(p.x, 0, p.z);
    this.player.rotation.y = p.facing;
    const moving = Math.hypot(p.moveX, p.moveZ) > 0.1 && sim.phase === 'playing';
    this.playerBody.position.y = 0.75 + (moving ? Math.abs(Math.sin(t * 12)) * 0.08 : 0);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    (this.playerBody.material as THREE.MeshLambertMaterial).emissive.setHex(this.hurtFlash > 0 ? 0x992222 : 0x000000);
    if (this.actor) {
      const a = this.actor;
      if (sim.phase === 'dead') a.die();
      else if (p.attackTimer > this.lastAtk + 0.02 && p.attackTimer > 0.08) {
        const k = sim.attack.kind;
        a.attack(k === 'arc' || k === 'reap' || k === 'javelin' ? 'chop' : k === 'arrow' ? 'shoot' : 'cast', p.attackTimer); // summon / fireball / shadow = cast
      }
      this.lastAtk = p.attackTimer;
      a.flash(this.hurtFlash > 0 ? 0x992222 : p.invuln > 0 && Math.sin(t * 30) > 0 ? 0x333333 : 0);
      a.update(sim.phase === 'playing' || sim.phase === 'dead' ? dt : 0, moving, 1.25);
    }
    if (this.floater) {
      // floats over the left shoulder, bobbing (the player group already turns with the player)
      this.floater.position.set(-0.85, 2.0 + Math.sin(t * 2.5) * 0.12, -0.3);
      this.floater.rotation.set(-0.5, Math.sin(t * 1.3) * 0.3, 0);
    }
    const ringMat = this.autoRing.material as THREE.MeshBasicMaterial;
    ringMat.color.setHex(p.autopilot ? 0x5aa9ff : 0xffc23a);
    this.autoRing.rotation.z = t * (p.autopilot ? 1.5 : 0);

    // enemies
    let si = 0;
    const setShadow = (x: number, z: number, r: number) => {
      if (si >= 400) return;
      this.tmp.position.set(x, 0.02, z);
      this.tmp.rotation.set(0, 0, 0);
      this.tmp.scale.setScalar(r);
      this.tmp.updateMatrix();
      this.shadows.setMatrixAt(si++, this.tmp.matrix);
    };
    setShadow(p.x, p.z, 0.55);

    const counts = Object.fromEntries(SMALL_KINDS.map((k) => [k, 0])) as Record<SmallKind, number>;
    const liveBosses = new Set<number>();
    for (const e of sim.enemies) {
      setShadow(e.x, e.z, e.radius * 1.1);
      if (isBigKind(e.kind)) { this.drawBoss(e, t, sim, dt); liveBosses.add(e.id); continue; }
      const kind = e.kind as SmallKind;
      if (this.flips) {
        const sc = (e.elite ? 1.3 : 1) * (kind === 'bomber' && e.fuse !== undefined ? 1 + (0.8 - e.fuse) * 0.5 : 1);
        this.tmp.position.set(e.x, 0, e.z);
        this.tmp.rotation.set(0, Math.atan2(p.x - e.x, p.z - e.z), 0);
        this.tmp.scale.setScalar(sc);
        this.tmp.updateMatrix();
        const base = e.elite ? ELITE_COLORS[e.elite] : ENEMY_TINTS[kind];
        const col = e.hitFlash > 0 ? 0xff6a6a : e.markTimer > 0 ? 0xffd23a : e.slowTimer > 0 ? 0x8fd8ff : kind === 'bomber' && e.fuse !== undefined && Math.sin(t * 30) > 0 ? 0xffffff : base;
        const spd = kind === 'swarm' ? 1.6 : kind === 'shield' ? 0.8 : 1.1;
        this.flipPut(this.flips[kind], (t * spd * FLIP_FPS) / 0.8 + e.id * 0.37, col);
        continue;
      }
      const mesh = this.enemyMeshes[kind];
      const i = counts[kind]++;
      if (i >= MAX_INST) continue;
      const bob = Math.abs(Math.sin(t * 8 + e.id)) * 0.12;
      const sc = e.elite ? 1.3 : 1;
      const half = (HALF_HEIGHT[kind] ?? 0.4) * sc;
      const fusing = kind === 'bomber' && e.fuse !== undefined;
      this.tmp.position.set(e.x, half + bob, e.z);
      this.tmp.rotation.set(0, Math.atan2(p.x - e.x, p.z - e.z) + (kind === 'swarm' ? t * 6 : 0), 0);
      this.tmp.scale.setScalar(sc * (fusing ? 1 + (0.8 - e.fuse!) * 0.6 : 1));
      this.tmp.updateMatrix();
      mesh.setMatrixAt(i, this.tmp.matrix);
      const base = e.elite ? ELITE_COLORS[e.elite] : ENEMY_COLORS[kind];
      mesh.setColorAt(i, this.tmpColor.setHex(e.hitFlash > 0 ? 0xffffff : e.markTimer > 0 ? 0xffd23a : e.slowTimer > 0 ? 0x8fd8ff : base));
    }
    for (const k of SMALL_KINDS) {
      const m = this.enemyMeshes[k];
      m.count = Math.min(counts[k], MAX_INST);
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    for (const [id, g] of this.bossMeshes) if (!liveBosses.has(id)) { this.scene.remove(g); this.bossMeshes.delete(id); this.bossActors.get(id)?.actor.dispose(); this.bossActors.delete(id); }
    // a new floor warning means a boss just started a telegraphed attack: show it casting
    if (sim.warnings.length > this.lastWarnCount) for (const b of this.bossActors.values()) b.actor.attack('cast', 0.9);
    this.lastWarnCount = sim.warnings.length;

    // projectiles
    let ai = 0, bi = 0, fi = 0, si2 = 0, ji = 0;
    for (const pr of sim.projectiles) {
      if (pr.fromPlayer && pr.javelin) {
        if (ji >= MAX_INST) continue;
        this.tmp.position.set(pr.x, 1.1, pr.z);
        this.tmp.rotation.set(0, Math.atan2(pr.vx, pr.vz), 0);
        this.tmp.scale.setScalar(pr.crit ? 1.25 : 1);
        this.tmp.updateMatrix();
        this.javelins.setMatrixAt(ji++, this.tmp.matrix);
      } else if (pr.fromPlayer && pr.blast && !pr.fx) {
        if (fi >= MAX_INST) continue;
        this.tmp.position.set(pr.x, 0.9, pr.z);
        this.tmp.rotation.set(0, 0, 0);
        this.tmp.scale.setScalar((pr.crit ? 1.3 : 1) * (pr.meteor ? 1.8 : 1) * (1 + Math.sin(t * 25 + fi) * 0.12));
        this.tmp.updateMatrix();
        this.fireballs.setMatrixAt(fi++, this.tmp.matrix);
      } else if (pr.fromPlayer && pr.shadow) {
        if (si2 >= MAX_INST) continue;
        this.tmp.position.set(pr.x, 0.9, pr.z);
        this.tmp.rotation.set(t * 8, t * 6, 0);
        this.tmp.scale.setScalar(pr.crit ? 1.35 : 1);
        this.tmp.updateMatrix();
        this.bolts.setMatrixAt(si2++, this.tmp.matrix);
      } else if (pr.fromPlayer) {
        if (ai >= MAX_INST) continue;
        this.tmp.position.set(pr.x, 0.9, pr.z);
        this.tmp.rotation.set(0, Math.atan2(pr.vx, pr.vz), 0);
        this.tmp.scale.setScalar(pr.crit ? 1.5 : 1);
        this.tmp.updateMatrix();
        this.arrows.setMatrixAt(ai, this.tmp.matrix);
        this.arrows.setColorAt(ai, this.tmpColor.setHex(pr.fx === 'fire' ? 0xff6a1a : pr.slow ? 0x8fe0ff : pr.ap ? 0xe6ecff : pr.crit ? 0xff9d2e : 0xffe08a));
        ai++;
      } else {
        if (bi >= MAX_INST) continue;
        this.tmp.position.set(pr.x, 0.8, pr.z);
        this.tmp.rotation.set(0, 0, 0);
        this.tmp.scale.setScalar(1 + Math.sin(t * 20) * 0.1);
        this.tmp.updateMatrix();
        this.bullets.setMatrixAt(bi++, this.tmp.matrix);
      }
    }
    this.arrows.count = ai; this.arrows.instanceMatrix.needsUpdate = true;
    if (this.arrows.instanceColor) this.arrows.instanceColor.needsUpdate = true;
    this.bullets.count = bi; this.bullets.instanceMatrix.needsUpdate = true;
    this.fireballs.count = fi; this.fireballs.instanceMatrix.needsUpdate = true;
    this.bolts.count = si2; this.bolts.instanceMatrix.needsUpdate = true;
    this.javelins.count = ji; this.javelins.instanceMatrix.needsUpdate = true;

    // necromancer allies: skeletons + raised (undead) enemies
    let sk = 0;
    const uc = { grunt: 0, shooter: 0, swarm: 0 };
    for (const m of sim.minions) {
      const sc = (m.big ? 1.45 : 1) * (sim.ut.tank ? 1.15 : 1);
      const bob = Math.abs(Math.sin(t * 9 + m.id)) * 0.08;
      const target = sim.nearestEnemy(m.x, m.z, 12);
      const face = target ? Math.atan2(target.x - m.x, target.z - m.z) : Math.atan2(p.x - m.x, p.z - m.z);
      // undead traits from gear change the look: 怨靈 pale blue, 骨法 purple, 骨甲 steel (bigger)
      const traitTint = sim.ut.wraith ? 0x9fe8ff : sim.ut.caster ? 0xb88aff : sim.ut.tank ? 0xaab4c8 : -1;
      const tint = m.life < 3 ? 0x6f7a72 : sim.minionBuff > 0 ? 0xc9a8ff : traitTint;
      if (this.undeadFlips) {
        setShadow(m.x, m.z, (m.kind === 'swarm' ? 0.35 : 0.5) * sc);
        this.tmp.position.set(m.x, 0, m.z);
        this.tmp.rotation.set(0, face, 0);
        this.tmp.scale.setScalar(sc);
        this.tmp.updateMatrix();
        const ghostTint = m.kind === 'skeleton' ? 0xf0ffe8 : 0x9dffd0;
        this.flipPut(this.undeadFlips[m.kind], t * 1.4 + m.id * 0.41, tint >= 0 ? tint : ghostTint);
        continue;
      }
      if (m.kind === 'skeleton') {
        if (sk >= MAX_INST) continue;
        setShadow(m.x, m.z, 0.4 * sc);
        this.tmp.position.set(m.x, (0.4 + bob) * sc, m.z);
        this.tmp.rotation.set(0, face, 0);
        this.tmp.scale.setScalar(sc);
        this.tmp.updateMatrix();
        this.skeletons.setMatrixAt(sk, this.tmp.matrix);
        this.skeletons.setColorAt(sk, this.tmpColor.setHex(tint >= 0 ? tint : 0xe8e2d0));
        this.tmp.position.set(m.x, (1.0 + bob) * sc, m.z);
        this.tmp.updateMatrix();
        this.skeletonHeads.setMatrixAt(sk, this.tmp.matrix);
        sk++;
        continue;
      }
      const mesh = this.undead[m.kind];
      const i = uc[m.kind]++;
      if (i >= MAX_INST) continue;
      const half = m.kind === 'shooter' ? 0.6 : m.kind === 'grunt' ? 0.48 : 0.3;
      setShadow(m.x, m.z, (m.kind === 'swarm' ? 0.35 : 0.5) * sc);
      this.tmp.position.set(m.x, (half + bob) * sc, m.z);
      this.tmp.rotation.set(0, face + (m.kind === 'swarm' ? t * 6 : 0), 0);
      this.tmp.scale.setScalar(sc);
      this.tmp.updateMatrix();
      mesh.setMatrixAt(i, this.tmp.matrix);
      mesh.setColorAt(i, this.tmpColor.setHex(tint >= 0 ? tint : 0x7dffc4));
    }
    this.skeletons.count = sk; this.skeletons.instanceMatrix.needsUpdate = true;
    if (this.skeletons.instanceColor) this.skeletons.instanceColor.needsUpdate = true;
    this.skeletonHeads.count = sk; this.skeletonHeads.instanceMatrix.needsUpdate = true;
    for (const k of ['grunt', 'shooter', 'swarm'] as const) {
      const m = this.undead[k];
      m.count = Math.min(uc[k], MAX_INST);
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    if (this.flips || this.undeadFlips) this.flipFlush();

    // 附魔領域 zones
    while (this.zoneMeshes.length < sim.zones.length) {
      const geo = new THREE.RingGeometry(0.85, 1, 40);
      geo.rotateX(-Math.PI / 2);
      const ring = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xc58aff, transparent: true, opacity: 0.6, depthWrite: false }));
      const fillGeo = new THREE.CircleGeometry(1, 40);
      fillGeo.rotateX(-Math.PI / 2);
      ring.add(new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: 0x8a5cff, transparent: true, opacity: 0.18, depthWrite: false })));
      this.scene.add(ring);
      this.zoneMeshes.push(ring);
    }
    this.zoneMeshes.forEach((m, i) => {
      const z = sim.zones[i];
      m.visible = !!z;
      if (!z) return;
      m.position.set(z.x, 0.1, z.z);
      m.scale.setScalar(z.r);
      m.rotation.y = t * 0.6;
      const poison = z.kind === 'poison', fire = z.kind === 'fire';
      (m.material as THREE.MeshBasicMaterial).color.setHex(poison ? 0x7dff5a : fire ? 0xff8a2a : 0xc58aff);
      ((m.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHex(poison ? 0x3fa83a : fire ? 0xc0400a : 0x8a5cff);
    });

    // ---------- boss warnings (red floor markers that fill up before the hit) ----------
    while (this.warnMeshes.length < sim.warnings.length) {
      const g = new THREE.CircleGeometry(1, 32); g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.3, depthWrite: false }));
      const rg = new THREE.RingGeometry(0.92, 1, 32); rg.rotateX(-Math.PI / 2);
      m.add(new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xff5050, transparent: true, opacity: 0.8, depthWrite: false })));
      const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2);
      const line = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.3, depthWrite: false }));
      m.add(line);
      this.scene.add(m);
      this.warnMeshes.push(m);
    }
    this.warnMeshes.forEach((m, i) => {
      const w = sim.warnings[i];
      m.visible = !!w;
      if (!w) return;
      const k = 1 - w.timer / w.max; // 0 → 1 as it charges
      const fill = m.material as THREE.MeshBasicMaterial;
      const ring = m.children[0] as THREE.Mesh, line = m.children[1] as THREE.Mesh;
      if (w.line) {
        const dx = w.line.x2 - w.x, dz = w.line.z2 - w.z, len = Math.hypot(dx, dz);
        m.position.set(w.x, 0.09, w.z); m.scale.setScalar(1); m.rotation.y = 0;
        fill.opacity = 0; ring.visible = false; line.visible = true;
        line.position.set(dx / 2, 0, dz / 2);
        line.rotation.y = Math.atan2(dx, dz);
        line.scale.set(w.line.w, 1, len);
        (line.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.4 * k;
      } else {
        m.position.set(w.x, 0.09, w.z); m.scale.setScalar(w.r * (0.35 + 0.65 * k)); m.rotation.y = 0;
        fill.opacity = 0.15 + 0.35 * k; ring.visible = true; line.visible = false;
        ring.scale.setScalar(1 / (0.35 + 0.65 * k)); // outer ring always shows the full size
      }
    });

    // ---------- 終極技 ----------
    const u = sim.ult;
    const am = Math.sqrt(value(sim.stats.area));
    // 時間力場
    this.chrono.visible = !!u.levels.chronoField;
    if (u.levels.chronoField) { this.chrono.position.set(p.x, 0.06, p.z); this.chrono.scale.setScalar(ULT.chronoField.radius(u.levels.chronoField) * am); this.chrono.rotation.y = -t * 0.4; }
    // 環繞光球
    let oi = 0;
    if (u.levels.orbs) {
      const n = ULT.orbs.count(u.levels.orbs), r = ULT.orbs.radius * am;
      for (let i = 0; i < n && oi < MAX_INST; i++) {
        const a = u.orbAngle + (i / n) * Math.PI * 2;
        this.tmp.position.set(p.x + Math.sin(a) * r, 0.9 + Math.sin(t * 5 + i) * 0.1, p.z + Math.cos(a) * r);
        this.tmp.rotation.set(0, 0, 0);
        this.tmp.scale.setScalar(1 + Math.sin(t * 12 + i) * 0.12);
        this.tmp.updateMatrix();
        this.orbMesh.setMatrixAt(oi++, this.tmp.matrix);
      }
    }
    this.orbMesh.count = oi; this.orbMesh.instanceMatrix.needsUpdate = true;
    // 追蹤飛彈
    let mi = 0;
    for (const m of u.missiles) {
      if (mi >= MAX_INST) break;
      this.tmp.position.set(m.x, 1.1, m.z);
      this.tmp.rotation.set(0, Math.atan2(m.vx, m.vz), 0);
      this.tmp.scale.setScalar(1.1);
      this.tmp.updateMatrix();
      this.missileMesh.setMatrixAt(mi++, this.tmp.matrix);
    }
    this.missileMesh.count = mi; this.missileMesh.instanceMatrix.needsUpdate = true;
    // 隕石雨
    let mti = 0;
    for (const m of u.meteors) {
      if (mti >= MAX_INST) break;
      this.tmp.position.set(m.x + m.delay * 3, 0.5 + m.delay * 14, m.z - m.delay * 3);
      this.tmp.rotation.set(t * 4, t * 3, 0);
      this.tmp.scale.setScalar(1);
      this.tmp.updateMatrix();
      this.meteorMesh.setMatrixAt(mti, this.tmp.matrix);
      this.tmp.position.set(m.x, 0.08, m.z);
      this.tmp.rotation.set(0, 0, 0);
      this.tmp.scale.setScalar(ULT.meteorShower.radius * am * (0.4 + Math.min(1, m.delay) * 0.6));
      this.tmp.updateMatrix();
      this.meteorMarks.setMatrixAt(mti, this.tmp.matrix);
      mti++;
    }
    this.meteorMesh.count = mti; this.meteorMesh.instanceMatrix.needsUpdate = true;
    this.meteorMarks.count = mti; this.meteorMarks.instanceMatrix.needsUpdate = true;
    // 吸血蝙蝠
    let bti = 0;
    for (const b of u.bats) {
      if (bti >= MAX_INST) break;
      this.tmp.position.set(b.x, 1.3 + Math.sin(t * 9 + bti) * 0.2, b.z);
      this.tmp.rotation.set(0, Math.atan2(b.vx, b.vz), 0);
      this.tmp.scale.set(1 + Math.sin(t * 30 + bti) * 0.45, 1, 1); // flapping
      this.tmp.updateMatrix();
      this.batMesh.setMatrixAt(bti++, this.tmp.matrix);
    }
    this.batMesh.count = bti; this.batMesh.instanceMatrix.needsUpdate = true;
    // 雷霆圖騰
    let tti = 0;
    for (const tt of u.totems) {
      if (tti >= MAX_INST) break;
      const grow = Math.min(1, (ULT.thunderTotem.dur - tt.life) * 4);
      this.tmp.position.set(tt.x, 0, tt.z); this.tmp.rotation.set(0, 0, 0); this.tmp.scale.set(1, grow, 1);
      this.tmp.updateMatrix();
      this.totemMesh.setMatrixAt(tti, this.tmp.matrix);
      this.tmp.position.set(tt.x, 1.6 * grow + 0.35 + Math.sin(t * 4) * 0.08, tt.z); this.tmp.rotation.set(0, t * 2, 0); this.tmp.scale.setScalar(1 + (tt.tick > 0.45 ? 0.5 : 0));
      this.tmp.updateMatrix();
      this.totemOrbs.setMatrixAt(tti, this.tmp.matrix);
      tti++;
    }
    this.totemMesh.count = tti; this.totemMesh.instanceMatrix.needsUpdate = true;
    this.totemOrbs.count = tti; this.totemOrbs.instanceMatrix.needsUpdate = true;
    // 聖光壁壘
    this.shieldBubble.visible = u.shield > 0;
    if (u.shield > 0) { this.shieldBubble.scale.setScalar(1 + Math.sin(t * 3) * 0.04); (this.shieldBubble.material as THREE.MeshBasicMaterial).opacity = 0.14 + Math.min(0.2, u.shield / sim.maxHp); }
    // 地雷
    let li = 0;
    for (const m of u.mines) {
      if (li >= MAX_INST) break;
      this.tmp.position.set(m.x, 0.07, m.z);
      this.tmp.rotation.set(0, t * 1.5 + li, 0);
      this.tmp.scale.setScalar((m.arm > 0 ? 0.6 : 1.4) * (1 + Math.sin(t * 6 + li) * 0.08));
      this.tmp.updateMatrix();
      this.mineMesh.setMatrixAt(li, this.tmp.matrix);
      this.mineMesh.setColorAt(li, this.tmpColor.setHex(m.arm > 0 ? 0x5a3d80 : Math.sin(t * 4 + li) > 0 ? 0xc58aff : 0xe6ccff));
      li++;
    }
    this.mineMesh.count = li; this.mineMesh.instanceMatrix.needsUpdate = true;
    if (this.mineMesh.instanceColor) this.mineMesh.instanceColor.needsUpdate = true;
    // 黑洞
    while (this.holeMeshes.length < u.holes.length) {
      const g = new THREE.Group();
      const disc = new THREE.CircleGeometry(1, 40); disc.rotateX(-Math.PI / 2);
      g.add(new THREE.Mesh(disc, new THREE.MeshBasicMaterial({ color: 0x14001f, transparent: true, opacity: 0.55, depthWrite: false })));
      const swirl = new THREE.RingGeometry(0.35, 1, 40, 1, 0, Math.PI * 1.3); swirl.rotateX(-Math.PI / 2);
      g.add(new THREE.Mesh(swirl, new THREE.MeshBasicMaterial({ color: 0x9b4dff, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide })));
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), new THREE.MeshBasicMaterial({ color: 0x000000 }));
      core.position.y = 0.6;
      g.add(core);
      this.scene.add(g);
      this.holeMeshes.push(g);
    }
    this.holeMeshes.forEach((g, i) => {
      const h = u.holes[i];
      g.visible = !!h;
      if (!h) return;
      g.position.set(h.x, 0.08, h.z);
      (g.children[0] as THREE.Mesh).scale.setScalar(h.r);
      (g.children[1] as THREE.Mesh).scale.setScalar(h.r);
      g.children[1].rotation.y = -t * 4;
      g.children[2].scale.setScalar(1 + Math.sin(t * 8) * 0.15);
    });

    // swing arcs and explosions fade out
    this.fx = this.fx.filter((f) => {
      f.life -= dt;
      const k = Math.max(0, f.life / f.max);
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = 0.75 * k;
      if (f.grow) f.mesh.scale.setScalar(1 + (1 - k) * f.grow);
      if (f.life <= 0) { this.scene.remove(f.mesh); f.mesh.geometry.dispose(); (f.mesh.material as THREE.Material).dispose(); return false; }
      return true;
    });

    this.updateNumbers(dt);

    // coins
    let ci = 0;
    for (const c of sim.coins) {
      if (ci >= MAX_INST) break;
      this.tmp.position.set(c.x, 0.45 + Math.sin(c.spin) * 0.1, c.z);
      this.tmp.rotation.set(Math.PI / 2, 0, c.spin);
      this.tmp.scale.setScalar(c.value >= 3 ? 1.4 : 1);
      this.tmp.updateMatrix();
      this.coins.setMatrixAt(ci++, this.tmp.matrix);
    }
    this.coins.count = ci; this.coins.instanceMatrix.needsUpdate = true;

    this.shadows.count = si;
    this.shadows.instanceMatrix.needsUpdate = true;

    // sparks
    let ki = 0;
    this.sparkData = this.sparkData.filter((s) => (s.life -= dt) > 0);
    for (const s of this.sparkData) {
      s.vy -= 18 * dt;
      s.x += s.vx * dt; s.y = Math.max(0.05, s.y + s.vy * dt); s.z += s.vz * dt;
      this.tmp.position.set(s.x, s.y, s.z);
      this.tmp.rotation.set(s.life * 9, s.life * 7, 0);
      this.tmp.scale.setScalar(Math.min(1, s.life * 3));
      this.tmp.updateMatrix();
      this.sparks.setMatrixAt(ki, this.tmp.matrix);
      this.sparks.setColorAt(ki, s.color);
      ki++;
    }
    this.sparks.count = ki; this.sparks.instanceMatrix.needsUpdate = true;
    if (this.sparks.instanceColor) this.sparks.instanceColor.needsUpdate = true;

    if (this.torchFlames) {
      this.torchSpots.forEach((f, i) => {
        this.tmp.position.set(f.x, f.y + Math.sin(t * 13 + i * 1.7) * 0.04, f.z);
        this.tmp.rotation.set(0, t * 2 + i, 0);
        this.tmp.scale.set(1, 1 + Math.sin(t * 17 + i * 2.3) * 0.25, 1);
        this.tmp.updateMatrix();
        this.torchFlames!.setMatrixAt(i, this.tmp.matrix);
      });
      this.torchFlames.instanceMatrix.needsUpdate = true;
    }

    // camera follows the player smoothly
    this.camTarget.lerp(new THREE.Vector3(p.x, 0, p.z), 1 - Math.exp(-dt * 8));
    this.shake = Math.max(0, this.shake - dt);
    const sx = (Math.random() - 0.5) * this.shake, sz = (Math.random() - 0.5) * this.shake;
    this.camera.position.copy(this.camTarget).add(CAM_OFFSET).add(new THREE.Vector3(sx, 0, sz));
    this.camera.lookAt(this.camTarget.x + sx, 0, this.camTarget.z + sz);

    this.renderer.render(this.scene, this.camera);
  }

  /** Call when a new run starts. */
  reset(sim: Sim): void {
    for (const n of this.dmgNums) { n.el.remove(); this.dmgPool.push(n.el); }
    this.dmgNums = [];
    const w = sim.weapons;
    this.buildClassLook({ id: sim.cls.id, sub: sim.awk?.sub ?? null, sub2: sim.awk?.sub2 ?? null, main: w?.main ?? null, off: w?.blocked ? null : w?.sub ?? null, custom: !!w });
    for (const f of this.fx) this.scene.remove(f.mesh);
    this.fx = [];
    for (const m of this.zoneMeshes) m.visible = false;
    this.mapIndex = -1;
    for (const g of this.bossMeshes.values()) this.scene.remove(g);
    this.bossMeshes.clear();
    for (const b of this.bossActors.values()) b.actor.dispose();
    this.bossActors.clear();
    this.lastWarnCount = 0;
    this.lastAtk = 0;
    this.sparkData = [];
    this.shake = 0;
    this.camTarget.set(sim.player.x, 0, sim.player.z);
  }

  private buildClassLook(L: PlayerLook): void {
    this.look = L;
    const { id, sub, sub2 } = L;
    if (this.actor) { this.player.remove(this.actor.root); this.actor.dispose(); this.actor = null; }
    if (this.floater) { this.player.remove(this.floater); this.floater = null; }
    // what is in each hand: the equipped weapons, or the class's default look when nothing is equipped
    const def = weaponReq(id, sub);
    const mainW = L.custom ? L.main ?? def.mainWeapon : def.mainWeapon;
    const offW = L.custom ? (mainW && WEAPONS[mainW].twoHanded ? null : L.off ?? (L.main ? null : def.subWeapon)) : def.subWeapon;
    if (this.flips) {
      const right = mainW ? WEAPON_PROPS[mainW] ?? null : null;
      const left = offW ? WEAPON_PROPS[offW] ?? null : null;
      const look: Look = { char: PLAYER_CHARS[id], right, left, height: PLAYER_HEIGHT };
      this.actor = new Actor(look, id === 'necro' ? { hue: 'necro' } : {});
      this.player.add(this.actor.root);
      if (mainW === 'spear') {
        // no lance in the model packs: a simple one in the right hand, pointing along the hand
        const lance = new THREE.Mesh(lanceGeo(id === 'archer' ? 1.9 : 2.4), new THREE.MeshLambertMaterial({ color: 0xd8c49a }));
        lance.rotation.x = -Math.PI / 2;
        lance.position.y = 0.2;
        this.actor.root.getObjectByName('handslot.r')?.add(lance) ?? this.actor.root.getObjectByName('handslotr')?.add(lance);
      }
      if (sub2) this.addThirdClass(id, sub, sub2);
    }
    for (const o of this.primitiveLook) o.visible = !this.actor;
    this.weaponGroup.clear();
    const body = this.playerBody.material as THREE.MeshLambertMaterial;
    body.color.setHex(id === 'warrior' ? 0xc4473a : id === 'archer' ? 0x3fd0b0 : id === 'necro' ? 0x3b3550 : 0x7b5cd6);
    if (id === 'necro') {
      const hood = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.55, 10), new THREE.MeshLambertMaterial({ color: 0x22202c }));
      hood.position.y = 1.78;
      this.weaponGroup.add(hood);
    }
    if (id === 'mage') {
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.6, 10), new THREE.MeshLambertMaterial({ color: 0x4b3a9a }));
      hat.position.y = 1.95;
      this.weaponGroup.add(hat);
    }
    if (mainW) this.weaponGroup.add(this.weaponMesh(mainW, 'right'));
    if (offW) this.weaponGroup.add(this.weaponMesh(offW, 'left'));
  }

  /** The third class shows on the model: a sword in the mouth (three warriors = three swords), a weapon on the back, or a floating book / soul. */
  private addThirdClass(id: ClassId, sub: ClassId | null, sub2: ClassId): void {
    const a = this.actor!;
    if (sub2 === 'warrior') {
      if (id === 'warrior' && sub === 'warrior') a.attach('head', '1H_Sword', THIRD.mouth);
      else a.attach('chest', '2H_Sword', THIRD.back);
    } else if (sub2 === 'archer') a.attach('chest', '2H_Crossbow', THIRD.backBow);
    else if (sub2 === 'mage') {
      const book = Actor.prop('Spellbook_open');
      if (book) { book.scale.setScalar(0.45); this.floater = book; this.player.add(book); }
    } else {
      const g = new THREE.Group();
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), new THREE.MeshBasicMaterial({ color: 0xc58aff }));
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), new THREE.MeshBasicMaterial({ color: 0x8a4dff, transparent: true, opacity: 0.35, depthWrite: false }));
      g.add(core, glow);
      this.floater = g; this.player.add(g);
    }
  }

  /** Simple shapes for each weapon type. Only weapons show on the model (plan Q19). */
  private weaponMesh(type: WeaponType, hand: 'right' | 'left'): THREE.Object3D {
    const mat = (c: number) => new THREE.MeshLambertMaterial({ color: c });
    const g = new THREE.Group();
    const side = hand === 'right' ? 0.45 : -0.45;
    switch (type) {
      case 'sword': case 'dagger': {
        const len = type === 'sword' ? 1.1 : 0.55;
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, len), mat(0xdfe6ee));
        blade.position.set(side, 0.95, 0.2 + len / 2);
        g.add(blade);
        break;
      }
      case 'spear': {
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), mat(0x7a5a2b));
        shaft.rotation.x = Math.PI / 2;
        shaft.position.set(0.35, 1.0, 0.6);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 6), mat(0xdfe6ee));
        tip.rotation.x = Math.PI / 2;
        tip.position.set(0.35, 1.0, 1.95);
        g.add(shaft, tip);
        break;
      }
      case 'bow': case 'longbow': case 'shortbow': {
        const r = type === 'longbow' ? 0.7 : type === 'shortbow' ? 0.3 : 0.45;
        const bow = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 6, 16, Math.PI), mat(type === 'longbow' ? 0xd9a441 : 0x8b5a2b));
        bow.position.set(hand === 'right' ? 0 : -0.4, 0.9, 0.45);
        bow.rotation.set(0, Math.PI / 2, Math.PI / 2);
        g.add(bow);
        break;
      }
      case 'staff': case 'greatstaff': {
        const big = type === 'greatstaff';
        const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, big ? 2 : 1.6, 6), mat(0x6b4a2a));
        staff.position.set(side, big ? 1.1 : 0.9, 0.2);
        const orb = new THREE.Mesh(big ? new THREE.OctahedronGeometry(0.28) : new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshBasicMaterial({ color: big ? 0x9b6bff : 0xffa03a }));
        orb.position.set(side, big ? 2.15 : 1.75, 0.2);
        g.add(staff, orb);
        break;
      }
      case 'shield': {
        const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 14), mat(0x7a5a2b));
        shield.rotation.z = Math.PI / 2;
        shield.position.set(side, 0.85, 0.1);
        g.add(shield);
        break;
      }
      case 'quiver': {
        const q = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.6, 8), mat(0x5a3d1e));
        q.position.set(0.15, 1.1, -0.35);
        q.rotation.x = 0.4;
        g.add(q);
        break;
      }
      case 'scythe': case 'greatscythe': {
        const big = type === 'greatscythe';
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, big ? 2.2 : 1.7, 6), mat(0x3a2a1e));
        shaft.position.set(side, big ? 1.15 : 0.95, 0.2);
        const blade = new THREE.Mesh(new THREE.TorusGeometry(big ? 0.55 : 0.42, 0.05, 6, 14, Math.PI * 0.8), mat(0xc9ccd6));
        blade.position.set(side, big ? 2.15 : 1.75, big ? 0.6 : 0.5);
        blade.rotation.set(0, Math.PI / 2, Math.PI);
        g.add(shaft, blade);
        break;
      }
      case 'skull': {
        const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), mat(0xeee6d0));
        skull.position.set(side, 1.2, 0.3);
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: 0xa65cff }));
        glow.position.set(side, 1.24, 0.48);
        g.add(skull, glow);
        break;
      }
      case 'orb': {
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), new THREE.MeshBasicMaterial({ color: 0x7fd8ff }));
        orb.position.set(side, 1.5, 0.1);
        g.add(orb);
        break;
      }
    }
    return g;
  }

  private addSwing(x: number, z: number, angle: number, reach: number, arc: number, fx: FxKind = 'physical'): void {
    const geo = new THREE.RingGeometry(0.4, reach, 24, 1, -arc / 2, arc);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: FX_COLORS[fx], transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }));
    // ring angles start on +x; our angle 0 points at +z
    m.rotation.y = angle - Math.PI / 2;
    m.position.set(x, 0.12, z);
    this.scene.add(m);
    this.fx.push({ mesh: m, life: 0.16, max: 0.16, grow: 0 });
  }

  /** Remove all floating numbers (run ended / back to the menu). */
  clearNumbers(): void {
    for (const n of this.dmgNums) { n.el.remove(); this.dmgPool.push(n.el); }
    this.dmgNums = [];
  }

  /** A floating damage number (crits always; normal hits only some of the time so it stays readable). */
  private addNumber(x: number, z: number, dmg: number, crit: boolean): void {
    if (!fxPrefs.numbers || dmg < 1) return;
    if (!crit && (this.dmgNums.length > 18 || Math.random() > 0.35)) return;
    if (this.dmgNums.length > 34) return;
    const el = this.dmgPool.pop() ?? document.createElement('div');
    el.className = `dmgnum${crit ? ' crit' : ''}`;
    el.textContent = dmg >= 10000 ? `${(dmg / 1000).toFixed(0)}k` : dmg >= 1000 ? `${(dmg / 1000).toFixed(1)}k` : `${Math.round(dmg)}`;
    this.dmgLayer.appendChild(el);
    this.dmgNums.push({ el, x: x + (Math.random() - 0.5) * 0.6, z, life: crit ? 0.8 : 0.6, max: crit ? 0.8 : 0.6, drift: (Math.random() - 0.5) * 18 });
  }

  private updateNumbers(dt: number): void {
    if (!this.dmgNums.length) return;
    const w = this.canvasEl.clientWidth, h = this.canvasEl.clientHeight;
    this.dmgNums = this.dmgNums.filter((n) => {
      n.life -= dt;
      if (n.life <= 0) { n.el.remove(); this.dmgPool.push(n.el); return false; }
      const k = 1 - n.life / n.max;
      this.projV.set(n.x, 1.6, n.z).project(this.camera);
      const sx = (this.projV.x + 1) / 2 * w + n.drift * k, sy = (1 - this.projV.y) / 2 * h - 34 * k;
      n.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%) scale(${(k < 0.15 ? 0.6 + k * 4 : 1).toFixed(2)})`;
      n.el.style.opacity = `${Math.min(1, n.life / n.max * 2.5)}`;
      return true;
    });
  }

  /** 天罰聖環: a golden ring that sweeps out from the player. */
  private addWave(x: number, z: number, r: number): void {
    const geo = new THREE.RingGeometry(0.86, 1, 64);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffd86b, transparent: true, opacity: 0.85, depthWrite: false }));
    m.position.set(x, 0.18, z);
    this.scene.add(m);
    const life = r / 13;
    this.fx.push({ mesh: m, life, max: life, grow: r });
    this.shake = Math.max(this.shake, 0.2);
  }

  /** 雷神之怒: bright segments between the enemies the bolt jumped to. */
  private addLightning(pts: number[]): void {
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const x1 = pts[i], z1 = pts[i + 1], x2 = pts[i + 2], z2 = pts[i + 3];
      const len = Math.hypot(x2 - x1, z2 - z1) || 0.1;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, len), new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.9 }));
      m.position.set((x1 + x2) / 2, 1.0, (z1 + z2) / 2);
      m.rotation.y = Math.atan2(x2 - x1, z2 - z1);
      this.scene.add(m);
      this.fx.push({ mesh: m, life: 0.18, max: 0.18, grow: 0 });
      this.burst(x2, z2, 0xbfe8ff, 3);
    }
  }

  private addDash(x1: number, z1: number, x2: number, z2: number): void {
    const len = Math.hypot(x2 - x1, z2 - z1) || 0.1;
    const geo = new THREE.PlaneGeometry(1.2, len);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.75, depthWrite: false }));
    m.position.set((x1 + x2) / 2, 0.14, (z1 + z2) / 2);
    m.rotation.y = Math.atan2(x2 - x1, z2 - z1);
    this.scene.add(m);
    this.fx.push({ mesh: m, life: 0.3, max: 0.3, grow: 0 });
  }

  private addExplosion(x: number, z: number, r: number, fx: FxKind = 'fire'): void {
    const geo = new THREE.CircleGeometry(r, 24);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: FX_COLORS[fx], transparent: true, opacity: 0.75, depthWrite: false }));
    m.position.set(x, 0.15, z);
    m.scale.setScalar(0.5);
    this.scene.add(m);
    this.fx.push({ mesh: m, life: 0.28, max: 0.28, grow: 0.6 });
    this.burst(x, z, FX_COLORS[fx], 6);
  }

  private drawBoss(e: Enemy, t: number, sim: Sim, dt: number): void {
    if (this.flips) { this.drawBossModel(e, sim, dt); return; }
    let g = this.bossMeshes.get(e.id);
    if (!g) {
      g = new THREE.Group();
      const big = e.kind === 'boss' || e.kind === 'worldboss';
      const color = e.kind === 'worldboss' && sim.wb ? sim.wb.color : big ? 0x8a1f2c : 0xa86b28;
      const body = new THREE.Mesh(
        e.kind === 'worldboss' ? new THREE.OctahedronGeometry(e.radius, 1) : big ? new THREE.IcosahedronGeometry(e.radius, 0) : new THREE.DodecahedronGeometry(e.radius, 0),
        new THREE.MeshLambertMaterial({ color, emissive: 0x000000 }),
      );
      body.position.y = e.radius + 0.1;
      body.name = 'body';
      g.add(body);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(e.radius * 0.5, e.radius * 0.8, big ? 5 : 4), new THREE.MeshLambertMaterial({ color: 0xffc23a }));
      crown.position.y = e.radius * 2.3;
      g.add(crown);
      this.scene.add(g);
      this.bossMeshes.set(e.id, g);
    }
    g.position.set(e.x, Math.abs(Math.sin(t * 3)) * 0.15, e.z);
    g.rotation.y = t * 0.8;
    const body = g.getObjectByName('body') as THREE.Mesh;
    const enraged = e.kind === 'worldboss' && sim.wbPhase === 2;
    (body.material as THREE.MeshLambertMaterial).emissive.setHex(e.hitFlash > 0 ? 0x664444 : enraged ? 0x441100 : 0x000000);
    if (e.kind === 'worldboss') g.scale.setScalar(1 + sim.wbPhase * 0.08);
  }

  /** Bosses as animated models: mini boss = barbarian, boss = skeleton warlord, world boss = giant skeleton mage. */
  private drawBossModel(e: Enemy, sim: Sim, dt: number): void {
    let g = this.bossMeshes.get(e.id);
    let b = this.bossActors.get(e.id);
    if (!g || !b) {
      const h = e.radius * (e.kind === 'miniboss' ? 3.2 : 3);
      const look: Look = e.kind === 'miniboss' ? { char: 'Barbarian', right: '2H_Axe', height: h }
        : e.kind === 'boss' ? { char: 'Skeleton_Warrior', right: 'Skeleton_Axe', left: 'Skeleton_Shield_Large_A', height: h }
        : { char: 'Skeleton_Mage', right: 'Skeleton_Staff', height: h };
      const tint = e.kind === 'boss' ? 0xff9a9a : e.kind === 'worldboss' && sim.wb ? sim.wb.color : undefined;
      const actor = new Actor(look, tint !== undefined ? { tint } : {});
      g = new THREE.Group();
      g.add(actor.root);
      this.scene.add(g);
      this.bossMeshes.set(e.id, g);
      b = { actor, x: e.x, z: e.z, atk: 0 };
      this.bossActors.set(e.id, b);
    }
    const p = sim.player;
    const moved = Math.hypot(e.x - b.x, e.z - b.z);
    b.x = e.x; b.z = e.z;
    g.position.set(e.x, 0, e.z);
    const dx = (e.dashT ?? 0) > 0 ? (e.dashVx ?? 0) : p.x - e.x, dz = (e.dashT ?? 0) > 0 ? (e.dashVz ?? 0) : p.z - e.z;
    g.rotation.y = Math.atan2(dx, dz);
    b.atk -= dt;
    const dist = Math.hypot(p.x - e.x, p.z - e.z);
    if ((e.dashWind ?? 0) > 0 && b.atk <= 0) { b.actor.attack('spin', 0.9); b.atk = 0.9; }
    else if (dist < e.radius + 1.8 && b.atk <= 0) { b.actor.attack('chop', 0.8); b.atk = 1.1; }
    const enraged = e.kind === 'worldboss' && sim.wbPhase === 2;
    b.actor.flash(e.hitFlash > 0 ? 0x553333 : enraged ? 0x441100 : 0);
    b.actor.update(sim.phase === 'playing' ? dt : 0, moved > 0.002, (e.dashT ?? 0) > 0 ? 2.2 : 1);
    if (e.kind === 'worldboss') g.scale.setScalar(1 + sim.wbPhase * 0.08);
  }

  /** The arena from KayKit dungeon pieces: tiled floor, tall walls on the far sides, low fences on the near
   *  sides (so they never hide the player), torches and banners on the walls, stone pillars, some clutter.
   *  Each biome tints the stone. Returns false if the models aren't loaded yet. */
  private buildModelMap(sim: Sim): boolean {
    const tex = dungeonTexture();
    if (!tex || !dungeonGeo('wall')) return false;
    this.dungeonMat ??= new THREE.MeshLambertMaterial({ map: tex });
    const theme = sim.theme % BIOME_LOOKS.length;
    const look = BIOME_LOOKS[theme];
    let seed = (sim.map * 7919 + sim.theme * 104729 + sim.tier * 31) >>> 0 || 1;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const placed = new Map<DungeonPiece, { m: THREE.Matrix4; c: number }[]>();
    const put = (name: DungeonPiece, x: number, y: number, z: number, rotY = 0, sx = 1, sy = 1, sz = 1, color = look.stone) => {
      const o = new THREE.Object3D();
      o.position.set(x, y, z); o.rotation.y = rotY; o.scale.set(sx, sy, sz); o.updateMatrix();
      if (!placed.has(name)) placed.set(name, []);
      placed.get(name)!.push({ m: o.matrix.clone(), c: color });
    };
    const H = ARENA_HALF;
    // floor: 4×4 tiles, one ring past the walls
    for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) {
      const x = i * 4, z = j * 4;
      const rough = rand() < 0.07 && Math.abs(i) > 1 && Math.abs(j) > 1;
      put(rough ? look.floorRough : look.floor, x, 0, z, Math.floor(rand() * 4) * Math.PI / 2, 1, 1, 1, look.floorTint);
    }
    // far walls (behind, x = -H and z = -H): tall, with torches and banners
    this.torchSpots = [];
    const segs = [-20, -16, -12, -8, -4, 0, 4, 8, 12, 16, 20];
    segs.forEach((c, k) => {
      for (const side of [0, 1] as const) {
        const pick = rand();
        const w: DungeonPiece = pick < 0.15 ? 'wall_cracked' : pick < 0.3 ? 'wall_window_closed' : 'wall';
        const x = side === 0 ? c : -H - 0.5, z = side === 0 ? -H - 0.5 : c, rot = side === 0 ? 0 : Math.PI / 2;
        put(w, x, 0, z, rot);
        if (k % 3 === 1) {
          // torch on the inner face (+0.5 from the wall line)
          const tx = side === 0 ? c : -H, tz = side === 0 ? -H : c;
          put('torch_mounted', tx, 2.2, tz, rot, 1, 1, 1, 0xffffff);
          this.torchSpots.push({ x: side === 0 ? tx : tx + 0.5, y: 2.95, z: side === 0 ? tz + 0.5 : tz });
        } else if (k % 3 === 0 && k !== 0) {
          put(look.banner, side === 0 ? c : -H, 0, side === 0 ? -H - 0.2 : c, rot, 1, 1, 1, 0xffffff);
        }
      }
      // near sides: low stone fences
      put('barrier_column', c, 0, H + 0.4, 0);
      put('barrier_column', H + 0.4, 0, c, Math.PI / 2);
    });
    put('pillar', -H - 0.5, 0, -H - 0.5, 0, 1.1, 1.1, 1.1);
    put('pillar', H + 0.4, 0, -H - 0.5, 0, 0.8, 0.45, 0.8);
    put('pillar', -H - 0.5, 0, H + 0.4, 0, 0.8, 0.45, 0.8);
    put('pillar', H + 0.4, 0, H + 0.4, 0, 0.8, 0.45, 0.8);
    // pillars that block movement
    for (const pl of sim.pillars) {
      const s = pl.r / 0.75;
      put(rand() < 0.3 ? 'pillar_decorated' : 'pillar', pl.x, 0, pl.z, Math.floor(rand() * 4) * Math.PI / 2, s, 0.65, s);
    }
    // clutter in the back corners and along the back walls (no collision, kept to the edges)
    const clutter: DungeonPiece[] = ['barrel_large', 'barrel_small', 'crates_stacked', 'box_small', 'rubble_half', 'candle_triple'];
    for (let i = 0; i < 10; i++) {
      const along = (rand() * 2 - 1) * (H - 3);
      const onX = rand() < 0.5;
      const x = onX ? along : -H + 1 + rand() * 0.8, z = onX ? -H + 1 + rand() * 0.8 : along;
      const kind = clutter[Math.floor(rand() * clutter.length)];
      const sc = kind === 'rubble_half' ? 0.5 : kind === 'crates_stacked' ? 0.7 : 0.8;
      put(kind, x, 0, z, rand() * Math.PI * 2, sc, sc, sc, 0xffffff);
    }
    for (const [name, list] of placed) {
      const geo = dungeonGeo(name);
      if (!geo) continue;
      const im = new THREE.InstancedMesh(geo, this.dungeonMat, list.length);
      list.forEach((p, i) => { im.setMatrixAt(i, p.m); im.setColorAt(i, this.tmpColor.setHex(p.c)); });
      im.frustumCulled = false;
      this.mapGroup.add(im);
    }
    // torch flames: small glowing shapes that flicker
    if (this.torchSpots.length) {
      const flame = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: look.flame }), this.torchSpots.length);
      flame.frustumCulled = false;
      this.torchFlames = flame;
      this.mapGroup.add(flame);
    }
    return true;
  }
}
