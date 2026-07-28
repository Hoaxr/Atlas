#!/usr/bin/env node
/**
 * Cleans up duplicate numbered subtitle files left by the subtitle downloader.
 * e.g. Movie.en.0.srt, Movie.en.1.srt, Movie.en.2.srt → keeps Movie.en.0.srt, deletes the rest.
 * Also renames Movie.en.0.srt → Movie.en.srt if no Movie.en.srt already exists.
 */
const fs = require('fs');
const path = require('path');

const SUBTITLE_EXTS = ['.srt', '.ass', '.ssa', '.vtt'];
const DRY_RUN = process.argv.includes('--dry-run');

if (DRY_RUN) console.log('[DRY RUN] No files will be modified.\n');

let deleted = 0;
let renamed = 0;

function processDir(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      processDir(path.join(dir, entry.name));
      continue;
    }
    if (!entry.isFile()) continue;

    const fullPath = path.join(dir, entry.name);
    const ext = path.extname(entry.name).toLowerCase();
    if (!SUBTITLE_EXTS.includes(ext)) continue;

    // Match pattern: <base>.<lang>.<number><ext>  e.g. "Movie.en.3.srt"
    const m = entry.name.match(/^(.+\.[a-z]{2,3})\.(\d+)(\.[a-z]{2,4})?(\.[a-z]{2,4})?$/i);
    if (!m) continue;

    const baseLang = m[1]; // e.g. "Movie.en"
    const num = parseInt(m[2], 10);
    const trailing = (m[3] || '') + (m[4] || ''); // e.g. ".srt" or ".forced.srt"
    const canonical = path.join(dir, baseLang + trailing + (trailing ? '' : ext));

    if (num === 0) {
      // This is the keeper — rename to canonical if it doesn't already exist
      if (!fs.existsSync(canonical)) {
        const target = path.join(dir, baseLang + ext);
        console.log(`RENAME: ${entry.name} → ${path.basename(target)}`);
        if (!DRY_RUN) fs.renameSync(fullPath, target);
        renamed++;
      }
      // If canonical already exists, this .0 is also a duplicate — delete it
      else {
        console.log(`DELETE (dup .0): ${fullPath}`);
        if (!DRY_RUN) fs.unlinkSync(fullPath);
        deleted++;
      }
    } else {
      // num >= 1 — always a duplicate, delete
      console.log(`DELETE: ${fullPath}`);
      if (!DRY_RUN) fs.unlinkSync(fullPath);
      deleted++;
    }
  }
}

const roots = ['/mnt/oblivion/movies', '/mnt/oblivion/tvshows'];
for (const root of roots) {
  if (fs.existsSync(root)) {
    console.log(`Scanning: ${root}`);
    processDir(root);
  } else {
    console.warn(`Skipping (not found): ${root}`);
  }
}

console.log(`\nDone. Deleted: ${deleted}, Renamed: ${renamed}`);
