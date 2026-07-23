"use strict";

const CATALYSTS = [
  { id: "bone", name: "骨", color: "#e8dcc0", glyph: "骨", base: "スケルトン" },
  { id: "fang", name: "牙", color: "#f2b36d", glyph: "牙", base: "魔獣" },
  { id: "iron", name: "鉄", color: "#9da7b3", glyph: "鉄", base: "ゴーレム" },
  { id: "mana", name: "魔力", color: "#76d7ff", glyph: "魔", base: "ウィスプ" },
  { id: "mushroom", name: "毒茸", color: "#b78aff", glyph: "毒", base: "スライム" },
  { id: "soul", name: "魂火", color: "#ff738f", glyph: "魂", base: "インプ" }
];

const BASE_STATS = {
  bone: { hp: 48, attack: 12, speed: 66, range: 34, cooldown: 0.82, size: 14, color: "#d9d3c4", tactic: "execute" },
  fang: { hp: 68, attack: 17, speed: 96, range: 36, cooldown: 0.72, size: 16, color: "#e09b56", tactic: "skirmish" },
  iron: { hp: 170, attack: 21, speed: 43, range: 39, cooldown: 1.18, size: 21, color: "#8895a5", tactic: "guard" },
  mana: { hp: 42, attack: 16, speed: 60, range: 145, cooldown: 1.08, size: 13, color: "#58c9ec", tactic: "cautious" },
  mushroom: { hp: 82, attack: 9, speed: 54, range: 45, cooldown: 0.9, size: 18, color: "#986bd0", tactic: "collect" },
  soul: { hp: 55, attack: 24, speed: 82, range: 42, cooldown: 0.78, size: 15, color: "#e95473", tactic: "raid" }
};

const TERRAIN = {
  road: { name: "街道", color: "#6c5144", effect: "移動+18%・遊撃型" },
  rock: { name: "岩場", color: "#4f5966", effect: "HP+25%・護衛型" },
  mana: { name: "魔力溜まり", color: "#284f73", effect: "攻撃+22%・射程+18" },
  swamp: { name: "毒沼", color: "#3c5b48", effect: "毒付与・攻撃+12%" },
  grave: { name: "墓地", color: "#51405e", effect: "骨/魂 HP・攻撃+22%" },
  field: { name: "平地", color: "#243c36", effect: "魔王付近なら護衛型" }
};

const MONSTER_TIER_BOOSTS = [0.88, 1.15, 1.5, 2];

const HARD_PREFERRED_TERRAIN = {
  bone: "grave",
  fang: "road",
  iron: "rock",
  mana: "mana",
  mushroom: "swamp",
  soul: "grave"
};

