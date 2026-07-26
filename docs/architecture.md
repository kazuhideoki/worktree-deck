# Worktree Deck アーキテクチャ

最終確認日: 2026-07-26

## このドキュメントの目的

このドキュメントは、Worktree Deck の実装における責務分割、依存規則、データの所有境界を定義する。
プロダクトの価値とシステム全体の責務は [design.md](design.md)、用語の意味は [domain.md](domain.md) を参照する。

## 実装構造

| 区分 | 主な責務 | 外部 I/O |
|---|---|---|
| `src/domain` | 状態の判定、値の正規化、ポリシー、セッションログの解釈 | 持たない |
| `src/application` | ユースケースの手順、エンティティ、外部依存を表すポート | ポート経由のみ |
| `src/interface-adapters` | application のポートと具体的な外部処理の接続 | 一部の adapter がコマンド・ファイル処理も担当する |
| `src/infrastructure` | Git、GitHub CLI、ファイル、環境設定、LocalStorage、外部アプリとの接続 | 担当する |
| Composition Root | application が使う依存の組み立てと UI への公開 | 具体実装を参照する |
| UI | Raycast の画面、表示状態、ユーザー操作、ユースケース呼び出し | Raycast API と画面固有のファイル操作に限る |

`src/lib` は移行前の処理が残る領域であり、新しい責務の配置先にはしない。
新規実装では、対象の判断を domain、処理手順を application、外部処理を infrastructure に置き、接続が必要な場合だけ interface-adapters を使う。

## 主要な設計判断

| 判断対象 | 採用する構成 | 採用しない構成 | 理由 | 代償 |
|---|---|---|---|---|
| 責務分割 | domain、application、外部接続、UI を分ける | UI や store に判断と外部処理をまとめる | Git や Raycast から独立して、判定とユースケースを検証できるようにする | ポートと依存の組み立てが増え、単純な処理でもファイルをまたぐ |
| 一覧取得 | 初期表示、セッション、詳細情報を段階的に更新する | すべての外部情報を取得してから表示する | セッションログや GitHub の取得を待たず、利用可能な一覧を先に表示する | 更新途中に新旧の情報が一時的に混在し、状態のマージが必要になる |
| データ保存 | 永続データをファイル、再生成可能な状態を LocalStorage に分ける | すべてを同じ保存機構へ置く | worker と画面の双方から必要な設定を共有しつつ、表示キャッシュを失敗しても主要処理を止めない | 保存先が複数になり、データの所有者と復旧方法を区別する必要がある |
| セッション対応 | provider ごとにログ探索・解析を分け、表示情報だけを共通化する | Codex と Claude Code を1つのログ形式として解析する | 保存形式と状態判定が異なるため、provider 固有の変更を他方へ波及させない | 共通型への変換と provider 別のテストが必要になり、未共通化の処理が残りやすい |

## 依存規則

### 維持する境界

- domain は他のプロジェクト層へ依存しない。
- application は domain と同じ application 内の型・ユースケースを参照できるが、interface-adapters、infrastructure、UI、lib へ依存しない。
- UI は infrastructure と lib を直接 import しない。
- UI は依存組み立て関数を呼ばず、Composition Root が公開した解決済み依存を利用する。
- 外部システム由来の値は、application または domain へ渡す前に adapter / infrastructure で必要な形へ変換する。
- 永続化するか、どの状態を残すかという判断は application または domain が担い、保存処理は infrastructure が担う。

これらのうち、UI と lib に関する import 制約、および UI での依存組み立て禁止は層制約テストで検証する。

### 現在の移行境界

interface-adapters と infrastructure の分離、および Composition Root への依存組み立て集約は完了していない。
一部の infrastructure は application の use case や interface-adapters を内部で組み立て、一部の interface-adapters は Node.js のコマンド・ファイル処理を直接持つ。

既存コードの説明としてこの状態を認めるが、新しい同種の接続点は増やさない。
変更時には、外部処理を infrastructure、ポートへの変換を interface-adapters、全体の組み立てを Composition Root へ寄せられるかを判断する。

