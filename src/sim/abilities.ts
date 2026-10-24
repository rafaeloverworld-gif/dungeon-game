// Skill-tree auto skills and awakened signature skills.
import { ARENA_HALF } from './config';
import { AUTO_SKILLS, type AutoSkillId } from './skills';
import { rankMult, treeSkillAny, type TreeActive, type TreeSkill } from './tree';
import { value } from './stats';
import type { Enemy, FxKind, Sim } from './sim';

const nearestWithin = (sim: Sim, r: number) => sim.nearestEnemy(sim.player.x, sim.player.z, r);

function enemiesNear(sim: Sim, r: number): number {
  const p = sim.player;
  let n = 0;
  for (const e of sim.enemies) if (Math.hypot(e.x - p.x, e.z - p.z) < r) n++;
  return n;
}

const area = (sim: Sim) => Math.sqrt(value(sim.stats.area));
const atk = (sim: Sim) => value(sim.stats.atk);

export function updateAbilities(sim: Sim, dt: number): void {
  updateTree(sim, dt);

  // ---------- auto skills from the trees ----------
  for (const sk of sim.autoSkills) {
    sk.timer -= dt;
    if (sk.timer > 0) continue;
    const lv2 = sk.level === 2;
    if (sk.id === 'barrier') {
      if (sim.player.hp / sim.maxHp > 0.85 && !nearestWithin(sim, 4)) { sk.timer = 0.5; continue; }
      sk.timer = AUTO_SKILLS.barrier.cooldown[sk.level - 1] * sim.sp.cdMult;
      castAuto(sim, 'barrier', lv2, null);
      continue;
    }
    const target = nearestWithin(sim, 11);
    if (!target) { sk.timer = 0.3; continue; }
    sk.timer = AUTO_SKILLS[sk.id].cooldown[sk.level - 1] * sim.sp.cdMult * (sk.id === 'raiseDead' ? sim.summonCdMult : 1);
    castAuto(sim, sk.id, lv2, target);
  }
  updateZonesEtc(sim, dt);
}

