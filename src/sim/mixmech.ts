// 混合層 奧義: every two-class pair has its own mechanic (on attacks, on kills or on a timer), with its own visuals.
import { shootArrow } from './abilities';
import { value } from './stats';
import { tr } from '../i18n';
import type { Enemy, FxKind, Sim } from './sim';

type Trigger = { every?: number; timer?: number; onKill?: number };
interface Mech { name: [string, string]; desc: (pct: string) => [string, string]; trig: Trigger; fn: (sim: Sim, t: Enemy | null, k: number) => void }

const area = (sim: Sim) => Math.sqrt(value(sim.stats.area));
const roll = (sim: Sim) => sim.rollDamage();
const vfx = (sim: Sim, kind: 'pillar' | 'ring' | 'beam' | 'rune' | 'shards', x: number, z: number, fx: FxKind, r = 2, x2?: number, z2?: number) => sim.events.push({ type: 'vfx', kind, x, z, r, fx, x2, z2 });
const nearest = (sim: Sim, x: number, z: number, n: number, r = 12) => sim.enemies.filter((e) => e.hp > 0 && Math.hypot(e.x - x, e.z - z) < r).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z)).slice(0, n);
const strongest = (sim: Sim, n: number, r = 14) => { const p = sim.player; return sim.enemies.filter((e) => e.hp > 0 && Math.hypot(e.x - p.x, e.z - p.z) < r).sort((a, b) => b.maxHp - a.maxHp).slice(0, n); };
const hit = (sim: Sim, e: Enemy, mult: number) => { const { dmg, crit } = roll(sim); sim.damageEnemy(e, dmg * mult, crit, true); };
const beamTo = (sim: Sim, e: Enemy, mult: number, fx: FxKind) => { const p = sim.player; vfx(sim, 'beam', p.x, p.z, fx, 0.35, e.x, e.z); hit(sim, e, mult); };

