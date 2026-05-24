# Worktree Deck

Worktree Deck is a Raycast extension for tracking git worktrees and related Codex sessions. It is designed for local development workflows that use git worktree, Codex CLI/App, and optionally Zed.

## Setup

```sh
npm install
```

```sh
npm run dev
```

After Raycast loads the extension, set the required preferences when prompted, then run the commands from Raycast. `Worktree Status` is a menu bar command, so run it once from Raycast to enable the menu bar item.

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

Process environment variables with the same names as the preferences can override those values in local development.

## Requirements

- Raycast
- Node.js / npm
- git
- gh, when using pull request actions
- bash
- rsync

## Privacy

Worktree Deck reads local git worktree metadata and local Codex session files from the paths you configure. It does not send this data to an external service.

## License

MIT
