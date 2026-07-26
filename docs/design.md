# Worktree Deck 設計

最終確認日: 2026-07-26

## このドキュメントの目的

このドキュメントは、Worktree Deck が提供する価値、システムの主要な責務、外部システムとの境界を説明する。
実装の層構造と依存規則は [architecture.md](architecture.md)、用語の意味は [domain.md](domain.md) を参照する。

## 提供する価値

Worktree Deck は、複数の Git worktree と、それぞれに関連するローカルのエージェントセッションを Raycast からまとめて扱うための個人向け開発ツールである。

利用者は worktree を中心に、次の情報と操作へ移動できる。

- repository と branch
- base ref に対する Git の状態
- GitHub Pull Request
- Codex と Claude Code のセッション
- worktree の作成、起動、更新、マージ、名称変更、削除、復元
- worktree 作成後のエージェントセッション開始

ターミナル、IDE、エージェントアプリを行き来するときも、作業単位となる worktree を見失わないことを重視する。

## システムの主要責務

### Worktree の一覧化

設定された基準ディレクトリから Git worktree を探索し、repository mapping によって表示対象を絞り込む。
一覧では worktree と元 repository を同じ repository 単位で扱う。

### 開発コンテキストの集約

worktree ごとに branch、base ref、ahead / behind、merge status、Pull Request、起動アプリを関連付ける。
Codex と Claude Code のローカルセッションを探索し、タイトル、状態、最新メッセージ、ユーザー入力待ちを一覧へ加える。

### Repository 操作の仲介

worktree の作成、pull、merge、Pull Request 作成、branch 名変更、削除と復元を、対象と結果を確認できる Raycast の操作として提供する。
実行そのものは Git、GitHub CLI、ローカルファイルシステムなどの外部機能へ委譲する。

### 作業開始の支援

worktree 作成時には、手動で開始するか、Codex または Claude Code の初回セッションをバックグラウンドで開始するかを選べる。
作成後に開く対象は、利用者が選んだ IDE または Codex App とする。

### 応答性と継続性の確保

前回表示できた情報を先に復元し、worktree、セッション、Git metadata、Pull Request を段階的に更新する。
外部情報の取得に時間がかかる場合でも、利用可能な一覧と操作を先に提示する。

## 主要な処理の流れ

### 一覧を開く

1. Raycast Preferences とアプリ内設定を読み込む。
2. worktree の探索結果または再利用可能なキャッシュを取得する。
3. repository mapping を適用して表示対象を決める。
4. Codex と Claude Code のセッション情報を関連付ける。
5. Git metadata、base ref、Pull Request、起動アプリを追加して表示を更新する。

### Worktree を作成する

1. repository、branch、base ref、開始方法、起動アプリを利用者が指定する。
2. Git worktree を作成し、必要な関連設定を保存する。
3. Auto Start の場合は、選択したエージェントで初回セッションを開始する。
4. 作成結果を一覧へ反映し、選択したアプリで開く。

### 既存の Worktree を操作する

対象 worktree の現在状態から実行計画を組み立て、必要な確認を経て Git や GitHub CLI を実行する。
削除時に branch を残す場合は、一定期間、復元候補として扱う。

## 外部システムとの境界

| 外部システム | Worktree Deck が利用するもの | 主な制約 |
|---|---|---|
| Raycast | 画面、Preferences、LocalStorage、通知 | Raycast Extension の実行環境に依存する |
| ローカルファイルシステム | worktree、設定、キャッシュ、セッションログ | 読み書き可能なローカルパスに限る |
| Git | worktree と branch の操作、差分・状態の取得 | 対象 repository と Git コマンドが必要 |
| GitHub CLI | Pull Request の取得と作成 | 対象 repository への認証が必要 |
| Codex | セッション探索、Auto Start、Codex App 連携 | ローカルの認証情報と CLI / App の利用可否に依存する |
| Claude Code | セッション探索、Auto Start、再開コマンド | バックグラウンド起動では明示的な OAuth token が必要 |
| IDE | worktree とセッションファイルを開く | 選択した IDE がインストールされている必要がある |

## 設計原則

### Worktree を中心に情報を結び付ける

repository、branch、セッション、Pull Request を別々の一覧にせず、実際の作業場所である worktree に関連付ける。
これにより、表示と操作の対象を同じ単位で判断できる。

### ローカルの情報を優先する

worktree、Git metadata、エージェントセッション、アプリ設定はローカルから取得する。
外部サービスが利用できない場合も、ローカルで確認できる範囲の一覧と操作を残す。

### 重い情報は段階的に更新する

初期表示に必要な情報と、セッション・Git・Pull Request の詳細取得を分ける。
キャッシュは応答性のために利用するが、更新後の情報で置き換えられる一時的な表示として扱う。

### 非表示と削除を区別する

Archive は一覧上の整理だけを行い、Git worktree を変更しない。
削除は Git worktree を対象とし、branch を残した場合だけ復元候補を保持する。

## 現在の制約

- repository mapping が表示対象と worktree の配置を結び付けるため、初回利用時に mapping の登録が必要である。
- Codex と Claude Code は一覧・状態表示に対応しているが、アプリ内のセッション本文解析は Codex 形式のみを扱う。Claude Code のセッションファイルは IDE や既定アプリで開いて確認する。
- GitHub CLI、Codex、Claude Code、IDE が未導入または未認証の場合、その外部機能を使う操作は実行できない。
- キャッシュを先に表示するため、更新完了までは古い情報が一時的に見える場合がある。
