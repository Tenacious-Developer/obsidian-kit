#!/usr/bin/env node
// Read, create and edit Obsidian Excalidraw drawings (.excalidraw.md) from the command line.
// Run with no arguments for usage.
"use strict";

const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
// Bundled so the kit runs with no npm install.
const LZString = require("./vendor/lz-string.js");
const { generateNKeysBetween } = require("./vendor/fractional-indexing.js");

const PLUGIN_SOURCE = "https://github.com/zsviczian/obsidian-excalidraw-plugin/releases/tag/2.22.1";
const FONT_FAMILY = 5; // Excalifont, the plugin's default hand-drawn font
const LINE_HEIGHT = 1.25;
const CHAR_WIDTH = 0.55; // average Excalifont glyph width as a fraction of font size
const STROKE = "#1e1e1e";
const ARROW_GAP = 6;
const SHAPES = ["rectangle", "ellipse", "diamond"];
const CONTAINER_TYPES = ["rectangle", "ellipse", "diamond", "frame", "magicframe", "image", "embeddable"];
const COLORS = {
  blue: "#a5d8ff", green: "#b2f2bb", yellow: "#ffec99", red: "#ffc9c9", orange: "#ffd8a8",
  purple: "#d0bfff", pink: "#eebefa", teal: "#96f2d7", gray: "#e9ecef", grey: "#e9ecef",
  white: "#ffffff", none: "transparent", transparent: "transparent",
};

const EMPTY_MD = `---

excalidraw-plugin: parsed
tags: [excalidraw]

---
==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠== You can decompress Drawing data with the command palette: 'Decompress current Excalidraw file'. For more info check in plugin settings under 'Saving'


# Excalidraw Data

## Text Elements
%%
## Drawing
\`\`\`json
{}
\`\`\`
%%`;

const USAGE = `Usage: node excalidraw.js <command> ...

  read <file> [--json]             Summarise a drawing (boxes, labels, arrows, containment).
                                   --json prints the full scene JSON instead.
  create <spec.json> <out> [--force] [--compress|--plain]
                                   Build a new drawing from a diagram spec (auto layout).
  add <file> <spec.json> [--below | --at X,Y]
                                   Add a spec's nodes/edges to an existing drawing. Edges may
                                   point at existing shapes by element id or by label text.
  write <file> <scene.json> [--reroute]
                                   Replace a drawing's elements with an edited scene
                                   (from read --json). Repairs bindings and Text Elements.
                                   --reroute redraws straight bound arrows after moving shapes.
  compress <file> | decompress <file>
                                   Switch a drawing's storage between compressed and plain JSON.
  open <file>                      Open any vault file in the Obsidian app.

Spec: { "title", "direction": "LR"|"TB",
        "nodes":  [{ "id", "label", "shape": "rectangle"|"ellipse"|"diamond", "color",
                     "stroke", "style", "rank", "x", "y", "width", "height", "fontSize", "link" }],
        "edges":  [{ "from", "to", "label", "style": "solid"|"dashed"|"dotted", "both", "arrow", "color" }],
        "groups": [{ "label", "nodes": [ids], "color", "style" }],
        "notes":  [{ "text", "near", "side": "below"|"above"|"left"|"right", "x", "y", "fontSize" }],
        "spacing": { "rank", "node" } }
Colors: ${Object.keys(COLORS).join(", ")} or any hex.`;

// ---------- small helpers ----------

const fail = (msg) => { throw new Error(msg); };
const color = (c, fallback) => (c == null ? fallback : COLORS[String(c).toLowerCase()] || c);
const randInt = () => Math.floor(Math.random() * 2 ** 31);
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const short = (s, n = 90) => { const t = String(s ?? "").replace(/\s*\n\s*/g, " / "); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const r = Math.round;

function randId() {
  const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, "")); } // PowerShell writes a BOM
  catch (e) { fail(`${file}: ${e.message}`); }
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

