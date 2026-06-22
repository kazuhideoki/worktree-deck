# ca / cc セッション対応の現状と方針

最終確認日: 2026-06-22

## 1. このドキュメントの目的

`worktree-deck` が扱う「Session」のうち、エージェント種別ごとの対応状況と、追加対応で触る境界を整理する。
実装の細部より、どこが種別に結合していて、種別を増やすときに何を共通化すべきかを残すことを優先する。

## 2. 用語

- **ca** = Codex。セッションの読み込み・一覧・詳細・メニューバー集計に対応済み。
- **cc** = Claude Code。一覧・状態・メニューバー集計まで対応済み。詳細メッセージは未対応。

どちらも、ローカルのセッションログファイルから Session を復元し、worktree に紐づけて表示する対象である。

## 3. 現状サマリ

| 機能 | ca (Codex) | cc (Claude Code) |
|------|-----------|------------------|
| セッション収集 | 対応済み | 対応済み |
| 一覧タイトル/状態 | 対応済み | 対応済み |
| 詳細メッセージ | 対応済み | 未対応 |
| メニューバー集計 | 対応済み | 対応済み |
| 起動・App 連携 | 対応済み | 範囲外(本対応では扱わない) |

cc は一覧表示・状態判定・メニューバー集計までは実装済み。残作業は、詳細メッセージ表示の provider 別ローダー化、subagent 判別、共通型の整理が中心。

## 4. ca（Codex）の現状

### 4.1 保存場所と収集

- `CODEX_HOME`（既定 `~/.codex`）配下の `sessions/YYYY/MM/DD/*.jsonl`。
- `WORKTREE_DECK_SEARCH_DAYS` 日分の日付フォルダを遡って全走査する（`infrastructure/codex-session-file-store.ts` の `collectSessionFiles`）。
- mtime + size をキーにした LocalStorage キャッシュ（titles-cache）で再解析を抑える。
- 巨大行・画像 payload は読み飛ばし、先頭/末尾の制限読みと全量フォールバックを使い分ける。

### 4.2 パース

- `domain/session-log-parser.service.ts`。Codex rollout JSONL（各行 `{type, payload, timestamp}` ラッパー）を1行ずつ解析する。
- 抽出物（`ParsedSessionLog`）: cwd 群 / title / status(working|done) / latestMessage / startedAt / sessionKind / threadId / parentThreadId / reviewTurnIds / skillUsages / isWaitingForUser。
- title は最初の user メッセージ（または goal objective）から生成。
- status は `response.*` ライフサイクル、`task_complete`、review モード遷移、`waitingForUser` の call_id 追跡などから判定する。
- sessionKind は `session_meta.payload.source` から main / subagent / review / reviewSubagent / autoReview を判別し、一覧には main / review / reviewSubagent のみ出す。

### 4.3 worktree との紐付け

- パースで得た cwd を worktree path に前方一致でマッチ（`matchPath`）。

### 4.4 一覧・詳細・メニューバーへの流れ

- 一覧: `loadTitlesForPaths` → `attachWorktreeTitles` で `Worktree.titleEntries`（`WorktreeTitle[]`）を付与。`application/worktree-deck-snapshot.usecase.ts` 経由で表示 snapshot に載る。
- 詳細: `findLatestSessionFileByPath` / `findFirstSessionFileByPath`、`loadSessionMessages` / `loadLatestSessionMessages`（`worktreeSessionFileDependencies` 経由）。`loadLatestSessionAnswer` は別経路（`worktree-store.ts` 由来）。
- メニューバー: `worktree-status-menu-bar.tsx` が状態件数を集計。

### 4.5 共通型と接続点（種別への結合箇所）

- 型が2系統に分かれている点に注意（cc 追加時の最初の論点）:
  - `infrastructure/worktree-types.ts`: `WorktreeTitle` / `SessionKind` / `SessionStatus` / `SessionMessage` / `SessionSkillUsage` を **`domain/session-log-parser.service.ts`（= ca パーサ）から re-export**。主に `codex-session-file-store` が参照。
  - `application/worktree-title.entity.ts`: `WorktreeTitle` を**独立に再定義**（ca パーサ由来は `SessionKind` / `SessionSkillUsage` のみ）。snapshot usecase・display cache・data-store・`composition-root`・UI の多くはこちらを参照。
  - いずれも型が ca 実装に紐づくうえ、`WorktreeTitle` の定義が二重化している。
- `composition-root.ts` の注入は一部 provider 対応済み:
  - `loadWorktreeDeckTitlesSnapshotDependencies` ← ca/cc を束ねる `loadMergedTitlesForPaths`, `attachWorktreeTitles`
  - `worktreeSessionFileDependencies` ← まだ `codex-session-file-store` の `findFirst/LatestSessionFileByPath`, `loadSessionMessages` 等
  - **詳細メッセージ対応ではここが次の cc provider 差し込み口**。

## 5. cc（Claude Code）の差分と対応状況

### 5.1 保存場所と収集（対応済み）

- `~/.claude/projects/<cwd を変換した名前>/<session-uuid>.jsonl`。変換は cwd の英数字以外（`/`・`.`・`_` など）をすべて `-` に置換する規則。
- フォルダ名が cwd 由来なので、worktree path から対象フォルダを直接特定できる。日付走査も本文の cwd タグ抽出も不要。
- 各行に `cwd` / `gitBranch` を持つ。変換は不可逆なため、フォルダ名で当たりを付け、行内 `cwd` で確証する。worktree のサブディレクトリ起動分はフォルダ名の前方一致で拾う。
- 実装は `infrastructure/claude-session-file-store.ts`。探索ルートは既定 `~/.claude/projects`、または `CLAUDE_CONFIG_DIR/projects`。
- mtime + size をキーにした LocalStorage キャッシュで再解析を抑える。

