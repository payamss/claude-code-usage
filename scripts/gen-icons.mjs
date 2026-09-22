#!/usr/bin/env node
// Regenerates src/app/favicon.ico and src/app/apple-icon.png from src/app/icon.svg.
//   node scripts/gen-icons.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const appDir = path.join(root, 'src', 'app');
const svg = fs.readFileSync(path.join(appDir, 'icon.svg'));

function icoBuffer(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);

  const entries = [];
  const images = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, buffer } of pngs) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);   // planes
    entry.writeUInt16LE(32, 6);  // bits per pixel
    entry.writeUInt32LE(buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    images.push(buffer);
    offset += buffer.length;
  }
  return Buffer.concat([header, ...entries, ...images]);
}

const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map(async (size) => ({
  size,
  buffer: await sharp(svg, { density: 384 }).resize(size, size).png().toBuffer(),
})));

fs.writeFileSync(path.join(appDir, 'favicon.ico'), icoBuffer(pngs));
console.log(`favicon.ico written (${sizes.join('/')})`);

await sharp(svg, { density: 384 }).resize(180, 180).png().toFile(path.join(appDir, 'apple-icon.png'));
console.log('apple-icon.png written (180x180)');
