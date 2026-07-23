"use strict";

const Logic = require("./gameLogic");

const AUDIO_LOAD_PLAN = [
  { id: "itemPickupSe", after: 1 },
  { id: "summonSe", after: 3 },
  { id: "kingDamageSe", after: 5 },
  { id: "enemyDefeatSe", after: 7 },
  { id: "monsterDeathSe", after: 9 },
  { id: "kingDeathSe", after: 11 },
  { id: "heroAppearSe", after: 100 },
  { id: "heroDefeatSe", after: 135 },
  { id: "gameEndSe", after: 150 }
];

exports.main = function main(param) {
  const scene = new g.Scene({
    game: g.game,
    assetIds: [
      "sprites", "field",
      "font15Image", "font15Glyphs",
      "font20Image", "font20Glyphs",
      "font24Image", "font24Glyphs",
      "font32Image", "font32Glyphs",
      "font44Image", "font44Glyphs"
    ]
  });
  const random = param.random || g.game.random;
  g.game.vars.gameState = { score: 0, difficulty: "normal" };

  scene.onLoad.add(() => {
    const W = g.game.width;
    const H = g.game.height;
    const TOP = 66;
    const FIELD_BOTTOM = 596;
    const GAME_TIME = 180;
    const MAX_PROJECTILES = 32;
    const MAX_EFFECTS = 44;
    const MAX_FLOATING_LABELS = 6;
    const CROWDED_UNIT_THRESHOLD = 28;
    const FINAL_COST_LIMIT = Logic.costLimit(GAME_TIME);
    const DT = 1 / g.game.fps;
    function loadBitmapFont(imageId, glyphId) {
      return new g.BitmapFont({
        src: scene.asset.getImageById(imageId),
        glyphInfo: JSON.parse(scene.asset.getTextContentById(glyphId))
      });
    }
    const font12 = loadBitmapFont("font15Image", "font15Glyphs");
    const font16 = loadBitmapFont("font20Image", "font20Glyphs");
    const font20 = loadBitmapFont("font24Image", "font24Glyphs");
    const font28 = loadBitmapFont("font32Image", "font32Glyphs");
    const font42 = loadBitmapFont("font44Image", "font44Glyphs");
    const spriteAtlas = scene.asset.getImageById("sprites");
    const fieldImage = scene.asset.getImageById("field");
    const ATLAS_CELL = 256;
    const seCooldownUntil = {};
    const loadedAudioIds = {};
    const audioAssetStates = {};
    let gameBgmPlayer = null;
    let audioInteractionReady = false;
    let audioRequestBusy = false;
    let nextAudioRequestAt = 0;
    let audioLoadPlanIndex = 0;

    function startGameBgm() {
      if (!audioInteractionReady || !loadedAudioIds.gameBgm || gameBgmPlayer || ended) return;
      try {
        const player = scene.asset.getAudioById("gameBgm").play();
        player.changeVolume(0.32);
        gameBgmPlayer = player;
      } catch (_error) {
        // iOS の自動再生制限などで失敗してもゲーム進行は止めない。
        void _error;
        gameBgmPlayer = null;
      }
    }

    function requestAudioAsset(assetId) {
      if (audioRequestBusy || loadedAudioIds[assetId] || audioAssetStates[assetId] === "loading") return;
      audioAssetStates[assetId] = "loading";
      audioRequestBusy = true;
      try {
        scene.requestAssets({ assetIds: [assetId], notifyErrorOnCallback: true }, (error) => {
          audioRequestBusy = false;
          nextAudioRequestAt = elapsed + 0.9;
          if (error) {
            audioAssetStates[assetId] = "failed";
            return;
          }
          audioAssetStates[assetId] = "ready";
          loadedAudioIds[assetId] = true;
          if (assetId === "gameBgm") startGameBgm();
        });
      } catch (_error) {
        void _error;
        audioRequestBusy = false;
        nextAudioRequestAt = elapsed + 0.9;
        audioAssetStates[assetId] = "failed";
      }
    }

    function pumpAudioLoading() {
      if (!audioInteractionReady || audioRequestBusy || elapsed < nextAudioRequestAt || audioLoadPlanIndex >= AUDIO_LOAD_PLAN.length) return;
      const next = AUDIO_LOAD_PLAN[audioLoadPlanIndex];
      if (elapsed < next.after) return;
      audioLoadPlanIndex += 1;
      requestAudioAsset(next.id);
    }

    function playSe(assetId, volume, cooldown) {
      if (!loadedAudioIds[assetId]) return;
      const now = g.game.age / g.game.fps;
      if (seCooldownUntil[assetId] && seCooldownUntil[assetId] > now) return;
      seCooldownUntil[assetId] = now + (cooldown || 0);
      try {
        const player = scene.asset.getAudioById(assetId).play();
        player.changeVolume(volume == null ? 0.7 : volume);
      } catch (_error) {
        // 音声再生の可否に関係なくゲームロジックを継続する。
        void _error;
      }
    }

    scene.onPointDownCapture.add(() => {
      if (!audioInteractionReady) {
        audioInteractionReady = true;
        requestAudioAsset("gameBgm");
      } else {
        startGameBgm();
      }
    });

    function setLabelText(label, text) {
      if (label.text === text) return false;
      label.text = text;
      label.invalidate();
      return true;
    }

    function setEntityVisible(entity, visible) {
      const currentlyVisible = entity.visible();
      if (visible && !currentlyVisible) entity.show();
      else if (!visible && currentlyVisible) entity.hide();
    }

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
      if (spec.tier > 0) {
        const upgradedCells = {
          bone: { col: 1, row: 1 }, fang: { col: 3, row: 1 }, iron: { col: 4, row: 1 },
          mana: { col: 2, row: 1 }, soul: { col: 5, row: 1 }
        };
        if (upgradedCells[spec.primary]) return upgradedCells[spec.primary];
      }
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
      const labelX = zone.x + (zone.id === "road" ? 44 : 8);
      const labelY = zone.id === "rock" ? zone.y - 16 : zone.y + 6;
      const labelWidth = zone.width - (zone.id === "road" ? 52 : 16);
      const rect = new g.FilledRect({
        scene, x: zone.x, y: zone.y, width: zone.width, height: zone.height,
        cssColor: info.color, opacity: 0.18
      });
      const label = new g.Label({
        scene, x: labelX, y: labelY, width: labelWidth,
        font: font12, text: info.name + "：" + info.effect,
        textColor: "#eef8f3", opacity: 0.86
      });
      root.append(rect);
      root.append(label);
      terrainViews.push({ zone, rect, label });
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
    const titleLabel = new g.Label({ scene, x: 18, y: 9, font: font20, text: "触媒モンスター ~最弱魔王の防衛戦~", textColor: "#f3d78b" });
    root.append(titleLabel);
    const scoreLabel = new g.Label({ scene, x: 18, y: 35, font: font20, text: "SCORE 0", textColor: "#ffffff" });
    root.append(scoreLabel);
    const timeLabel = new g.Label({ scene, x: W / 2, y: 0, anchorX: 0.5, font: font42, text: "180", textColor: "#ffffff" });
    root.append(timeLabel);
    const phaseLabel = new g.Label({ scene, x: W / 2, y: 48, anchorX: 0.5, font: font12, text: "準備", textColor: "#8ee6c3" });
    root.append(phaseLabel);
    const TOP_STATUS_SHIFT_X = 88;
    const TOP_STATUS_RIGHT = W - 18 - TOP_STATUS_SHIFT_X;
    const statusLabel = new g.Label({ scene, x: TOP_STATUS_RIGHT, y: 10, anchorX: 1, font: font16, text: "軍勢 0/6  死亡 0", textColor: "#d8e3df" });
    root.append(statusLabel);
    const comboLabel = new g.Label({ scene, x: W - 260, y: 35, anchorX: 1, font: font20, text: "", textColor: "#ffd064" });
    root.append(comboLabel);
    const kingHpLabel = new g.Label({ scene, x: TOP_STATUS_RIGHT, y: 34, anchorX: 1, font: font16, text: "魔王HP 50/50", textColor: "#ffb2c9" });
    root.append(kingHpLabel);
    const KING_HP_BAR_X = W - 430 - TOP_STATUS_SHIFT_X;
    const kingHpBg = new g.FilledRect({ scene, x: KING_HP_BAR_X, y: 15, width: 190, height: 12, cssColor: "#3d2630" });
    const kingHpBar = new g.FilledRect({ scene, x: KING_HP_BAR_X, y: 15, width: 190, height: 12, cssColor: "#e95780" });
    root.append(kingHpBg); root.append(kingHpBar);
    const ruleHintBg = new g.FilledRect({
      scene, x: W / 2 - 315, y: TOP + 5, width: 630, height: 32,
      cssColor: "#10231e", opacity: 0.82
    });
    const ruleHintLabel = new g.Label({
      scene, x: W / 2, y: TOP + 10, anchorX: 0.5, font: font16,
      text: "触媒を拾う → 画面下で選ぶ → フィールドタップで召喚", textColor: "#fff0a5"
    });
    root.append(ruleHintBg); root.append(ruleHintLabel);

    const inventoryPanel = new g.FilledRect({ scene, x: 0, y: FIELD_BOTTOM, width: W, height: H - FIELD_BOTTOM, cssColor: "#0b1513" });
    root.append(inventoryPanel);
    root.append(new g.Label({ scene, x: 12, y: FIELD_BOTTOM + 5, font: font12, text: "触媒を1～3個選び、フィールドの召喚地点をタップ", textColor: "#b9c9c3" }));

    let elapsed = 0;
    let phase = "ready";
    let readyLeft = 10;
    let difficultyId = "normal";
    let difficulty = Logic.difficultySettings(difficultyId);
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
    let fastUiLeft = 0;
    let appliedMonsterTier = 0;
    let knownCostLimit = Logic.costLimit(0);
    let summonSerial = 0;
    let simulationFrame = 0;
    const minions = [];
    const enemies = [];
    const drops = [];
    const effects = [];
    const projectiles = [];
    const inventory = {};
    Logic.CATALYSTS.forEach((c) => { inventory[c.id] = 1; });
    let selected = [];
    let summonPauseLeft = 0;
    let fieldDragStart = null;

    const king = {
      x: W / 2,
      y: 450,
      alive: true,
      hp: 50,
      maxHp: 50,
      reviveLeft: 0,
      invincible: 0,
      sinceDamage: 99,
      targetX: W / 2,
      targetY: 450
    };
    const kingBody = atlasSprite(0, 0, king.x - 28, king.y - 28, 56, 56, false);
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
    const selectionLabel = new g.Label({ scene, x: 770, y: FIELD_BOTTOM + 5, font: font12, text: "", textColor: "#ffffff" });
    root.append(selectionLabel);
    const previewLabel = new g.Label({ scene, x: 770, y: FIELD_BOTTOM + 26, width: 390, font: font16, text: "", textColor: "#8ee6c3" });
    root.append(previewLabel);
    const toastLabel = new g.Label({ scene, x: W / 2, y: FIELD_BOTTOM - 44, anchorX: 0.5, font: font20, text: "", textColor: "#fff0a5", hidden: true });
    root.append(toastLabel);
    const pauseBanner = new g.FilledRect({
      scene, x: 350, y: TOP + 94, width: 480, height: 42,
      cssColor: "#5c4618", opacity: 0.9, hidden: true
    });
    root.append(pauseBanner);
    const pauseIndicator = new g.Label({
      scene, x: 590, y: TOP + 103, anchorX: 0.5, font: font20,
      text: "", textColor: "#fff0a5", hidden: true
    });
    root.append(pauseIndicator);

    const enemyPanel = new g.FilledRect({ scene, x: 10, y: TOP + 38, width: 330, height: 48, cssColor: "#1a2024", opacity: 0.64 });
    const allyPanel = new g.FilledRect({ scene, x: W - 440, y: TOP + 38, width: 430, height: 48, cssColor: "#17241f", opacity: 0.68 });
    root.append(enemyPanel); root.append(allyPanel);
    const enemyTitle = new g.Label({ scene, x: 20, y: TOP + 45, font: font16, text: "敵勢力 0", textColor: "#ffb0a4" });
    const allyTitle = new g.Label({ scene, x: W - 430, y: TOP + 45, font: font16, text: "味方勢力 0/6", textColor: "#9cf0ba" });
    root.append(enemyTitle); root.append(allyTitle);
    const enemyRows = [];
    const allyRows = [];
    for (let i = 0; i < 4; ++i) {
      const label = new g.Label({ scene, x: 20, y: TOP + 72 + i * 22, width: 310, font: font12, text: "", textColor: "#e4d8d4" });
      enemyRows.push(label); root.append(label);
    }
    for (let i = 0; i < 7; ++i) {
      const label = new g.Label({ scene, x: W - 430, y: TOP + 72 + i * 22, width: 412, font: font12, text: "", textColor: "#d8eee0" });
      allyRows.push(label); root.append(label);
    }
    const forcePanelEntities = [enemyPanel, allyPanel, enemyTitle, allyTitle, ...enemyRows, ...allyRows];
    let forcePanelsVisible = true;
    const forceToggleButton = new g.FilledRect({
      scene, x: W - 172, y: TOP + 5, width: 162, height: 30,
      cssColor: "#315b4b", opacity: 0.94, touchable: true
    });
    const forceToggleLabel = new g.Label({
      scene, x: W - 91, y: TOP + 10, anchorX: 0.5,
      font: font12, text: "勢力表示 ON", textColor: "#ffffff"
    });
    root.append(forceToggleButton);
    root.append(forceToggleLabel);

    function setForcePanelsVisible(visible) {
      forcePanelsVisible = visible;
      forcePanelEntities.forEach((entity) => setEntityVisible(entity, visible));
      forceToggleButton.cssColor = visible ? "#315b4b" : "#3b4541";
      forceToggleButton.modified();
      setLabelText(forceToggleLabel, visible ? "勢力表示 ON" : "勢力表示 OFF");
      if (visible) refreshForcePanels();
    }

    forceToggleButton.onPointDown.add(() => {
      setForcePanelsVisible(!forcePanelsVisible);
    });

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
      const lock = new g.Label({ scene, x: x + 105, y: y + 64, anchorX: 1, font: font12, text: "", textColor: "#ff9b9b" });
      root.append(base); root.append(strip); root.append(glyph); root.append(name); root.append(count); root.append(lock);
      const button = { cat, base, strip, glyph, name, count, lock, x, y };
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
        refreshSummonGuidance(true);
      });
    });

    const MOBILE_CONTROL_SIZE = 104;
    const MOBILE_CONTROL_X = W - MOBILE_CONTROL_SIZE - 8;
    const MOBILE_CONTROL_Y = FIELD_BOTTOM + 10;
    const clearButtonGroup = new g.E({ scene, hidden: true });
    const clearButton = new g.FilledRect({
      scene, x: MOBILE_CONTROL_X, y: MOBILE_CONTROL_Y + 22,
      width: MOBILE_CONTROL_SIZE, height: 58, cssColor: "#704653", touchable: true
    });
    const clearButtonLabel = new g.Label({
      scene, x: MOBILE_CONTROL_X + MOBILE_CONTROL_SIZE / 2, y: MOBILE_CONTROL_Y + 40,
      anchorX: 0.5, font: font16, text: "選択解除", textColor: "#ffffff"
    });
    clearButtonGroup.append(clearButton);
    clearButtonGroup.append(clearButtonLabel);
    clearButton.onPointDown.add(() => {
      cancelSummonSelection();
    });

    battlefieldInput.onPointDown.add((ev) => {
      if (phase !== "play" || ended) return;
      if (selected.length) {
        summon(ev.point.x, TOP + ev.point.y);
        return;
      }
      if (!king.alive) return;
      releaseVirtualPad();
      fieldDragStart = { x: king.x, y: king.y };
      king.targetX = king.x;
      king.targetY = king.y;
    });
    battlefieldInput.onPointMove.add((ev) => {
      if (!king.alive || phase !== "play" || selected.length || !fieldDragStart) return;
      king.targetX = Logic.clamp(fieldDragStart.x + ev.startDelta.x, 24, W - 24);
      king.targetY = Logic.clamp(fieldDragStart.y + ev.startDelta.y, TOP + 24, FIELD_BOTTOM - 24);
    });
    battlefieldInput.onPointUp.add(() => {
      if (fieldDragStart) stopKingMovement();
    });

    const PAD_SIZE = MOBILE_CONTROL_SIZE;
    const PAD_CENTER = PAD_SIZE / 2;
    const PAD_X = MOBILE_CONTROL_X;
    const PAD_Y = MOBILE_CONTROL_Y;
    let virtualPadActive = false;
    const virtualPadVector = { x: 0, y: 0 };
    const padBase = new g.FilledRect({
      scene, x: PAD_X, y: PAD_Y, width: PAD_SIZE, height: PAD_SIZE,
      cssColor: "#10221d", opacity: 0.55, hidden: true
    });
    const padHorizontal = new g.FilledRect({
      scene, x: PAD_X + 10, y: PAD_Y + 37, width: 84, height: 30,
      cssColor: "#8aa49a", opacity: 0.46, hidden: true
    });
    const padVertical = new g.FilledRect({
      scene, x: PAD_X + 37, y: PAD_Y + 10, width: 30, height: 84,
      cssColor: "#8aa49a", opacity: 0.46, hidden: true
    });
    const padKnob = new g.FilledRect({
      scene, x: PAD_X + PAD_CENTER - 17, y: PAD_Y + PAD_CENTER - 17,
      width: 34, height: 34, cssColor: "#e7b75d", opacity: 0.82, hidden: true
    });
    const padLabel = new g.Label({
      scene, x: PAD_X + PAD_CENTER, y: PAD_Y + PAD_CENTER - 6, anchorX: 0.5,
      font: font12, text: "MOVE", textColor: "#15201d", hidden: true
    });
    const padInput = new g.FilledRect({
      scene, x: PAD_X, y: PAD_Y, width: PAD_SIZE, height: PAD_SIZE,
      cssColor: "#ffffff", opacity: 0.001, touchable: true, hidden: true
    });
    const virtualPadEntities = [padBase, padHorizontal, padVertical, padKnob, padLabel, padInput];
    virtualPadEntities.forEach((entity) => root.append(entity));
    root.append(clearButtonGroup);
    let virtualPadVisible = false;

    function setVirtualPadVisible(visible) {
      if (virtualPadVisible === visible) return;
      virtualPadVisible = visible;
      virtualPadEntities.forEach((entity) => {
        if (visible) entity.show(); else entity.hide();
      });
      if (!visible) releaseVirtualPad();
    }

    function releaseVirtualPad() {
      virtualPadActive = false;
      Logic.resetVirtualPad(king, virtualPadVector);
      padKnob.x = PAD_X + PAD_CENTER - padKnob.width / 2;
      padKnob.y = PAD_Y + PAD_CENTER - padKnob.height / 2;
      padKnob.modified();
    }

    function applyVirtualPad(localX, localY) {
      if (phase !== "play" || ended || !king.alive || selected.length) return;
      const dx = localX - PAD_CENTER;
      const dy = localY - PAD_CENTER;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const strength = Math.min(1, distance / 48);
      if (distance < 9) {
        virtualPadVector.x = 0;
        virtualPadVector.y = 0;
      } else {
        virtualPadVector.x = dx / distance * strength;
        virtualPadVector.y = dy / distance * strength;
      }
      virtualPadActive = true;
      fieldDragStart = null;
      king.targetX = king.x;
      king.targetY = king.y;
      padKnob.x = PAD_X + PAD_CENTER - padKnob.width / 2 + virtualPadVector.x * 27;
      padKnob.y = PAD_Y + PAD_CENTER - padKnob.height / 2 + virtualPadVector.y * 27;
      padKnob.modified();
    }

    padInput.onPointDown.add((ev) => { applyVirtualPad(ev.point.x, ev.point.y); });
    padInput.onPointMove.add((ev) => { applyVirtualPad(ev.point.x + ev.startDelta.x, ev.point.y + ev.startDelta.y); });
    padInput.onPointUp.add(() => { releaseVirtualPad(); });

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
      let total = 0;
      for (let i = 0; i < minions.length; ++i) total += minions[i].cost;
      return total;
    }

    function currentCostLimit() {
      return Logic.costLimit(elapsed);
    }

    function remainingCost() {
      return Math.max(0, currentCostLimit() - currentCost());
    }

    function canAddCatalyst(id) {
      let already = 0;
      for (let i = 0; i < selected.length; ++i) {
        if (selected[i] === id) already += 1;
      }
      return selected.length < 3 && already < inventory[id] && selected.length + 1 <= remainingCost();
    }

    function stopKingMovement() {
      fieldDragStart = null;
      king.targetX = king.x;
      king.targetY = king.y;
      releaseVirtualPad();
    }

    function cancelSummonSelection() {
      selected = [];
      summonPauseLeft = 0;
      stopKingMovement();
      pauseBanner.hide();
      pauseIndicator.hide();
      refreshInventory();
      updateSelectionPreview();
      refreshSummonGuidance(true);
    }

    function setScore(value) {
      score = Math.max(0, Math.floor(value));
      g.game.vars.gameState.score = score;
      scoreLabel.text = "SCORE " + score + (difficultyId === "hard" ? "  HARD（スコア5倍）" : "");
      scoreLabel.invalidate();
    }

    function awardScore(basePoints) {
      const awarded = Logic.scoreAward(basePoints, difficultyId);
      setScore(score + awarded);
      return awarded;
    }

    function showToast(text, color) {
      toastLabel.text = text;
      toastLabel.textColor = color || "#fff0a5";
      setEntityVisible(toastLabel, true);
      toastLabel.invalidate();
      toastLabel.modified();
      toastLeft = 1.6;
    }

    function refreshInventory() {
      buttons.forEach((b) => {
        const used = selected.filter((id) => id === b.cat.id).length;
        const canAdd = canAddCatalyst(b.cat.id);
        const costLocked = selected.length + 1 > remainingCost();
        b.count.text = "×" + inventory[b.cat.id] + (used ? "  選" + used : "");
        b.lock.text = costLocked && !used ? "上限" : "";
        b.count.textColor = used ? "#fff0a5" : canAdd ? "#ffffff" : "#78847f";
        b.count.invalidate();
        b.lock.invalidate();
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
      selectionLabel.text = names.length ? "選択中: " + names.join(" + ") : remainingCost() > 0 ? "" : "軍勢上限：召喚できません";
      selectionLabel.invalidate();
    }

    function updateSelectionPreview() {
      if (!selected.length) {
        previewLabel.text = remainingCost() > 0 ? "光っている触媒ボタンをタップ" : "味方の撃破か次の上限拡張を待ってください";
      } else {
        const spec = Logic.summonSpec(selected, "field", elapsed, false, difficultyId);
        if (difficultyId === "hard") {
          const preferred = Logic.hardPreferredTerrain(spec.primary);
          const rankHint = selected.length >= 2 ? "★共鳴可能" : "2触媒以上で共鳴";
          previewLabel.text = spec.name + "　適性：" + Logic.TERRAIN[preferred].name + "（" + rankHint + "）";
        } else {
          previewLabel.text = spec.name;
        }
      }
      previewLabel.invalidate();
    }

    let summonGuidanceState = "";
    let summonGuidancePulseStep = -1;
    function refreshSummonGuidance(force) {
      const choosing = phase === "play" && selected.length > 0;
      const selectable = phase === "play" && !selected.length && remainingCost() > 0;
      const padVisible = phase === "play" && !choosing && king.alive && !ended;
      const state = choosing + "/" + selectable + "/" + padVisible;
      const stateChanged = state !== summonGuidanceState;
      const pulseStep = Math.floor(elapsed * 10);
      const pulseChanged = pulseStep !== summonGuidancePulseStep;
      if (!force && !stateChanged && (!(choosing || selectable) || !pulseChanged)) return;
      summonGuidanceState = state;
      summonGuidancePulseStep = pulseStep;
      const pulse = 0.5 + (Math.sin(elapsed * 7) + 1) * 0.2;
      inventoryGuideBorders.forEach((border) => {
        setEntityVisible(border, selectable);
        if (selectable && border.opacity !== pulse) {
          border.opacity = pulse;
          border.modified();
        }
      });
      setEntityVisible(summonTargetTint, choosing);
      const tintOpacity = 0.045 + pulse * 0.045;
      if (choosing && summonTargetTint.opacity !== tintOpacity) {
        summonTargetTint.opacity = tintOpacity;
        summonTargetTint.modified();
      }
      summonFieldBorders.forEach((border) => {
        setEntityVisible(border, choosing);
        if (choosing && border.opacity !== pulse) {
          border.opacity = pulse;
          border.modified();
        }
      });
      setEntityVisible(pauseBanner, choosing);
      if (stateChanged || force) {
        terrainViews.forEach((view) => {
          const info = Logic.TERRAIN[view.zone.id];
          const affinity = choosing && difficultyId === "hard" && Logic.hasHardTerrainAffinity(selected[0], view.zone.id);
          setLabelText(view.label, info.name + "：" + info.effect + (affinity ? " ★適性" : ""));
          view.rect.opacity = choosing ? 0.42 : 0.18;
          view.rect.cssColor = affinity ? "#8a7024" : info.color;
          view.label.opacity = choosing ? 1 : 0.86;
          view.rect.modified();
          view.label.modified();
        });
      }
      setVirtualPadVisible(padVisible);
      setEntityVisible(clearButtonGroup, choosing);
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
      setLabelText(kingHpLabel, "魔王HP " + hp + "/" + king.maxHp);
      const width = Math.max(0, 190 * king.hp / king.maxHp);
      const color = king.hp <= 30 ? "#ff3e5f" : king.hp <= 60 ? "#ee8a65" : "#e95780";
      if (kingHpBar.width !== width || kingHpBar.cssColor !== color) {
        kingHpBar.width = width;
        kingHpBar.cssColor = color;
        kingHpBar.modified();
      }
    }

    function refreshForcePanels() {
      if (!forcePanelsVisible) return;
      setLabelText(enemyTitle, "敵勢力 " + enemies.length);
      const enemyCounts = {};
      enemies.forEach((enemy) => { enemyCounts[enemy.name] = (enemyCounts[enemy.name] || 0) + 1; });
      const enemyParts = Object.keys(enemyCounts).map((name) => name + "×" + enemyCounts[name]);
      const enemyPanelHeight = 50 + Math.ceil(enemyParts.length / 2) * 22;
      if (enemyPanel.height !== enemyPanelHeight) {
        enemyPanel.height = enemyPanelHeight;
        enemyPanel.modified();
      }
      enemyRows.forEach((row, index) => {
        setLabelText(row, enemyParts.slice(index * 2, index * 2 + 2).join("　"));
      });

      setLabelText(allyTitle, "味方勢力 " + minions.length + "体 / コスト" + currentCost() + "/" + currentCostLimit());
      const groups = {};
      minions.forEach((minion) => {
        const key = minion.name + "/" + minion.primary + "/" + minion.tactic + "/" + minion.hardPrepared;
        if (!groups[key]) groups[key] = { name: minion.name, primary: minion.primary, tactic: minion.tactic, tier: minion.tier, prepared: minion.hardPrepared, count: 0, hp: 0, maxHp: 0 };
        groups[key].tier = Math.max(groups[key].tier, minion.tier);
        groups[key].count += 1;
        groups[key].hp += Math.max(0, minion.hp);
        groups[key].maxHp += minion.maxHp;
      });
      const allyGroups = Object.keys(groups).map((key) => groups[key]);
      const visibleAllyRows = Math.min(7, allyGroups.length > 6 ? 7 : allyGroups.length);
      const allyPanelHeight = 50 + visibleAllyRows * 22;
      if (allyPanel.height !== allyPanelHeight) {
        allyPanel.height = allyPanelHeight;
        allyPanel.modified();
      }
      allyRows.forEach((row, index) => {
        let text = "";
        if (index < 6 && allyGroups[index]) {
          const group = allyGroups[index];
          const countText = group.count > 1 ? "×" + group.count : "";
          text = (group.prepared ? "★" : "") + group.name.slice(0, 11) + countText + " T" + (group.tier + 1) + " HP" + Math.ceil(group.hp) + "/" + group.maxHp + "  " + speciesName(group.primary) + "/" + tacticName(group.tactic);
        } else if (index === 6 && allyGroups.length > 6) {
          text = "ほか " + (allyGroups.length - 6) + "編成";
        }
        setLabelText(row, text);
      });
    }

    function summon(x, y) {
      if (!selected.length) return;
      const terrain = terrainAt(x, y);
      const near = Logic.distance({ x, y }, king) < 150;
      const spec = Logic.summonSpec(selected, terrain, elapsed, near, difficultyId);
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
      unitLayer.append(body); unitLayer.append(hpBg); unitLayer.append(hpBar);
      minions.push({
        ...spec, x, y, hp: spec.hp, maxHp: spec.hp, body, hpBg, hpBar,
        attackLeft: random.generate() * 0.4, age: 0, poisonTick: 0, id: summonSerial
      });
      playSe("summonSe", 0.72, 0.1);
      burst(x, y, spec.color, 6);
      const hardResult = difficultyId !== "hard" ? "" : spec.hardPrepared ? " ★地形共鳴！" : spec.cost === 1 ? " △低位召喚" : "";
      showToast(spec.name + " 召喚！ " + Logic.TERRAIN[terrain].name + "［" + Logic.TERRAIN[terrain].effect + "］" + hardResult, spec.color);
      selected = [];
      summonPauseLeft = 0;
      stopKingMovement();
      refreshInventory();
      updateSelectionPreview();
      refreshSummonGuidance(true);
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
        const cell = minionCell(minion);
        minion.body.srcX = cell.col * ATLAS_CELL;
        minion.body.srcY = cell.row * ATLAS_CELL;
        minion.body.modified();
        burst(minion.x, minion.y, "#a8ffcf", 5);
      });
      if (minions.length) showToast("魔王軍強化！ 全モンスター ×" + nextBoost.toFixed(2), "#a8ffcf");
    }

    function spawnDrop(x, y, forcedId) {
      if (drops.length >= 20) return;
      const cat = forcedId ? Logic.CATALYSTS.find((c) => c.id === forcedId) : Logic.CATALYSTS[Math.floor(random.generate() * Logic.CATALYSTS.length)];
      const cell = catalystCell(cat.id);
      const body = atlasSprite(cell.col, cell.row, x - 20, y - 20, 40, 40, false);
      unitLayer.append(body);
      drops.push({ x, y, id: cat.id, body, age: 0, visualStep: -1 });
    }

    function removeDrop(index, collectorName) {
      const drop = drops[index];
      inventory[drop.id] = Logic.addCatalyst(inventory[drop.id]);
      drop.body.destroy();
      drops.splice(index, 1);
      playSe("itemPickupSe", collectorName === "king" ? 0.62 : 0.48, 0.08);
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
    const HARD_ENEMY_NAMES = {
      fighter: "掃討戦士", rogue: "突破盗賊", archer: "狙撃弓兵",
      cleric: "軍師僧侶", knight: "粉砕騎士", hero: "勇者"
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
      const spawnParameters = Logic.enemySpawnParameters(elapsed, difficultyId);
      if (typeId !== "hero" && enemies.length >= spawnParameters.maxEnemies) return false;
      const base = ENEMY_TYPES[typeId];
      const gate = gates[Math.floor(random.generate() * gates.length)];
      const mult = typeId === "hero" ? 1 : Logic.enemyMultiplier(elapsed);
      const hp = Math.round(base.hp * mult * difficulty.enemyHp);
      const x = gate.sx;
      const y = gate.sy;
      const cell = enemyCell(typeId);
      const visualSize = Math.max(40, base.size * 2.35);
      const body = atlasSprite(cell.col, cell.row, x - visualSize / 2, y - visualSize / 2, visualSize, visualSize, false);
      const hpBg = new g.FilledRect({ scene, x: x - 20, y: y - base.size - 7, width: 40, height: 4, cssColor: "#251f21" });
      const hpBar = new g.FilledRect({ scene, x: x - 20, y: y - base.size - 7, width: 40, height: 4, cssColor: typeId === "hero" ? "#ffd34e" : "#e46c6c" });
      unitLayer.append(body); unitLayer.append(hpBg); unitLayer.append(hpBar);
      enemies.push({
        ...base, typeId, name: difficultyId === "hard" ? HARD_ENEMY_NAMES[typeId] : base.name, x, y, hp, maxHp: hp,
        attack: base.attack * mult * difficulty.enemyAttack,
        speed: base.speed * difficulty.enemySpeed,
        cooldown: base.cooldown * difficulty.enemyCooldown,
        body, hpBg, hpBar,
        attackLeft: random.generate() * 0.5, poisonLeft: 0, poisonTick: 0, scatterTarget: null
      });
      if (!king.alive) assignScatterTarget(enemies[enemies.length - 1]);
      if (typeId === "hero") {
        playSe("heroAppearSe", 0.9);
        showToast("勇者襲来！ 魔王を最優先で狙っています", "#ffd34e");
      }
      return true;
    }

    function nearest(origin, list, filter) {
      let best = null;
      let bestDistanceSquared = Infinity;
      list.forEach((item) => {
        if (filter && !filter(item)) return;
        const dx = origin.x - item.x;
        const dy = origin.y - item.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared < bestDistanceSquared) {
          best = item;
          bestDistanceSquared = distanceSquared;
        }
      });
      return { target: best, distance: Math.sqrt(bestDistanceSquared) };
    }

    function hardTargetForEnemy(enemy) {
      if (enemy.typeId === "rogue" || enemy.typeId === "hero") {
        const interceptor = nearest(enemy, minions, (minion) => minion.tactic === "guard" && Logic.distance(minion, king) < 180);
        if (interceptor.target && interceptor.distance < 260) return interceptor.target;
        return king;
      }
      let best = null;
      let bestScore = Infinity;
      const searchRange = enemy.typeId === "archer" ? 360 : 285;
      minions.forEach((minion) => {
        const distance = Logic.distance(enemy, minion);
        if (distance > searchRange) return;
        let score = distance;
        if (enemy.typeId === "fighter" || enemy.typeId === "knight") score += (minion.cost - 1) * 58;
        if (enemy.typeId === "archer") {
          score -= (1 - Math.max(0, minion.hp) / minion.maxHp) * 90;
          if (!minion.hardPrepared) score -= 42;
        }
        if (score < bestScore) {
          best = minion;
          bestScore = score;
        }
      });
      return best || king;
    }

    function enemyDamageAgainst(enemy, target) {
      if (difficultyId !== "hard" || target === king) return enemy.attack;
      return enemy.attack * Logic.hardEnemyDamageMultiplier(target);
    }

    function performHardCleave(enemy, center, primaryTarget) {
      if (difficultyId !== "hard" || enemy.range >= 80) return;
      if (enemy.typeId !== "fighter" && enemy.typeId !== "knight" && enemy.typeId !== "hero") return;
      const radius = enemy.typeId === "hero" ? 82 : enemy.typeId === "knight" ? 68 : 52;
      minions.forEach((minion) => {
        if (minion === primaryTarget || Logic.distance(minion, center) > radius) return;
        const splashDamage = enemy.attack * 0.42 * Logic.hardEnemyDamageMultiplier(minion);
        applyDamage(minion, splashDamage, enemy.color, false);
      });
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
      const bodyX = unit.x - unit.body.width / 2;
      const bodyY = unit.y - unit.body.height / 2;
      if (unit.body.x !== bodyX || unit.body.y !== bodyY) {
        unit.body.x = bodyX;
        unit.body.y = bodyY;
        unit.body.modified();
      }
      const hpX = unit.x - (unit.maxHp > 500 ? 28 : unit.body.width > 34 ? 20 : 18);
      const hpY = unit.y - unit.size - 7;
      if (unit.hpBg.x !== hpX || unit.hpBg.y !== hpY) {
        unit.hpBg.x = hpX;
        unit.hpBg.y = hpY;
        unit.hpBg.modified();
      }
      const hpWidth = Math.max(0, unit.hpBg.width * unit.hp / unit.maxHp);
      if (unit.hpBar.x !== hpX || unit.hpBar.y !== hpY || unit.hpBar.width !== hpWidth) {
        unit.hpBar.x = hpX;
        unit.hpBar.y = hpY;
        unit.hpBar.width = hpWidth;
        unit.hpBar.modified();
      }
    }

    function destroyUnit(unit) {
      unit.body.destroy(); unit.hpBg.destroy(); unit.hpBar.destroy();
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
          kingBody.show(); kingCrown.show();
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
      if (difficulty.kingRegen > 0 && king.sinceDamage >= 5 && king.hp < king.maxHp) {
        king.hp = Math.min(king.maxHp, king.hp + difficulty.kingRegen * dt);
        refreshKingHp();
      }
      if (virtualPadActive) {
        king.x += virtualPadVector.x * 155 * dt;
        king.y += virtualPadVector.y * 155 * dt;
      } else {
        moveToward(king, { x: king.targetX, y: king.targetY }, 155, dt, 1);
      }
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
      kingBody.hide(); kingCrown.hide();
      enemies.forEach(assignScatterTarget);
      refreshKingHp();
      playSe("kingDeathSe", 0.95);
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
          playSe("monsterDeathSe", 0.55, 0.08);
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
        } else if (difficultyId === "hard") target = hardTargetForEnemy(e);
        else if (e.tactic === "king") target = king;
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
            performAttack(e, target, enemyDamageAgainst(e, target), false);
            performHardCleave(e, target, target);
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
          let baseGained = Logic.scoreForKill(e.score, elapsed, combo, risk);
          if (e.typeId === "hero") {
            bossDefeated = true;
            baseGained += Math.floor(Math.max(0, GAME_TIME - elapsed) * 150);
          }
          const gained = awardScore(baseGained);
          if (e.typeId === "hero") {
            playSe("heroDefeatSe", 0.9);
            showToast("勇者撃破！ ＋" + gained, "#ffe470");
          } else {
            playSe("enemyDefeatSe", 0.5, 0.07);
          }
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
        const visualStep = Math.floor(d.age * 5);
        if (visualStep !== d.visualStep) {
          d.visualStep = visualStep;
          d.body.opacity = 0.72 + Math.sin(d.age * 5) * 0.22;
          d.body.modified();
        }
        if (king.alive && Logic.distance(d, king) < 35) removeDrop(i, "king");
      }
    }

    function isTargetValid(target) {
      if (target === king) return king.alive;
      return minions.indexOf(target) >= 0 || enemies.indexOf(target) >= 0;
    }

    function floatingDamage(target, amount, color) {
      let activeFloatingLabels = 0;
      for (let i = 0; i < effects.length; ++i) {
        if (effects[i].type === "floating") activeFloatingLabels += 1;
      }
      if (activeFloatingLabels >= MAX_FLOATING_LABELS || effects.length >= MAX_EFFECTS) return;
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
      else playSe("kingDamageSe", 0.72, 0.12);
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
      if (effects.length >= MAX_EFFECTS) return;
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
        if (projectiles.length >= MAX_PROJECTILES) {
          meleeTrace(attacker, target, color);
          applyDamage(target, damage, color, poison);
          return;
        }
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
      if (effects.length >= MAX_EFFECTS) return;
      unit.body.cssColor = "#ffffff";
      unit.body.modified();
      effects.push({ type: "flash", unit, color, left: 0.08 });
    }

    function burst(x, y, color, count) {
      const crowded = minions.length + enemies.length >= CROWDED_UNIT_THRESHOLD;
      const requestedCount = crowded ? Math.min(count, count >= 12 ? 6 : 3) : count;
      const particleCount = Math.min(requestedCount, Math.max(0, MAX_EFFECTS - effects.length));
      for (let i = 0; i < particleCount; ++i) {
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
      if (gameBgmPlayer) {
        gameBgmPlayer.stop();
        gameBgmPlayer = null;
      }
      playSe("gameEndSe", 0.9);
      const noDeathBonus = deaths === 0 ? awardScore(3000) : 0;
      const overlay = new g.FilledRect({ scene, width: W, height: H, cssColor: "#07100e", opacity: 0.9 });
      root.append(overlay);
      root.append(new g.Label({ scene, x: W / 2, y: 150, anchorX: 0.5, font: font42, text: "防衛戦終了", textColor: "#f3d78b" }));
      root.append(new g.Label({ scene, x: W / 2, y: 230, anchorX: 0.5, font: font42, text: "SCORE  " + score, textColor: "#ffffff" }));
      root.append(new g.Label({ scene, x: W / 2, y: 310, anchorX: 0.5, font: font20, text: difficulty.name + "　勇者 " + (bossDefeated ? "撃破" : "生存") + "　魔王死亡 " + deaths + "回　最大軍勢 " + FINAL_COST_LIMIT, textColor: "#c9d9d1" }));
      if (deaths === 0) root.append(new g.Label({ scene, x: W / 2, y: 355, anchorX: 0.5, font: font28, text: "ノーデスボーナス +" + noDeathBonus, textColor: "#8ee6c3" }));
      if (g.game.requestSaveScore) g.game.requestSaveScore(score);
    }

    function showReadyOverlay() {
      const overlay = new g.FilledRect({ scene, width: W, height: H, cssColor: "#07100e", opacity: 0.88 });
      const panel = new g.FilledRect({ scene, x: 150, y: 54, width: 980, height: 606, cssColor: "#172923" });
      const readyTitle = new g.Label({ scene, x: W / 2, y: 76, anchorX: 0.5, font: font42, text: "触媒モンスター ~最弱魔王の防衛戦~", textColor: "#f3d78b" });
      const lines = [
        "フィールドをドラッグして魔王を動かし、触媒を拾う",
        "画面下の触媒を1～3個選ぶ（選択中は戦闘停止）",
        "光ったフィールドをタップしてモンスターを召喚",
        "モンスターは自動戦闘。魔王は3秒で復活／右上で勢力表示切替"
      ];
      const entities = [overlay, panel, readyTitle];
      entities.forEach((entity) => root.append(entity));
      const goalLabel = new g.Label({ scene, x: W / 2, y: 137, anchorX: 0.5, font: font20, text: "目的：180秒生き延び、敵を倒してハイスコアを目指せ！", textColor: "#ffe08a" });
      const operationTitle = new g.Label({ scene, x: 210, y: 180, font: font20, text: "遊び方", textColor: "#8ee6c3" });
      const lineLabels = lines.map((line, i) => new g.Label({ scene, x: 225, y: 216 + i * 30, font: font16, text: (i + 1) + ". " + line, textColor: "#e7efec" }));
      const scoreRuleLabel = new g.Label({ scene, x: W / 2, y: 339, anchorX: 0.5, font: font16, text: "敵撃破で得点／魔王死亡で減点　ハードは獲得スコア5倍", textColor: "#f0c6aa" });
      const difficultyTitle = new g.Label({ scene, x: 210, y: 372, font: font20, text: "難易度を選択（デフォルト：ノーマル）", textColor: "#8ee6c3" });
      const normalButton = new g.FilledRect({ scene, x: 225, y: 407, width: 390, height: 70, cssColor: "#315b4b", touchable: true });
      const hardButton = new g.FilledRect({ scene, x: 665, y: 407, width: 390, height: 70, cssColor: "#242d2a", touchable: true });
      const normalLabel = new g.Label({ scene, x: 420, y: 414, anchorX: 0.5, font: font20, text: "● ノーマル（選択中）", textColor: "#ffffff" });
      const normalDetail = new g.Label({ scene, x: 420, y: 449, anchorX: 0.5, font: font12, text: "標準難易度・HP自然回復あり", textColor: "#d5e5df" });
      const hardLabel = new g.Label({ scene, x: 860, y: 414, anchorX: 0.5, font: font20, text: "ハード", textColor: "#d4ddd9" });
      const hardDetail = new g.Label({ scene, x: 860, y: 449, anchorX: 0.5, font: font12, text: "敵AI・敵数・対群強化／地形共鳴・スコア5倍", textColor: "#f2b4a8" });
      const startButton = new g.FilledRect({ scene, x: 440, y: 498, width: 400, height: 68, cssColor: "#a45b35", touchable: true });
      const startLabel = new g.Label({ scene, x: W / 2, y: 510, anchorX: 0.5, font: font28, text: "ノーマルで開始", textColor: "#ffffff" });
      const countdownLabel = new g.Label({ scene, x: W / 2, y: 588, anchorX: 0.5, font: font20, text: "自動開始まで 10", textColor: "#f3d78b" });
      entities.push(goalLabel, operationTitle, ...lineLabels, scoreRuleLabel, difficultyTitle, normalButton, hardButton, normalLabel, normalDetail, hardLabel, hardDetail, startButton, startLabel, countdownLabel);
      entities.slice(3).forEach((entity) => root.append(entity));

      function refreshDifficultySelection() {
        const hard = difficultyId === "hard";
        difficulty = Logic.difficultySettings(difficultyId);
        g.game.vars.gameState.difficulty = difficultyId;
        normalButton.cssColor = hard ? "#242d2a" : "#315b4b";
        hardButton.cssColor = hard ? "#7a3f3f" : "#242d2a";
        normalLabel.text = hard ? "ノーマル" : "● ノーマル（選択中）";
        hardLabel.text = hard ? "● ハード（選択中）" : "ハード";
        startLabel.text = difficulty.name + "で開始";
        normalButton.modified(); hardButton.modified();
        normalLabel.invalidate(); hardLabel.invalidate(); startLabel.invalidate();
        setScore(score);
      }

      normalButton.onPointDown.add(() => { difficultyId = "normal"; refreshDifficultySelection(); });
      hardButton.onPointDown.add(() => { difficultyId = "hard"; refreshDifficultySelection(); });
      function beginGame() {
        if (phase !== "ready") return;
        startGameBgm();
        entities.forEach((entity) => entity.destroy());
        phase = "play";
        if (difficultyId === "hard") spawnLeft *= difficulty.spawnIntervalMultiplier;
        phaseLabel.text = difficulty.name + "　防衛開始";
        phaseLabel.invalidate();
        const startMessage = difficultyId === "hard"
          ? "ハード開始！ 2～3触媒を適性地形へ置いて地形共鳴せよ"
          : "ノーマルで防衛開始！ 触媒を集めて召喚せよ";
        showToast(startMessage, difficultyId === "hard" ? "#ffb0a4" : "#8ee6c3");
      }
      startButton.onPointDown.add(beginGame);
      refreshDifficultySelection();
      return { beginGame, countdownLabel };
    }

    const readyUi = showReadyOverlay();
    refreshInventory();
    refreshKingHp();
    refreshForcePanels();
    updateSelectionPreview();
    refreshSummonGuidance(true);
    for (let i = 0; i < 10; ++i) {
      spawnDrop(90 + random.generate() * (W - 180), TOP + 70 + random.generate() * (FIELD_BOTTOM - TOP - 130));
    }

    scene.onUpdate.add(() => {
      if (phase === "ready") {
        readyLeft -= DT;
        setLabelText(readyUi.countdownLabel, "自動開始まで " + Math.max(1, Math.ceil(readyLeft)));
        if (readyLeft <= 0) readyUi.beginGame();
        return;
      }
      if (ended) { updateEffects(DT); return; }

      elapsed += DT;
      const showRuleHint = elapsed < 18;
      setEntityVisible(ruleHintBg, showRuleHint);
      setEntityVisible(ruleHintLabel, showRuleHint);
      pumpAudioLoading();
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
      const timeText = String(Math.ceil(left));
      const timeColor = left <= 20 ? "#ff718c" : "#ffffff";
      if (timeLabel.text !== timeText || timeLabel.textColor !== timeColor) {
        timeLabel.text = timeText;
        timeLabel.textColor = timeColor;
        timeLabel.invalidate();
      }
      let battlePaused = selected.length > 0;
      if (battlePaused) {
        summonPauseLeft -= DT;
        if (summonPauseLeft <= 0) {
          cancelSummonSelection();
          showToast("召喚選択を解除しました", "#c9d9d1");
          battlePaused = false;
        }
      }
      setEntityVisible(pauseIndicator, battlePaused);
      comboLeft -= DT;
      if (comboLeft <= 0) combo = 0;
      fastUiLeft -= DT;
      if (fastUiLeft <= 0) {
        fastUiLeft = 0.1;
        const pauseDisplay = Math.max(0, Math.ceil(summonPauseLeft * 5) / 5).toFixed(1);
        setLabelText(pauseIndicator, battlePaused ? "戦術停止 " + pauseDisplay + "　召喚地点をタップ" : "");
        setLabelText(phaseLabel, difficulty.name + "　" + (battlePaused ? "戦術停止" : phaseName() + "　魔軍×" + Logic.monsterTierBoost(monsterTier).toFixed(2)));
        refreshSummonGuidance();
        setLabelText(statusLabel, "軍勢 " + currentCost() + "/" + costLimit + "  死亡 " + deaths);
        setLabelText(comboLabel, combo >= 2 ? combo + " COMBO  ×" + (1 + Math.min(10, combo - 1) * 0.1).toFixed(1) : "");
      }
      toastLeft -= DT;
      if (toastLeft <= 0 && toastLabel.visible()) toastLabel.hide();

      if (!battlePaused) {
        spawnLeft -= DT;
        if (spawnLeft <= 0) {
          const spawnParameters = Logic.enemySpawnParameters(elapsed, difficultyId);
          spawnEnemy(chooseEnemyType());
          if (random.generate() < spawnParameters.extraChance) spawnEnemy(chooseEnemyType());
          spawnLeft = spawnParameters.interval;
        }
        if (!bossSpawned && elapsed >= 160) { bossSpawned = true; spawnEnemy("hero"); }

        dropLeft -= DT;
        if (dropLeft <= 0) {
          spawnDrop(70 + random.generate() * (W - 140), TOP + 45 + random.generate() * (FIELD_BOTTOM - TOP - 80));
          dropLeft = 3.2 + random.generate() * 2.4;
        }

        updateKing(DT);
        updateProjectiles(DT);
        simulationFrame += 1;
        const crowded = minions.length + enemies.length >= CROWDED_UNIT_THRESHOLD;
        if (!crowded || simulationFrame % 2 === 0) {
          const unitDt = crowded ? DT * 2 : DT;
          updateMinions(unitDt);
          updateEnemies(unitDt);
          updateDrops(unitDt);
        }
      }
      updateEffects(DT);
      forceUiLeft -= DT;
      if (forceUiLeft <= 0) {
        forceUiLeft = 0.65;
        refreshForcePanels();
        refreshKingHp();
      }
      if (elapsed >= GAME_TIME) endGame();
    });
  });

  g.game.pushScene(scene);
};
