# worktree-deck ドメイン用語

最終確認日: 2026-07-26

このドキュメントは、`worktree-deck` で使う主要な言葉の意味を揃えるための用語集である。
実装ファイル名や関数名はここに書かず、コード構造が変わっても変わりにくい概念だけを扱う。

## Worktree

Git repository から切り出された作業用ディレクトリ。
`worktree-deck` では一覧の中心単位であり、repository、branch、path、作業状態、関連セッションをまとめて扱う。

## Repository

worktree の元になる Git repository。
同じ repository から作られた worktree は、一覧上で同じまとまりとして扱う。

## Repository Mapping

repository の実パスと、worktree 基準ディレクトリ配下で使う名前の対応。
表示対象の絞り込み、repository ごとのグループ化、worktree の作成先、branch 名の候補に使う。

## Branch

worktree が作業対象にしている Git branch。
一覧上の表示名、merge / pull / PR 作成、base ref 推定の基準になる。

## Base Ref

worktree の作業差分を比較する基準 ref。
merge 状態、ahead / behind、PR 作成時の base branch を判断するために使う。

## Merge Status

worktree が base ref に対してどの状態にあるかを表す分類。
主な状態は、同期済み、未マージ、作業ツリー dirty、commit なし、判定不能である。

## Ahead / Behind

base ref と worktree の HEAD の差分 commit 数。
作業が base より進んでいるか、base から遅れているかを一覧で判断するために使う。

## Session

Codex または Claude Code の作業ログから復元される作業単位。
worktree や repository に紐づき、タイトル、最新メッセージ、skill 利用履歴、作業中/完了、ユーザー入力待ちなどの状態を持つ。

## Session Provider

session を生成したエージェントの種別。
Worktree Deck では Codex を `ca`、Claude Code を `cc` として区別し、ログ探索、状態判定、起動・再開方法を切り替える。

## Review Session

Codex でレビューを目的とする session。
通常作業 session と区別し、一覧や詳細表示では重複表示や表示対象メッセージの扱いを変える。

## Auto Start

worktree 作成後に、選択した session provider の初回セッションをバックグラウンドで開始する方法。
Manual は worktree の作成と起動だけを行い、エージェントセッションを自動では開始しない。

## Display Snapshot

一覧表示に必要な worktree、repository mapping、session、Git metadata、起動アプリ情報をまとめた表示用の状態。
初期表示、session、Git・Pull Request の詳細を段階的に反映する。

## Display Cache

前回表示できた snapshot 相当の情報を、次回起動時に素早く復元するための保存値。
更新中や一部の外部 I/O 失敗時でも、最後に成功した表示状態を使えるようにする。

## Worktree Archive

worktree を削除せず、通常の一覧から Archived へ分ける表示状態。
Git worktree、branch、ローカルファイルは変更しない。

## Deleted Worktree

Git worktree を削除した後、branch が残っている場合に復元候補として保持する記録。
Archive とは異なり、元の worktree ディレクトリはすでに存在しない。

## Open App

worktree ごとに選ぶ起動先。
Preferred IDE または Codex App を選び、Codex App の場合は関連する thread も保持できる。

## Preferred IDE

Open App が IDE を指すときに使う既定の IDE。
Zed、Cursor、VS Code のような候補から選び、worktree 作成後やファイルを開く操作の既定値になる。

## Worktree Create Start Mode

worktree 作成フォームを Auto Start と Manual のどちらで開くかを表す既定値。
フォーム上では作成ごとに変更できる。

## Runtime Preferences

Raycast Preferences で管理する実行時の設定。
worktree の作成先、Codex home、セッション探索期間、完了扱いのしきい値、Claude Auto Start の認証情報など、実行環境ごとに変わる値を扱う。

## Application Settings

`worktree-deck` が自分で管理するアプリ内設定。
repository mapping、preferred IDE、Worktree Create Start Mode、worktree ごとの Open App など、Raycast Preferences ではなくアプリの操作から変える値を扱う。
