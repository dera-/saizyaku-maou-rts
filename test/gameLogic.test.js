"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const logic = require("../script/gameLogic");

test("敵倍率は開始時1、終了時2.15で単調増加する", () => {
  assert.equal(logic.enemyMultiplier(0), 1);
  assert.ok(Math.abs(logic.enemyMultiplier(180) - 2.15) < 0.0001);
  assert.ok(logic.enemyMultiplier(120) > logic.enemyMultiplier(60));
});

test("経過時間に応じて腐敗段階が0から3まで上がる", () => {
  assert.deepEqual([0, 44, 45, 90, 135, 180].map(logic.corruptionTier), [0, 0, 1, 2, 3, 3]);
});

test("敵の出現間隔は序盤を長く取り、段階的に短くなる", () => {
  assert.equal(logic.enemySpawnInterval(0), 6.5);
  assert.equal(logic.enemySpawnInterval(30), 4.9);
  assert.equal(logic.enemySpawnInterval(60), 3.9);
  assert.ok(logic.enemySpawnInterval(150) < 3);
  assert.ok(logic.enemySpawnInterval(180) >= 2.45);
});

test("軍勢コスト上限は45秒ごとに6から15まで拡張される", () => {
  assert.deepEqual([0, 44, 45, 89, 90, 134, 135, 180].map(logic.costLimit), [6, 6, 9, 9, 12, 12, 15, 15]);
});

test("モンスターは45秒ごとに最大2倍まで強化される", () => {
  assert.deepEqual([0, 1, 2, 3].map(logic.monsterTierBoost), [0.88, 1.15, 1.5, 2]);
});

test("代表レシピ名を解決する", () => {
  assert.equal(logic.recipeName(["bone", "iron"]), "アーマースケルトン");
  assert.equal(logic.recipeName(["fang", "mushroom"]), "ヴェノムハウンド");
  assert.equal(logic.recipeName(["iron", "soul"]), "インフェルノゴーレム");
});

test("追加触媒、地形、時間が召喚性能と戦術を変える", () => {
  const early = logic.summonSpec(["bone"], "field", 0, false);
  const late = logic.summonSpec(["bone", "iron"], "rock", 150, false);
  assert.ok(late.hp > early.hp * 2);
  assert.ok(late.attack > early.attack);
  assert.equal(late.tactic, "guard");
  assert.equal(late.cost, 2);
  assert.equal(late.tier, 3);
});

test("コンボと危険撃破でスコアが増える", () => {
  const normal = logic.scoreForKill(100, 0, 1, false);
  const bonus = logic.scoreForKill(100, 100, 5, true);
  assert.equal(normal, 100);
  assert.ok(bonus > normal * 2);
});

test("死亡ペナルティは死亡回数に応じて増える", () => {
  assert.deepEqual([0, 1, 2].map(logic.deathPenalty), [1500, 2000, 2500]);
});
