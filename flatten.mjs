#!/usr/bin/env node
/**
 * Flatten a directory into a single LLM-friendly text file with XML-like tags:
 * <file path=relative/path>
 *   ...contents...
 * </file>
 *
 * Usage:
 *   node flatten.mjs ./my_project
 *   node flatten.mjs ./my_project --output flattened.txt
 *   node flatten.mjs ./my_project --ignore node_modules,.git,dist
 *
 * Notes:
 * - Skips binary-ish files via heuristic (null bytes / high non-text ratio).
 * - Reads text as UTF-8.
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const args = {
    root: null,
    output: null,
    ignore: [],
    maxFileBytes: 2_000_000, // 2MB per file safety cap (adjust if you want)
  };

  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--output" || a.startsWith("--output=")) {
      args.output = a.includes("=") ? a.split("=").slice(1).join("=") : argv[++i];
    } else if (a === "--ignore" || a.startsWith("--ignore=")) {
      const v = a.includes("=") ? a.split("=").slice(1).join("=") : argv[++i];
      args.ignore.push(...String(v).split(",").map(s => s.trim()).filter(Boolean));
    } else if (a === "--max-file-bytes" || a.startsWith("--max-file-bytes=")) {
      const v = a.includes("=") ? a.split("=").slice(1).join("=") : argv[++i];
      args.maxFileBytes = Number(v);
    } else if (!a.startsWith("-")) {
      positional.push(a);
    }
  }

  args.root = positional[0] ?? null;
  return args;
}

function normalizeIgnoreList(ignore, outputPath) {
  const defaults = [
    "node_modules",
    ".git",
    ".hg",
    ".svn",
    "dist",
    "build",
    "out",
    ".next",
    ".cache",
    ".turbo",
    ".vercel",
    "coverage",
    "__pycache__",
    "venv",
    ".venv",
  ];

  const merged = new Set([...defaults, ...ignore]);

  if (outputPath) merged.add(outputPath);

  return [...merged].filter(Boolean);
}

function shouldIgnore(absPath, relPath, ignoreList) {
  // Ignore if any ignore token matches a path segment or is contained in the path.
  // This mimics the Python "if any(ignored in subdir for ignored in ignore_dirs)" vibe :contentReference[oaicite:2]{index=2}
  const rel = relPath.split(path.sep).join("/");

  for (const token of ignoreList) {
    const t = token.split(path.sep).join("/").replace(/\/+$/, "");
    if (!t) continue;

    // Match path segment or substring.
    if (rel === t) return true;
    if (rel.startsWith(t + "/")) return true;
    if (rel.includes("/" + t + "/")) return true;
    if (rel.endsWith("/" + t)) return true;

    // Also check basename exact match (file ignore)
    if (path.basename(rel) === t) return true;
  }
  return false;
}

function isProbablyBinary(buffer) {
  if (!buffer || buffer.length === 0) return false;

  // If contains null byte, highly likely binary
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === 0) return true;
  }

  // Heuristic: count "weird" bytes (control chars excluding \n \r \t)
  let weird = 0;
  const sampleLen = Math.min(buffer.length, 4096);
  for (let i = 0; i < sampleLen; i++) {
    const b = buffer[i];
    const isText =
      b === 9 || b === 10 || b === 13 || // \t \n \r
      (b >= 32 && b <= 126) ||           // printable ASCII
      b >= 128;                           // allow UTF-8 multibyte region (roughly)
    if (!isText) weird++;
  }

  const ratio = weird / sampleLen;
  return ratio > 0.2;
}

async function walkDir(rootAbs, rel = "") {
  const abs = path.join(rootAbs, rel);
  const entries = await fsp.readdir(abs, { withFileTypes: true });

  const results = [];
  for (const ent of entries) {
    const childRel = path.join(rel, ent.name);
    if (ent.isDirectory()) {
      results.push(...(await walkDir(rootAbs, childRel)));
    } else if (ent.isFile()) {
      results.push(childRel);
    }
  }
  return results;
}

async function flattenDirectory({ root, output, ignore, maxFileBytes }) {
  if (!root) {
    throw new Error("Missing root directory. Example: node flatten.mjs ./my_project");
  }

  const rootAbs = path.resolve(process.cwd(), root);
  const outAbs = output ? path.resolve(process.cwd(), output) : null;

  const ignoreList = normalizeIgnoreList(ignore, outAbs ? path.relative(rootAbs, outAbs) : null);

  let fileList;
  try {
    fileList = await walkDir(rootAbs);
  } catch (e) {
    throw new Error(`Failed to read directory: ${rootAbs}\n${e.message}`);
  }

  // Sort for stable output (nice for diffs + caching)
  fileList.sort((a, b) => a.localeCompare(b));

  let res = "";
  let skippedBinary = 0;
  let skippedTooLarge = 0;
  let skippedIgnored = 0;

  for (const relPath of fileList) {
    const absPath = path.join(rootAbs, relPath);

    if (shouldIgnore(absPath, relPath, ignoreList)) {
      skippedIgnored++;
      continue;
    }

    const st = await fsp.stat(absPath);
    if (st.size > maxFileBytes) {
      skippedTooLarge++;
      continue;
    }

    // Read a small buffer to detect binary
    const fd = await fsp.open(absPath, "r");
    const probe = Buffer.alloc(Math.min(st.size, 4096));
    await fd.read(probe, 0, probe.length, 0);
    await fd.close();

    if (isProbablyBinary(probe)) {
      skippedBinary++;
      continue;
    }

    // Read full text
    let text;
    try {
      text = await fsp.readFile(absPath, "utf8");
    } catch {
      skippedBinary++;
      continue;
    }

    const relUnix = relPath.split(path.sep).join("/");

    res += `<file path=${relUnix}>\n`;
    res += text;
    if (!text.endsWith("\n")) res += "\n";
    res += `</file>\n\n`;
  }

  if (outAbs) {
    await fsp.writeFile(outAbs, res, "utf8");
    console.log(`Successfully flattened directory to ${outAbs}`);
  } else {
    process.stdout.write(res);
  }

  // Extra stats (optional, but useful)
  console.error(
    `\n[stats] files=${fileList.length} ignored=${skippedIgnored} binary=${skippedBinary} too_large=${skippedTooLarge}\n`
  );
}

// --- main ---
(async () => {
  try {
    const args = parseArgs(process.argv.slice(2));
    await flattenDirectory(args);
  } catch (err) {
    console.error(String(err?.message ?? err));
    process.exit(1);
  }
})();