/** One auto skill (old skill boards and the 技能樹 share these). */
export function castAuto(sim: Sim, id: AutoSkillId, lv2: boolean, target: Enemy | null, k = 1): void {
  const A = atk(sim) * k; // 技能樹: rank / 強化 power
  const p = sim.player;
  if (id === 'barrier') {
    p.invuln = Math.max(p.invuln, lv2 ? 1.8 : 1.2);
    p.hp = Math.min(sim.maxHp, p.hp + sim.maxHp * (lv2 ? 0.1 : 0.06));
    sim.events.push({ type: 'explode', x: p.x, z: p.z, r: 1.6, fx: 'holy' });
    return;
  }
  if (!target) return;
  {
    const { crit } = sim.rollDamage();
    const critMult = crit ? value(sim.stats.critDmg) : 1;
    switch (id) {
      case 'whirlwind': {
        const r = (lv2 ? 3.8 : 3) * area(sim);
        sim.arcHit(0, r, Math.PI * 2, (lv2 ? 2.5 : 1.5) * k, 'physical'); // arcHit rolls its own crits
        break;
      }
      case 'slam': {
        const r = (lv2 ? 5.5 : 4) * area(sim);
        sim.explode(p.x, p.z, r, A * (lv2 ? 3 : 2) * critMult, crit, 'physical', { knock: 2.5 });
        break;
      }
      case 'arrowRain': {
        const r = (lv2 ? 3.5 : 2.5) * area(sim);
        sim.explode(target.x, target.z, r, A * (lv2 ? 2 : 1.2) * critMult, crit, 'physical', { slow: 0.7 });
        break;
      }
      case 'warCry': {
        const r = (lv2 ? 6 : 5) * area(sim);
        sim.explode(p.x, p.z, r, A * critMult, crit, 'holy', { slow: 0.5, slowTime: lv2 ? 4 : 3 });
        break;
      }
      case 'snare': {
        const r = (lv2 ? 3.6 : 2.8) * area(sim);
        sim.explode(target.x, target.z, r, A * 0.8 * critMult, crit, 'arcane', { slow: 0.15, slowTime: lv2 ? 3 : 2 });
        break;
      }
      case 'timeWarp': {
        const r = 9 * area(sim);
        sim.explode(p.x, p.z, r, lv2 ? A * 1.2 * critMult : 0, crit, 'arcane', { slow: lv2 ? 0.4 : 0.5, slowTime: lv2 ? 5 : 4 });
        break;
      }
      case 'arrowFan': {
        const n = lv2 ? 8 : 5;
        const base = Math.atan2(target.x - p.x, target.z - p.z);
        const spread = (55 * Math.PI) / 180;
        for (let i = 0; i < n; i++) {
          const a = base - spread / 2 + (spread * i) / (n - 1);
          shootArrow(sim, a, A * critMult, crit, { pierce: 2, speed: 22, range: 11 });
        }
        break;
      }
      case 'frostNova': {
        const r = (lv2 ? 4.5 : 3.5) * area(sim);
        sim.explode(p.x, p.z, r, A * (lv2 ? 2.5 : 1.5) * critMult, crit, 'frost', { slow: 0.6 });
        break;
      }
      case 'meteor': {
        const targets = [target];
        if (lv2) {
          const others = sim.enemies.filter((e) => e !== target && Math.hypot(e.x - p.x, e.z - p.z) < 12);
          if (others.length) targets.push(others[Math.floor(sim.rand() * others.length)]);
        }
        for (const t of targets) sim.explode(t.x, t.z, 3.5 * area(sim), A * 4 * critMult, crit, 'fire');
        break;
      }
      case 'raiseDead': {
        const n = lv2 ? 3 : 2;
        for (let i = 0; i < n; i++) {
          const a = sim.rand() * Math.PI * 2;
          if (!sim.summon(p.x + Math.sin(a) * 1.5, p.z + Math.cos(a) * 1.5, { power: k })) {
            for (const m of sim.minions) { m.hp = m.maxHp; m.life = Math.max(m.life, 20); } // at the cap: refresh them instead
            break;
          }
        }
        break;
      }
      case 'corpseBlast': {
        const r = (lv2 ? 3.2 : 2.5) * area(sim);
        sim.explode(target.x, target.z, r, A * (lv2 ? 2.8 : 1.8) * critMult, crit, 'shadow');
        break;
      }
      case 'boneArmor': {
        const per = lv2 ? 0.03 : 0.02;
        p.hp = Math.min(sim.maxHp, p.hp + sim.maxHp * per * Math.max(1, sim.minions.length));
        sim.events.push({ type: 'explode', x: p.x, z: p.z, r: 1.4, fx: 'shadow' });
        break;
      }
      case 'curse': {
        const r = (lv2 ? 6 : 5) * area(sim);
        for (const e of sim.enemies) {
          if (Math.hypot(e.x - p.x, e.z - p.z) > r + e.radius) continue;
          e.markTimer = Math.max(e.markTimer, lv2 ? 4 : 3);
          e.slowTimer = Math.max(e.slowTimer, lv2 ? 4 : 3);
          e.slowMult = Math.min(e.slowMult, 0.6);
          if (lv2) sim.damageEnemy(e, A * 0.8 * critMult, crit, true);
        }
        sim.events.push({ type: 'explode', x: p.x, z: p.z, r, fx: 'shadow' });
        break;
      }
      default: break;
    }
  }
}

