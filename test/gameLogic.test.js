"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const logic = require("../script/gameLogic");

test("敵倍率は開始時1、終了時2.15で単調増加する", () => {
  assert.equal(logic.enemyMultiplier(0), 1);
  assert.ok(Math.abs(logic.enemyMultiplier(140) - 2.15) < 0.0001);
  assert.ok(logic.enemyMultiplier(95) > logic.enemyMultiplier(45));
});

test("経過時間に応じて腐敗段階が0から3まで上がる", () => {
  assert.deepEqual([0, 34, 35, 70, 105, 140].map(logic.corruptionTier), [0, 0, 1, 2, 3, 3]);
});

test("敵の出現間隔は序盤を長く取り、段階的に短くなる", () => {
  assert.equal(logic.enemySpawnInterval(0), 6.5);
  assert.equal(logic.enemySpawnInterval(24), 4.9);
  assert.equal(logic.enemySpawnInterval(35), 4.35);
  assert.equal(logic.enemySpawnInterval(47), 3.55);
  assert.ok(logic.enemySpawnInterval(117) < 3);
  assert.equal(logic.enemySpawnInterval(140), 2.45);
});

test("140秒の進行率に合わせて敵の追加出現率が段階的に上がる", () => {
  assert.deepEqual([34, 35, 59, 82, 105].map(logic.enemyExtraSpawnChance), [0, 0.04, 0.08, 0.16, 0.14]);
});

test("ハードは敵の出現間隔を短縮し追加出現率と同時出現上限を増やす", () => {
  const normal = logic.enemySpawnParameters(70, "normal");
  const hard = logic.enemySpawnParameters(70, "hard");
  assert.equal(normal.interval, logic.enemySpawnInterval(70));
  assert.equal(normal.extraChance, logic.enemyExtraSpawnChance(70));
  assert.ok(hard.interval < normal.interval);
  assert.ok(hard.extraChance > normal.extraChance);
  assert.equal(normal.maxEnemies, 42);
  assert.equal(hard.maxEnemies, 48);
});

test("軍勢コスト上限は35秒ごとに6から15まで拡張される", () => {
  assert.deepEqual([0, 34, 35, 69, 70, 104, 105, 140].map(logic.costLimit), [6, 6, 9, 9, 12, 12, 15, 15]);
});

test("モンスターは35秒ごとに最大2倍まで強化される", () => {
  assert.deepEqual([0, 1, 2, 3].map(logic.monsterTierBoost), [0.88, 1.15, 1.5, 2]);
});

test("ハードは敵を強化し、自然回復をなくして獲得スコアを5倍にする", () => {
  const normal = logic.difficultySettings("normal");
  const hard = logic.difficultySettings("hard");
  assert.equal(normal.kingRegen, 4);
  assert.equal(normal.scoreMultiplier, 1);
  assert.equal(hard.kingRegen, 0);
  assert.equal(hard.scoreMultiplier, 5);
  assert.ok(hard.enemyHp > normal.enemyHp);
  assert.ok(hard.enemyAttack > normal.enemyAttack);
  assert.ok(hard.enemySpeed > normal.enemySpeed);
  assert.ok(hard.enemyCooldown < normal.enemyCooldown);
  assert.equal(logic.scoreAward(1250, "normal"), 1250);
  assert.equal(logic.scoreAward(1250, "hard"), 6250);
  assert.equal(logic.difficultySettings("unknown").id, "normal");
});

test("代表レシピ名を解決する", () => {
  assert.equal(logic.recipeName(["bone", "iron"]), "アーマースケルトン");
  assert.equal(logic.recipeName(["fang", "mushroom"]), "ヴェノムハウンド");
  assert.equal(logic.recipeName(["iron", "soul"]), "インフェルノゴーレム");
});

test("追加触媒、地形、時間が召喚性能と戦術を変える", () => {
  const early = logic.summonSpec(["bone"], "field", 0, false);
  const late = logic.summonSpec(["bone", "iron"], "rock", 117, false);
  assert.ok(late.hp > early.hp * 2);
  assert.ok(late.attack > early.attack);
  assert.equal(late.tactic, "guard");
  assert.equal(late.cost, 2);
  assert.equal(late.tier, 3);
});

test("ハードは2触媒以上と適性地形の組み合わせで地形共鳴する", () => {
  const single = logic.summonSpec(["iron"], "rock", 35, false, "hard");
  const misplaced = logic.summonSpec(["iron", "bone"], "swamp", 35, false, "hard");
  const prepared = logic.summonSpec(["iron", "bone"], "rock", 35, false, "hard");
  assert.equal(logic.hardPreferredTerrain("iron"), "rock");
  assert.equal(logic.hasHardTerrainAffinity("iron", "rock"), true);
  assert.equal(single.hardPrepared, false);
  assert.equal(misplaced.hardPrepared, false);
  assert.equal(prepared.hardPrepared, true);
  assert.ok(prepared.hp > misplaced.hp);
  assert.ok(prepared.attack > misplaced.attack);
});

test("ハード敵は低位召喚に強く、地形共鳴した高位召喚には弱い", () => {
  const lowRank = logic.hardEnemyDamageMultiplier({ cost: 1, hardPrepared: false });
  const highRank = logic.hardEnemyDamageMultiplier({ cost: 3, hardPrepared: false });
  const prepared = logic.hardEnemyDamageMultiplier({ cost: 3, hardPrepared: true });
  assert.equal(lowRank, 1.55);
  assert.ok(highRank < 1);
  assert.ok(prepared < highRank);
});

test("コンボと危険撃破でスコアが増える", () => {
  const normal = logic.scoreForKill(100, 0, 1, false);
  const bonus = logic.scoreForKill(100, 78, 5, true);
  assert.equal(normal, 100);
  assert.ok(bonus > normal * 2);
});

test("ハードでは勇者以外の通常敵撃破スコアも5倍になる", () => {
  const fighterKill = logic.scoreForKill(100, 0, 1, false);
  assert.equal(logic.scoreAward(fighterKill, "normal"), 100);
  assert.equal(logic.scoreAward(fighterKill, "hard"), 500);
});

test("死亡ペナルティはノーマルとハードで共通かつ死亡回数に応じて増える", () => {
  const normal = [0, 1, 2].map((deaths) => logic.deathPenalty(deaths));
  const hard = [0, 1, 2].map((deaths) => logic.deathPenalty(deaths));
  assert.deepEqual(normal, [1500, 2000, 2500]);
  assert.deepEqual(hard, normal);
});

test("バーチャルパッドを離すと入力と古い移動目標が現在位置へリセットされる", () => {
  const king = { x: 412, y: 358, targetX: 380, targetY: 340 };
  const vector = { x: 0.75, y: -0.25 };
  logic.resetVirtualPad(king, vector);
  assert.deepEqual(vector, { x: 0, y: 0 });
  assert.equal(king.targetX, king.x);
  assert.equal(king.targetY, king.y);
});

test("触媒は10個以上取得でき、99個で上限になる", () => {
  assert.equal(logic.addCatalyst(9), 10);
  assert.equal(logic.addCatalyst(10), 11);
  assert.equal(logic.addCatalyst(99), 99);
});