export const MIX_MECH: Record<string, Mech> = {
  warrior_warrior: { name: ['雙刃迴旋', 'Twin Whirl'], trig: { every: 4 }, desc: (p) => [`每第 4 下攻擊再轉一圈斬晒身邊敵人（${p}）`, `Every 4th attack also spins, hitting everything around you (${p})`],
    fn: (sim, _t, k) => { const p = sim.player, r = 3.2 * area(sim); sim.arcHit(0, r, Math.PI * 2, 1.2 * k, 'physical'); vfx(sim, 'ring', p.x, p.z, 'physical', r); } },
  warrior_archer: { name: ['穿雲槍', 'Sky Lance'], trig: { every: 5 }, desc: (p) => [`每第 5 下攻擊擲出一支穿透長槍（${p}）`, `Every 5th attack throws a piercing lance (${p})`],
    fn: (sim, t, k) => { if (!t) return; const p = sim.player, a = Math.atan2(t.x - p.x, t.z - p.z), { dmg, crit } = roll(sim); shootArrow(sim, a, dmg * 2.5 * k, crit, { pierce: 99, speed: 30, range: 16, radius: 0.6 }); vfx(sim, 'beam', p.x, p.z, 'holy', 0.5, p.x + Math.sin(a) * 16, p.z + Math.cos(a) * 16); } },
  warrior_mage: { name: ['聖光審判', 'Judgement'], trig: { timer: 5 }, desc: (p) => [`每 5 秒一道聖光柱打落最強嘅敵人（${p}），回 3% HP`, `Every 5s a pillar of light strikes the strongest enemy (${p}) and heals 3% HP`],
    fn: (sim, _t, k) => { const [e] = strongest(sim, 1); if (!e) return; const { dmg, crit } = roll(sim); sim.explode(e.x, e.z, 2.2 * area(sim), dmg * 3 * k, crit, 'holy', { noProc: true }); vfx(sim, 'pillar', e.x, e.z, 'holy', 1.4); sim.player.hp = Math.min(sim.maxHp, sim.player.hp + sim.maxHp * 0.03); } },
  warrior_necro: { name: ['死亡印記', 'Death Mark'], trig: { every: 5 }, desc: (p) => [`每第 5 下攻擊喺目標位置爆開暗影（${p}），每隻打中回 0.5% HP`, `Every 5th attack bursts shadow at the target (${p}), healing 0.5% HP per enemy hit`],
    fn: (sim, t, k) => { if (!t) return; const r = 2.6 * area(sim), n = nearest(sim, t.x, t.z, 99, r).length, { dmg, crit } = roll(sim); sim.explode(t.x, t.z, r, dmg * 1.8 * k, crit, 'shadow', { noProc: true }); vfx(sim, 'shards', t.x, t.z, 'shadow', r); sim.player.hp = Math.min(sim.maxHp, sim.player.hp + sim.maxHp * Math.min(0.05, 0.005 * n)); } },
  archer_warrior: { name: ['致命追擊', 'Deadly Pursuit'], trig: { every: 4 }, desc: (p) => [`每第 4 下攻擊向最強嘅敵人射一支重箭（${p}，必定暴擊）`, `Every 4th attack fires a heavy bolt at the strongest enemy (${p}, always crits)`],
    fn: (sim, _t, k) => { const [e] = strongest(sim, 1); if (!e) return; sim.forceCrit = true; beamTo(sim, e, 1.6 * k, 'physical'); sim.forceCrit = false; vfx(sim, 'shards', e.x, e.z, 'physical', 1.2); } },
  archer_archer: { name: ['鷹擊', 'Hawk Strike'], trig: { every: 5 }, desc: (p) => [`每第 5 下攻擊同時射中附近 3 隻敵人（各 ${p}）`, `Every 5th attack also strikes 3 nearby enemies (${p} each)`],
    fn: (sim, _t, k) => { const p = sim.player; for (const e of nearest(sim, p.x, p.z, 3, 14)) beamTo(sim, e, 1.3 * k, 'physical'); } },
  archer_mage: { name: ['元素箭陣', 'Elemental Circle'], trig: { timer: 6 }, desc: (p) => [`每 6 秒喺最強敵人腳下開魔法陣，火、冰、奧術輪流爆三次（各 ${p}）`, `Every 6s a magic circle under the strongest enemy bursts fire, frost and arcane (${p} each)`],
    fn: (sim, _t, k) => { const [e] = strongest(sim, 1); if (!e) return; const x = e.x, z = e.z, r = 2.4 * area(sim); vfx(sim, 'rune', x, z, 'arcane', r); (['fire', 'frost', 'arcane'] as const).forEach((fx, i) => sim.treeLater.push({ t: 0.2 + i * 0.25, fn: () => sim.withSrc('skill', () => { const { dmg, crit } = roll(sim); sim.explode(x, z, r, dmg * 1.4 * k, crit, fx, { noProc: true, elem: fx === 'arcane' ? undefined : fx }); vfx(sim, 'pillar', x, z, fx, 0.9); }) })); } },
  archer_necro: { name: ['幽魂之箭', 'Ghost Arrow'], trig: { onKill: 0.25 }, desc: (p) => [`殺死敵人時射出幽魂箭打最近嘅敵人（${p}）`, `Killing an enemy sends a ghost arrow at the nearest enemy (${p})`],
    fn: (sim, t, k) => { if (!t) return; const [e] = nearest(sim, t.x, t.z, 1, 10); if (!e) return; vfx(sim, 'beam', t.x, t.z, 'shadow', 0.3, e.x, e.z); hit(sim, e, 1.5 * k); } },
  mage_warrior: { name: ['元素斬', 'Elemental Slash'], trig: { every: 3 }, desc: (p) => [`每第 3 下攻擊向前揮出元素斬（${p}），火冰輪流`, `Every 3rd attack sweeps an elemental slash in front (${p}), fire and frost in turn`],
    fn: (sim, t, k) => { if (!t) return; const p = sim.player, a = Math.atan2(t.x - p.x, t.z - p.z), fx: FxKind = sim.mixN % 2 ? 'frost' : 'fire'; sim.arcHit(a, 4.2 * area(sim), (200 * Math.PI) / 180, 1.5 * k, fx); vfx(sim, 'shards', t.x, t.z, fx, 1.5); } },
  mage_archer: { name: ['星墜', 'Starfall'], trig: { timer: 5 }, desc: (p) => [`每 5 秒 3 粒流星砸落附近敵人（各 ${p}）`, `Every 5s three shooting stars hit nearby enemies (${p} each)`],
    fn: (sim, _t, k) => { const p = sim.player; for (const e of nearest(sim, p.x, p.z, 3, 13)) { const { dmg, crit } = roll(sim); sim.explode(e.x, e.z, 2 * area(sim), dmg * 1.8 * k, crit, 'fire', { noProc: true, elem: 'fire' }); vfx(sim, 'pillar', e.x, e.z, 'fire', 0.8); } } },
  mage_mage: { name: ['奧術共鳴', 'Arcane Resonance'], trig: { every: 4 }, desc: (p) => [`每第 4 下攻擊喺目標爆奧術新星（${p}），再連鎖電到 3 隻敵人`, `Every 4th attack bursts an arcane nova at the target (${p}) and chains to 3 enemies`],
    fn: (sim, t, k) => { if (!t) return; const r = 2.6 * area(sim), { dmg, crit } = roll(sim); sim.explode(t.x, t.z, r, dmg * 1.6 * k, crit, 'arcane', { noProc: true }); vfx(sim, 'ring', t.x, t.z, 'arcane', r); const pts = [t.x, t.z]; for (const e of nearest(sim, t.x, t.z, 4, 9).filter((e) => e !== t).slice(0, 3)) { pts.push(e.x, e.z); hit(sim, e, 0.8 * k); } if (pts.length > 2) sim.events.push({ type: 'lightning', pts }); } },
  mage_necro: { name: ['冥冰新星', 'Grave Frost'], trig: { timer: 6 }, desc: (p) => [`每 6 秒身邊爆出冥冰新星（${p}），減速 3 秒`, `Every 6s a grave-frost nova bursts around you (${p}) and slows for 3s`],
    fn: (sim, _t, k) => { const p = sim.player, r = 4.5 * area(sim), { dmg, crit } = roll(sim); sim.explode(p.x, p.z, r, dmg * 2.2 * k, crit, 'frost', { noProc: true, slow: 0.4, slowTime: 3 }); vfx(sim, 'ring', p.x, p.z, 'frost', r); vfx(sim, 'shards', p.x, p.z, 'shadow', r * 0.6); } },
  necro_warrior: { name: ['骸骨衝鋒', 'Bone Rush'], trig: { timer: 8 }, desc: (p) => [`每 8 秒所有骷髏狂暴 4 秒（傷害 ×1.5），身邊震出衝擊波（${p}）`, `Every 8s all skeletons frenzy for 4s (×1.5 damage) and a shockwave bursts around you (${p})`],
    fn: (sim, _t, k) => { const p = sim.player, r = 4 * area(sim), { dmg, crit } = roll(sim); sim.minionBuff = Math.max(sim.minionBuff, 4); sim.minionBuffMult = Math.max(sim.minionBuffMult, 1.5); sim.explode(p.x, p.z, r, dmg * 1.5 * k, crit, 'shadow', { noProc: true, knock: 1.5 }); vfx(sim, 'ring', p.x, p.z, 'shadow', r); for (const m of sim.minions) vfx(sim, 'pillar', m.x, m.z, 'shadow', 0.5); } },
  necro_archer: { name: ['骨箭雨', 'Bone Volley'], trig: { every: 4 }, desc: (p) => [`每第 4 下攻擊向目標射出 5 支骨箭（各 ${p}）`, `Every 4th attack fires 5 bone arrows at the target (${p} each)`],
    fn: (sim, t, k) => { if (!t) return; const p = sim.player, a = Math.atan2(t.x - p.x, t.z - p.z); for (let i = 0; i < 5; i++) { const { dmg, crit } = roll(sim); shootArrow(sim, a + (i - 2) * 0.12, dmg * 0.9 * k, crit, { pierce: 2, speed: 24, range: 14, shadow: true }); } vfx(sim, 'shards', p.x, p.z, 'shadow', 1.2); } },
  necro_mage: { name: ['靈魂爆燃', 'Soul Pyre'], trig: { timer: 6 }, desc: (p) => [`每 6 秒最強嘅 4 隻敵人身上爆起靈魂火柱（各 ${p}）`, `Every 6s soul-fire pillars erupt on the 4 strongest enemies (${p} each)`],
    fn: (sim, _t, k) => { for (const e of strongest(sim, 4, 12)) { const { dmg, crit } = roll(sim); sim.explode(e.x, e.z, 1.8 * area(sim), dmg * 2 * k, crit, 'shadow', { noProc: true }); vfx(sim, 'pillar', e.x, e.z, 'shadow', 1); } } },
  necro_necro: { name: ['亡者狂潮', 'Tide of the Dead'], trig: { timer: 10 }, desc: (p) => [`每 10 秒喺最近 3 隻敵人腳下爬出骷髏（8 秒，力量 ${p}）`, `Every 10s skeletons claw up under the 3 nearest enemies (8s, power ${p})`],
    fn: (sim, _t, k) => { const p = sim.player; for (const e of nearest(sim, p.x, p.z, 3, 10)) { sim.summon(e.x, e.z, { force: true, life: 8, power: k }); vfx(sim, 'pillar', e.x, e.z, 'shadow', 0.8); vfx(sim, 'rune', e.x, e.z, 'shadow', 1.2); } } },
};
/** Power at rank r (1–3). */
export const mechK = (r: number) => 1 + 0.4 * (r - 1);
export const mechDesc = (key: string, r: number) => { const m = MIX_MECH[key]; if (!m) return ''; const d = m.desc(`${Math.round(100 * mechK(r) * 1)}%`); return tr(d[0], d[1]); };