function updateZonesEtc(sim: Sim, dt: number): void {
  const p = sim.player;
  // ---------- zones (附魔領域) ----------
  sim.zones = sim.zones.filter((z) => {
    z.timer -= dt;
    z.tick -= dt;
    if (z.tick <= 0) {
      z.tick = 0.5;
      for (const e of sim.enemies) {
        if (Math.hypot(e.x - z.x, e.z - z.z) < z.r + e.radius) {
          e.slowTimer = 0.7;
          e.slowMult = Math.min(e.slowMult, z.slow ?? 0.5);
          sim.withSrc(z.src ?? 'skill', () => sim.damageEnemy(e, z.dmg, false, true));
          if ((z.kind === 'poison' || z.kind === 'fire') && e.hp > 0) sim.applyElem(e, z.kind); // 元素: poison / fire on the ground
        }
      }
      sim.enemies = sim.enemies.filter((e) => e.hp > 0);
    }
    return z.timer > 0;
  });

  // ---------- 劍刃風暴 (channel) ----------
  if (sim.spinTimer > 0) {
    sim.spinTimer -= dt;
    sim.spinTick -= dt;
    if (sim.spinTick <= 0) {
      sim.spinTick = 0.25;
      const reach = (value(sim.stats.range) + 0.6) * area(sim);
      sim.arcHit(sim.clock * 12, reach, Math.PI * 2, 0.7 * (sim.signature?.dmgMult ?? 1) * sim.spinMult, 'physical');
    }
  }

  sim.enemies = sim.enemies.filter((e) => e.hp > 0);

  // ---------- signature skill ----------
  const sig = sim.signature;
  if (!sig || !sim.sigDef) return;
  sig.timer = Math.max(0, sig.timer - dt);
  const ready = sig.timer <= 0;
  let cast = ready && sim.sigRequested;
  if (ready && !cast && p.autopilot) cast = shouldAutoCast(sim);
  sim.sigRequested = false;
  if (!cast) return;
  if (castSignature(sim)) {
    sig.timer = sig.cooldown;
    if (sim.uq.sigGuard) { p.invuln = Math.max(p.invuln, 1.5); p.hp = Math.min(sim.maxHp, p.hp + sim.maxHp * 0.08); } // 刃之守護
    if (sim.uq.sigField) sim.zones.push({ x: p.x, z: p.z, r: 4 * area(sim), timer: 4, tick: 0, dmg: value(sim.stats.atk) * 0.3 }); // 聖域
    sim.events.push({ type: 'skill', name: sim.sigDef.name, icon: sim.sigDef.icon, signature: true });
    if (sim.awk?.echo && sig.echo > 0) castEcho(sim);
    sim.enemies = sim.enemies.filter((e) => e.hp > 0);
  }
}

/** Three-class echo: the third class follows up every Signature cast. */
function castEcho(sim: Sim): void {
  const p = sim.player;
  const echo = sim.awk!.echo!;
  const sig = sim.signature!;
  const pow = sig.echo * sig.dmgMult; // pure triples have power 2 (more waves / arrows / blasts / skeletons)
  const pure = echo.power >= 2;
  const k = pow / echo.power; // board upgrade + signature damage
  switch (echo.kind) {
    case 'slash': {
      const reach = (value(sim.stats.range) + 2.2) * area(sim);
      const waves = pure ? 3 : 1;
      for (let i = 0; i < waves; i++) sim.arcHit(p.facing + i * 2.1, reach * (1 + i * 0.15), Math.PI * 2, 2 * k, 'physical');
      break;
    }
    case 'volley': {
      const n = pure ? 20 : 10;
      for (let i = 0; i < n; i++) {
        const { dmg, crit } = sim.rollDamage();
        shootArrow(sim, (i / n) * Math.PI * 2, dmg * 1.2 * k, crit, { pierce: 3, speed: 20, range: 13 });
      }
      break;
    }
    case 'blast': {
      const n = pure ? 8 : 4;
      const targets = [...sim.enemies].filter((e) => e.hp > 0).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)).slice(0, n);
      for (const e of targets) {
        const { dmg, crit } = sim.rollDamage();
        sim.damageEnemy(e, dmg * 2 * k, crit);
        sim.events.push({ type: 'explode', x: e.x, z: e.z, r: 1.6 * area(sim), fx: 'arcane' });
      }
      break;
    }
    case 'souls': {
      const n = pure ? 4 : 2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        sim.summon(p.x + Math.sin(a) * 1.5, p.z + Math.cos(a) * 1.5, { force: true, life: 12, big: pure, power: (pure ? 1.5 : 1) * k });
      }
      break;
    }
  }
}

function shouldAutoCast(sim: Sim): boolean {
  const kind = sim.sigDef!.kind;
  if (kind === 'holyLight') return sim.player.hp / sim.maxHp < 0.55 || enemiesNear(sim, 3.5) >= 5;
  if (kind === 'soulReap') return sim.player.hp / sim.maxHp < 0.6 && enemiesNear(sim, 4) >= 3 || enemiesNear(sim, 4) >= 5;
  if (sim.boss && Math.hypot(sim.boss.x - sim.player.x, sim.boss.z - sim.player.z) < 12) return true;
  return enemiesNear(sim, kind === 'charge' || kind === 'spellSlash' ? 6 : 9) >= 4;
}