### 5.2 行スキーマ（一覧解析は対応済み）

- `{type:"user"|"assistant", message, cwd, ...}` のフラット形式（Anthropic Messages API 形）。`message.content` は string か `[{type:text|thinking|tool_use|tool_result|image}]`。
- title は `ai-title` エントリ（`aiTitle`）を最優先、無ければ最初の user。
- subagent は同一ファイル内の行の `isSidechain` フィールドで判別する想定（Task/サブエージェント使用時に `true` の行が混在。本環境のログでは未観測）。現状は未実装で、cc は常に `sessionKind: "main"` として扱う。
- ノイズ除外対象（行の `.type` 値）: `attachment` / `mode` / `permission-mode` / `pr-link` / `system` / `file-history-snapshot` / `queue-operation` などの付随イベント。加えて `isMeta:true` を持つ行（`isMeta` は `.type` ではなくフィールド）。
- 実装は `domain/claude-session-log-parser.service.ts`。一覧向けに title / cwd 群 / status / latestMessage / startedAt / isWaitingForUser を抽出する。

### 5.3 status 判定（対応済み）

- 明示ライフサイクルが無いので、末尾の付随イベントを飛ばし「最後の会話エントリ」で判定する。
- done: 末尾 assistant の `stop_reason=end_turn`。
- working: 未完了 tool_use / tool_result / user 入力で終わっている。
- 待ち: `AskUserQuestion` / `ExitPlanMode` を、`tool_use.id` ↔ user content の `tool_result.tool_use_id` で突き合わせて未完了を追跡する（ca の `waitingForUserCallIds` と同型）。
- permission / sandbox 承認待ちは、`~/.claude/sessions/*.json` の live session から `status: "waiting"` かつ `waitingFor` が `permission prompt` / `sandbox request` のものだけを user waiting として反映する。
- mtime 経過（`WORKTREE_DECK_DONE_THRESHOLD_DAYS`）で working→done に倒すのは ca と共通。
- review の概念は無いため、sessionKind は main / subagent のみに簡素化（ca の review 重複除外ロジックは不要）。ただし現状は subagent 判別未実装。

### 5.4 一覧・メニューバー接続（対応済み）

- `composition-root.ts` の `loadMergedTitlesForPaths` で ca の `loadTitlesForPaths` と cc の `loadClaudeTitlesForPaths` を並列取得し、同じ `Worktree.titleEntries` に混在させる。
- `WorktreeTitle.provider` に `"cc"` を付与し、UI 側で provider に応じたアイコン表示ができる。
- メニューバー集計は merged titles を使うため、cc の working / done / waiting も集計対象になる。

### 5.5 詳細メッセージ（未対応）

- `SessionDetailView` は `sessionPath` を受け取れるため cc のファイルを選択対象にはできる。
- ただし `worktreeSessionFileDependencies` は現在も `codex-session-file-store` の `loadLatestSessionMessages` / `loadSessionMessages` を注入している。
- cc の JSONL を `SessionMessage[]` に変換する詳細用 parser / loader は未実装。現状では、cc の一覧タイトルから詳細を開いても本文は正しく表示できない前提で扱う。

## 6. 決定方針

- **一覧表示**: ca と cc を混在表示する（worktree ごとに両方のセッションが並ぶ）。`WorktreeTitle` に provider 種別を持たせ、UI で区別する。
- **status 精度**: cc も ca と同等まで作り込む（末尾を精密解析）。
- **抽象化**: 収集とパースは provider ごとに別実装、出力（`ParsedSessionLog` / `WorktreeTitle`）を共通契約にする。`matchPath`・キャッシュ骨格・snapshot / 詳細 / メニューバーは provider 非依存に保つ。

## 7. cc 追加で触る範囲（スコープ）

- 完了: `domain/claude-session-log-parser.service.ts` — cc 一覧向け行パーサ。
- 完了: `infrastructure/claude-session-file-store.ts` — projects 収集 + キャッシュ + 紐付け + live waiting 反映。
- 一部完了: `WorktreeTitle` に provider 種別を追加。表示キャッシュも provider を保持する。
- 完了: `loadTitlesForPaths` 相当を ca/cc マージにし、`composition-root.ts` で両 provider を束ねる。
- 完了: 一覧 / メニューバーで provider を区別して扱う。最新 assistant メッセージは provider アイコンで表示する。
- 未完了: 詳細メッセージの provider 別 loader。
- 未完了: 共通型を provider 非依存へ整理（`worktree-types.ts` の re-export と `application/worktree-title.entity.ts` の `WorktreeTitle` 二重定義の両方を解消）。
- 未完了: cc subagent 判別。

## 8. スコープ外（今回は触らない）

- Codex / Claude の起動・App 連携（`codex-app-*`, `start-*-initial-session`, open-app 系）。
- CI 設定（本ブランチでは未変更）。

## 9. 未決の論点

- cc の探索ルート設定: env は `CLAUDE_CONFIG_DIR` で実装済み。Preferences として露出するかは未決。
- 共通型の置き場所: ca パーサからの re-export と `worktree-title.entity.ts` の `WorktreeTitle` 二重定義を統合し、provider 非依存の型ファイル（例 `domain/session-types.ts`）へ切り出すか。
- `WorktreeTitle` の provider 種別の型（`"ca" | "cc"`）は実装済み。UI 表現は最新 assistant メッセージの provider アイコン表示まで実装済みで、セッション詳細画面や選択画面でさらに表示するかは未決。
- cc 詳細メッセージ loader を、既存 `worktreeSessionFileDependencies` の関数内で provider/path 判定するか、`WorktreeTitle.provider` を詳細表示まで明示的に渡すか。
