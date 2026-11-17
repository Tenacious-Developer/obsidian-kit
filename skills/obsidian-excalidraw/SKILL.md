---
name: obsidian-excalidraw
description: Create, read, explain and edit Excalidraw drawings (.excalidraw.md) in the user's Obsidian vault — architecture diagrams, HLDs, flowcharts, boxes-and-arrows, with technology logos, AWS/cloud service icons and images. Use whenever the user asks for a diagram/drawing/architecture/flow "in Obsidian" or "in Excalidraw", asks to draw a note's content, or asks what an existing .excalidraw.md drawing shows or to change it.
---

# Excalidraw drawings in Obsidian

Needs the Obsidian **Excalidraw** community plugin (by Zsolt Viczian) in the vault, and Node.js
(22+ for `render`, which also needs Chrome, Edge or Chromium and internet access).
To find the vault, follow "Find the vault first" in the obsidian-notes skill
(`node "${CLAUDE_PLUGIN_ROOT}/skills/obsidian-notes/scripts/obsidian.js" vaults`).

Tool: `node "${CLAUDE_SKILL_DIR}/scripts/excalidraw.js"` (run it with no args for full usage).

**Never Edit the ```json / ```compressed-json block of a drawing by hand.** Drawings are often stored compressed,
and the plugin also keeps every text in a `## Text Elements` section that must match the JSON.
Always go through the tool, which handles both, plus arrow bindings and z-order.

## Read / explain a drawing
- `read <file>` → boxes with labels and ids, what is inside what, every arrow as `A --> B` with its label, free text.
  This is usually enough to explain or reason about a diagram.
- `render <file>` → a PNG of the drawing exactly as Excalidraw draws it; Read the PNG to *see* it (layout, hand-drawn
  parts, images). `--region X,Y,W,H` zooms into part of a big canvas.
- `read <file> --json` → the full scene (exact coordinates, colours) when you need precise detail.
- Arrows marked `(near, unbound)` were drawn next to a box without snapping to it; treat them as connected.

## Create a diagram
1. Get the content: read the note(s) the user points at ("based on this") or use the conversation.
2. Design before drawing, following the **excalidraw-design** skill: the diagram's one job, the shape that fits it
   (layers, mind map, pipeline, ...), then the **components** (nodes), the **interactions** (edges, labelled with the
   verb, protocol or event), and the **boundaries** (groups). Aim for 4–15 nodes in a flow, or up to ~40 in a mind map.
3. Write a spec JSON in the scratchpad, then `create <spec.json> "<vault>/<Folder>/<Name>.excalidraw.md"`.
   Default location: the same folder as the source note; default name: the topic, e.g. `Booking Flow.excalidraw.md`.
4. **Look at it:** `render <file>` and Read the PNG, then fix and re-render until clean (excalidraw-design step 4).
   Also run `read` to confirm every intended node and edge is there.
5. Offer to embed it in the source note with `![[<Name>.excalidraw]]`, then `open <file>` to show it in Obsidian.

Spec:
```json
{
  "title": "Flight Booking - HLD",
  "direction": "LR",
  "nodes": [
    { "id": "client", "label": "Client\n(Web / Mobile)", "color": "green" },
    { "id": "gw", "label": "API Gateway", "color": "yellow", "link": "[[API Gateway]]" },
    { "id": "flight", "label": "Flight Service", "color": "blue", "rank": 2 },
    { "id": "db", "label": "Flights DB", "shape": "ellipse", "color": "orange" },
    { "id": "mq", "label": "Kafka", "shape": "diamond", "color": "purple" }
  ],
  "edges": [
    { "from": "client", "to": "gw", "label": "HTTPS" },
    { "from": "gw", "to": "flight", "label": "/flights" },
    { "from": "flight", "to": "db" },
    { "from": "flight", "to": "mq", "label": "seat.held", "style": "dashed" }
  ],
  "groups": [{ "label": "Backend", "nodes": ["flight", "db"] }],
  "notes": [{ "text": "JWT checked here", "near": "gw", "side": "below" }]
}
```
- `shape`: rectangle (default), ellipse, diamond. `color`: blue, green, yellow, red, orange, purple, pink, teal, gray, white, or hex.
- Edge options: `style` solid/dashed/dotted, `both: true` for a two-way arrow, `arrow: false` for a plain line.
- Layout is automatic in layers along `direction` (LR = left to right, TB = top to bottom). Set the same `rank`
  on nodes to stack them in one column/row (e.g. all services rank 2), or give `x`/`y` to place a node exactly.