export function shootArrow(sim: Sim, angle: number, dmg: number, crit: boolean, o: { pierce: number; speed: number; range: number; radius?: number; shadow?: boolean; slow?: number }): void {
  const p = sim.player;
  sim.projectiles.push({
    x: p.x, z: p.z, vx: Math.sin(angle) * o.speed, vz: Math.cos(angle) * o.speed,
    dmg, crit, fromPlayer: true, life: o.range / o.speed, pierce: o.pierce, radius: o.radius ?? 0.3, hit: [],
    shadow: o.shadow, slow: o.slow, src: 'skill', // counted as 技能 on the DPS meter
  });
}

/** Strongest nearby target: the boss if close, otherwise the enemy with the most HP. */
function bestTarget(sim: Sim, r: number): Enemy | null {
  const p = sim.player;
  if (sim.boss && Math.hypot(sim.boss.x - p.x, sim.boss.z - p.z) < r + 4) return sim.boss;
  let best: Enemy | null = null;
  for (const e of sim.enemies) {
    if (Math.hypot(e.x - p.x, e.z - p.z) > r) continue;
    if (!best || e.maxHp > best.maxHp) best = e;
  }
  return best;
}

/** Cast a Signature-style skill: the character's own (no args) or one from the skill tree (kind / power / enhanced). */
export function castSignature(sim: Sim, kindO?: string, mO?: number, upO?: boolean): boolean {
  const p = sim.player;
  const m = mO ?? sim.signature!.dmgMult;
  const up = upO ?? sim.signature!.level === 2; // enhanced version (awakened board)
  const kind = kindO ?? sim.sigDef!.kind;
  const { dmg: baseDmg, crit } = sim.rollDamage();
  const target = nearestWithin(sim, 14);
  const aim = target ? Math.atan2(target.x - p.x, target.z - p.z) : p.facing;
  switch (kind) {
    case 'bladeStorm':
      sim.spinTimer = up ? 4.5 : 3;
      sim.spinTick = 0;
      return true;
    case 'charge': {
      const len = up ? 9 : 7;
      const x1 = p.x, z1 = p.z;
      const lim = ARENA_HALF - 1;
      const x2 = Math.max(-lim, Math.min(lim, x1 + Math.sin(aim) * len));
      const z2 = Math.max(-lim, Math.min(lim, z1 + Math.cos(aim) * len));
      const dx = x2 - x1, dz = z2 - z1;
      const L2 = dx * dx + dz * dz || 1;
      for (const e of sim.enemies) {
        const t = Math.max(0, Math.min(1, ((e.x - x1) * dx + (e.z - z1) * dz) / L2));
        if (Math.hypot(e.x - (x1 + dx * t), e.z - (z1 + dz * t)) < 1.3 + e.radius) sim.damageEnemy(e, baseDmg * (up ? 3.5 : 2.5) * m, crit);
      }
      sim.enemies = sim.enemies.filter((e) => e.hp > 0);
      p.x = x2; p.z = z2;
      p.invuln = Math.max(p.invuln, 0.5);
      p.facing = aim;
      sim.events.push({ type: 'dash', x1, z1, x2, z2 });
      return true;
    }
    case 'holyLight':
      p.hp = Math.min(sim.maxHp, p.hp + sim.maxHp * (up ? 0.45 : 0.3));
      p.invuln = Math.max(p.invuln, up ? 3.5 : 2.5);
      sim.explode(p.x, p.z, 3.5 * area(sim), baseDmg * 2 * m, crit, 'holy');
      return true;
    case 'markPrey': {
      const t = bestTarget(sim, 14);
      if (!t) return false;
      t.markTimer = up ? 8 : 6;
      const a = Math.atan2(t.x - p.x, t.z - p.z);
      const n = up ? 8 : 5;
      for (let i = 0; i < n; i++) shootArrow(sim, a + (i - (n - 1) / 2) * 0.05, baseDmg * 1.2 * m, crit, { pierce: 0, speed: 24, range: 16 });
      return true;
    }
    case 'snipe': {
      const t = bestTarget(sim, 18) ?? target;
      const a = t ? Math.atan2(t.x - p.x, t.z - p.z) : p.facing;
      shootArrow(sim, a, baseDmg * (up ? 12 : 8) * m, crit, { pierce: 99, speed: 40, range: 20, radius: 0.5 });
      return true;
    }
    case 'arrowStorm':
      const n = up ? 24 : 16;
      for (let i = 0; i < n; i++) shootArrow(sim, (i / n) * Math.PI * 2, baseDmg * 1.5 * m, crit, { pierce: 1, speed: 18, range: 11 });
      return true;
    case 'spellSlash':
      sim.arcHit(aim, 4.5 * area(sim), up ? Math.PI * 2 : (240 * Math.PI) / 180, (up ? 5 : 3.5) * m, 'arcane');
      return true;
    case 'field':
      sim.zones.push({ x: p.x, z: p.z, r: 5 * area(sim), timer: up ? 9 : 6, tick: 0, dmg: baseDmg * (up ? 0.55 : 0.4) * m });
      return true;
    case 'soulReap': {
      const before = sim.enemies.filter((e) => Math.hypot(e.x - p.x, e.z - p.z) < 4 * area(sim) + e.radius).length;
      sim.arcHit(aim, 4 * area(sim), Math.PI * 2, (up ? 4.5 : 3) * m, 'shadow');
      p.hp = Math.min(sim.maxHp, p.hp + sim.maxHp * Math.min(up ? 0.3 : 0.2, before * (up ? 0.03 : 0.02)));
      return true;
    }
    case 'ghostVolley': {
      const near = sim.enemies.filter((e) => Math.hypot(e.x - p.x, e.z - p.z) < 14).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)).slice(0, up ? 6 : 4);
      if (!near.length) return false;
      for (const e of near) {
        const a = Math.atan2(e.x - p.x, e.z - p.z);
        for (let i = 0; i < (up ? 4 : 3); i++) shootArrow(sim, a + (i - 1) * 0.06, baseDmg * 1.8 * m, crit, { pierce: 99, speed: 26, range: 16 });
      }
      return true;
    }
    case 'deathNova':
      sim.explode(p.x, p.z, (up ? 6.5 : 5) * area(sim), baseDmg * (up ? 4.5 : 3) * m, crit, 'shadow', { slow: 0.5, slowTime: 3 });
      return true;
    case 'boneArmy':
      for (let i = 0; i < (up ? 6 : 4); i++) {
        const a = (i / (up ? 6 : 4)) * Math.PI * 2;
        sim.summon(p.x + Math.sin(a) * 1.6, p.z + Math.cos(a) * 1.6, { force: true, life: 15, power: m }); // 招牌強化 makes them hit harder
      }
      sim.minionBuff = 8;
      sim.minionBuffMult = up ? 1.8 : 1.5;
      return true;
    case 'boneSpear': {
      const t = bestTarget(sim, 18) ?? target;
      const a = t ? Math.atan2(t.x - p.x, t.z - p.z) : p.facing;
      shootArrow(sim, a, baseDmg * (up ? 11 : 7) * m, crit, { pierce: 99, speed: 34, range: 22, radius: up ? 0.8 : 0.55 });
      return true;
    }
    case 'soulStorm': {
      const n = up ? 20 : 12;
      for (let i = 0; i < n; i++) shootArrow(sim, (i / n) * Math.PI * 2, baseDmg * 1.5 * m, crit, { pierce: 1, speed: 16, range: 11, shadow: true, slow: 0.5 });
      return true;
    }
    case 'raiseLegion': {
      const n = up ? 7 : 5;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        sim.summon(p.x + Math.sin(a) * 1.8, p.z + Math.cos(a) * 1.8, { force: true, big: true, life: up ? 16 : 12, power: m });
      }
      for (const mn of sim.minions) mn.hp = mn.maxHp;
      return true;
    }
    case 'quake': { // 專精 戰士: three shockwaves
      for (const r of [3, 5, 7]) sim.explode(p.x, p.z, r * area(sim), baseDmg * (up ? 2.8 : 2) * m, crit, 'physical', { knock: 1.2, slow: 0.6, slowTime: 1.5 });
      return true;
    }
    case 'skyfall': { // 專精 弓手: arrows rain around the target
      const t = bestTarget(sim, 16) ?? target;
      if (!t) return false;
      const n = up ? 20 : 14;
      for (let i = 0; i < n; i++) {
        const a = sim.rand() * Math.PI * 2, d = Math.sqrt(sim.rand()) * 4.5;
        sim.explode(t.x + Math.sin(a) * d, t.z + Math.cos(a) * d, 1.6 * area(sim), baseDmg * 1.6 * m, crit, 'physical');
      }
      return true;
    }
    case 'boneGrave': { // 專精 死靈: skeletons rise under the enemies
      const near = sim.enemies.filter((e) => e.hp > 0 && Math.hypot(e.x - p.x, e.z - p.z) < 9).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)).slice(0, up ? 12 : 8);
      if (!near.length) return false;
      for (const e of near) sim.summon(e.x, e.z, { force: true, life: 12, power: m });
      sim.minionBuff = 8; sim.minionBuffMult = 1.6;
      return true;
    }
    case 'meteorCall': { // 專精 法師
      const near = sim.enemies.filter((e) => Math.hypot(e.x - p.x, e.z - p.z) < 14).sort((a, b) => b.maxHp - a.maxHp).slice(0, up ? 7 : 5);
      if (!near.length) return false;
      for (const e of near) sim.explode(e.x, e.z, 2.8 * area(sim), baseDmg * 3.5 * m, crit, 'fire', { elem: 'fire' });
      return true;
    }
    case 'arcaneBurst': {
      const near = sim.enemies.filter((e) => Math.hypot(e.x - p.x, e.z - p.z) < 12).sort((a, b) => b.maxHp - a.maxHp).slice(0, up ? 8 : 5);
      if (!near.length) return false;
      for (const e of near) sim.explode(e.x, e.z, 3 * area(sim), baseDmg * 3 * m, crit, 'arcane');
      return true;
    }
  }
  return false;
}

