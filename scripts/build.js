// Bundles index.html + src/* into one self-contained file: dist/autonomous-black-belt.html
// Usage: node scripts/build.js
const fs = require("fs"), path = require("path");
const root = path.resolve(__dirname, "..");
let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
html = html.replace(/<link rel="stylesheet" href="(src\/[^"]+)">/g, (_, f) => `<style>\n${fs.readFileSync(path.join(root, f), "utf8")}</style>`);
html = html.replace(/<script src="(src\/[^"]+)"><\/script>/g, (_, f) => `<script>\n${fs.readFileSync(path.join(root, f), "utf8")}</script>`);
fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist", "autonomous-black-belt.html"), html);
// Variant for hosts that supply their own document skeleton (no doctype/html/head/body tags).
const bare = html.replace(/<!doctype html>\s*/i, "").replace(/<\/?html[^>]*>\s*/gi, "").replace(/<\/?head>\s*/gi, "").replace(/<\/?body>\s*/gi, "").replace(/<meta charset="utf-8">\s*/i, "").replace(/<meta name="viewport"[^>]*>\s*/i, "");
fs.writeFileSync(path.join(root, "dist", "artifact.html"), bare);
console.log("Built dist/autonomous-black-belt.html (" + Math.round(html.length / 1024) + " KB)");
