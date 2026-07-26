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

## Review Session

Codex でレビューを目的とする session。
通常作業 session と区別し、一覧や詳細表示では重複表示や表示対象メッセージの扱いを変える。

## Auto Start

worktree 作成後に、Codex または Claude Code の初回セッションをバックグラウンドで開始する方法。
Manual は worktree の作成と起動だけを行い、エージェントセッションを自動では開始しない。

## Worktree Archive

worktree を削除せず、通常の一覧から Archived へ分ける表示状態。
Git worktree、branch、ローカルファイルは変更しない。

## Deleted Worktree

Git worktree を削除した後、branch が残っている場合に復元候補として保持する記録。
Archive とは異なり、元の worktree ディレクトリはすでに存在しない。

## Open App

worktree ごとに選ぶ起動先。
IDE または Codex App を選び、Codex App の場合は関連する thread も保持できる。
