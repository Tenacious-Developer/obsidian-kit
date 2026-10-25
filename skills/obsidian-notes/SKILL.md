---
name: obsidian-notes
description: Create, read, search, edit, move and organise notes and folders in the user's Obsidian vault. Use whenever the user mentions Obsidian, "my vault" or "my notes", or asks to write, save, update, find, link, restructure or summarise notes. For diagrams and Excalidraw drawings use the obsidian-excalidraw skill.
---

# Obsidian notes

An Obsidian vault is a plain folder of Markdown files, and Obsidian picks up changes made on disk immediately.
Work on it directly with Read, Write, Edit, Glob and Grep. No plugin or MCP server is needed.

Helper: `node "${CLAUDE_SKILL_DIR}/scripts/obsidian.js" <command>`
- `vaults`: list the vaults on this machine (most recently used first, plus `$OBSIDIAN_VAULT` if set)
- `open <file>`: show a note or drawing in the Obsidian app
- `setup <vault path>`: give Claude Code permanent access to a vault (adds it to `permissions.additionalDirectories`
  in `~/.claude/settings.json`, with a backup)

## Find the vault first
1. If the vault path is already known in this conversation, use it.
2. Otherwise run `vaults`. With one vault, use it. With several, ask the user which one.
3. If you can't read or write files in the vault (it's outside the working directory), ask the user before running
   `setup "<vault path>"`. For this session only, they can also run `/add-dir "<vault path>"`.

## Ground rules
- Never write inside `.obsidian/` (app and plugin settings). Reading it is fine.
- Ask before deleting a note or folder, or before overwriting a note that already has content.
- Look before you create: `Glob` the folder first so you extend existing notes and don't create duplicates.
- Long notes: `Grep` first, then Read with offset/limit.
- After creating or changing a note the user will want to see, offer to `open` it.

## Match the vault's style
Before writing, read one or two notes in the same folder and copy their style. If the vault has no clear style, use this
default (the kit owner's style):
- No YAML frontmatter. Add properties only if the user asks for tags or metadata.
- Content starts directly with `## 1. Section` numbered H2 sections. A short intro line before them is fine.
- **Bold** key terms, short bullet lists, and `>` blockquotes for the one-line core idea.
- Flows drawn in plain text with `↓` / `→` on their own lines; tables and code blocks where useful.
- Emoji used sparingly as section markers, never as decoration everywhere.
- Folders group topics (`Project/Service/...`); file names describe the content (`REST API Design.md`), never "Untitled".

## Obsidian Markdown
- Link notes: `[[Note name]]`, `[[Note name|shown text]]`, `[[Note name#Heading]]`. Links resolve by file name,
  so new names must be unique in the vault. When a new note relates to existing ones, link them.
- Embed: `![[Note name]]`, `![[image.png]]`, or a drawing `![[HLD.excalidraw]]`.
- Callouts: `> [!note]`, `> [!tip]`, `> [!warning]` with the body on following `>` lines.
- Tags: `#topic/subtopic`. Mermaid code blocks render natively.
- File names must not contain `\ / : * ? " < > | # ^ [ ]`.

## Renaming and moving
Obsidian only rewrites links automatically when a note is renamed **inside the app**. When you rename or move a
file on disk, `Grep` the vault for `[[Old name` (and `![[Old name`) and update every link in the same change.