// The vault's own "Compress Excalidraw JSON in Markdown" setting, used as the default for new files.
function vaultCompresses(file) {
  const vault = findVault(file);
  const settings = vault && path.join(vault, ".obsidian", "plugins", "obsidian-excalidraw-plugin", "data.json");
  if (!settings || !fs.existsSync(settings)) return false;
  try { return JSON.parse(fs.readFileSync(settings, "utf8")).compress === true; } catch { return false; }
}

// ---------- element factories ----------

function baseElement(type, props) {
  return {
    id: randId(), type, x: 0, y: 0, width: 0, height: 0, angle: 0,
    strokeColor: STROKE, backgroundColor: "transparent", fillStyle: "solid",
    strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100,
    groupIds: [], frameId: null, index: null, roundness: null,
    seed: randInt(), version: 1, versionNonce: randInt(), isDeleted: false,
    boundElements: [], updated: Date.now(), link: null, locked: false,
    ...props,
  };
}

function measure(text, fontSize) {
  const lines = String(text).split("\n");
  return {
    width: Math.max(...lines.map((l) => l.length)) * fontSize * CHAR_WIDTH,
    height: lines.length * fontSize * LINE_HEIGHT,
  };
}

function textElement(text, x, y, opts = {}) {
  const fontSize = opts.fontSize || 20;
  const { width, height } = measure(text, fontSize);
  return baseElement("text", {
    x, y, width, height, strokeColor: opts.color || STROKE, groupIds: opts.groupIds || [],
    text, rawText: text, originalText: text, fontSize, fontFamily: FONT_FAMILY,
    textAlign: opts.align || "left", verticalAlign: opts.valign || "top",
    containerId: opts.containerId || null, autoResize: true, lineHeight: LINE_HEIGHT,
  });
}

// Text centred inside a shape, or on an arrow's midpoint.
function boundText(container, text, fontSize) {
  const t = textElement(text, 0, 0, { fontSize, align: "center", valign: "middle", containerId: container.id });
  if (container.type === "arrow") {
    const [dx, dy] = container.points[container.points.length - 1];
    t.x = container.x + dx / 2 - t.width / 2;
    t.y = container.y + dy / 2 - t.height / 2;
  } else {
    t.x = container.x + (container.width - t.width) / 2;
    t.y = container.y + (container.height - t.height) / 2;
  }
  (container.boundElements ||= []).push({ type: "text", id: t.id });
  return t;
}

// Where a ray from the element's centre in direction (dx, dy) leaves its outline, pushed out by gap.
function boundaryPoint(el, dx, dy, gap) {
  const cx = el.x + el.width / 2, cy = el.y + el.height / 2;
  const hw = el.width / 2, hh = el.height / 2, len = Math.hypot(dx, dy);
  let t;
  if (el.type === "ellipse") t = 1 / Math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2);
  else if (el.type === "diamond") t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
  else t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  return { x: cx + dx * t + (dx / len) * gap, y: cy + dy * t + (dy / len) * gap };
}

// Straight segment between the outlines of a and b, or null when their centres coincide.
function segment(a, b) {
  const dx = b.x + b.width / 2 - (a.x + a.width / 2);
  const dy = b.y + b.height / 2 - (a.y + a.height / 2);
  if (!dx && !dy) return null;
  const p1 = boundaryPoint(a, dx, dy, ARROW_GAP);
  const p2 = boundaryPoint(b, -dx, -dy, ARROW_GAP);
  return {
    x: p1.x, y: p1.y, width: Math.abs(p2.x - p1.x), height: Math.abs(p2.y - p1.y),
    points: [[0, 0], [p2.x - p1.x, p2.y - p1.y]],
  };
}

function arrowBetween(a, b, e) {
  const seg = segment(a, b);
  if (!seg) return null;
  const arrow = baseElement("arrow", {
    ...seg,
    roundness: { type: 2 }, strokeStyle: e.style || "solid", strokeColor: color(e.color, STROKE),
    startBinding: { elementId: a.id, mode: "orbit", fixedPoint: [0.5, 0.5] },
    endBinding: { elementId: b.id, mode: "orbit", fixedPoint: [0.5, 0.5] },
    startArrowhead: e.both ? "arrow" : null, endArrowhead: e.arrow === false ? null : "arrow",
    elbowed: false, moveMidPointsWithElement: false,
  });
  (a.boundElements ||= []).push({ id: arrow.id, type: "arrow" });
  (b.boundElements ||= []).push({ id: arrow.id, type: "arrow" });
  return arrow;
}