// ---------- 技能樹 actives (Diablo-style): rank → 強化 → one of two 變化 ----------
function heal(sim: Sim, frac: number): void { sim.player.hp = Math.min(sim.maxHp, sim.player.hp + sim.maxHp * frac); }
function updateTree(sim: Sim, dt: number): void {
  const tb = sim.tb;
  tb.dmgT = Math.max(0, tb.dmgT - dt); tb.avatarT = Math.max(0, tb.avatarT - dt); tb.undyingT = Math.max(0, tb.undyingT - dt);
  if (sim.treeLater.length) {
    for (const l of sim.treeLater) l.t -= dt;
    const due = sim.treeLater.filter((l) => l.t <= 0);
    sim.treeLater = sim.treeLater.filter((l) => l.t > 0);
    for (const l of due) l.fn();
  }
  const p = sim.player;
  for (const sk of sim.treeSkills) {
    sk.timer -= dt;
    if (sk.timer > 0) continue;
    const def = treeSkillAny(sk.id);
    if (!def) continue;
    const target = sim.nearestEnemy(p.x, p.z, 9);
    // self buffs wait for a fight; the rest wait for a target in reach
    if (!target) { sk.timer = 0.3; continue; }
    if (sk.id === 'w_wall' && p.hp > sim.maxHp * 0.9 && sim.elemShield > sim.maxHp * 0.05) { sk.timer = 0.5; continue; }
    if (def.cast) { // archer / mage / necro: shared skills with generic 變化
      const code = sk.mod !== -1 ? def.mods?.[sk.mod]?.code : undefined;
      sk.timer = (def.cd ?? 5) * sim.sp.cdMult * (code === 'cdr' ? 0.7 : 1);
      castTree(sim, sk, def, target, 1);
      continue;
    }
    sk.timer = (def.cd ?? 5) * sim.sp.cdMult;
    const m = rankMult(sk.rank);
    const ar = area(sim);
    const aim = Math.atan2(target.x - p.x, target.z - p.z);
    castVfx(sim, sk, target);
    switch (sk.id) {
      case 'w_cleave': {
        const reach = (value(sim.stats.range) + 1.6) * ar, mult = 2.2 * m * (sk.enh ? 1.4 : 1);
        const hits = sim.arcHit(aim, reach, Math.PI * 0.8, mult, 'physical');
        if (sk.enh) for (const e of sim.enemies) if (Math.hypot(e.x - p.x, e.z - p.z) < reach && e.kind !== 'boss' && e.kind !== 'miniboss') { const d = Math.hypot(e.x - p.x, e.z - p.z) || 1; e.x += ((e.x - p.x) / d) * 1.2; e.z += ((e.z - p.z) / d) * 1.2; }
        if (sk.mod === 0) heal(sim, Math.min(0.08, 0.01 * hits));
        if (sk.mod === 1) sim.treeLater.push({ t: 0.3, fn: () => sim.withSrc('skill', () => sim.arcHit(aim, reach, Math.PI * 0.8, mult * 0.6, 'physical')) });
        break;
      }
      case 'w_warcry': {
        const r = 5 * ar * (sk.enh ? 1.3 : 1);
        sim.explode(p.x, p.z, r, atk(sim) * m, false, 'holy', { slow: 0.5, slowTime: 3 });
        tb.dmg = 0.15 + 0.05 * sk.rank; tb.dmgT = sk.enh ? 8 : 5;
        if (sk.mod === 0) heal(sim, 0.1);
        if (sk.mod === 1) for (const e of sim.enemies) if (Math.hypot(e.x - p.x, e.z - p.z) < r + e.radius) e.markTimer = Math.max(e.markTimer, 5);
        break;
      }
      case 'w_whirl': {
        const r = 3 * ar * (sk.enh ? 1.25 : 1), mult = 1.8 * m * (sk.enh ? 1.3 : 1);
        if (sk.mod === 0) { for (let i = 0; i < 3; i++) sim.treeLater.push({ t: i * 0.33 + 0.01, fn: () => sim.withSrc('skill', () => sim.arcHit(0, r, Math.PI * 2, mult * 0.7, 'physical')) }); }
        else { const hits = sim.arcHit(0, r, Math.PI * 2, mult, 'physical'); if (sk.mod === 1) heal(sim, Math.min(0.1, 0.006 * hits)); }
        break;
      }
      case 'w_charge': {
        const len = sk.enh ? 9 : 7, mult = 2.5 * m * (sk.enh ? 1.4 : 1);
        const lim = ARENA_HALF - 1, x1 = p.x, z1 = p.z;
        const x2 = Math.max(-lim, Math.min(lim, x1 + Math.sin(aim) * len)), z2 = Math.max(-lim, Math.min(lim, z1 + Math.cos(aim) * len));
        const dx = x2 - x1, dz = z2 - z1, L2 = dx * dx + dz * dz || 1;
        for (const e of sim.enemies) {
          const t = Math.max(0, Math.min(1, ((e.x - x1) * dx + (e.z - z1) * dz) / L2));
          if (Math.hypot(e.x - (x1 + dx * t), e.z - (z1 + dz * t)) < 1.3 + e.radius) { const { dmg, crit } = sim.rollDamage(); sim.damageEnemy(e, dmg * mult, crit); }
        }
        sim.enemies = sim.enemies.filter((e) => e.hp > 0);
        p.x = x2; p.z = z2;
        sim.events.push({ type: 'swing', x: x1, z: z1, angle: aim, reach: len, arc: 0.3, fx: 'physical' });
        if (sk.mod === 0) sim.explode(x2, z2, 3 * ar, atk(sim) * 2 * m, false, 'physical', { knock: 1.5 });
        if (sk.mod === 1) p.invuln = Math.max(p.invuln, 1.4);
        break;
      }
      case 'w_slam': {
        const r = 4 * ar * (sk.enh ? 1.35 : 1), dmg = atk(sim) * 2.4 * m * (sk.enh ? 1.5 : 1);
        const { crit } = sim.rollDamage(); const cm = crit ? value(sim.stats.critDmg) : 1;
        sim.explode(p.x, p.z, r, dmg * cm, crit, 'physical', { knock: 2.5 });
        if (sk.mod === 0) { const x = p.x, z = p.z; sim.treeLater.push({ t: 0.6, fn: () => sim.withSrc('skill', () => sim.explode(x, z, r, dmg * 0.6, false, 'physical', { knock: 1.5 })) }); }
        if (sk.mod === 1) for (const e of sim.enemies) if (e.kind !== 'boss' && e.kind !== 'miniboss' && e.kind !== 'worldboss' && Math.hypot(e.x - p.x, e.z - p.z) < r + e.radius) { e.slowTimer = Math.max(e.slowTimer, 1.5); e.slowMult = 0.05; }
        break;
      }
      case 'w_wall': {
        const frac = (0.2 + 0.03 * sk.rank) + (sk.enh ? 0.1 : 0);
        sim.elemShield = Math.max(sim.elemShield, sim.maxHp * frac);
        sim.events.push({ type: 'explode', x: p.x, z: p.z, r: 1.6, fx: 'holy' });
        if (sk.mod === 0) sim.explode(p.x, p.z, 3.5 * ar, atk(sim) * 1.5 * m, false, 'physical', { knock: 1.5 });
        if (sk.mod === 1) heal(sim, 0.12);
        break;
      }
      case 'w_storm': {
        sim.spinTimer = 2.5 + 0.25 * sk.rank + (sk.enh ? 1.5 : 0); sim.spinTick = 0;
        sim.spinMult = m * (sk.mod === 0 ? 1.6 : 1);
        tb.spinGuard = sk.mod === 1;
        break;
      }
      case 'w_avatar': {
        tb.avatarT = 6 + sk.rank + (sk.enh ? 3 : 0);
        tb.avatarMult = sk.mod === 0 ? 1.8 : 1.5;
        if (sk.enh) heal(sim, 0.2);
        if (sk.mod === 1) tb.undyingT = tb.avatarT;
        sim.events.push({ type: 'skill', name: def.name, icon: def.icon, signature: false });
        break;
      }
    }
  }
}

