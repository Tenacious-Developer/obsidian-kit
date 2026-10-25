#!/usr/bin/env node
// Find Obsidian vaults on this machine, open files in the app, and give Claude Code access to a vault.
// Usage: node obsidian.js <vaults | open <file> | setup <vault path>>
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

// Where the Obsidian app keeps its list of vaults.
function obsidianConfig() {
  const home = os.homedir();
  if (process.platform === "win32") return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "obsidian", "obsidian.json");
  if (process.platform === "darwin") return path.join(home, "Library", "Application Support", "obsidian", "obsidian.json");
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "obsidian", "obsidian.json");
}

function listVaults() {
  const vaults = [];
  if (process.env.OBSIDIAN_VAULT) vaults.push({ path: process.env.OBSIDIAN_VAULT, source: "OBSIDIAN_VAULT" });
  const file = obsidianConfig();
  if (fs.existsSync(file)) {
    const entries = Object.values(JSON.parse(fs.readFileSync(file, "utf8")).vaults || {});
    entries.sort((a, b) => (b.ts || 0) - (a.ts || 0)); // most recently used first
    for (const v of entries) vaults.push({ path: v.path, source: v.open ? "obsidian, open now" : "obsidian" });
  }
  return vaults.filter((v) => fs.existsSync(path.join(v.path, ".obsidian")));
}

function findVault(file) {
  let dir = path.dirname(path.resolve(file));
  for (;;) {
    if (fs.existsSync(path.join(dir, ".obsidian"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function cmdVaults() {
  const vaults = listVaults();
  if (!vaults.length) return console.log(`No vaults found (looked in ${obsidianConfig()} and $OBSIDIAN_VAULT).`);
  for (const v of vaults) {
    const notes = countNotes(v.path);
    console.log(`${v.path}  (${v.source}; ${notes.md} notes, ${notes.drawings} drawings)`);
  }
}

function countNotes(dir) {
  const out = { md: 0, drawings: 0 };
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    if (e.isDirectory()) {
      const sub = countNotes(path.join(dir, e.name));
      out.md += sub.md;
      out.drawings += sub.drawings;
    } else if (e.name.endsWith(".excalidraw.md")) out.drawings++;
    else if (e.name.endsWith(".md")) out.md++;
  }
  return out;
}

function cmdOpen(file) {
  const abs = path.resolve(file);
  const vault = findVault(abs);
  if (!vault) throw new Error(`${file} is not inside an Obsidian vault (no .obsidian folder above it)`);
  const rel = path.relative(vault, abs).split(path.sep).join("/");
  const uri = `obsidian://open?vault=${encodeURIComponent(path.basename(vault))}&file=${encodeURIComponent(rel)}`;
  const [cmd, args] = process.platform === "win32" ? ["explorer.exe", [uri]] : process.platform === "darwin" ? ["open", [uri]] : ["xdg-open", [uri]];
  execFile(cmd, args, () => {}); // explorer.exe exits 1 even on success
  console.log(`opening ${uri}`);
}

// Add the vault to permissions.additionalDirectories in the user's Claude Code settings,
// so every project can read and write it without /add-dir.
function cmdSetup(vault) {
  const abs = path.resolve(vault);
  if (!fs.existsSync(path.join(abs, ".obsidian"))) throw new Error(`${abs} is not an Obsidian vault (no .obsidian folder)`);
  const file = path.join(os.homedir(), ".claude", "settings.json");
  const settings = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  settings.permissions ||= {};
  const dirs = (settings.permissions.additionalDirectories ||= []);
  if (dirs.some((d) => path.resolve(d).toLowerCase() === abs.toLowerCase())) return console.log(`already set up: ${abs}`);
  if (fs.existsSync(file)) fs.copyFileSync(file, file + ".bak");
  dirs.push(abs);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(settings, null, 2) + "\n", "utf8");
  console.log(`added ${abs} to permissions.additionalDirectories in ${file} (backup: settings.json.bak). Takes effect in new sessions.`);
}

try {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "vaults") cmdVaults();
  else if (cmd === "open" && arg) cmdOpen(arg);
  else if (cmd === "setup" && arg) cmdSetup(arg);
  else console.log("Usage: node obsidian.js vaults | open <file> | setup <vault path>");
} catch (e) {
  console.error("error: " + e.message);
  process.exit(1);
}
