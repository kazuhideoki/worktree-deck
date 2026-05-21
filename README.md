# worktree-deck

git worktree × Codex CLI/APP × Zed によるセッション管理向け Raycast extension です。
汎用ツールとして整えることより、自分の作業環境で使うことを優先しています。設定値や運用ルールは各自の環境に合わせて調整してください。

## Setup

```sh
npm install
cp assets/.env.example assets/.env
```

必要に応じて `assets/.env` を編集してから Raycast で開発実行します。

```sh
npm run dev
```

Raycast に extension が読み込まれたら、必要な command を Raycast から実行します。`Worktree Status` は menu bar command のため、反映させるには Raycast で一度明示的に実行します。

## Commands

- `Worktree Deck`: git worktree と関連する Codex セッションを一覧するメイン画面
- `Worktree Status`: working / done などの件数を Raycast menu bar に表示する常駐表示

## Configuration

`.env` は `assets/.env` のみを参照します。主な設定値は次の通りです。

- `GIT_WORKTREE_PATH`: worktree 作成先のベースディレクトリ
- `CODEX_HOME`: Codex のホームディレクトリ
- `WORKTREE_DECK_SEARCH_DAYS`: セッション検索日数
- `WORKTREE_DECK_DONE_THRESHOLD_DAYS`: working を done 扱いにする経過日数
- `WORKTREE_DECK_STORAGE_DIR`: worktree-deck の storage 保存先

実行時に必要な場合は、次の値も環境変数で上書きできます。

- `WORKTREE_MAPPING_FILE`: `git_worktree_wrap.sh` が読む mapping.txt のパス
- `WORKTREE_REPO_ROOT`: `git_worktree_wrap.sh` の実行対象リポジトリルート

## Requirements

- Raycast
- Node.js / npm
- git
- gh（PR 作成機能を使う場合）
- bash
- rsync

## License

MIT