/** Generic 技能樹 active: rank +20% each, 強化 = upgraded version +30%, then its 變化. */
function castTree(sim: Sim, sk: TreeActive, def: TreeSkill, target: Enemy, scale: number): void {
  const c = def.cast!, p = sim.player;
  const code = sk.mod !== -1 ? def.mods?.[sk.mod]?.code : undefined;
  const k = rankMult(sk.rank) * (sk.enh ? 1.3 : 1) * (code === 'power' ? 1.5 : 1) * scale;
  if ('auto' in c) castAuto(sim, c.auto, sk.enh, target, k);
  else if ('autos' in c) { castAuto(sim, c.autos[0], sk.enh, target, k * 0.75); castAuto(sim, c.autos[1], sk.enh, target.hp > 0 ? target : sim.nearestEnemy(p.x, p.z, 11), k * 0.75); } // 混合層 合技: two skills at 75% each
  else castSignature(sim, c.sig, k, sk.enh);
  if (scale === 1) { sim.events.push({ type: 'skill', name: def.name, icon: def.icon, signature: false }); castVfx(sim, sk, target); }
  if (scale !== 1 || !code) return;
  const near = (r: number) => sim.enemies.filter((e) => e.hp > 0 && Math.hypot(e.x - target.x, e.z - target.z) < r + e.radius);
  switch (code) {
    case 'echo': sim.treeLater.push({ t: 0.5, fn: () => { const t = target.hp > 0 ? target : sim.nearestEnemy(p.x, p.z, 11); if (t) sim.withSrc('skill', () => castTree(sim, sk, def, t, 0.6)); } }); break;
    case 'heal': heal(sim, 0.1); break;
    case 'shield': sim.elemShield = Math.max(sim.elemShield, sim.maxHp * 0.15); break;
    case 'buff': sim.tb.dmg = Math.max(sim.tb.dmgT > 0 ? sim.tb.dmg : 0, 0.25); sim.tb.dmgT = Math.max(sim.tb.dmgT, 5); break;
    case 'invuln': p.invuln = Math.max(p.invuln, 1.2); break;
    case 'mark': for (const e of near(4)) e.markTimer = Math.max(e.markTimer, 4); break;
    case 'slow': for (const e of near(4)) { e.slowTimer = Math.max(e.slowTimer, 3); e.slowMult = Math.min(e.slowMult, 0.3); } break;
    case 'nova': sim.explode(p.x, p.z, 3.5 * area(sim), atk(sim) * 1.2 * k, false, 'arcane'); break;
    default: break;
  }
}

/** Every 技能樹 cast: a rune circle under you in the class colour; an enhanced skill also drops a light pillar on the target. */
const TREE_FX: Record<string, FxKind> = { w: 'physical', a: 'holy', m: 'arcane', n: 'shadow', x: 'fire' };
function castVfx(sim: Sim, sk: TreeActive, target: Enemy): void {
  const p = sim.player, fx = TREE_FX[sk.id[0]] ?? 'arcane';
  sim.events.push({ type: 'vfx', kind: 'rune', x: p.x, z: p.z, r: 1.6, fx });
  if (sk.enh) sim.events.push({ type: 'vfx', kind: 'pillar', x: target.x, z: target.z, r: 0.9, fx });
}
