"use strict";

const Logic = require("./gameLogic");

exports.main = function main(param) {
  const scene = new g.Scene({ game: g.game, assetIds: ["sprites", "field"] });
  const random = param.random || g.game.random;
  g.game.vars.gameState = { score: 0 };

  scene.onLoad.add(() => {
    const W = g.game.width;
    const H = g.game.height;
    const TOP = 66;
    const FIELD_BOTTOM = 596;
    const GAME_TIME = 180;
    const FINAL_COST_LIMIT = Logic.costLimit(GAME_TIME);
    const DT = 1 / g.game.fps;
    const font12 = new g.DynamicFont({ game: g.game, fontFamily: "sans-serif", size: 12 });
    const font16 = new g.DynamicFont({ game: g.game, fontFamily: "sans-serif", size: 16 });
    const font20 = new g.DynamicFont({ game: g.game, fontFamily: "sans-serif", size: 20 });
    const font28 = new g.DynamicFont({ game: g.game, fontFamily: "sans-serif", size: 28, fontWeight: "bold" });
    const font42 = new g.DynamicFont({ game: g.game, fontFamily: "sans-serif", size: 42, fontWeight: "bold" });
    const spriteAtlas = scene.asset.getImageById("sprites");
    const fieldImage = scene.asset.getImageById("field");
    const ATLAS_CELL = 256;

    function atlasSprite(col, row, x, y, width, height, touchable) {
      return new g.Sprite({
        scene, src: spriteAtlas, x, y, width, height,
        srcX: col * ATLAS_CELL, srcY: row * ATLAS_CELL,
        srcWidth: ATLAS_CELL, srcHeight: ATLAS_CELL,
        touchable: !!touchable
      });
    }

    function catalystCell(id) {
      const cells = { bone: 0, fang: 1, iron: 2, mana: 3, mushroom: 4, soul: 5 };
      return { col: cells[id], row: 3 };
    }

    function minionCell(spec) {
      const specials = {
        "アーマースケルトン": { col: 1, row: 1 },
        "スケルトンメイジ": { col: 2, row: 1 },
        "ヴェノムハウンド": { col: 3, row: 1 },
        "インフェルノゴーレム": { col: 4, row: 1 },
        "レイス": { col: 5, row: 1 }
      };
      if (specials[spec.name]) return specials[spec.name];
      const cells = {
        bone: { col: 1, row: 0 }, fang: { col: 2, row: 0 }, iron: { col: 3, row: 0 },
        mana: { col: 4, row: 0 }, mushroom: { col: 5, row: 0 }, soul: { col: 0, row: 1 }
      };
      return cells[spec.primary];
    }

    function enemyCell(typeId) {
      const cells = { fighter: 0, rogue: 1, archer: 2, cleric: 3, knight: 4, hero: 5 };
      return { col: cells[typeId], row: 2 };
    }

    const root = new g.E({ scene });
    scene.append(root);
    root.append(new g.FilledRect({ scene, width: W, height: H, cssColor: "#142620" }));
    root.append(new g.Sprite({ scene, src: fieldImage, x: 0, y: 0, width: W, height: H, opacity: 0.9 }));

    const terrains = [
      { id: "road", x: 0, y: 292, width: W, height: 84 },
      { id: "rock", x: 82, y: 92, width: 244, height: 142 },
      { id: "mana", x: 478, y: 120, width: 284, height: 128 },
      { id: "swamp", x: 886, y: 398, width: 260, height: 154 },
      { id: "grave", x: 128, y: 420, width: 250, height: 130 }
    ];

    const terrainViews = [];
    terrains.forEach((zone) => {
      const info = Logic.TERRAIN[zone.id];
      const rect = new g.FilledRect({
        scene, x: zone.x, y: zone.y, width: zone.width, height: zone.height,
        cssColor: info.color, opacity: 0.18
      });
      const label = new g.Label({
        scene, x: zone.x + 8, y: zone.y + 6, width: zone.width - 16,
        font: font12, text: info.name + "：" + info.effect,
        textColor: "#eef8f3", opacity: 0.86
      });
      root.append(rect);
      root.append(label);
      terrainViews.push({ rect, label });
    });
    const fieldEffectLabel = new g.Label({
      scene, x: 12, y: FIELD_BOTTOM - 20, width: 360, font: font12,
      text: "平地：魔王付近なら護衛型", textColor: "#dcebe5", opacity: 0.82
    });
    root.append(fieldEffectLabel);

    const gates = [
      { x: 4, y: 300, width: 30, height: 68, sx: 42, sy: 334 },
      { x: W - 34, y: 300, width: 30, height: 68, sx: W - 42, sy: 334 },
      { x: W / 2 - 34, y: TOP, width: 68, height: 28, sx: W / 2, sy: TOP + 38 }
    ];
    gates.forEach((gate) => {
      root.append(new g.FilledRect({ scene, x: gate.x, y: gate.y, width: gate.width, height: gate.height, cssColor: "#a8344f", opacity: 0.36 }));
    });

    const battlefieldInput = new g.FilledRect({
      scene, x: 0, y: TOP, width: W, height: FIELD_BOTTOM - TOP,
      cssColor: "#ffffff", opacity: 0.001, touchable: true
    });
    root.append(battlefieldInput);
    const summonTargetTint = new g.FilledRect({
      scene, x: 0, y: TOP, width: W, height: FIELD_BOTTOM - TOP,
      cssColor: "#ffe56a", opacity: 0.06, hidden: true
    });
    root.append(summonTargetTint);
    const summonFieldBorders = [
      new g.FilledRect({ scene, x: 0, y: TOP, width: W, height: 6, cssColor: "#ffe56a", hidden: true }),
      new g.FilledRect({ scene, x: 0, y: FIELD_BOTTOM - 6, width: W, height: 6, cssColor: "#ffe56a", hidden: true }),
      new g.FilledRect({ scene, x: 0, y: TOP, width: 6, height: FIELD_BOTTOM - TOP, cssColor: "#ffe56a", hidden: true }),
      new g.FilledRect({ scene, x: W - 6, y: TOP, width: 6, height: FIELD_BOTTOM - TOP, cssColor: "#ffe56a", hidden: true })
    ];
    summonFieldBorders.forEach((border) => root.append(border));
    const unitLayer = new g.E({ scene });
    root.append(unitLayer);

    const topBar = new g.FilledRect({ scene, x: 0, y: 0, width: W, height: TOP, cssColor: "#0b1513", opacity: 0.96 });
    root.append(topBar);
    const titleLabel = new g.Label({ scene, x: 18, y: 9, font: font20, text: "最弱魔王の180秒防衛戦", textColor: "#f3d78b" });
    root.append(titleLabel);
    const scoreLabel = new g.Label({ scene, x: 18, y: 35, font: font20, text: "SCORE 0", textColor: "#ffffff" });
    root.append(scoreLabel);
    const timeLabel = new g.Label({ scene, x: W / 2, y: 8, anchorX: 0.5, font: font42, text: "180", textColor: "#ffffff" });
    root.append(timeLabel);
    const phaseLabel = new g.Label({ scene, x: W / 2, y: 48, anchorX: 0.5, font: font12, text: "準備", textColor: "#8ee6c3" });
    root.append(phaseLabel);
    const statusLabel = new g.Label({ scene, x: W - 18, y: 10, anchorX: 1, font: font16, text: "軍勢 0/6  死亡 0", textColor: "#d8e3df" });
    root.append(statusLabel);
    const comboLabel = new g.Label({ scene, x: W - 260, y: 35, anchorX: 1, font: font20, text: "", textColor: "#ffd064" });
    root.append(comboLabel);
    const kingHpLabel = new g.Label({ scene, x: W - 18, y: 34, anchorX: 1, font: font16, text: "魔王HP 100/100", textColor: "#ffb2c9" });
    root.append(kingHpLabel);
    const kingHpBg = new g.FilledRect({ scene, x: W - 370, y: 15, width: 190, height: 12, cssColor: "#3d2630" });
    const kingHpBar = new g.FilledRect({ scene, x: W - 370, y: 15, width: 190, height: 12, cssColor: "#e95780" });
    root.append(kingHpBg); root.append(kingHpBar);

    const inventoryPanel = new g.FilledRect({ scene, x: 0, y: FIELD_BOTTOM, width: W, height: H - FIELD_BOTTOM, cssColor: "#0b1513" });
    root.append(inventoryPanel);
    root.append(new g.Label({ scene, x: 12, y: FIELD_BOTTOM + 5, font: font12, text: "触媒を1～3個選び、戦場の召喚地点をタップ", textColor: "#b9c9c3" }));

    let elapsed = 0;
    let phase = "ready";
    let readyLeft = 5;
    let spawnLeft = 6;
    let dropLeft = 0.5;
    let score = 0;
    let deaths = 0;
    let combo = 0;
    let comboLeft = 0;
    let bossSpawned = false;
    let bossDefeated = false;
    let ended = false;
    let toastLeft = 0;
    let forceUiLeft = 0;
    let appliedMonsterTier = 0;
    let knownCostLimit = Logic.costLimit(0);
    let summonSerial = 0;
    const minions = [];
    const enemies = [];
    const drops = [];
    const effects = [];
    const projectiles = [];
    const inventory = {};
    Logic.CATALYSTS.forEach((c) => { inventory[c.id] = 1; });
    let selected = [];
    let summonPauseLeft = 0;
    let kingDragStart = null;

    const king = {
      x: W / 2,
      y: 450,
      alive: true,
      hp: 100,
      maxHp: 100,
      reviveLeft: 0,
      invincible: 0,
      sinceDamage: 99,
      targetX: W / 2,
      targetY: 450
    };
    const kingBody = atlasSprite(0, 0, king.x - 28, king.y - 28, 56, 56, true);
    root.append(kingBody);
    const kingCrown = new g.Label({ scene, x: king.x, y: king.y - 31, anchorX: 0.5, font: font16, text: "魔王", textColor: "#ffe4a6" });
    root.append(kingCrown);

    const inventoryGuideBorders = [
      new g.FilledRect({ scene, x: 6, y: FIELD_BOTTOM + 22, width: 722, height: 4, cssColor: "#ffe56a" }),
      new g.FilledRect({ scene, x: 6, y: FIELD_BOTTOM + 108, width: 722, height: 4, cssColor: "#ffe56a" }),
      new g.FilledRect({ scene, x: 6, y: FIELD_BOTTOM + 22, width: 4, height: 90, cssColor: "#ffe56a" }),
      new g.FilledRect({ scene, x: 724, y: FIELD_BOTTOM + 22, width: 4, height: 90, cssColor: "#ffe56a" })
    ];
    inventoryGuideBorders.forEach((border) => root.append(border));
    const selectionLabel = new g.Label({ scene, x: 770, y: FIELD_BOTTOM + 5, font: font12, text: "① 触媒を1～3個選択", textColor: "#ffffff" });
    root.append(selectionLabel);
    const previewLabel = new g.Label({ scene, x: 770, y: FIELD_BOTTOM + 26, width: 390, font: font16, text: "", textColor: "#8ee6c3" });
    root.append(previewLabel);
    const toastLabel = new g.Label({ scene, x: W / 2, y: FIELD_BOTTOM - 44, anchorX: 0.5, font: font20, text: "", textColor: "#fff0a5", hidden: true });
    root.append(toastLabel);
    const pauseBanner = new g.FilledRect({
      scene, x: W / 2 - 285, y: TOP + 94, width: 570, height: 42,
      cssColor: "#5c4618", opacity: 0.9, hidden: true
    });
    root.append(pauseBanner);
    const pauseIndicator = new g.Label({
      scene, x: W / 2, y: TOP + 103, anchorX: 0.5, font: font20,
      text: "", textColor: "#fff0a5", hidden: true
    });
    root.append(pauseIndicator);

    const enemyPanel = new g.FilledRect({ scene, x: 10, y: TOP + 38, width: 290, height: 48, cssColor: "#1a2024", opacity: 0.64 });
    const allyPanel = new g.FilledRect({ scene, x: W - 410, y: TOP + 38, width: 400, height: 48, cssColor: "#17241f", opacity: 0.68 });
    root.append(enemyPanel); root.append(allyPanel);
    const enemyTitle = new g.Label({ scene, x: 20, y: TOP + 45, font: font16, text: "敵勢力 0", textColor: "#ffb0a4" });
    const allyTitle = new g.Label({ scene, x: W - 400, y: TOP + 45, font: font16, text: "味方勢力 0/6", textColor: "#9cf0ba" });
    root.append(enemyTitle); root.append(allyTitle);
    const enemyRows = [];
    const allyRows = [];
    for (let i = 0; i < 4; ++i) {
      const label = new g.Label({ scene, x: 20, y: TOP + 70 + i * 21, width: 270, font: font12, text: "", textColor: "#e4d8d4" });
      enemyRows.push(label); root.append(label);
    }
    for (let i = 0; i < 7; ++i) {
      const label = new g.Label({ scene, x: W - 400, y: TOP + 70 + i * 21, width: 382, font: font12, text: "", textColor: "#d8eee0" });
      allyRows.push(label); root.append(label);
    }

    const buttons = [];
    Logic.CATALYSTS.forEach((cat, i) => {
      const x = 10 + i * 121;
      const y = FIELD_BOTTOM + 27;
      const base = new g.FilledRect({ scene, x, y, width: 111, height: 82, cssColor: "#24312e", touchable: true });
      const strip = new g.FilledRect({ scene, x, y, width: 8, height: 82, cssColor: cat.color });
      const cell = catalystCell(cat.id);
      const glyph = atlasSprite(cell.col, cell.row, x + 10, y + 4, 48, 48, false);
      const name = new g.Label({ scene, x: x + 58, y: y + 9, anchorX: 0.5, font: font16, text: cat.name, textColor: "#ffffff" });
      const count = new g.Label({ scene, x: x + 58, y: y + 43, anchorX: 0.5, font: font20, text: "×1", textColor: "#ffffff" });
      root.append(base); root.append(strip); root.append(glyph); root.append(name); root.append(count);
      const button = { cat, base, strip, glyph, name, count, x, y };
      buttons.push(button);

      base.onPointDown.add(() => {
        if (phase !== "play" || ended || !king.alive) return;
        stopKingMovement();
        if (!canAddCatalyst(cat.id)) {
          showToast(remainingCost() <= selected.length ? "この編成は軍勢上限を超えます" : "この触媒は選択できません", "#ff9b9b");
          return;
        }
        selected.push(cat.id);
        summonPauseLeft = 5;
        updateSelectionPreview();
        refreshInventory();
      });
    });

    const clearButton = new g.FilledRect({ scene, x: 1174, y: FIELD_BOTTOM + 26, width: 94, height: 34, cssColor: "#704653", touchable: true });
    root.append(clearButton);
    root.append(new g.Label({ scene, x: 1221, y: FIELD_BOTTOM + 34, anchorX: 0.5, font: font16, text: "選択解除", textColor: "#ffffff" }));
    clearButton.onPointDown.add(() => {
      cancelSummonSelection();
    });

    battlefieldInput.onPointDown.add((ev) => {
      if (phase !== "play" || ended || !selected.length) return;
      summon(ev.point.x, TOP + ev.point.y);
    });

    kingBody.onPointDown.add((_ev) => {
      if (!king.alive || phase !== "play") return;
      kingDragStart = { x: king.x, y: king.y };
      king.targetX = king.x;
      king.targetY = king.y;
    });
    kingBody.onPointMove.add((ev) => {
      if (!king.alive || phase !== "play" || !kingDragStart) return;
      king.targetX = Logic.clamp(kingDragStart.x + ev.startDelta.x, 24, W - 24);
      king.targetY = Logic.clamp(kingDragStart.y + ev.startDelta.y, TOP + 24, FIELD_BOTTOM - 24);
    });
    kingBody.onPointUp.add(() => { stopKingMovement(); });

    function terrainAt(x, y) {
      for (let i = terrains.length - 1; i >= 0; --i) {
        const z = terrains[i];
        if (x >= z.x && x <= z.x + z.width && y >= z.y && y <= z.y + z.height) return z.id;
      }
      return "field";
    }

    function phaseName() {
      if (elapsed < 45) return "準備：通常体";
      if (elapsed < 90) return "混戦：強化体";
      if (elapsed < 135) return "包囲：変異体";
      if (elapsed < 160) return "勇者前衛隊：最終形態";
      return "勇者襲来";
    }

    function currentCost() {
      return minions.reduce((sum, m) => sum + m.cost, 0);
    }

    function currentCostLimit() {
      return Logic.costLimit(elapsed);
    }

    function remainingCost() {
      return Math.max(0, currentCostLimit() - currentCost());
    }

    function canAddCatalyst(id) {
      const already = selected.filter((selectedId) => selectedId === id).length;
      return selected.length < 3 && already < inventory[id] && selected.length + 1 <= remainingCost();
    }

    function stopKingMovement() {
      kingDragStart = null;
      king.targetX = king.x;
      king.targetY = king.y;
    }

    function cancelSummonSelection() {
      selected = [];
      summonPauseLeft = 0;
      stopKingMovement();
      pauseBanner.hide();
      pauseIndicator.hide();
      refreshInventory();
      updateSelectionPreview();
    }

    function setScore(value) {
      score = Math.max(0, Math.floor(value));
      g.game.vars.gameState.score = score;
      scoreLabel.text = "SCORE " + score;
      scoreLabel.invalidate();
    }

    function showToast(text, color) {
      toastLabel.text = text;
      toastLabel.textColor = color || "#fff0a5";
      toastLabel.hidden = false;
      toastLabel.invalidate();
      toastLabel.modified();
      toastLeft = 1.6;
    }

    function refreshInventory() {
      buttons.forEach((b) => {
        const used = selected.filter((id) => id === b.cat.id).length;
        const canAdd = canAddCatalyst(b.cat.id);
        const costLocked = selected.length + 1 > remainingCost();
        b.count.text = costLocked && !used ? "上限" : "×" + inventory[b.cat.id] + (used ? "  選" + used : "");
        b.count.textColor = used ? "#fff0a5" : canAdd ? "#ffffff" : "#78847f";
        b.count.invalidate();
        b.base.cssColor = used ? "#435147" : canAdd ? "#24312e" : "#151a18";
        const opacity = used || canAdd ? 1 : 0.34;
        b.strip.opacity = opacity;
        b.glyph.opacity = opacity;
        b.name.opacity = opacity;
        b.base.modified();
        b.strip.modified();
        b.glyph.modified();
        b.name.modified();
      });
      const names = selected.map((id) => Logic.CATALYSTS.find((c) => c.id === id).name);
      selectionLabel.text = names.length ? "選択中: " + names.join(" + ") : remainingCost() > 0 ? "① 触媒を1～3個選択" : "軍勢上限：召喚できません";
      selectionLabel.invalidate();
    }

    function updateSelectionPreview() {
      if (!selected.length) {
        previewLabel.text = remainingCost() > 0 ? "光っている触媒ボタンをタップ" : "味方の撃破か次の上限拡張を待ってください";
      } else {
        const spec = Logic.summonSpec(selected, "field", elapsed, false);
        previewLabel.text = spec.name + " → ② 戦場の召喚地点をタップ";
      }
      previewLabel.invalidate();
    }

    function refreshSummonGuidance() {
      const choosing = phase === "play" && selected.length > 0;
      const selectable = phase === "play" && !selected.length && remainingCost() > 0;
      const pulse = 0.5 + (Math.sin(elapsed * 7) + 1) * 0.2;
      inventoryGuideBorders.forEach((border) => {
        if (selectable) border.show(); else border.hide();
        border.opacity = pulse;
        border.modified();
      });
      if (choosing) summonTargetTint.show(); else summonTargetTint.hide();
      summonTargetTint.opacity = 0.045 + pulse * 0.045;
      summonTargetTint.modified();
      summonFieldBorders.forEach((border) => {
        if (choosing) border.show(); else border.hide();
        border.opacity = pulse;
        border.modified();
      });
      if (choosing) pauseBanner.show(); else pauseBanner.hide();
      terrainViews.forEach((view) => {
        view.rect.opacity = choosing ? 0.42 : 0.18;
        view.label.opacity = choosing ? 1 : 0.86;
        view.rect.modified();
        view.label.modified();
      });
    }

    function tacticName(id) {
      const names = { guard: "魔王護衛", execute: "各個撃破", skirmish: "遊撃", collect: "収集", cautious: "慎重", raid: "強襲" };
      return names[id] || id;
    }

    function speciesName(primary) {
      const names = { bone: "骨族", fang: "魔獣族", iron: "鉱石族", mana: "精霊族", mushroom: "粘体族", soul: "魔族" };
      return names[primary] || "不明";
    }

    function refreshKingHp() {
      const hp = Math.max(0, Math.ceil(king.hp));
      kingHpLabel.text = "魔王HP " + hp + "/" + king.maxHp;
      kingHpLabel.invalidate();
      kingHpBar.width = Math.max(0, 190 * king.hp / king.maxHp);
      kingHpBar.cssColor = king.hp <= 30 ? "#ff3e5f" : king.hp <= 60 ? "#ee8a65" : "#e95780";
      kingHpBar.modified();
    }

    function refreshForcePanels() {
      enemyTitle.text = "敵勢力 " + enemies.length;
      enemyTitle.invalidate();
      const enemyCounts = {};
      enemies.forEach((enemy) => { enemyCounts[enemy.name] = (enemyCounts[enemy.name] || 0) + 1; });
      const enemyParts = Object.keys(enemyCounts).map((name) => name + "×" + enemyCounts[name]);
      enemyPanel.height = 48 + Math.ceil(enemyParts.length / 2) * 21;
      enemyPanel.modified();
      enemyRows.forEach((row, index) => {
        row.text = enemyParts.slice(index * 2, index * 2 + 2).join("　");
        row.invalidate();
      });

      allyTitle.text = "味方勢力 " + minions.length + "体 / コスト" + currentCost() + "/" + currentCostLimit();
      allyTitle.invalidate();
      const groups = {};
      minions.forEach((minion) => {
        const key = minion.name + "/" + minion.primary + "/" + minion.tactic;
        if (!groups[key]) groups[key] = { name: minion.name, primary: minion.primary, tactic: minion.tactic, tier: minion.tier, count: 0, hp: 0, maxHp: 0 };
        groups[key].tier = Math.max(groups[key].tier, minion.tier);
        groups[key].count += 1;
        groups[key].hp += Math.max(0, minion.hp);
        groups[key].maxHp += minion.maxHp;
      });
      const allyGroups = Object.keys(groups).map((key) => groups[key]);
      const visibleAllyRows = Math.min(7, allyGroups.length > 6 ? 7 : allyGroups.length);
      allyPanel.height = 48 + visibleAllyRows * 21;
      allyPanel.modified();
      allyRows.forEach((row, index) => {
        if (index < 6 && allyGroups[index]) {
          const group = allyGroups[index];
          const countText = group.count > 1 ? "×" + group.count : "";
          row.text = group.name.slice(0, 11) + countText + " T" + (group.tier + 1) + " HP" + Math.ceil(group.hp) + "/" + group.maxHp + "  " + speciesName(group.primary) + "/" + tacticName(group.tactic);
        } else if (index === 6 && allyGroups.length > 6) {
          row.text = "ほか " + (allyGroups.length - 6) + "編成";
        } else {
          row.text = "";
        }
        row.invalidate();
      });
    }

    function summon(x, y) {
      if (!selected.length) return;
      const terrain = terrainAt(x, y);
      const near = Logic.distance({ x, y }, king) < 150;
      const spec = Logic.summonSpec(selected, terrain, elapsed, near);
      if (currentCost() + spec.cost > currentCostLimit()) {
        showToast("軍勢上限です（" + currentCost() + "/" + currentCostLimit() + "）", "#ff9b9b");
        return;
      }
      for (const id of selected) {
        if (inventory[id] <= 0) return;
      }
      selected.forEach((id) => { inventory[id] -= 1; });
      summonSerial += 1;
      const cell = minionCell(spec);
      const visualSize = Math.max(38, spec.size * 2.45);
      const body = atlasSprite(cell.col, cell.row, x - visualSize / 2, y - visualSize / 2, visualSize, visualSize, false);
      const hpBg = new g.FilledRect({ scene, x: x - 18, y: y - spec.size - 7, width: 36, height: 4, cssColor: "#251f21" });
      const hpBar = new g.FilledRect({ scene, x: x - 18, y: y - spec.size - 7, width: 36, height: 4, cssColor: "#6be08c" });
      const mark = new g.Label({ scene, x, y: y - 9, anchorX: 0.5, font: font12, text: "", textColor: "#17201e" });
      unitLayer.append(body); unitLayer.append(hpBg); unitLayer.append(hpBar); unitLayer.append(mark);
      minions.push({
        ...spec, x, y, hp: spec.hp, maxHp: spec.hp, body, hpBg, hpBar, mark,
        attackLeft: random.generate() * 0.4, age: 0, poisonTick: 0, id: summonSerial
      });
      burst(x, y, spec.color, 6);
      showToast(spec.name + " 召喚！ " + Logic.TERRAIN[terrain].name + "［" + Logic.TERRAIN[terrain].effect + "］", spec.color);
      selected = [];
      summonPauseLeft = 0;
      stopKingMovement();
      refreshInventory();
      updateSelectionPreview();
    }

    function empowerExistingMinions(nextTier) {
      const nextBoost = Logic.monsterTierBoost(nextTier);
      minions.forEach((minion) => {
        if (minion.tier >= nextTier) return;
        const ratio = nextBoost / Logic.monsterTierBoost(minion.tier);
        minion.maxHp = Math.round(minion.maxHp * ratio);
        minion.hp = Math.round(minion.hp * ratio);
        minion.attack = Math.round(minion.attack * ratio);
        minion.tier = nextTier;
        burst(minion.x, minion.y, "#a8ffcf", 5);
      });
      if (minions.length) showToast("魔王軍強化！ 全モンスター ×" + nextBoost.toFixed(2), "#a8ffcf");
    }

    function spawnDrop(x, y, forcedId) {
      if (drops.length >= 20) return;
      const cat = forcedId ? Logic.CATALYSTS.find((c) => c.id === forcedId) : Logic.CATALYSTS[Math.floor(random.generate() * Logic.CATALYSTS.length)];
      const cell = catalystCell(cat.id);
      const body = atlasSprite(cell.col, cell.row, x - 15, y - 15, 30, 30, false);
      const label = new g.Label({ scene, x, y: y - 8, anchorX: 0.5, font: font12, text: "", textColor: "#18201e" });
      unitLayer.append(body); unitLayer.append(label);
      drops.push({ x, y, id: cat.id, body, label, age: 0 });
    }

    function removeDrop(index, collectorName) {
      const drop = drops[index];
      inventory[drop.id] = Math.min(9, inventory[drop.id] + 1);
      drop.body.destroy(); drop.label.destroy();
      drops.splice(index, 1);
      refreshInventory();
      if (collectorName === "king") burst(drop.x, drop.y, "#ffffff", 3);
    }

    const ENEMY_TYPES = {
      fighter: { name: "戦士", hp: 62, attack: 14, speed: 49, range: 35, cooldown: 0.9, score: 100, color: "#d1a15e", tactic: "duel", size: 15 },
      rogue: { name: "盗賊", hp: 42, attack: 12, speed: 82, range: 31, cooldown: 0.66, score: 180, color: "#e56f73", tactic: "king", size: 13 },
      archer: { name: "弓兵", hp: 48, attack: 15, speed: 45, range: 138, cooldown: 1.3, score: 220, color: "#7dd59a", tactic: "cautious", size: 14 },
      cleric: { name: "僧侶", hp: 72, attack: 10, speed: 39, range: 105, cooldown: 1.2, score: 300, color: "#f2e3a2", tactic: "cautious", size: 15 },
      knight: { name: "騎士", hp: 180, attack: 24, speed: 43, range: 40, cooldown: 1.0, score: 500, color: "#8aa9c9", tactic: "duel", size: 20 },
      hero: { name: "勇者", hp: 980, attack: 38, speed: 61, range: 44, cooldown: 0.68, score: 10000, color: "#ffd34e", tactic: "king", size: 28 }
    };

    function chooseEnemyType() {
      const r = random.generate();
      if (elapsed < 30) return r < 0.9 ? "fighter" : "rogue";
      if (elapsed < 45) return r < 0.82 ? "fighter" : "rogue";
      if (elapsed < 90) return r < 0.42 ? "fighter" : r < 0.68 ? "rogue" : r < 0.88 ? "archer" : "cleric";
      if (elapsed < 135) return r < 0.27 ? "fighter" : r < 0.47 ? "rogue" : r < 0.7 ? "archer" : r < 0.84 ? "cleric" : "knight";
      return r < 0.18 ? "rogue" : r < 0.4 ? "archer" : r < 0.58 ? "cleric" : "knight";
    }

    function spawnEnemy(typeId) {
      const base = ENEMY_TYPES[typeId];
      const gate = gates[Math.floor(random.generate() * gates.length)];
      const mult = typeId === "hero" ? 1 : Logic.enemyMultiplier(elapsed);
      const hp = Math.round(base.hp * mult);
      const x = gate.sx;
      const y = gate.sy;
      const cell = enemyCell(typeId);
      const visualSize = Math.max(40, base.size * 2.35);
      const body = atlasSprite(cell.col, cell.row, x - visualSize / 2, y - visualSize / 2, visualSize, visualSize, false);
      const hpBg = new g.FilledRect({ scene, x: x - 20, y: y - base.size - 7, width: 40, height: 4, cssColor: "#251f21" });
      const hpBar = new g.FilledRect({ scene, x: x - 20, y: y - base.size - 7, width: 40, height: 4, cssColor: typeId === "hero" ? "#ffd34e" : "#e46c6c" });
      const label = new g.Label({ scene, x, y: y - 9, anchorX: 0.5, font: font12, text: "", textColor: "#1b201e" });
      unitLayer.append(body); unitLayer.append(hpBg); unitLayer.append(hpBar); unitLayer.append(label);
      enemies.push({
        ...base, typeId, x, y, hp, maxHp: hp, attack: base.attack * mult, body, hpBg, hpBar, label,
        attackLeft: random.generate() * 0.5, poisonLeft: 0, poisonTick: 0, scatterTarget: null
      });
      if (!king.alive) assignScatterTarget(enemies[enemies.length - 1]);
      if (typeId === "hero") showToast("勇者襲来！ 魔王を最優先で狙っています", "#ffd34e");
    }

    function nearest(origin, list, filter) {
      let best = null;
      let bestD = Infinity;
      list.forEach((item) => {
        if (filter && !filter(item)) return;
        const d = Logic.distance(origin, item);
        if (d < bestD) { best = item; bestD = d; }
      });
      return { target: best, distance: bestD };
    }

    function moveToward(unit, target, speed, dt, stopRange) {
      if (!target) return;
      const dx = target.x - unit.x;
      const dy = target.y - unit.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d <= stopRange) return;
      const amount = Math.min(d - stopRange, speed * dt);
      unit.x += dx / d * amount;
      unit.y += dy / d * amount;
    }

    function syncEntity(unit) {
      unit.body.x = unit.x - unit.body.width / 2;
      unit.body.y = unit.y - unit.body.height / 2;
      unit.body.modified();
      unit.hpBg.x = unit.x - (unit.maxHp > 500 ? 28 : unit.body.width > 34 ? 20 : 18);
      unit.hpBg.y = unit.y - unit.size - 7;
      unit.hpBg.modified();
      unit.hpBar.x = unit.hpBg.x;
      unit.hpBar.y = unit.hpBg.y;
      unit.hpBar.width = Math.max(0, unit.hpBg.width * unit.hp / unit.maxHp);
      unit.hpBar.modified();
      const textEntity = unit.label || unit.mark;
      textEntity.x = unit.x;
      textEntity.y = unit.y - 9;
      textEntity.modified();
    }

    function destroyUnit(unit) {
      unit.body.destroy(); unit.hpBg.destroy(); unit.hpBar.destroy();
      (unit.label || unit.mark).destroy();
    }

    function assignScatterTarget(enemy) {
      let angle = Math.atan2(enemy.y - king.y, enemy.x - king.x);
      if (Math.abs(enemy.x - king.x) + Math.abs(enemy.y - king.y) < 1) angle = random.generate() * Math.PI * 2;
      angle += (random.generate() - 0.5) * 0.9;
      const scatterDistance = 320 + random.generate() * 120;
      enemy.scatterTarget = {
        x: Logic.clamp(enemy.x + Math.cos(angle) * scatterDistance, 30, W - 30),
        y: Logic.clamp(enemy.y + Math.sin(angle) * scatterDistance, TOP + 30, FIELD_BOTTOM - 30)
      };
    }

    function updateKing(dt) {
      if (!king.alive) {
        king.reviveLeft -= dt;
        if (king.reviveLeft <= 0) {
          king.alive = true;
          king.hp = king.maxHp;
          king.invincible = 2;
          king.sinceDamage = 99;
          kingBody.hidden = false; kingCrown.hidden = false;
          kingBody.modified(); kingCrown.modified();
          enemies.forEach((e) => {
            const d = Logic.distance(e, king);
            if (d < 170) moveToward(e, { x: e.x + (e.x - king.x) * 2, y: e.y + (e.y - king.y) * 2 }, 150, 0.9, 0);
            e.scatterTarget = null;
          });
          refreshKingHp();
          showToast("魔王復活！ 2秒無敵", "#ff9fc0");
        }
        return;
      }
      king.invincible = Math.max(0, king.invincible - dt);
      king.sinceDamage += dt;
      if (king.sinceDamage >= 5 && king.hp < king.maxHp) {
        king.hp = Math.min(king.maxHp, king.hp + 4 * dt);
        refreshKingHp();
      }
      moveToward(king, { x: king.targetX, y: king.targetY }, 155, dt, 1);
      king.x = Logic.clamp(king.x, 20, W - 20);
      king.y = Logic.clamp(king.y, TOP + 20, FIELD_BOTTOM - 20);
      kingBody.x = king.x - kingBody.width / 2; kingBody.y = king.y - kingBody.height / 2;
      kingCrown.x = king.x; kingCrown.y = king.y - 38;
      kingBody.opacity = king.invincible > 0 && Math.floor(king.invincible * 10) % 2 ? 0.4 : 1;
      kingBody.modified(); kingCrown.modified();
    }

    function killKing() {
      if (!king.alive) return;
      const penalty = Logic.deathPenalty(deaths);
      deaths += 1;
      setScore(score - penalty);
      king.alive = false;
      king.hp = 0;
      king.reviveLeft = 3;
      cancelSummonSelection();
      king.targetX = king.x; king.targetY = king.y;
      kingBody.hidden = true; kingCrown.hidden = true;
      kingBody.modified(); kingCrown.modified();
      enemies.forEach(assignScatterTarget);
      refreshKingHp();
      burst(king.x, king.y, "#ff4d7a", 12);
      showToast("魔王死亡！ 3秒後復活  -" + penalty, "#ff7b96");
    }

    function updateMinions(dt) {
      for (let i = minions.length - 1; i >= 0; --i) {
        const m = minions[i];
        m.age += dt;
        m.attackLeft -= dt;
        let targetInfo = nearest(m, enemies);
        if (m.tactic === "guard" && Logic.distance(m, king) > 150) {
          moveToward(m, king, m.speed, dt, 80);
          targetInfo = nearest(m, enemies, (e) => Logic.distance(e, king) < 190);
        } else if (m.tactic === "execute") {
          targetInfo = { target: null, distance: Infinity };
          enemies.forEach((e) => {
            const weight = Logic.distance(m, e) + e.hp * 0.22;
            if (weight < targetInfo.distance) { targetInfo.target = e; targetInfo.distance = Logic.distance(m, e); }
          });
        }
        if (m.tactic === "collect" && drops.length) {
          const item = nearest(m, drops);
          if (item.target && item.distance < 250) {
            moveToward(m, item.target, m.speed * 1.12, dt, 8);
            if (item.distance < 23) removeDrop(drops.indexOf(item.target), "minion");
            syncEntity(m);
            continue;
          }
        }
        const target = targetInfo.target;
        if (target) {
          moveToward(m, target, m.speed, dt, m.range);
          const d = Logic.distance(m, target);
          if (d <= m.range + target.size && m.attackLeft <= 0) {
            performAttack(m, target, m.attack * (king.alive ? 1 : 0.7), m.poison);
            m.attackLeft = m.cooldown;
          }
        } else if (m.tactic !== "raid") {
          moveToward(m, king, m.speed * 0.65, dt, 95 + (m.id % 3) * 22);
        }
        syncEntity(m);
        if (m.hp <= 0) {
          burst(m.x, m.y, m.color, 5);
          destroyUnit(m);
          minions.splice(i, 1);
          refreshInventory();
          updateSelectionPreview();
        }
      }
    }

    function updateEnemies(dt) {
      for (let i = enemies.length - 1; i >= 0; --i) {
        const e = enemies[i];
        e.attackLeft -= dt;
        if (e.poisonLeft > 0) {
          e.poisonLeft -= dt;
          e.poisonTick -= dt;
          if (e.poisonTick <= 0) { e.hp -= 4; e.poisonTick = 0.5; }
        }
        let target = null;
        let movementOnly = false;
        if (!king.alive) {
          target = e.scatterTarget;
          movementOnly = true;
        } else if (e.tactic === "king") target = king;
        else {
          const closeMinion = nearest(e, minions);
          target = closeMinion.target && closeMinion.distance < 210 ? closeMinion.target : king;
        }
        if (target) {
          const targetSize = target === king ? 17 : (target.size || 0);
          const d = Logic.distance(e, target);
          const desired = movementOnly ? 4 : e.range + targetSize;
          if (d > desired) moveToward(e, target, movementOnly ? Math.max(110, e.speed * 1.8) : e.speed, dt, movementOnly ? 4 : desired - 2);
          if (!movementOnly && d <= desired + 4 && e.attackLeft <= 0) {
            e.attackLeft = e.cooldown;
            performAttack(e, target, e.attack, false);
          }
        }
        if (e.typeId === "cleric" && e.attackLeft <= 0) {
          const ally = nearest(e, enemies, (other) => other !== e && other.hp < other.maxHp * 0.8);
          if (ally.target && ally.distance < 130) {
            ally.target.hp = Math.min(ally.target.maxHp, ally.target.hp + 18 * Logic.enemyMultiplier(elapsed));
            e.attackLeft = 1.4;
            burst(ally.target.x, ally.target.y, "#fff3b5", 3);
          }
        }
        syncEntity(e);
        if (e.hp <= 0) {
          combo = comboLeft > 0 ? combo + 1 : 1;
          comboLeft = 3;
          const risk = king.alive && Logic.distance(e, king) < 120;
          let gained = Logic.scoreForKill(e.score, elapsed, combo, risk);
          if (e.typeId === "hero") {
            bossDefeated = true;
            gained += Math.floor(Math.max(0, GAME_TIME - elapsed) * 150);
            showToast("勇者撃破！ ＋" + gained, "#ffe470");
          }
          setScore(score + gained);
          if (random.generate() < 0.38 || e.typeId === "hero") spawnDrop(e.x, e.y);
          burst(e.x, e.y, e.color, e.typeId === "hero" ? 18 : 6);
          destroyUnit(e);
          enemies.splice(i, 1);
        }
      }
    }

    function updateDrops(dt) {
      for (let i = drops.length - 1; i >= 0; --i) {
        const d = drops[i];
        d.age += dt;
        d.body.opacity = 0.72 + Math.sin(d.age * 5) * 0.22;
        d.body.modified();
        if (king.alive && Logic.distance(d, king) < 35) removeDrop(i, "king");
      }
    }

    function isTargetValid(target) {
      if (target === king) return king.alive;
      return minions.indexOf(target) >= 0 || enemies.indexOf(target) >= 0;
    }

    function floatingDamage(target, amount, color) {
      const label = new g.Label({
        scene, x: target.x, y: target.y - 30, anchorX: 0.5,
        font: font16, text: "-" + Math.max(1, Math.round(amount)), textColor: color || "#ffffff"
      });
      unitLayer.append(label);
      effects.push({ type: "floating", body: label, x: target.x, y: target.y - 30, left: 0.65 });
    }

    function damageKing(amount) {
      if (!king.alive || king.invincible > 0) return;
      const damage = Math.max(1, Math.round(amount));
      king.hp = Math.max(0, king.hp - damage);
      king.sinceDamage = 0;
      king.invincible = 0.45;
      floatingDamage(king, damage, "#ff8ba8");
      burst(king.x, king.y, "#ff5c83", 4);
      refreshKingHp();
      if (king.hp <= 0) killKing();
    }

    function applyDamage(target, amount, color, poison) {
      if (target === king) {
        damageKing(amount);
        return;
      }
      if (!isTargetValid(target)) return;
      const damage = Math.max(1, Math.round(amount));
      target.hp -= damage;
      if (poison) target.poisonLeft = Math.max(target.poisonLeft || 0, 3);
      hitFlash(target, color);
      floatingDamage(target, damage, color);
    }

    function meleeTrace(attacker, target, color) {
      const dx = target.x - attacker.x;
      const dy = target.y - attacker.y;
      const length = Math.max(16, Math.sqrt(dx * dx + dy * dy));
      const line = new g.FilledRect({
        scene, x: attacker.x, y: attacker.y, width: length, height: 5,
        anchorY: 0.5, angle: Math.atan2(dy, dx) * 180 / Math.PI,
        cssColor: color, opacity: 0.95
      });
      unitLayer.append(line);
      effects.push({ type: "trace", body: line, left: 0.18 });
    }

    function performAttack(attacker, target, damage, poison) {
      if (!target || !isTargetValid(target)) return;
      const color = attacker.color || "#ffffff";
      if (attacker.range >= 80) {
        const body = new g.FilledRect({
          scene, x: attacker.x, y: attacker.y, width: 12, height: 6,
          anchorX: 0.5, anchorY: 0.5, cssColor: color
        });
        unitLayer.append(body);
        projectiles.push({
          x: attacker.x, y: attacker.y, body, target,
          damage, poison: !!poison, color, speed: attacker.typeId === "archer" ? 330 : 285
        });
      } else {
        meleeTrace(attacker, target, color);
        applyDamage(target, damage, color, poison);
      }
    }

    function updateProjectiles(dt) {
      for (let i = projectiles.length - 1; i >= 0; --i) {
        const projectile = projectiles[i];
        if (!isTargetValid(projectile.target)) {
          projectile.body.destroy();
          projectiles.splice(i, 1);
          continue;
        }
        const dx = projectile.target.x - projectile.x;
        const dy = projectile.target.y - projectile.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;
        const amount = Math.min(distance, projectile.speed * dt);
        projectile.x += dx / distance * amount;
        projectile.y += dy / distance * amount;
        projectile.body.x = projectile.x;
        projectile.body.y = projectile.y;
        projectile.body.angle = Math.atan2(dy, dx) * 180 / Math.PI;
        projectile.body.modified();
        const targetSize = projectile.target === king ? 17 : projectile.target.size;
        if (distance <= targetSize + 8) {
          applyDamage(projectile.target, projectile.damage, projectile.color, projectile.poison);
          burst(projectile.x, projectile.y, projectile.color, 4);
          projectile.body.destroy();
          projectiles.splice(i, 1);
        }
      }
    }

    function hitFlash(unit, color) {
      unit.body.cssColor = "#ffffff";
      unit.body.modified();
      effects.push({ type: "flash", unit, color, left: 0.08 });
    }

    function burst(x, y, color, count) {
      for (let i = 0; i < count; ++i) {
        const angle = random.generate() * Math.PI * 2;
        const speed = 35 + random.generate() * 75;
        const body = new g.FilledRect({ scene, x: x - 3, y: y - 3, width: 6, height: 6, cssColor: color });
        unitLayer.append(body);
        effects.push({ type: "particle", body, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, left: 0.45 });
      }
    }

    function updateEffects(dt) {
      for (let i = effects.length - 1; i >= 0; --i) {
        const effect = effects[i];
        effect.left -= dt;
        if (effect.type === "flash" && effect.left <= 0) {
          if (!effect.unit.body.destroyed()) {
            effect.unit.body.cssColor = effect.color;
            effect.unit.body.modified();
          }
          effects.splice(i, 1);
        } else if (effect.type === "trace") {
          effect.body.opacity = Math.max(0, effect.left / 0.18);
          effect.body.modified();
          if (effect.left <= 0) { effect.body.destroy(); effects.splice(i, 1); }
        } else if (effect.type === "floating") {
          effect.y -= 28 * dt;
          effect.body.y = effect.y;
          effect.body.opacity = Math.max(0, effect.left / 0.65);
          effect.body.modified();
          if (effect.left <= 0) { effect.body.destroy(); effects.splice(i, 1); }
        } else if (effect.type === "particle") {
          effect.x += effect.vx * dt;
          effect.y += effect.vy * dt;
          effect.vy += 75 * dt;
          effect.body.x = effect.x; effect.body.y = effect.y;
          effect.body.opacity = Math.max(0, effect.left / 0.45);
          effect.body.modified();
          if (effect.left <= 0) { effect.body.destroy(); effects.splice(i, 1); }
        }
      }
    }

    function endGame() {
      if (ended) return;
      ended = true;
      phase = "end";
      if (deaths === 0) setScore(score + 4000);
      const overlay = new g.FilledRect({ scene, width: W, height: H, cssColor: "#07100e", opacity: 0.9 });
      root.append(overlay);
      root.append(new g.Label({ scene, x: W / 2, y: 150, anchorX: 0.5, font: font42, text: "防衛戦終了", textColor: "#f3d78b" }));
      root.append(new g.Label({ scene, x: W / 2, y: 230, anchorX: 0.5, font: font42, text: "SCORE  " + score, textColor: "#ffffff" }));
      root.append(new g.Label({ scene, x: W / 2, y: 310, anchorX: 0.5, font: font20, text: "勇者 " + (bossDefeated ? "撃破" : "生存") + "　魔王死亡 " + deaths + "回　最大軍勢 " + FINAL_COST_LIMIT, textColor: "#c9d9d1" }));
      if (deaths === 0) root.append(new g.Label({ scene, x: W / 2, y: 355, anchorX: 0.5, font: font28, text: "ノーデスボーナス +4000", textColor: "#8ee6c3" }));
      root.append(new g.Label({ scene, x: W / 2, y: 430, anchorX: 0.5, font: font16, text: "ランキングへスコアを送信中…", textColor: "#aebdb8" }));
      if (g.game.requestSaveScore) g.game.requestSaveScore(score);
    }

    function showReadyOverlay() {
      const overlay = new g.FilledRect({ scene, width: W, height: H, cssColor: "#07100e", opacity: 0.88 });
      const panel = new g.FilledRect({ scene, x: 190, y: 95, width: 900, height: 500, cssColor: "#172923" });
      const readyTitle = new g.Label({ scene, x: W / 2, y: 120, anchorX: 0.5, font: font42, text: "最弱魔王の180秒防衛戦", textColor: "#f3d78b" });
      const lines = [
        "魔王は100HP制。被弾エフェクトを見てドラッグで回避しよう",
        "触媒を1～3個選ぶと戦術停止。戦場をタップして召喚",
        "軍勢上限は45秒ごとに 6 → 9 → 12 → 15 へ拡張",
        "魔王と収集型モンスターで、戦場の触媒を回収",
        "160秒で勇者襲来。撃破速度・コンボ・ノーデスで高得点"
      ];
      root.append(overlay); root.append(panel); root.append(readyTitle);
      const lineLabels = lines.map((line, i) => new g.Label({ scene, x: 245, y: 205 + i * 48, font: font20, text: "・" + line, textColor: "#e7efec" }));
      lineLabels.forEach((lineLabel) => root.append(lineLabel));
      const count = new g.Label({ scene, x: W / 2, y: 500, anchorX: 0.5, font: font42, text: "開始まで 5", textColor: "#8ee6c3" });
      root.append(count);
      return { overlay, panel, readyTitle, count, lineLabels };
    }

    const readyUi = showReadyOverlay();
    refreshInventory();
    refreshKingHp();
    refreshForcePanels();
    updateSelectionPreview();
    for (let i = 0; i < 10; ++i) {
      spawnDrop(90 + random.generate() * (W - 180), TOP + 70 + random.generate() * (FIELD_BOTTOM - TOP - 130));
    }

    scene.onUpdate.add(() => {
      if (phase === "ready") {
        readyLeft -= DT;
        readyUi.count.text = "開始まで " + Math.max(1, Math.ceil(readyLeft));
        readyUi.count.invalidate();
        if (readyLeft <= 0) {
          readyUi.overlay.destroy(); readyUi.panel.destroy(); readyUi.readyTitle.destroy(); readyUi.count.destroy();
          readyUi.lineLabels.forEach((lineLabel) => lineLabel.destroy());
          phase = "play";
          showToast("防衛開始！ 触媒を集めて召喚せよ", "#8ee6c3");
        }
        return;
      }
      if (ended) { updateEffects(DT); return; }

      elapsed += DT;
      const monsterTier = Logic.corruptionTier(elapsed);
      if (monsterTier > appliedMonsterTier) {
        appliedMonsterTier = monsterTier;
        empowerExistingMinions(monsterTier);
      }
      const costLimit = currentCostLimit();
      if (costLimit > knownCostLimit) {
        const previousLimit = knownCostLimit;
        knownCostLimit = costLimit;
        showToast("軍勢上限拡張！ " + previousLimit + " → " + costLimit, "#ffe56a");
        refreshInventory();
        updateSelectionPreview();
      }
      const left = Math.max(0, GAME_TIME - elapsed);
      timeLabel.text = String(Math.ceil(left));
      timeLabel.textColor = left <= 20 ? "#ff718c" : "#ffffff";
      timeLabel.invalidate();
      let battlePaused = selected.length > 0;
      if (battlePaused) {
        summonPauseLeft -= DT;
        if (summonPauseLeft <= 0) {
          cancelSummonSelection();
          showToast("召喚選択を解除しました", "#c9d9d1");
          battlePaused = false;
        }
      }
      if (battlePaused) pauseIndicator.show(); else pauseIndicator.hide();
      pauseIndicator.text = battlePaused ? "② 召喚地点をタップ　戦術停止 " + summonPauseLeft.toFixed(1) : "";
      pauseIndicator.invalidate();
      phaseLabel.text = battlePaused ? "戦術停止" : phaseName() + "　魔軍×" + Logic.monsterTierBoost(monsterTier).toFixed(2);
      phaseLabel.invalidate();
      refreshSummonGuidance();
      statusLabel.text = "軍勢 " + currentCost() + "/" + costLimit + "  死亡 " + deaths;
      statusLabel.invalidate();

      comboLeft -= DT;
      if (comboLeft <= 0) combo = 0;
      comboLabel.text = combo >= 2 ? combo + " COMBO  ×" + (1 + Math.min(10, combo - 1) * 0.1).toFixed(1) : "";
      comboLabel.invalidate();
      toastLeft -= DT;
      if (toastLeft <= 0 && !toastLabel.hidden) { toastLabel.hidden = true; toastLabel.modified(); }

      if (!battlePaused) {
        spawnLeft -= DT;
        if (spawnLeft <= 0) {
          spawnEnemy(chooseEnemyType());
          if (elapsed > 105 && random.generate() < 0.14) spawnEnemy(chooseEnemyType());
          spawnLeft = Logic.enemySpawnInterval(elapsed);
        }
        if (!bossSpawned && elapsed >= 160) { bossSpawned = true; spawnEnemy("hero"); }

        dropLeft -= DT;
        if (dropLeft <= 0) {
          spawnDrop(70 + random.generate() * (W - 140), TOP + 45 + random.generate() * (FIELD_BOTTOM - TOP - 80));
          dropLeft = 3.2 + random.generate() * 2.4;
        }

        updateKing(DT);
        updateMinions(DT);
        updateProjectiles(DT);
        updateEnemies(DT);
        updateDrops(DT);
      }
      updateEffects(DT);
      forceUiLeft -= DT;
      if (forceUiLeft <= 0) {
        forceUiLeft = 0.2;
        refreshForcePanels();
        refreshKingHp();
      }
      if (elapsed >= GAME_TIME) endGame();
    });
  });

  g.game.pushScene(scene);
};
