# Zenn CLI

* [📘 How to use](https://zenn.dev/zenn/articles/zenn-cli-guide)

## dev.to への自動転載

Zenn の記事自動英訳（記事URLに `?locale=en` を付けると読める英語版）を使い、英語版を [dev.to](https://dev.to/quolu) へ転載する仕組み。

### 動作

毎日 09:00 JST に GitHub Actions が起動し、1実行につき:

1. `post-order.json` の時系列順で、まだ転載していない最も古い記事を1本選ぶ
2. Zenn 英語版が翻訳済みなら dev.to へ投稿する（未翻訳なら投稿せず順番を保持）
3. 本文中のブログ内部リンクは、転載済みの記事なら dev.to のリンクへ貼りかえる
4. 投稿時にリンク先が未転載だったリンクは、リンク先が出たあとで対象記事を自動更新して貼りかえる

投稿は1実行あたり1本（dev.to のレート制限対策）。既存記事は1日1本ずつ消化される。

### ファイル

| ファイル | 役割 |
|---|---|
| `.github/workflows/crosspost-devto.yml` | 毎日の cron 起動と手動実行 |
| `.github/scripts/crosspost-devto.mjs` | 転載処理の本体 |
| `post-order.json` | 転載する時系列順（ブログ公開日順）。新記事は Zenn フィードから自動で末尾に加わるため編集不要 |
| `crossposted-devto.json` | 転載済み記録（記事ごとに dev.to の URL・ID・未解決リンク） |

### 前提

- Zenn 側で記事の自動翻訳をオプトインで有効化していること
- リポジトリの Secrets に dev.to の API キーを `DEVTO_API_KEY` として登録していること

### 新しい記事を書いたとき

特別な操作は不要。Zenn に公開すればフィード経由で自動的に転載キューの末尾へ加わり、Zenn が英訳したあとに dev.to へ投稿される。