export function mixOnAttack(sim: Sim, t: Enemy): void {
  const m = sim.mixKey ? MIX_MECH[sim.mixKey] : undefined;
  if (!m?.trig.every || ++sim.mixN % m.trig.every) return;
  sim.withSrc('skill', () => m.fn(sim, t, mechK(sim.mixRank)));
}
export function mixOnKill(sim: Sim, e: Enemy): void {
  const m = sim.mixKey ? MIX_MECH[sim.mixKey] : undefined;
  if (!m?.trig.onKill || sim.time - sim.mixT < m.trig.onKill || sim.mixDepth) return;
  sim.mixT = sim.time; sim.mixDepth++;
  try { sim.withSrc('skill', () => m.fn(sim, e, mechK(sim.mixRank))); } finally { sim.mixDepth--; }
}
export function mixTick(sim: Sim, dt: number): void {
  const m = sim.mixKey ? MIX_MECH[sim.mixKey] : undefined;
  if (!m?.trig.timer) return;
  sim.mixT -= dt;
  if (sim.mixT > 0) return;
  if (!sim.nearestEnemy(sim.player.x, sim.player.z, 12)) { sim.mixT = 0.3; return; }
  sim.mixT = m.trig.timer * sim.sp.cdMult;
  sim.withSrc('skill', () => m.fn(sim, null, mechK(sim.mixRank)));
}