この移行状態では、層をまたぐ既存依存を経由して責務が再び混ざることと、現在の層制約テストだけではすべての逆向き依存を検出できないことが残余リスクとなる。
interface-adapters を独立した層として徹底するか、単純な接続を Composition Root と infrastructure へ集約するかは未決であり、大きな依存整理を行うときに決定する。

## 一覧データの構成

一覧データは、初期表示、セッション、詳細情報の3段階で組み立てる。

1. 初期表示では、worktree、repository mapping、起動アプリを取得し、利用可能なら表示キャッシュを適用する。
2. セッション段階では、Codex と Claude Code のタイトル・状態を取得して worktree に関連付ける。
3. 詳細段階では、Git metadata、base ref、ahead / behind、Pull Request を追加する。

UI はこの段階を個別の外部処理として実装せず、application が返す snapshot を表示状態へ反映する。
再読み込み中は、取得済みの値を不要に空へ戻さず、新しい結果が得られた単位で更新する。

## 設定とデータの所有境界

| データ | 所有先 | 扱い |
|---|---|---|
| worktree 基準ディレクトリ、Codex home、セッション探索期間、完了判定期間、Claude OAuth token | Raycast Preferences | command 起動時に実行環境へ反映する |
| repository mapping、General Settings、worktree ごとの起動アプリ、明示的なセッションタイトル、削除履歴、job state | `~/.worktree-deck/storage` | Worktree Deck が所有する永続データ |
| worktree 一覧、セッション解析結果、表示 snapshot、選択、Archive、フォーム下書き | Raycast LocalStorage | 再生成可能なキャッシュまたは UI 状態 |
| base ref | Git branch config を優先し、worktree 単位の保存値を補助に使う | branch と比較基準の関係を保持する |
| Codex セッション | 設定された Codex home | 読み取り対象であり、Worktree Deck は所有しない |
| Claude Code セッション | `CLAUDE_CONFIG_DIR` または既定の Claude ディレクトリ | 読み取り対象であり、Worktree Deck は所有しない |

Claude Auto Start の OAuth token は worker へ環境変数で渡し、job state へ保存しない。
ファイル保存領域の場所は Raycast Preferences から変更しない。

## Agent セッション境界

Codex と Claude Code は保存形式と状態判定が異なるため、ログ探索と一覧解析を provider ごとに分ける。
一覧へ渡すタイトル、状態、更新日時、ユーザー入力待ち、provider は共通の表示情報として扱う。

現在、共通のセッション型の一部は Codex 用パーサーの型を再利用しており、application と infrastructure に類似した表示型が残っている。
また、セッション本文ローダーは Codex 形式だけを解析するため、Claude Code の本文表示は provider 別の実装へ分離できていない。
provider 追加や本文表示を変更するときは、探索、一覧解析、本文解析の3つを別の境界として扱う。

共通のセッション型を置く場所と、本文ローダーへ provider を渡す方法は未決である。
Claude Code の本文表示へ着手するときに、一覧型の重複解消と合わせて決定する。

## 境界を表す命名

- 外部依存を表す application のポート型は `*Dependencies` とする。
- ポートへ具体実装を接続する関数は `create*Dependencies` とする。
- 外部処理のまとまりを型として表す場合は `*Infra` とする。

ファイル名、export 形式、テスト配置などの実装規約は、リポジトリの開発ガイドに従う。

## 変更時チェックリスト

- 変更する判断、処理手順、外部処理がそれぞれ適切な区分に置かれている。
- application が concrete な外部実装を import していない。
- UI が infrastructure を直接 import せず、依存を組み立てていない。
- 新しい依存の接続点が Composition Root または責務の明確な adapter に集約されている。
- 永続データと再生成可能なキャッシュを混同していない。
- Codex / Claude Code 固有の処理を共通型へ漏らしていない。
- 層制約テストと変更対象のユースケーステストが通過している。
