# Vault Link

Vault Link is an Obsidian plugin that links a file or folder in this vault to a file or folder in another vault on your disk, so they share the exact same content. Edit it in either vault and the change shows up in both, since it's really just one file linked in two places. You can also exclude specific files/folders from a link (e.g. themes) so they stay independent per vault.

## How to use it

1. Open the plugin settings and click "Add link".
2. Under "Sync Files/Folders", enter the file or folder in this vault you want to sync.
3. Under "Other vault's folder", enter (or browse to) the root folder of the other vault on disk.
4. Optionally set a "Synced Target" folder inside the other vault to place it in. Leave it blank to place it at the root of the other vault.
5. Optionally add exclude patterns (comma-separated) for files/folders you want to keep independent per vault.
6. Click "Sync now" to link them. From then on, links are kept in sync automatically.
7. Use "Detach (unlink)" if you ever want to break the link and make both copies independent again.

## Upcoming

- [ ] Block sync from target

## Known Problems

1. Root (/) has linking conflicts (will drop .obsidian folder support)