- Mind maps: `"layout": "mindmap", "root": "<centre id>"` and edges from parent to child. Branches are split
  between both sides, each column gets one width, and lines have no arrowheads. Give the root a bigger `fontSize`
  (30) and `width`/`height`, branches `fontSize` 22, and leaves 16. Each branch gets its own `color`, shared by its children.
- `link: "[[Note]]"` makes the box clickable in Obsidian, opening that note. Use it to tie diagrams to notes.

## Icons and images
A node with `icon` or `image` is drawn as the picture with its label underneath: borderless unless the node has a
`color`, grouped so it moves as one, and arrows still connect to it like any box. The files are saved in the
vault (`<Excalidraw folder>/icons/<set>/`, web images in `<Excalidraw folder>/images/`), so drawings work offline.
- `"icon": "redis"`: a bare name tries Devicon (colour logos), then Simple Icons (~3,400 brands in their brand colour).
  Force one with `devicon:<name>` or `si:<name>`. Use the names `icons search <words>` prints; don't guess.
- `"icon": "aws:lambda"`: official AWS Architecture Icons (~800). The first `aws:` icon downloads AWS's own package
  (~15 MB, a few seconds) into the vault; nothing to set up. Short names work: `aws:s3`, `aws:sqs`, `aws:ecs`,
  `aws:alb`, `aws:vpc`, `aws:api-gateway`. Other packs (Azure, GCP, a company's own) are imported from a zip or folder
  the user downloaded: `icons import "<zip>" --vault "<vault>"` (Azure is detected; others take `--set gcp` etc.).
- `"icon": "[[my-logo.svg]]"` uses any image already in the vault. `iconSize` (default 64) sets its size.
- `"image": "[[checkout.png]]"` shows a picture (screenshot, mockup) at `imageWidth` (default 240). A `https://` URL is
  downloaded into the vault first. Use only images the user provided or pointed you to, never random web images.
- The `shape` option is ignored on icon nodes. Keep groups (VPC, region, "Backend") as plain dashed boxes around them.

Conventions (keep them consistent across the vault): green = users/clients, yellow = gateways/edge/load balancers,
blue = services, orange ellipse = databases/caches/storage, purple diamond = queues/topics/events,
red = external or third-party systems and security concerns, gray = infrastructure. Request flows go LR;
hierarchies and pipelines go TB. Labels are short (≤ 3 words, use `\n` for a second line). Async = dashed.

## Change an existing drawing
- **Add** boxes/arrows: `add <file> <spec.json>` (new content goes to the right; `--below` or `--at X,Y` to choose).
  Edge `from`/`to` can name existing shapes by **id or exact label**, e.g. `{ "from": "Execution Service", "to": "queue" }`.
- **Rename, recolour, move, delete**: `read <file> --json > scene.json` (scratchpad), edit scene.json, then `write <file> scene.json`.
  - Rename: change the text element's `text` (the tool syncs `originalText` and the Text Elements section).
  - Recolour: `backgroundColor` / `strokeColor` on the shape.
  - Move: shift the shape and its bound text (`containerId` = shape id) by the same dx/dy, then `write ... --reroute`
    so straight arrows follow. For an icon node, also shift the `image` element in the same group (`groupIds`).
  - Delete: remove the shape, its bound text and its arrows (and, for an icon node, the `image` in its group);
    dangling references and unused Embedded Files entries are cleaned up automatically.
  - Swap an icon: easiest is to delete the node and `add` it again with the new `icon`.
- Ask the user to close or save the drawing in Obsidian first if they are editing it right now. The plugin reloads
  the file when it changes, and unsaved edits in the open view could conflict.

## Notes
- New drawings follow the vault's "Compress Excalidraw JSON" setting, and existing ones keep the format they had;
  `compress`/`decompress` switch a file. The plugin regenerates PNG/SVG exports next time the drawing is saved in Obsidian.
- Arrows are straight lines. For crowded diagrams, use `rank`, `x`/`y`, or split the diagram rather than accept crossings.
- Images are stored the plugin's way: an `image` element whose `fileId` is listed in the `## Embedded Files` section
  as `<fileId>: [[path]]`. `read` shows them as `icon <path>` on their node, or `file <path>` for a standalone image;
  `render` loads them from the vault. Freehand strokes in existing drawings are preserved but not editable through specs.
