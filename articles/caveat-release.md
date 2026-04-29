---
title: "Caveat を npm に公開した — 同じ罠を二度踏まないための長期記憶レイヤ"
emoji: "🪤"
type: "tech"
topics: ["claudecode", "ai", "hooks", "oss", "npm"]
published: true
---

:::message
この記事は [Claude Code 始めました](https://kitepon-rgb.github.io/WebAICoding/) からの転載です。
:::

[Caveat](https://github.com/kitepon-rgb/Caveat) っていうClaude Code用の長期記憶レイヤをnpmに公開した。

## 何をするか

Claude Codeを使ってると、実装そのものより「他人の仕様」の解明に時間が溶ける。GPUドライバのバージョン制約、ネイティブモジュールのビルド失敗、IDEの癖、特定OSでだけ起きるパス問題。一度ハマって解決したのに、半年後に別プロジェクトで同じ罠を踏む。AIに聞いても「分からない」とは言わずに推測で動くから、また同じ時間を溶かす。

Caveatは「**一度書き留めておけば**、次に同じ場面に出くわした瞬間に自動で関連メモが浮上する」レイヤ。人間が思い出せなくても、AIが知らなくても、関連性は構造的に検出される。

## 3つの発火点

Caveatは hook で3カ所に仕込まれる。

| 発火点 | いつ動くか | 何をするか |
|---|---|---|
| プロンプト送信時 | プロンプトが送られた瞬間 | プロンプトを分解して、過去のメモと2語以上が共起するエントリだけ浮上 |
| ツールエラー時 | Claudeのツール呼び出しが失敗した瞬間 | バックグラウンドで検索を走らせ、次のターンに既知罠として通知 |
| セッション終了時 | セッションが閉じる時 | 会話ログから「もがきシグナル」を抽出。新規罠として記録すべきものがあればAIに促す |

「もがきシグナル」っていうのは、ツール失敗・同じファイルを何度も編集・Web検索の連発・Bashコマンドの再実行みたいな、**AI自身は自覚してないけど客観的には苦戦してた痕跡**。これを最後にスキャンして、「今日のセッション、ここで詰まってたよね？罠として記録する？」って促す。

## キーワードリストを持たない設計

検索のロジックは **共起FTS** だけ。事前に「rtxって単語が来たらGPU関連メモを出す」みたいなキーワード対応表は一切持ってない。

代わりに、入力プロンプトを分解して、**2個以上の単語が同じエントリに同時に出てくる** ものだけを浮上させる。`make` とか `new` みたいな汎用的な単語は単独では発火しないけど、技術的な単語が2つ以上重なると一致する。

新しい罠カテゴリが増えても、`entries/<slug>.md` を1つ追加するだけ。コードもキーワード表も触らなくていい。トリガーが自己拡張する。

## ナレッジは markdown-in-git

データの実体は普通のmarkdownファイル。SQLiteは検索用の派生インデックスで、消しても再構築できる。

```
~/.caveat/own/
├── entries/
│   ├── rtx-5090-cuda-12-init-fail.md
│   ├── windows-node-spawn-cmd-enoent.md
│   └── ...
└── .git/
```

Obsidianのvaultとしてそのまま開ける。チームで共有したければ普通に `git push` すればいい。中央サーバはない。

## Public / Private の2層

エントリには `visibility` がある。

- **Public**: 同じ外部ツール・仕様を使えば誰でも踏める罠（GPU、ビルド環境、IDE、バージョン制約）
- **Private**: コードを読むだけでは復元できないプロジェクト固有の文脈（意図的な非標準挙動、上流修正待ちの回避策、自分専用の慣習）

判定はClaudeが自動でやる。迷ったらprivate寄り（漏洩防止）。明示的に「これはprivateで」と指示すれば最優先される。

pre-commit hookが `private` のエントリを共有repoに混入させない仕組みも入ってる。

## インストール

```bash
npm install -g caveat-cli
caveat init
```

`caveat init` は、

- `~/.caveat/` を初期化
- Claude CodeにMCPサーバを登録
- `~/.claude/settings.json` に3つのhookを追加

を一発でやる。既存のhook設定は壊さない（マージ前にバックアップを作る）。

```bash
caveat search "rtx"        # 既存メモを検索
caveat serve               # 読み取り専用ポータルを起動
caveat uninstall           # Claude連携だけ解除（データは残す）
```

## 中央DBは持たない

過去のバージョンには共有DBがあって、`caveat push` で全員で1つのナレッジを育てる構想だった。これは廃止した。

赤の他人からの貢献を自動で検証するのは原理的に無理だと判断したから。LLMをゲートにしても回避できるし、長期に潜伏する攻撃は静的検査で見つからない。だから信頼は「自動検査」じゃなくて「**社会的文脈**」で引く。誰のrepoを購読するかで信頼の輪郭を決める方式に変えた。

```bash
caveat community add https://github.com/acme-corp/caveats
caveat pull
```

詳しい経緯はまた別の記事で書く。

## 要件

- Node.js 22.5+
- Claude Code（hooks対応）
- pnpm（開発時のみ）

## ステータス

v0.11.1、203 tests passing。個人と小規模チームが想定ユースケース。

[Caveat — GitHub](https://github.com/kitepon-rgb/Caveat)

MIT。バグ報告・PRも歓迎。
