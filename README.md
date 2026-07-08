# Vault Link

Vault Link links a file or folder in this vault to a file or folder in another vault on your disk, so they share the exact same content. Edit it in either vault and the change shows up in both, since it's really just one file linked in two places.

Desktop only (requires filesystem access Obsidian doesn't expose on mobile).

## Quick start

1. Open the plugin settings and click **+ Add link**.
2. Under **Sync target vault**, start typing to pick another vault you've opened before, or paste/browse to its folder path directly.
3. By default the whole vault syncs to the root of the target vault. Click **Sync now** to link it for the first time — a link never syncs on its own until you've clicked this once, so you have a chance to set everything up (excludes, sync direction, etc.) first. After that it stays in sync automatically.
4. Use **Detach (unlink)** any time you want to break the link and make both copies independent again.

## Multiple files/folders per link

A link can sync more than just "the whole vault". Click **+ Add file/folder** to add specific files/folders to sync to the same target vault instead of (or alongside) the whole-vault default — use a separate link if you want to sync with a *different* vault.

If you add a specific file/folder alongside the whole-vault default, it's automatically excluded from the whole-vault side so it's only managed once, by its own entry — same for a folder added alongside one of its own subfolders.

Leaving "File or folder" blank (or typing `/`) means the whole vault. Your `.obsidian` config folder is excluded by default in that case (so plugin data, caches, and workspace layout don't get synced or slow things down); an **Also sync .obsidian** toggle appears when needed if you actually want it included.

## Excluding files/folders

Folders and the whole vault can set exclude patterns — comma-separated globs (e.g. `theme.css`, `*.css`, `assets/private/**`), or picked directly via **Exclude a specific file/folder**. This section is hidden for a single file, since there's nothing inside it to exclude.

Set excludes up *before* your first sync: they only stop future linking, they don't undo files that are already linked.

## Sync direction

Each link has a **Default sync direction** that applies to any file/folder that doesn't set its own, and each file/folder has its own dropdown that can override it.

- **Two-way** (default): a real symlink/hard link. Edit either side, both update instantly — no action needed from the plugin.
- **One-way**: this vault is authoritative. Syncing only ever copies from here to the target vault. Edits made directly in the target vault are overwritten on the next sync, and files created only in the target vault are never pulled into this vault. Useful when the target is more of a read-only mirror (e.g. publishing notes out) rather than a second vault you edit day-to-day.

One-way content edits are picked up automatically once things have been quiet for a few seconds, rather than on every keystroke, so it doesn't compete with active typing.