// ---------- layout ----------

// Layered layout: ranks from longest path along edges, barycentre ordering inside each rank,
// group members kept next to each other. Fills px/py/w/h on every node.
function layoutSpec(spec) {
  const dir = String(spec.direction || "LR").toUpperCase() === "TB" ? "TB" : "LR";
  const gapRank = spec.spacing?.rank ?? (dir === "LR" ? 180 : 130);
  const gapNode = spec.spacing?.node ?? 60;

  const nodes = (spec.nodes || []).map((n, i) => {
    if (!n.id) fail(`node #${i + 1} has no "id"`);
    const shape = n.shape || "rectangle";
    if (!SHAPES.includes(shape)) fail(`node "${n.id}": shape must be one of ${SHAPES.join(", ")}`);
    const label = String(n.label ?? n.id);
    const fontSize = n.fontSize || 20;
    const m = measure(label, fontSize);
    const k = shape === "rectangle" ? 1 : 1.45; // ellipses and diamonds need room around the label
    return {
      ...n, label, shape, fontSize, order: i,
      w: n.width || Math.max(160, Math.ceil(m.width * k + 50)),
      h: n.height || Math.max(70, Math.ceil(m.height * k + 36)),
    };
  });
  const byId = new Map();
  for (const n of nodes) {
    if (byId.has(n.id)) fail(`duplicate node id "${n.id}"`);
    byId.set(n.id, n);
  }

  const groupOf = new Map();
  (spec.groups || []).forEach((g, gi) => (g.nodes || []).forEach((id) => groupOf.has(id) || groupOf.set(id, gi)));

  const edges = (spec.edges || []).filter((e) => byId.has(e.from) && byId.has(e.to) && e.from !== e.to);
  const preds = new Map(nodes.map((n) => [n.id, []]));
  const neighbours = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    preds.get(e.to).push(e.from);
    neighbours.get(e.from).push(e.to);
    neighbours.get(e.to).push(e.from);
  }

  const rankOf = new Map(), visiting = new Set();
  const rank = (id) => {
    const n = byId.get(id);
    if (n.rank != null) return n.rank;
    if (rankOf.has(id)) return rankOf.get(id);
    if (visiting.has(id)) return -1; // edge back into a cycle: ignore it
    visiting.add(id);
    let best = 0;
    for (const p of preds.get(id)) best = Math.max(best, rank(p) + 1);
    visiting.delete(id);
    rankOf.set(id, best);
    return best;
  };
  for (const n of nodes) n.r = rank(n.id);

  const layers = [...new Set(nodes.map((n) => n.r))].sort((a, b) => a - b).map((rk) => nodes.filter((n) => n.r === rk));
  const pos = new Map();
  layers.forEach((L) => L.forEach((n, i) => pos.set(n.id, i)));

  const sortLayer = (L) => {
    const bary = new Map(L.map((n) => {
      const ns = neighbours.get(n.id).filter((id) => byId.get(id).r !== n.r);
      return [n.id, ns.length ? avg(ns.map((id) => pos.get(id))) : pos.get(n.id)];
    }));
    const groupBary = new Map();
    for (const n of L) {
      const g = groupOf.get(n.id);
      if (g != null) (groupBary.get(g) || groupBary.set(g, []).get(g)).push(bary.get(n.id));
    }
    const key = (n) => (groupOf.has(n.id) ? avg(groupBary.get(groupOf.get(n.id))) : bary.get(n.id));
    L.sort((a, b) => key(a) - key(b) || (groupOf.get(a.id) ?? -1) - (groupOf.get(b.id) ?? -1)
      || bary.get(a.id) - bary.get(b.id) || a.order - b.order);
    L.forEach((n, i) => pos.set(n.id, i));
  };
  for (let it = 0; it < 4; it++) {
    layers.forEach(sortLayer);
    [...layers].reverse().forEach(sortLayer);
  }

  // "main" runs across ranks, "cross" runs along a rank.
  let main = 0;
  for (const L of layers) {
    const thick = Math.max(...L.map((n) => (dir === "LR" ? n.w : n.h)));
    const lens = L.map((n) => (dir === "LR" ? n.h : n.w));
    const gaps = L.slice(1).map((n, i) => gapNode + (groupOf.get(n.id) !== groupOf.get(L[i].id) ? 70 : 0));
    let cross = -(lens.reduce((a, b) => a + b, 0) + gaps.reduce((a, b) => a + b, 0)) / 2;
    L.forEach((n, i) => {
      if (i > 0) cross += gaps[i - 1];
      const m = main + (thick - (dir === "LR" ? n.w : n.h)) / 2;
      [n.px, n.py] = dir === "LR" ? [m, cross] : [cross, m];
      cross += lens[i];
    });
    main += thick + gapRank;
  }

  // A group spanning several ranks can reach into nodes it does not own: push those along their
  // rank (with everything beyond them) until the dashed group outline clears them.
  const crossOf = (n) => (dir === "LR" ? n.py : n.px);
  const lenOf = (n) => (dir === "LR" ? n.h : n.w);
  const shift = (n, d) => { if (dir === "LR") n.py += d; else n.px += d; };
  const [padLo, padHi] = dir === "LR" ? [50 + 25, 30 + 25] : [30 + 25, 30 + 25];
  (spec.groups || []).forEach((g, gi) => {
    const members = nodes.filter((n) => groupOf.get(n.id) === gi);
    if (!members.length) return;
    const memberRanks = new Set(members.map((n) => n.r));
    const lo = Math.min(...members.map(crossOf)) - padLo;
    const hi = Math.max(...members.map((n) => crossOf(n) + lenOf(n))) + padHi;
    for (const L of layers) {
      if (!memberRanks.has(L[0].r)) continue;
      const firstMember = L.findIndex((n) => groupOf.get(n.id) === gi);
      L.forEach((n, i) => {
        if (groupOf.get(n.id) === gi) return;
        const a = crossOf(n), b = a + lenOf(n);
        if (b <= lo || a >= hi) return;
        if (i < firstMember) L.slice(0, i + 1).forEach((m) => shift(m, lo - b));
        else L.slice(i).forEach((m) => shift(m, hi - a));
      });
    }
  });

  for (const n of nodes) {
    n.manual = n.x != null && n.y != null;
    if (n.manual) [n.px, n.py] = [n.x, n.y];
  }
  return nodes;
}

