# Worktree Deck

Worktree Deck is a Raycast extension for tracking git worktrees and related Codex sessions. It is designed for local development workflows that use git worktree, Codex CLI/App, and optionally Zed.

## Setup

```sh
npm install
cp assets/.env.example assets/.env
```

Edit `assets/.env` for your local paths, then run the extension in Raycast development mode.

```sh
npm run dev
```

After Raycast loads the extension, run the commands from Raycast. `Worktree Status` is a menu bar command, so run it once from Raycast to enable the menu bar item.

## Commands

- `Worktree Deck`: Lists git worktrees and related Codex sessions.
- `Worktree Status`: Shows working and done session counts in the Raycast menu bar.

## Configuration

The extension reads configuration from `assets/.env`. The main settings are:

- `GIT_WORKTREE_PATH`: Base directory where git worktrees are created.
- `CODEX_HOME`: Codex home directory.
- `WORKTREE_DECK_SEARCH_DAYS`: Number of days to search for Codex sessions.
- `WORKTREE_DECK_DONE_THRESHOLD_DAYS`: Number of days after which a working session is treated as done.
- `WORKTREE_DECK_STORAGE_DIR`: Storage directory for Worktree Deck state.

The following environment variables can also override runtime behavior when needed:

- `WORKTREE_MAPPING_FILE`: Path to the `mapping.txt` file used by `git_worktree_wrap.sh`.
- `WORKTREE_REPO_ROOT`: Repository root used by `git_worktree_wrap.sh`.

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
