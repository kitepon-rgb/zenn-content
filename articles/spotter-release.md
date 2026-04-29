---
title: "Claudeのツール呼び忘れを別Claudeに監査させたら、デーモンが74個立った話"
emoji: "👁️"
type: "tech"
topics: ["claudecode", "ai", "hooks", "oss", "npm"]
published: true
---

:::message
この記事は [Claude Code 始めました](https://kitepon-rgb.github.io/WebAICoding/) からの転載です。
:::

## きっかけ

ある日、Claudeに「今何時？」って聞いたら、推測で答えてきた。

別の日には、設定ファイルの中身を聞いたら、ファイル名から推測で説明してきた。`read_file` ツールがあるのに使わない。

最初は「Claudeも疲れてるのかな」くらいに思ってたけど、頻度が多い。プロンプトに「ツールを使ってね」って書いても、たまに忘れる。

ここで気づいた。**Claudeは「分からないと自覚できない」。だからツールを取りに行けない。**

「呼び忘れに気をつけて」とお願いしても、自分が「分かってない」と分かってないので、気をつけようがない。構造的な問題だった。

## やってみた

じゃあ別の目を置けばいい。

Bell (メインのClaude) とは別に、**ツールカタログを完全に把握した監査役のClaude (Haiku 4.5) をセッションごとに常駐させる**。Bellの発話予定と最終応答を並走で見て、ツールを呼び忘れてたら指摘する。

| 状況 | Bell の応答 | 監査役の指摘 |
|---|---|---|
| 「今日の天気は？」 | 推測で答える | `web_search` 使えるよ |
| 「この設定の中身は？」 | 名前から推測 | `read_file` 使えるよ |
| 「今何時？」 | 学習時点の時刻 | `current_time` 使えるよ |

ポイントは **Bellの自覚に頼らない** こと。Bellに「気をつけて」って書くんじゃなく、もう一人の目を物理的に置く。判定は2段階で、ユーザーが入力した瞬間（要請に対して使うべきツールを列挙）と、Bellが応答を返した直後（事実の断定に検証ツールを差し込めるか）に hook が走る。

これを `claude-spotter` という名前で作った。

## 公開した直後にやらかした

便利な設計だ、と自分では思った。`npm install -g claude-spotter` だけで全プロジェクトで自動有効化、何も設定いらない。最高じゃん。

公開して、自分で使い始めた。

64分後、デーモンが74個立ってた。

## 何が起きてたか

実セッションのログを掘ったら、74個のうち51個が [Throughline](https://github.com/kitepon-rgb/Throughline) (自分の別ツール) 由来だった。

Throughlineは内部で `claude -p` を呼ぶ。`claude -p` を呼ぶと SessionStart hook が走る。SessionStart hook で Spotter の daemon が立つ。Spotter の daemon は監査のために `claude -p` を呼ぶ。**…無限再帰じゃないけど、再帰的増殖**。

`postinstall` で `~/.claude/settings.json` に書き込んでたせいで、システム上のあらゆる Claude Code セッションが Spotter の hook を読み込む構造になってた。「全プロジェクト自動有効化」の代償。

5層の防御を入れて自分自身の再帰は止めたけど、**他ツール由来の `claude -p` には無防備**だった。これは仕組みの問題で、後付けのガードでは塞げない。

## 撤回した

`postinstall` の自動登録を撤回。`npm install` は CLI を使える状態にするだけにして、各プロジェクトで `spotter install` を明示的に打ってもらう。`<project>/.claude/settings.json` に hook を書く。

「全プロジェクトで自動」が便利だと思ってたけど、副作用の方がはるかに大きかった。本当は自動が理想で、ユーザーが各プロジェクトで `spotter install` を打つのは妥協。Claude Code の hook 機構が「セッション起源を識別」できれば自動でも安全にできるはずで、そうなったら戻したい。

## 次のバグ: 過去プロジェクトのツールが幽霊として残る

しばらく使ってると、別の症状が出た。

プロジェクトAでセッションを開いたら、監査役が「`mermaid_diagram` ツール使えるよ」と提案してきた。ところがこのプロジェクトに `mermaid` MCP は登録してない。

調べたら、過去にプロジェクトBで使ってた MCP のツール定義が、グローバルDBに残ってて、それがプロジェクトAでも参照されてた。「使えないツールを提案する」回帰。

監査役が使うツールカタログを **ローカルDB限定** に変えた (v1.2.0)。グローバルDBは「他プロジェクトで取得済みなら description だけ再利用するキャッシュ」に降格。各プロジェクトで毎回 discovery を走らせて、見つからなかったツールはローカルDBから消す (prune)。

## Windowsで .cmd 配布のMCPがspawn失敗する

もう一つ踏んだ。Windowsで `claude-mermaid` のような npm-global の `.cmd` 配布MCPを `spawn('claude-mermaid')` すると、ENOENTで即落ちる。

Node.jsの `spawn` は Windows で `CreateProcess` を直接呼ぶけど、`CreateProcess` は `.exe` しか解決しない (PATHEXT の `.cmd` は解決しない)。`cmd.exe /c` で包めば動く、という同じパターンを Spotter 自身が claude CLI起動で過去に踏んで直してたんだけど、**MCPサーバ起動経路にこのパターンを横展開し忘れてた** (v1.2.2 で修正)。

自分で踏んだ罠を、別の経路でまた踏む。これがあって [Caveat](https://kitepon-rgb.github.io/WebAICoding/post/caveat-release/) の必要性を強く感じた。同じ罠を二度踏まない仕組みがないと、こうなる。

## 現状

v1.2.4。Windows / macOS / Linux の CI が全部緑。

```bash
npm install -g claude-spotter
cd your-project
spotter install
```

ツールカタログは `spotter install` 時に自動収集、Claude Code 起動ごとに SessionStart hook がバックグラウンドで refresh する。手書きで管理する必要はない。

```bash
spotter status      # 稼働中の監査役一覧
spotter db list     # このプロジェクトのツールカタログ
spotter doctor      # 環境診断
spotter uninstall   # hook登録を解除
```

## まだ甘いところ

- **Stop hook の差し戻しは2連続表示になる**。Bellが応答を返した後にhookが走る仕様なので、補正応答を出すとユーザーは「最初の応答 + 補正応答」を続けて見ることになる。入力時 (UserPromptSubmit) で先回りできれば理想で、応答後は保険。
- **Haiku の timeout でユーザー入力がブロックされる**。fail-open (パスして通す) にするかは検討中。

## Throughline / Caveat との関係

Spotter は同じ作者が作った [Throughline](https://kitepon-rgb.github.io/WebAICoding/post/throughline-release/) と [Caveat](https://kitepon-rgb.github.io/WebAICoding/post/caveat-release/) と、**哲学を共有する別プロダクト**。

|  | Throughline | Caveat | Spotter |
|---|---|---|---|
| 思想 | 引き算 | 蓄積 | 足し算 |
| 対象 | コンテキストの肥大化 | 同じ罠を二度踏むこと | ツールの取りこぼし |
| 仕組み | hookで記憶を退避 | hookで過去ノートを浮上 | hookで監査役を並走 |

3つに共通するのは **「主体（Bell）に頼らない仕組み」**。3つとも同居できる。

## 要件

- Node.js 22.5+
- Claude Code 2.0+
- Claude Maxプラン（`claude -p` でHaiku 4.5を起動するため）

[Spotter — GitHub](https://github.com/kitepon-rgb/Spotter)

MIT。同じ問題で困ってる人がいたら、気が向いたら覗いてみてください。
