"use strict";

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const sources = [
  path.join(projectRoot, "script", "main.js"),
  path.join(projectRoot, "script", "gameLogic.js")
];
const requiredCharacters = " 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz！？。、：；・／～ー＋－×％（）［］【】「」『』…→←↑↓●□■★☆♪￥#&'+,-./:;=?@_~";
const characters = new Set(Array.from(requiredCharacters));

sources.forEach((filePath) => {
  Array.from(fs.readFileSync(filePath, "utf8")).forEach((character) => {
    if (character !== "\r" && character !== "\n" && character !== "\t") characters.add(character);
  });
});

const output = Array.from(characters)
  .sort((left, right) => left.codePointAt(0) - right.codePointAt(0))
  .join("");
const outputPath = path.join(projectRoot, "assets", "font", "chars.txt");
fs.writeFileSync(outputPath, output, "utf8");
console.log("Generated " + characters.size + " glyph characters: " + outputPath);