function bbox(els) {
  const live = els.filter((e) => !e.isDeleted);
  if (!live.length) return null;
  return {
    minX: Math.min(...live.map((e) => e.x)), minY: Math.min(...live.map((e) => e.y)),
    maxX: Math.max(...live.map((e) => e.x + e.width)), maxY: Math.max(...live.map((e) => e.y + e.height)),
  };
}

// Turn a laid-out spec into Excalidraw elements. `external(ref)` resolves edge endpoints that are
// not in the spec (shapes already in the drawing).
function buildElements(spec, nodes, external = () => null) {
  const groupEls = [], nodeEls = [], edgeEls = [], noteEls = [], titleEls = [];
  const shapeById = new Map();

  for (const n of nodes) {
    const shape = baseElement(n.shape, {
      x: n.px, y: n.py, width: n.w, height: n.h,
      backgroundColor: color(n.color, "transparent"), strokeColor: color(n.stroke, STROKE),
      strokeStyle: n.style || "solid",
      roundness: n.shape === "rectangle" ? { type: 3 } : n.shape === "diamond" ? { type: 2 } : null,
      link: n.link || null,
    });
    nodeEls.push(shape, boundText(shape, n.label, n.fontSize));
    shapeById.set(n.id, shape);
  }
  const resolve = (ref, what) => shapeById.get(ref) || external(ref)
    || fail(`${what} "${ref}" not found. Spec ids: ${[...shapeById.keys()].join(", ") || "(none)"}`);

  for (const g of spec.groups || []) {
    const box = bbox((g.nodes || []).map((id) => resolve(id, `group "${g.label}" member`)));
    if (!box) continue;
    const gid = randId();
    const rect = baseElement("rectangle", {
      x: box.minX - 30, y: box.minY - 50, width: box.maxX - box.minX + 60, height: box.maxY - box.minY + 80,
      strokeStyle: g.style || "dashed", strokeColor: color(g.stroke, "#868e96"),
      backgroundColor: color(g.color, "transparent"), roundness: { type: 3 }, groupIds: [gid],
    });
    groupEls.push(rect);
    if (g.label) groupEls.push(textElement(g.label, rect.x + 14, rect.y + 10, { fontSize: 18, color: "#495057", groupIds: [gid] }));
  }

  for (const e of spec.edges || []) {
    const a = resolve(e.from, "edge endpoint"), b = resolve(e.to, "edge endpoint");
    const arrow = a !== b && arrowBetween(a, b, e);
    if (!arrow) { console.error(`skipped edge ${e.from} -> ${e.to}: self loop or overlapping shapes`); continue; }
    edgeEls.push(arrow);
    if (e.label) edgeEls.push(boundText(arrow, String(e.label), e.fontSize || 16));
  }

  for (const t of spec.notes || []) {
    const el = textElement(String(t.text), t.x ?? 0, t.y ?? 0, { fontSize: t.fontSize || 16, color: t.color || "#495057" });
    if (t.near) {
      const s = resolve(t.near, "note anchor");
      const side = t.side || "below";
      if (side === "below") [el.x, el.y] = [s.x, s.y + s.height + 16];
      else if (side === "above") [el.x, el.y] = [s.x, s.y - el.height - 16];
      else if (side === "right") [el.x, el.y] = [s.x + s.width + 20, s.y];
      else [el.x, el.y] = [s.x - el.width - 20, s.y];
    }
    noteEls.push(el);
  }

  if (spec.title) {
    const box = bbox([...groupEls, ...nodeEls]) || { minX: 0, minY: 0 };
    titleEls.push(textElement(String(spec.title), box.minX, box.minY - 90, { fontSize: 32 }));
  }
  return [...groupEls, ...nodeEls, ...edgeEls, ...noteEls, ...titleEls];
}