const DIFFICULTIES = {
  normal: {
    id: "normal", name: "ノーマル", enemyHp: 1, enemyAttack: 1,
    enemySpeed: 1, enemyCooldown: 1, scoreMultiplier: 1, kingRegen: 4,
    spawnIntervalMultiplier: 1, extraSpawnBonus: 0, maxEnemies: 42
  },
  hard: {
    id: "hard", name: "ハード", enemyHp: 1.3, enemyAttack: 1.25,
    enemySpeed: 1.08, enemyCooldown: 0.9, scoreMultiplier: 5, kingRegen: 0,
    spawnIntervalMultiplier: 0.82, extraSpawnBonus: 0.1, maxEnemies: 48
  }
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function resetVirtualPad(king, vector) {
  vector.x = 0;
  vector.y = 0;
  king.targetX = king.x;
  king.targetY = king.y;
}

function enemyMultiplier(elapsed) {
  const t = clamp(elapsed / 180, 0, 1);
  return 1 + 1.15 * Math.pow(t, 1.55);
}

function corruptionTier(elapsed) {
  return clamp(Math.floor(elapsed / 45), 0, 3);
}

function costLimit(elapsed) {
  return [6, 9, 12, 15][corruptionTier(elapsed)];
}

function enemySpawnInterval(elapsed) {
  if (elapsed < 30) return 6.5;
  if (elapsed < 45) return 4.9;
  if (elapsed < 60) return 4.35;
  if (elapsed < 90) return 3.55;
  return Math.max(2.45, 3.35 - (elapsed - 90) / 100);
}

function enemyExtraSpawnChance(elapsed) {
  if (elapsed < 45) return 0;
  if (elapsed < 75) return 0.04;
  if (elapsed < 105) return 0.08;
  if (elapsed < 135) return 0.16;
  return 0.14;
}

function enemySpawnParameters(elapsed, difficultyId) {
  const settings = difficultySettings(difficultyId);
  return {
    interval: enemySpawnInterval(elapsed) * settings.spawnIntervalMultiplier,
    extraChance: clamp(enemyExtraSpawnChance(elapsed) + settings.extraSpawnBonus, 0, 0.8),
    maxEnemies: settings.maxEnemies
  };
}

function monsterTierBoost(tier) {
  return MONSTER_TIER_BOOSTS[clamp(Math.floor(tier), 0, 3)];
}

function difficultySettings(id) {
  return DIFFICULTIES[id] || DIFFICULTIES.normal;
}

function hardPreferredTerrain(primary) {
  return HARD_PREFERRED_TERRAIN[primary] || "field";
}

function hasHardTerrainAffinity(primary, terrainId) {
  return hardPreferredTerrain(primary) === terrainId;
}

function hardEnemyDamageMultiplier(minion) {
  const cost = clamp(Math.floor(minion.cost || 1), 1, 3);
  const rankMultiplier = [0, 1.55, 1.08, 0.88][cost];
  return rankMultiplier * (minion.hardPrepared ? 0.78 : 1);
}

function addCatalyst(current, amount) {
  return clamp(Math.floor(current) + (amount == null ? 1 : Math.floor(amount)), 0, 99);
}

function scoreAward(basePoints, difficultyId) {
  return Math.floor(Math.max(0, basePoints) * difficultySettings(difficultyId).scoreMultiplier);
}

function scoreForKill(base, elapsed, combo, risk) {
  const phase = 1 + corruptionTier(elapsed) * 0.25;
  const chain = 1 + Math.min(10, Math.max(0, combo - 1)) * 0.1;
  return Math.floor(base * phase * chain * (risk ? 1.25 : 1));
}

function deathPenalty(previousDeaths) {
  return 1500 + previousDeaths * 500;
}

function catalystById(id) {
  return CATALYSTS.find((c) => c.id === id);
}

function recipeName(ids) {
  const primary = ids[0];
  const counts = {};
  ids.forEach((id) => { counts[id] = (counts[id] || 0) + 1; });
  const key = ids.slice().sort().join("+");
  const specials = {
    "bone+iron": "アーマースケルトン",
    "bone+mana": "スケルトンメイジ",
    "bone+bone": "スケルトン小隊",
    "fang+mushroom": "ヴェノムハウンド",
    "iron+soul": "インフェルノゴーレム",
    "mana+soul": "レイス",
    "mana+mushroom+mushroom": "疫病スライム",
    "fang+fang+iron": "装甲ベヒモス",
    "bone+bone+mana": "骸骨魔導隊",
    "iron+iron+soul": "煉獄巨像"
  };
  if (specials[key]) return specials[key];
  const base = catalystById(primary).base;
  if (ids.length === 1) return base;
  if (counts[primary] === ids.length) return "大" + base;
  return catalystById(ids[1]).name + "の" + base;
}

function summonSpec(ids, terrainId, elapsed, nearKing, difficultyId) {
  if (!ids || ids.length < 1 || ids.length > 3) throw new Error("触媒は1～3個必要です");
  const primary = ids[0];
  const base = BASE_STATS[primary];
  if (!base) throw new Error("不明な触媒です: " + primary);
  const stats = { ...base };

  ids.slice(1).forEach((id) => {
    if (id === "bone") { stats.hp *= 1.14; stats.cooldown *= 0.92; }
    if (id === "fang") { stats.attack *= 1.28; stats.speed *= 1.12; stats.tactic = "execute"; }
    if (id === "iron") { stats.hp *= 1.42; stats.speed *= 0.9; stats.tactic = "guard"; }
    if (id === "mana") { stats.attack *= 1.2; stats.range += 48; stats.tactic = "cautious"; }
    if (id === "mushroom") { stats.hp *= 1.16; stats.attack *= 1.08; stats.poison = true; stats.tactic = "collect"; }
    if (id === "soul") { stats.attack *= 1.38; stats.hp *= 0.9; stats.tactic = "raid"; }
  });

  if (terrainId === "road") { stats.speed *= 1.18; stats.tactic = "skirmish"; }
  if (terrainId === "rock") { stats.hp *= 1.25; stats.tactic = "guard"; }
  if (terrainId === "mana") { stats.attack *= 1.22; stats.range += 18; }
  if (terrainId === "swamp") { stats.poison = true; stats.attack *= 1.12; }
  if (terrainId === "grave" && (primary === "bone" || primary === "soul")) {
    stats.hp *= 1.22;
    stats.attack *= 1.22;
  }
  if (nearKing) stats.tactic = "guard";

  const hardMode = difficultySettings(difficultyId).id === "hard";
  const terrainAffinity = hasHardTerrainAffinity(primary, terrainId);
  stats.hardPrepared = false;
  stats.terrainAffinity = terrainAffinity;
  if (hardMode) {
    const recipeBoost = ids.length === 1 ? 0.82 : ids.length === 2 ? 1.06 : 1.2;
    stats.hp *= recipeBoost;
    stats.attack *= recipeBoost;
    if (terrainAffinity) {
      stats.hp *= 1.25;
      stats.attack *= 1.25;
      stats.cooldown *= 0.92;
      stats.hardPrepared = ids.length >= 2;
    }
  }

  const tier = corruptionTier(elapsed);
  const tierBoost = monsterTierBoost(tier);
  stats.hp *= tierBoost;
  stats.attack *= tierBoost;
  stats.hp = Math.round(stats.hp);
  stats.attack = Math.round(stats.attack);
  stats.speed = Math.round(stats.speed);
  stats.cost = ids.length === 3 ? 3 : ids.length === 2 ? 2 : 1;
  stats.name = recipeName(ids);
  stats.tier = tier;
  stats.primary = primary;
  stats.ingredients = ids.slice();
  return stats;
}

module.exports = {
  CATALYSTS,
  BASE_STATS,
  TERRAIN,
  clamp,
  distance,
  resetVirtualPad,
  enemyMultiplier,
  enemySpawnInterval,
  enemyExtraSpawnChance,
  enemySpawnParameters,
  monsterTierBoost,
  difficultySettings,
  hardPreferredTerrain,
  hasHardTerrainAffinity,
  hardEnemyDamageMultiplier,
  addCatalyst,
  scoreAward,
  corruptionTier,
  costLimit,
  scoreForKill,
  deathPenalty,
  recipeName,
  summonSpec
};
