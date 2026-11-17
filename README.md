# obsidian-kit

A Claude Code plugin that lets Claude work inside your Obsidian vault:

- **obsidian-notes**: create, read, search, edit, move and link notes and folders, in your vault's own style.
- **obsidian-excalidraw**: create architecture diagrams, flowcharts and mind maps as Excalidraw drawings, read and
  explain existing drawings, and edit them (add, rename, recolour, move, delete boxes and arrows). Nodes can carry
  technology logos, AWS/Azure/GCP service icons, or images.
- **excalidraw-design**: how to design a diagram that explains something, plus a render-and-look loop. Claude renders
  the drawing to a PNG with Excalidraw itself, looks at it, fixes what's wrong, and renders again.

No MCP server is needed. A vault is a folder of Markdown files, so Claude edits it directly. A bundled Node script
reads and writes the Excalidraw plugin's `.excalidraw.md` format, including compressed drawings.

## Requirements

- [Claude Code](https://code.claude.com)
- [Node.js](https://nodejs.org) 22 or later (18 works for everything except rendering)
- [Obsidian](https://obsidian.md) with the **Excalidraw** community plugin (for drawings)
- For rendering: Chrome, Edge or Chromium, and internet access (Excalidraw is loaded from esm.sh). No other install needed.
- For icons: internet access the first time each icon is used (it's then saved in your vault).

## Install

In a terminal:

```
claude plugin marketplace add Tenacious-Developer/obsidian-kit
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
- "Make a mind map of everything in my Docker notes"
- "Draw the HLD of a food delivery app with AWS icons"

## Icons

- **Technology logos** work out of the box: [Devicon](https://devicon.dev) (colour logos, MIT) and
  [Simple Icons](https://simpleicons.org) (~3,400 brands, CC0). Each icon is downloaded the first time it's used and
  saved under `Excalidraw/icons/` in your vault.
- **AWS service icons** (`aws:lambda`, `aws:s3`, ...) are the official
  [AWS Architecture Icons](https://aws.amazon.com/architecture/icons/). AWS allows them in diagrams but not
  redistribution, so they aren't in this repo. The first time a diagram uses one, the kit downloads AWS's package
  (~15 MB) and saves ~800 icons under `Excalidraw/icons/aws/`. No setup needed.
- **Azure, Google Cloud or your own icons**: download the pack, then ask Claude to *"import the icons from <zip>"*.
  This runs `excalidraw.js icons import <zip> --set gcp`, for example.
- Brand logos and service icons are trademarks of their owners. Use them to identify the products in your diagrams.

Skills can also be run directly: `/obsidian-kit:obsidian-notes`, `/obsidian-kit:obsidian-excalidraw`,
`/obsidian-kit:excalidraw-design`.

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
skills/obsidian-excalidraw/       drawing skill + scripts/excalidraw.js (read, create, add, write, render, icons)
skills/excalidraw-design/         design method + render-and-look loop
```

The design approach is inspired by Cole Medin's
[excalidraw-diagram-skill](https://github.com/coleam00/excalidraw-diagram-skill); this kit's version is an independent
rewrite for Obsidian.

`scripts/vendor/` bundles [lz-string](https://github.com/pieroxy/lz-string) (MIT) and
[fractional-indexing](https://github.com/rocicorp/fractional-indexing) (CC0), so nothing needs `npm install`.

## License

MIT
