/**
 * Copia ../dist → game-dist/, comprime PNG, y genera assets/game-dist.zip.
 * Uso: npm run sync-game  (desde arca-shell; requiere dist del juego).
 */
import { execSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const shellRoot = join(__dirname, "..");
const gameDistSrc = join(shellRoot, "..", "dist");
const staged = join(shellRoot, "game-dist");
const zipOut = join(shellRoot, "assets", "game-dist.zip");
const buildIdPath = join(shellRoot, "src", "config.ts");

function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...listFiles(abs));
    else out.push(abs);
  }
  return out;
}

function bytesOf(files) {
  return files.reduce((n, f) => n + statSync(f).size, 0);
}

function fmt(n) {
  return `${(n / 1024 / 1024).toFixed(2)} MiB`;
}

if (!existsSync(join(gameDistSrc, "index.html"))) {
  console.error("No existe ../dist/index.html. Corre `npm run build` en arca-merge primero.");
  process.exit(1);
}

rmTree(staged);
mkdirSync(staged, { recursive: true });
cpSync(gameDistSrc, staged, { recursive: true });

const allBefore = listFiles(staged);
const pngBefore = allBefore.filter((f) => extname(f).toLowerCase() === ".png");
const pngBytesBefore = bytesOf(pngBefore);
const distBytesBefore = bytesOf(allBefore);

let pngSaved = 0;
for (const abs of pngBefore) {
  const original = readFileSync(abs);
  const optimized = await sharp(original)
    .png({
      compressionLevel: 9,
      effort: 10,
      adaptiveFiltering: true,
      palette: true,
      quality: 85
    })
    .toBuffer();
  if (optimized.length < original.length) {
    writeFileSync(abs, optimized);
    pngSaved += original.length - optimized.length;
  }
}

const allAfter = listFiles(staged);
const pngBytesAfter = bytesOf(
  allAfter.filter((f) => extname(f).toLowerCase() === ".png")
);
const distBytesAfter = bytesOf(allAfter);

const files = {};
for (const abs of allAfter) {
  const rel = relative(staged, abs).split("\\").join("/");
  files[rel] = new Uint8Array(readFileSync(abs));
}

const zipped = zipSync(files, { level: 6 });
mkdirSync(dirname(zipOut), { recursive: true });
writeFileSync(zipOut, zipped);

const buildId = new Date()
  .toISOString()
  .slice(0, 16)
  .replace("T", ".")
  .replace(":", "");
let config = readFileSync(buildIdPath, "utf8");
config = config.replace(/gameBuildId:\s*"[^"]*"/, `gameBuildId: "${buildId}"`);
writeFileSync(buildIdPath, config);

console.log(`OK: ${Object.keys(files).length} archivos → assets/game-dist.zip`);
console.log(`gameBuildId → ${buildId}`);
console.log(`PNG  ${fmt(pngBytesBefore)} → ${fmt(pngBytesAfter)}  (−${fmt(pngSaved)})`);
console.log(`dist ${fmt(distBytesBefore)} → ${fmt(distBytesAfter)}`);
console.log(`zip  ${fmt(zipped.length)}`);

function rmTree(dir) {
  if (!existsSync(dir)) return;
  execSync(`rm -rf "${dir}"`);
}
