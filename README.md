# Worktree Deck

Worktree Deck is a Raycast extension for tracking git worktrees and related Codex sessions. It is designed for local development workflows that use git worktree, Codex CLI/App, and optionally Zed.

## Commands

- `Worktree Deck`: Lists git worktrees and related Codex sessions.
- `Worktree Status`: Shows working and done session counts in the Raycast menu bar.

## Configuration

The extension reads configuration from Raycast Preferences > Extensions > Worktree Deck. The main settings are:

- `GIT_WORKTREE_PATH`: Worktree directory under your home directory. Default: `~/.worktree-deck/worktrees`.
- `CODEX_HOME`: Codex home directory. Default: `~/.codex`.
- `WORKTREE_DECK_SEARCH_DAYS`: Number of days to search for Codex sessions.
- `WORKTREE_DECK_DONE_THRESHOLD_DAYS`: Number of days after which a working session is treated as done.

Worktree Deck stores local state in `~/.worktree-deck/storage`.

Defaults are provided for the required preferences, so the extension can start without extra setup. Adjust them from Raycast Preferences only if your local paths differ. `Worktree Status` is a menu bar command, so run it once from Raycast to enable the menu bar item.

## Requirements

- Raycast
- Git, for worktree listing and worktree operations
- Codex CLI, when using Auto Start or Codex App actions
- GitHub CLI (`gh`), when creating pull requests
- Zed, VS Code, or Cursor, only when opening a worktree in that IDE

Missing optional tools are reported when you use the related action. The main worktree list does not require `gh` or an IDE to be installed.

## Development

```sh
npm install
```

```sh
npm run dev
```

Use Raycast Preferences > Extensions > Worktree Deck to adjust local development paths when needed.

## Privacy

Worktree Deck reads local git worktree metadata and local Codex session files from the paths you configure. It does not send this data to an external service.

## License

MIT