// ---------- file I/O ----------

function loadDrawing(file) {
  if (!fs.existsSync(file)) fail(`${file}: file not found`);
  const md = fs.readFileSync(file, "utf8");
  if (file.endsWith(".excalidraw")) return { md: null, data: JSON.parse(md), compressed: false };
  const m = md.match(/```(compressed-json|json)\r?\n([\s\S]*?)```/);
  if (!m) fail(`${file}: no Excalidraw drawing block found (is it an .excalidraw.md file?)`);
  const raw = m[1] === "compressed-json" ? LZString.decompressFromBase64(m[2].replace(/\s+/g, "")) : m[2];
  if (!raw) fail(`${file}: could not decompress the drawing data`);
  const data = JSON.parse(raw);
  data.elements ||= [];
  return { md, data, compressed: m[1] === "compressed-json" };
}

// Make bindings, containers and text fields agree with each other after edits.
function repair(elements) {
  const els = elements.filter((e) => !e.isDeleted);
  const byId = new Map(els.map((e) => [e.id, e]));
  const link = (host, id, type) => {
    host.boundElements = host.boundElements || [];
    if (!host.boundElements.some((b) => b.id === id)) host.boundElements.push({ id, type });
  };
  for (const e of els) {
    e.boundElements = (e.boundElements || []).filter((b, i, all) => byId.has(b.id) && all.findIndex((x) => x.id === b.id) === i);
    e.groupIds ||= [];
    if (e.type === "text") {
      if (norm(e.text) !== norm(e.originalText)) {
        e.originalText = e.text;
        if (!e.containerId) Object.assign(e, measure(e.text, e.fontSize || 20));
      }
      e.rawText = e.originalText;
      if (e.containerId && !byId.has(e.containerId)) e.containerId = null;
      if (e.containerId) link(byId.get(e.containerId), e.id, "text");
    }
    if (e.type === "arrow") {
      for (const k of ["startBinding", "endBinding"]) {
        if (e[k] && !byId.has(e[k].elementId)) e[k] = null;
        if (e[k]) link(byId.get(e[k].elementId), e.id, "arrow");
      }
    }
  }
  return els;
}

