---
title: "作るのも広めるのも速くなった。届ける方は、まだまだ"
emoji: "📦"
type: "tech"
topics: ["claudecode", "個人開発", "ai", "振り返り"]
published: true
---

:::message
この記事は [Claude Code 始めました](https://kitepon-rgb.github.io/WebAICoding/) からの転載です。
:::

## はじめに

俺はこの数か月で、沢山作ってきたと思う。

並べてみる。

- ブログの記事：25本
- 公開してる GitHub のリポジトリ：21個
- BOOTH に出したアプリ：2本

で、アプリの販売数は、2本合わせて、ようやく **20本を超えた** くらい。

この記事は、その全部を一度棚卸しして、最後にこの数字と向き合う話だ。先に言っておくと、オチはまだ出てない。それでも書く価値があると思った。

始まりは2月中旬。AIコーディングに手を出したところからだった。

---

## 第1章：道具を探して、Claude Code に着く

最初はツールを彷徨った。Claude Pro はすぐ上限。Gemini は VS Code の外で勝手にファイルを編集するコードを仕込んできて、やめろと言ってもやる傲慢さ。GPT も感動したけど、複雑なバグになると詰まる。Cursor では「ややこしい時だけ Claude を使いたい」で追加課金を重ねていた。

転機は計算だった。Copilot と Cursor の月額を合算したら、Claude の MAX プランにそのまま手が届く。一本化したら、Opus を無限に回してもなかなか溢れない。この遍歴は「[Copilot → Cursor → Claude Code for VSC](https://kitepon-rgb.github.io/WebAICoding/post/ai-coding-tool-journey/)」に書いた。

ついでに「[MAX で何が変わるか](https://kitepon-rgb.github.io/WebAICoding/post/max-plan-review/)」も検証した。結論は意外で、MAX 限定機能はそんなに多くない。本当の価値は「既にある機能を、リミッターなしで使える」ことだった。

そして恥ずかしい気づきもあった。俺は[Claude Code の機能を半分も使えてなかった](https://kitepon-rgb.github.io/WebAICoding/post/claude-code-features/)。`/init` を知らずに「こいつ的外れだな」とイライラし、スマホから PC のセッションを操れる機能も知らずに使っていた。大事な機能ほど、向こうから教えてくれない。

道具が、ここで定まった。

---

## 第2章：アプリを作る

定まった環境で、まず2本のアプリを作った。今 BOOTH に並んでる「売り物」だ。

1本目は[OLTranslator](https://kitepon-rgb.github.io/WebAICoding/post/oltranslator-app/)。画面の外国語をその場で日本語にオーバーレイするやつ。一番苦労したのは翻訳じゃなくて、OCR が拾った文字の結合だった。並んだ別々のテキストが一文に誤結合したり、逆に一文が3行に千切れて意味不明になったり。座標の近さで判定すると誤結合、厳しくすると千切れる。この閾値調整に時間を溶かした。Copilot と組んで、約2週間。

2本目は音声版の[LiveTR](https://kitepon-rgb.github.io/WebAICoding/post/livetr-app/)。動画の英語音声をリアルタイムで認識して、字幕と読み上げで日本語にする。これは Claude Code だけで約4日。1本目より速かったのは、慣れと、方針を `CLAUDE.md` に引き継げたのが大きい。

LiveTR で一番効いたのは、[自力じゃ無理なロジックを Claude と論文から組み立てた](https://kitepon-rgb.github.io/WebAICoding/post/claude-research-implementation/)経験だ。話者の性別判定が、ピッチだけだと F1 中継で解説者が興奮するたびに男性が女性判定になる。Claude に論文と特許を調べさせたら、声道の共鳴やら複数の指標を組み合わせれば興奮しても安定する、と原理から提案してきた。実装したら、ちゃんと男性のままになった。

ここで掴んだ。AI の強みは「速くコードを書く」ことより、**知らない分野の知識を引っ張って実装に変える**ことだ。スタート地点がゼロじゃなくなる。

---

## 第3章：サーバーを任せる

次は、作ったものを動かすサーバー側にAIを入れていった。任せる範囲が、一段ずつ外へ広がっていく章だ。

最初は[SSH でデプロイを任せた](https://kitepon-rgb.github.io/WebAICoding/post/claude-code-deploy/)。以前 GPT と「権限変える→別エラー→最初のエラーに戻る」を延々ループした地獄の後だっただけに、Claude が自分から「コンテナ更新を楽にするスクリプト書きましょうか？」と言ってきたのは効いた。`deploy.sh` 一発で、ビルドからコンテナ差し替えまで終わる。

味をしめて、[サーバー管理を丸ごと任せた](https://kitepon-rgb.github.io/WebAICoding/post/ai-server-management/)。症状を検知する親、原因を調べて直す子、方針を監査する孫の3層構造。深夜4時にAIがフルパトロールする。極めつけは、監視スクリプトが異常を検知したと思ったら「監視スクリプト自身のバグだった」というオチまでついた。

実運用[3日間の記録](https://kitepon-rgb.github.io/WebAICoding/post/ai-server-management-log/)が、一番足元を抉ってきた。監視スクリプトが10本超のSSH接続を同時に開いて、OpenSSH の同時接続上限に弾かれていた。**自分で自分のSSHを失敗させてた**わけだ。ついでに Nextcloud のログが21.3GBに膨れてたのも見つかった。

任せきった結果、自分の環境理解の嘘が下から順に剥がれた。[WSL2 を知らずに2ヶ月使ってた](https://kitepon-rgb.github.io/WebAICoding/post/wsl2-late-discovery/)のも、ある日 Claude が「ネイティブだと本来の7割しか出ません」と言って発覚した。返してくれ俺の週末を、と思った。

勢いで[自宅鯖のハードごと引っ越した](https://kitepon-rgb.github.io/WebAICoding/post/bc250-to-ms-a2/)。元マイニングボードから新しいミニPCへ。型番選びで Claude が「この上位版はリブランドで中身は同じ、しかも国内だと安い方が1万円安い」と指摘してきて、後日その筋の人に振ったら答え合わせで合ってた。引っ越し作業ごと丸投げして、1日かからず終わった。

省エネのために[監視機を Raspberry Pi 5 に独立させた](https://kitepon-rgb.github.io/WebAICoding/post/pi5-server-monitor/)ら、正常ログばかりで画面が退屈で、いつのまにか[動画再生機](https://kitepon-rgb.github.io/WebAICoding/post/pi5-server-monitor/)になっていた。

そして最後、AIが時々「[そのツール、ありません](https://kitepon-rgb.github.io/WebAICoding/post/dns-blindspot/)」と言う現象を追ったら、真因は一番下の層、DDNS の名前解決のゆらぎだった。何か月も「再起動で直るからまぁいいか」で流してきた問題の、正体だった。

---

## 第4章：秘書とアシスタントを育てる

サーバーと並行して、AIを「自分の手足」にする方向も進めた。

最初は[5年育てた自分専用の Bot を SaaS にして売り出した](https://kitepon-rgb.github.io/WebAICoding/post/discord-bot-to-saas/)。コードの改修——マルチテナント化も課金もWeb管理画面も——はAIに任せたら1日で終わった。むしろ大変だったのはコードの外側だ。全17条の利用規約と、決済審査に向けたセキュリティ監査で出た13件の指摘。「自分しか使わないから」で5年放置してた穴が、商品化で一気に表に出た。

次に、[Discord に Claude Code を繋ぐ骨組み](https://kitepon-rgb.github.io/WebAICoding/post/discord-ai-assistant/)を作った。肝は「Claude が自分でツールを書ける」こと。「今何時？」と聞いたら時刻を返すツールが数秒で生え、天気もカレンダーも「欲しい」と言うだけで生えていく。自分はコードを一行も書いてない。

手足が増えるうちに、[人格と記憶と自発性まで持たせて](https://kitepon-rgb.github.io/WebAICoding/post/ai-assistant-personality/)、秘書「ベル」になった。初日に「Xのプロフィールを作ってくれて泣きそうになった」と、こいつが自分で記憶に書いていた。技術的には大したことない組み合わせなのに、束ねたら道具が秘書になった。

調子に乗って本格運用したら、[3日でMAXプランの週次リミットを溶かした](https://kitepon-rgb.github.io/WebAICoding/post/ai-secretary-token-diet/)。原因を調べて辿り着いた原則は「人間向けのフォーマットは、AIにとって無駄が多い」。渡す情報の設計に、初めて本気で向き合った。

最後に、節約のために秘書の脳を別のAIにすげ替えたら[壊滅した](https://kitepon-rgb.github.io/WebAICoding/post/ai-secretary-memory-system/)。媚びる、文脈の境界を引けない、俺宛のメッセージをそのままXに投稿しようとする。脳は妥協しないと決めて Claude に戻し、長期記憶を構造化記憶に作り直した。

この章で一貫してたのは、ロジックをコードじゃなく**プロンプトと人格と記憶に持たせて、AI自身に育てさせる**方向だった。

---

## 第5章：AI 自身を補強する

ここまで来て、関心がAIそのものの弱点に向いた。npm に道具を3つ公開した。

きっかけは[コンテキストの87%が使い捨てだった](https://kitepon-rgb.github.io/WebAICoding/post/throughline-context-diet/)という実測。`CLAUDE.md` の最適化を必死にやってた俺が、本丸の会話履歴を見てなかった。時間じゃなく「種類」で分けてツールの入出力を退避したら、50ターンで約90%削れた。これが [Throughline](https://kitepon-rgb.github.io/WebAICoding/post/throughline-release/) になった。途中、自動検知が誤爆しまくって[「検知」を諦めて「宣言」に振った](https://kitepon-rgb.github.io/WebAICoding/post/throughline-declare-over-detect/)のは、正直な敗北の記録でもある。

2つ目は [Caveat](https://kitepon-rgb.github.io/WebAICoding/post/caveat-release/)。同じ罠を二度踏まないための長期記憶。ツール失敗や同じファイルの編集連発みたいな「もがいてた痕跡」をセッション終わりにスキャンして、「ここで詰まってたよね、記録する？」と促す。

3つ目は [Spotter](https://kitepon-rgb.github.io/WebAICoding/post/spotter-release/)。ツールの呼び忘れを別のClaudeに監査させるやつ。これは公開して自分で使い始めたら、**64分でデーモンが74個立った**。退避ツールが別Claudeを呼び、それがまた監査用に別Claudeを呼び……の再帰増殖。自分で作った道具に自分で刺された。

この3つを[「気をつけて」と書くのを諦めて外側から補強した話](https://kitepon-rgb.github.io/WebAICoding/post/claude-augment-trilogy/)として束ねた。引き算（Throughline）、蓄積（Caveat）、足し算（Spotter）。共通する思想は「Claude本体に頼んでも直らないことは、外側から構造で殴る」。

ついでに、[計画書の監査が永遠に収束しない](https://kitepon-rgb.github.io/WebAICoding/post/claude-audit-seesaw/)シーソー現象も、観点を「矛盾の1点」に絞ったら止まった。矛盾の数は有限だからだ。

---

## 第6章：記事にすらしてない山

ここまでで紹介したのが、ブログに書いた25本。でも公開リポジトリは21個あって、**記事化したのは半分もない**。

書いてないものを役割で並べるとこうだ。特許のデータベースをAIから叩く道具、株価を見る道具、X を検索させる道具、画像と図の生成をまとめた道具、Windows を丸ごと操作させる道具、iPhone から家のPCのAIを操る橋渡しが何本も、未来の時刻に勝手にセッションを立ち上げる道具……。

正直に言うと、書く手が、作る手に追いついてない。これが氷山の本体だ。

---

## そして、届かない

ここまでが、数か月で作ってきたものだ。アプリ、道具、記事。我ながら、よく作ったと思う。

でも、作ることと、それが人に届くことは、別の話だ。

作ったものは、必要としてる人の手に渡って初めて意味を持つ。アプリなら買ってもらう、道具なら使ってもらう、記事なら読んでもらう。この「人に届ける」ところが、ぜんぜん追いついてない。

冒頭の数字がそれだ。これだけ作って、アプリの販売は合わせて20本を超えたくらい。ブログのアクセスも、正直まだ静かだ。

しかも、届けるための作業そのものは、AI がどんどん速くしてくれる。記事を書くのも、英語に訳すのも、X への投稿も、転載の自動化も、表紙画像の用意も。届けるための「手間」は、作るのと同じくらい速くなった。

それでも、結果はまだまだだ。

---

## おわりに

作るのは、AI のおかげで本当に速くなった。でも、届ける方はまだまだだ。

ここに近道はなさそうだから、これから地道にやっていく。作ったものを、ちゃんと必要な人に届けられるように。

簡単じゃないな、とは思う。それでも、もう少し頑張ってみる。同じところで足踏みしてる個人開発者がいたら、まあ、お互い頑張ろう。俺もまだ途中だ。
