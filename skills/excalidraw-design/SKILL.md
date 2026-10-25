---
name: excalidraw-design
description: Design method for clear, good-looking Excalidraw diagrams, with a mandatory render-and-look loop. Use together with obsidian-excalidraw whenever creating or substantially changing a diagram, mind map, architecture, flowchart or concept map, and whenever the user asks for a "beautiful", "clean", "visual" or "explain it as a diagram" result.
---

# Designing Excalidraw diagrams

A diagram earns its place when its **shape** explains something the text alone doesn't. Design first, draw with the
obsidian-excalidraw tool, then **look at the result and fix it**. You can't judge a diagram from its JSON.

Tool (from the obsidian-excalidraw skill): `node "${CLAUDE_PLUGIN_ROOT}/skills/obsidian-excalidraw/scripts/excalidraw.js"`

## 1. Decide the diagram's job
Write one sentence: *after looking at this, the viewer understands ___.* Everything that doesn't serve that sentence
goes into the note text, not the drawing. If there are two jobs, make two diagrams.

## 2. Pick the shape that matches the idea

| The idea is… | Use | How |
|---|---|---|
| a topic and its parts (study notes, overviews) | **mind map** | spec `"layout": "mindmap"`, `"root"`, edges parent → child |
| a request or data flow through components | **left-to-right layers** | `"direction": "LR"`, group by tier (client, edge, services, data) |
| steps in order, a pipeline | **assembly line** | `"direction": "LR"` chain; one verb per arrow label |
| a hierarchy or breakdown | **tree** | `"direction": "TB"`, or a mindmap |
| one thing feeding many / many feeding one | **fan-out / fan-in** | put the hub on its own `rank`, spokes on the next |
| a cycle or feedback loop | **loop** | place nodes with `x`/`y` on a circle, arrows round it |
| two options compared | **side by side** | two groups with matching rows, the same order in each |
| change over time | **timeline** | one row of small nodes with notes above or below |

Avoid uniform grids of identical boxes. When a diagram has several sections, give each the shape that fits it.

## 3. Make it readable
- **Hierarchy by size:** title 30–32, main nodes 20–22, details 14–16. The most important thing is the biggest and has the most space around it.
- **Colour carries meaning:** one colour per *kind* of thing (see the conventions in obsidian-excalidraw), at most 5–6 colours.
  Branches of a mind map each get their own colour, and their children share it. The centre gets a colour no branch uses (yellow).
- **Say it once:** no `title` on a mind map (the centre node is the title), and no label repeated in two places.
- **Short labels:** 1–4 words per box, `\n` for a second line. Explanations go in `notes` (free text), not in boxes.
- **Real names, not placeholders:** `POST /bookings`, `booking.created`, `Postgres`, not "API", "Event", "DB".
  For technical diagrams add one concrete example as a note (an endpoint, an event payload, a command).
- **Every relationship is a line.** Being next to each other doesn't mean connected. Label arrows with a verb or protocol.
- **Clickable:** set `link: "[[Note#Heading]]"` on boxes so the diagram opens the notes behind it.

## 4. Render, look, fix (mandatory)
1. `render <file>` → prints the PNG path. **Read the PNG** to see it.
2. Check, in this order:
   - Does the shape tell the story from step 1, with the eye's path obvious (centre-out, or left to right)?
   - Text cut off, overflowing its box, or overlapping anything?
   - Lines crossing boxes or text, or arrows pointing at the wrong thing?
   - Crowded corners next to empty areas; uneven gaps; misaligned columns?
   - Anything too small to read at normal zoom?
3. Fix through the spec (sizes, `rank`, `spacing`, `x`/`y`, shorter labels) and re-create with `--force`, or edit the
   scene and `write`. Then render again.
4. Repeat until a round finds nothing to fix. That usually takes 2–4 rounds. Anything you notice is something to fix,
   including small things (a repeated label, a colour clash, a stray element). Don't report a known issue and leave it.
   Tell the user what you fixed.

For big drawings, zoom in with `render <file> --region X,Y,W,H` (canvas coordinates: `read` prints shape positions,
and `render` prints the canvas origin). Rendering needs Chrome, Edge or Chromium, Node.js 22+, and internet access
(Excalidraw loads from esm.sh). If it can't run, say so and fall back to checking with `read`.

## Credit
The design-then-render-and-fix approach is inspired by Cole Medin's
[excalidraw-diagram-skill](https://github.com/coleam00/excalidraw-diagram-skill). This skill is an independent rewrite
for Obsidian's `.excalidraw.md` files and this kit's tool.
