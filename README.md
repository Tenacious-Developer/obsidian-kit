# obsidian-kit

A Claude Code plugin that lets Claude work inside your Obsidian vault:

- **obsidian-notes**: create, read, search, edit, move and link notes and folders, in your vault's own style.
- **obsidian-excalidraw**: create architecture diagrams and flowcharts as Excalidraw drawings, read and explain existing
  drawings, and edit them (add, rename, recolour, move, delete boxes and arrows).

No MCP server is needed. A vault is a folder of Markdown files, so Claude edits it directly. A bundled Node script
reads and writes the Excalidraw plugin's `.excalidraw.md` format, including compressed drawings.

## Requirements

- [Claude Code](https://code.claude.com)
- [Node.js](https://nodejs.org) 18 or later
- [Obsidian](https://obsidian.md) with the **Excalidraw** community plugin (for drawings)

## Install

In a terminal:

```
claude plugin marketplace add <github-username>/obsidian-kit
claude plugin install obsidian-kit@obsidian-kit
```

Then start Claude Code and ask it to set up your vault:

> Find my Obsidian vault and set it up

Claude finds the vault from Obsidian's own vault list and, with your OK, adds it to
`permissions.additionalDirectories` in `~/.claude/settings.json`, so every project can use it.

## Use

- "Create a folder System_Design with a note on caching"
- "Read my Airline/Overview note and make an architecture diagram of it in Excalidraw"
- "Explain what my replit/HLD drawing shows"
- "Add a Payment Service to the Flight Booking HLD, connected from Booking Service"

Skills can also be run directly: `/obsidian-kit:obsidian-notes`, `/obsidian-kit:obsidian-excalidraw`.

## Update and remove

```
claude plugin marketplace update obsidian-kit
claude plugin uninstall obsidian-kit@obsidian-kit
```

## Develop

Edit the files, then check and try the plugin without installing it:

```
claude plugin validate .
claude --plugin-dir .
```

Layout:

```
.claude-plugin/plugin.json        plugin name and version
.claude-plugin/marketplace.json   makes this repo installable with "marketplace add"
skills/obsidian-notes/            notes skill + scripts/obsidian.js (find vaults, open, setup)
skills/obsidian-excalidraw/       drawing skill + scripts/excalidraw.js (read, create, add, write)
```

`scripts/vendor/` bundles [lz-string](https://github.com/pieroxy/lz-string) (MIT) and
[fractional-indexing](https://github.com/rocicorp/fractional-indexing) (CC0), so nothing needs `npm install`.

## License

MIT
