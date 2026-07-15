"use strict";

const main = require("./main");

module.exports = function bootstrap(originalParam) {
  const param = {};
  Object.keys(originalParam || {}).forEach((key) => {
    param[key] = originalParam[key];
  });
  param.sessionParameter = {};
  param.random = g.game.random;

  const waitingScene = new g.Scene({ game: g.game });
  let started = false;

  function start() {
    if (started) return;
    started = true;
    g.game.popScene();
    main.main(param);
  }

  waitingScene.onMessage.add((msg) => {
    if (!msg.data || msg.data.type !== "start" || !msg.data.parameters) return;
    param.sessionParameter = msg.data.parameters;
    if (msg.data.parameters.randomSeed != null) {
      param.random = new g.XorshiftRandomGenerator(msg.data.parameters.randomSeed);
    }
    start();
  });

  waitingScene.onLoad.add(() => {
    let ticks = 0;
    waitingScene.onUpdate.add(() => {
      ticks += 1;
      if (ticks > 3) start();
    });
  });

  g.game.pushScene(waitingScene);
};