function renderMarkdown(prevMd, data, compress) {
  const texts = data.elements.filter((e) => e.type === "text" && !e.isDeleted)
    .map((e) => `${e.originalText ?? e.text} ^${e.id}\n\n`).join("");
  const block = compress
    ? "```compressed-json\n" + LZString.compressToBase64(JSON.stringify(data)).match(/.{1,256}/g).join("\n\n") + "\n```"
    : "```json\n" + JSON.stringify(data, null, "\t") + "\n```";
  let md = prevMd && /## Text Elements\r?\n/.test(prevMd) ? prevMd : EMPTY_MD;
  md = md.replace(/(## Text Elements\r?\n)([\s\S]*?)(?=\r?\n## |\r?\n?%%)/, (_, head) => head + texts);
  return md.replace(/```(?:compressed-json|json)\r?\n[\s\S]*?```/, () => block);
}

function saveDrawing(file, prevMd, data, compress) {
  data.type = "excalidraw";
  data.version = 2;
  data.source ||= PLUGIN_SOURCE;
  data.appState ||= { gridSize: 20, gridStep: 5, gridModeEnabled: false, viewBackgroundColor: "#ffffff", currentItemFontFamily: FONT_FAMILY };
  data.files ||= {};
  data.elements = repair(data.elements);
  // Fresh z-order keys in array order, and a version bump so an open Obsidian view takes the new data.
  const keys = generateNKeysBetween(null, null, data.elements.length);
  data.elements.forEach((e, i) => {
    e.index = keys[i];
    e.version = (e.version || 1) + 1;
    e.versionNonce = randInt();
    e.updated = Date.now();
  });
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const out = file.endsWith(".excalidraw") ? JSON.stringify(data, null, "\t") : renderMarkdown(prevMd, data, compress);
  fs.writeFileSync(file, out, "utf8");
}

// ---------- read summary ----------

function summarize(file, data, compressed) {
  const els = data.elements.filter((e) => !e.isDeleted);
  const byId = new Map(els.map((e) => [e.id, e]));
  const shapes = els.filter((e) => CONTAINER_TYPES.includes(e.type));
  const freeTexts = els.filter((e) => e.type === "text" && !e.containerId);
  const label = (el) => {
    const t = (el.boundElements || []).map((b) => byId.get(b.id)).find((x) => x && x.type === "text");
    if (t) return t.originalText ?? t.text;
    if (el.name) return el.name;
    // a group box drawn as a rectangle with a free text label in its top band
    const inner = freeTexts.find((t) => t.x >= el.x && t.x < el.x + el.width && t.y >= el.y && t.y < el.y + 60);
    return inner ? inner.originalText ?? inner.text : null;
  };
  const name = (el) => `"${short(label(el) ?? "(no label)", 50)}" [${el.id}]`;
  const contains = (o, i) => o !== i && o.x <= i.x && o.y <= i.y && o.x + o.width >= i.x + i.width && o.y + o.height >= i.y + i.height;
  const parentOf = (el) => {
    if (el.frameId && byId.has(el.frameId)) return byId.get(el.frameId);
    return shapes.filter((o) => contains(o, el)).sort((a, b) => a.width * a.height - b.width * b.height)[0];
  };
  const nearest = (x, y) => shapes.find((s) => x >= s.x - 30 && x <= s.x + s.width + 30 && y >= s.y - 30 && y <= s.y + s.height + 30);
  const end = (a, which) => {
    const binding = which === "start" ? a.startBinding : a.endBinding;
    if (binding && byId.has(binding.elementId)) return name(byId.get(binding.elementId));
    const [px, py] = which === "start" ? a.points[0] : a.points[a.points.length - 1];
    const s = nearest(a.x + px, a.y + py);
    return s ? `${name(s)} (near, unbound)` : `(${r(a.x + px)},${r(a.y + py)})`;
  };

  const out = [];
  const box = bbox(els);
  out.push(`${file}`);
  out.push(`${els.length} elements, ${compressed ? "compressed" : "plain"} JSON` + (box ? `, canvas (${r(box.minX)},${r(box.minY)}) to (${r(box.maxX)},${r(box.maxY)})` : ""));

  if (shapes.length) {
    out.push("", "SHAPES (type, label [id], position, size, fill, parent, link)");
    for (const s of shapes) {
      const p = parentOf(s);
      out.push(`  ${s.type.padEnd(9)} ${name(s)}  at ${r(s.x)},${r(s.y)}  ${r(s.width)}x${r(s.height)}  bg ${s.backgroundColor}`
        + (p ? `  in ${name(p)}` : "") + (s.link ? `  link ${s.link}` : ""));
    }
  }
  const arrows = els.filter((e) => e.type === "arrow" || e.type === "line");
  if (arrows.length) {
    out.push("", "CONNECTIONS");
    for (const a of arrows) {
      const t = (a.boundElements || []).map((b) => byId.get(b.id)).find((x) => x && x.type === "text");
      const head = a.type === "line" ? "---" : a.startArrowhead ? "<->" : "-->";
      out.push(`  ${end(a, "start")} ${head} ${end(a, "end")}` + (t ? `  label "${short(t.originalText ?? t.text, 40)}"` : "")
        + (a.strokeStyle !== "solid" ? `  ${a.strokeStyle}` : "") + `  [${a.id}]`);
    }
  }
  if (freeTexts.length) {
    out.push("", "FREE TEXT (label [id], position, font size)");
    for (const t of freeTexts) out.push(`  "${short(t.originalText ?? t.text)}" [${t.id}]  at ${r(t.x)},${r(t.y)}  ${r(t.fontSize)}px`);
  }
  const other = {};
  for (const e of els) if (!CONTAINER_TYPES.includes(e.type) && !["text", "arrow", "line"].includes(e.type)) other[e.type] = (other[e.type] || 0) + 1;
  if (Object.keys(other).length) out.push("", "OTHER: " + Object.entries(other).map(([k, v]) => `${v} ${k}`).join(", "));
  return out.join("\n");
}

// ---------- commands ----------

function cmdCreate(specFile, outFile, flags) {
  if (!outFile) fail("create needs <spec.json> <out.excalidraw.md>");
  if (!/\.excalidraw(\.md)?$/.test(outFile)) outFile += ".excalidraw.md";
  if (fs.existsSync(outFile) && !flags.force) fail(`${outFile} already exists (use --force to overwrite, or "add" to extend it)`);
  const spec = readJson(specFile);
  const elements = buildElements(spec, layoutSpec(spec));
  const compress = flags.compress || (!flags.plain && vaultCompresses(outFile));
  saveDrawing(outFile, null, { elements }, compress);
  console.log(`created ${outFile} (${elements.length} elements)`);
}

function cmdAdd(file, specFile, flags) {
  const { md, data, compressed } = loadDrawing(file);
  const spec = readJson(specFile);
  const live = data.elements.filter((e) => !e.isDeleted);
  const shapes = live.filter((e) => CONTAINER_TYPES.includes(e.type));
  const labelOf = (s) => {
    const t = (s.boundElements || []).map((b) => live.find((x) => x.id === b.id)).find((x) => x && x.type === "text");
    return t ? t.originalText ?? t.text : s.name;
  };
  const external = (ref) => shapes.find((s) => s.id === ref) || shapes.find((s) => norm(labelOf(s)) === norm(ref));

  const nodes = layoutSpec(spec);
  const auto = nodes.filter((n) => !n.manual);
  const existing = bbox(live);
  if (auto.length && existing) {
    const minX = Math.min(...auto.map((n) => n.px)), minY = Math.min(...auto.map((n) => n.py));
    let tx, ty;
    if (flags.at) [tx, ty] = flags.at.split(",").map(Number);
    else if (flags.below) [tx, ty] = [existing.minX, existing.maxY + 200];
    else [tx, ty] = [existing.maxX + 250, existing.minY + (spec.title ? 90 : 0)];
    for (const n of auto) { n.px += tx - minX; n.py += ty - minY; }
  }
  const added = buildElements(spec, nodes, external);
  data.elements.push(...added);
  saveDrawing(file, md, data, flags.compress || (!flags.plain && compressed));
  console.log(`added ${added.length} elements to ${file}`);
}

function cmdWrite(file, sceneFile, flags) {
  const scene = readJson(sceneFile);
  const prev = fs.existsSync(file) ? loadDrawing(file) : { md: null, data: {}, compressed: vaultCompresses(file) };
  const data = { ...prev.data, ...(Array.isArray(scene) ? { elements: scene } : scene) };
  if (!Array.isArray(data.elements)) fail(`${sceneFile}: expected an "elements" array`);
  const ids = new Set();
  for (const e of data.elements) {
    if (!e.id || !e.type) fail(`every element needs "id" and "type": ${JSON.stringify(e).slice(0, 120)}`);
    if (ids.has(e.id)) fail(`duplicate element id "${e.id}"`);
    ids.add(e.id);
  }
  if (flags.reroute) {
    // Redraw straight arrows between the shapes they are bound to, and re-centre their labels.
    const byId = new Map(data.elements.filter((e) => !e.isDeleted).map((e) => [e.id, e]));
    for (const a of byId.values()) {
      if (a.type !== "arrow" || a.points.length !== 2) continue;
      const from = byId.get(a.startBinding?.elementId), to = byId.get(a.endBinding?.elementId);
      const seg = from && to && segment(from, to);
      if (!seg) continue;
      Object.assign(a, seg);
      const label = (a.boundElements || []).map((b) => byId.get(b.id)).find((t) => t && t.type === "text");
      if (label) [label.x, label.y] = [a.x + seg.points[1][0] / 2 - label.width / 2, a.y + seg.points[1][1] / 2 - label.height / 2];
    }
  }
  saveDrawing(file, prev.md, data, flags.compress || (!flags.plain && prev.compressed));
  console.log(`wrote ${file} (${data.elements.filter((e) => !e.isDeleted).length} elements)`);
}

function cmdOpen(file) {
  const abs = path.resolve(file);
  const vault = findVault(abs) || fail(`${file} is not inside an Obsidian vault (no .obsidian folder above it)`);
  const rel = path.relative(vault, abs).split(path.sep).join("/");
  const uri = `obsidian://open?vault=${encodeURIComponent(path.basename(vault))}&file=${encodeURIComponent(rel)}`;
  const [cmd, args] = process.platform === "win32" ? ["explorer.exe", [uri]] : process.platform === "darwin" ? ["open", [uri]] : ["xdg-open", [uri]];
  execFile(cmd, args, () => {}); // explorer.exe exits 1 even on success
  console.log(`opening ${uri}`);
}

function main() {
  const args = process.argv.slice(2);
  const flags = {}, pos = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--at") flags.at = args[++i];
    else if (args[i].startsWith("--")) flags[args[i].slice(2)] = true;
    else pos.push(args[i]);
  }
  const [cmd, a, b] = pos;
  if (!cmd || flags.help) return console.log(USAGE);
  if (cmd !== "create" && !a) fail(`${cmd} needs a file argument`);

  if (cmd === "read") {
    const { data, compressed } = loadDrawing(a);
    console.log(flags.json ? JSON.stringify({ ...data, elements: data.elements.filter((e) => !e.isDeleted) }, null, 1) : summarize(a, data, compressed));
  } else if (cmd === "create") cmdCreate(a, b, flags);
  else if (cmd === "add") cmdAdd(a, b || fail("add needs <file> <spec.json>"), flags);
  else if (cmd === "write") cmdWrite(a, b || fail("write needs <file> <scene.json>"), flags);
  else if (cmd === "compress" || cmd === "decompress") {
    const { md, data } = loadDrawing(a);
    saveDrawing(a, md, data, cmd === "compress");
    console.log(`${cmd}ed ${a}`);
  } else if (cmd === "open") cmdOpen(a);
  else fail(`unknown command "${cmd}"\n\n${USAGE}`);
}

try { main(); } catch (e) { console.error("error: " + e.message); process.exit(1); }
