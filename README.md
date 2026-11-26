# My Crypto Smash

スマホを **傾けて・振って・はじいて**、ヒーローのマレットをフィールドで滑らせ、
エネミーをはじき飛ばして GUM を集めるインクリメンタルゲームです。
My Crypto Heroes の非公式二次創作（無料・非営利）です。

## 遊び方

古いゲームコーナーに閉じこめられた主人公が、呪われたピンボールで GUM を稼ぎ、「入金口」にノルマを納めて脱出をめざします。

- **引っぱって離す**：打ち出しの通路から球を打ち出す（押している間は傾き・振りを使わない）
- **傾ける**：打ち出した球を少し曲げる
- **振る**：台を揺らす
- **水平リセット**（左下）：いま持っている角度を「水平」にする

1 回のプレイは 40 秒のピンボール（フリッパーは自動）。ノルマは 10 段階で、納品額は 200 GUM から毎回 4 倍。各ノルマは 3 プレイ以内に納めないと GAME OVER です。
プレイと納品で手に入るエンブレムで、台の仕掛け（ギミック）・エクステンション（スコアの効果。同じシリーズを重ねてレアリティを上げる）・マレットのレベル（基礎ポイント）・スキルツリーを買い、ノルマを納めるたびに Limited を 1 つ選びます。
ノルマ 10 を納めれば部屋から出られます（通常のエンディング。スキルツリーを持って最初から）。仕掛けを買い足して台に宿るピエロをジョーカーに戻してからノルマ 10 を納めるとラストステージ（ボスラッシュ）。突破すれば真のエンディングです。

センサーは HTTPS のページでしか使えません。iOS では「はじめる」を押したときに出る許可を「許可」にしてください。

## 開発

```sh
git clone --recurse-submodules https://github.com/bearko/MyCryptoSmash
npm install
npm run dev      # 同じ Wi-Fi のスマホからも開ける（センサーは HTTPS が必要なので、スマホでの確認は公開先で）
npm test
npm run build
```

素材は [bearko/mycryptoheroes](https://github.com/bearko/mycryptoheroes) をサブモジュール（`vendor/mycryptoheroes`）として読み込み、
`scripts/sync-assets.mjs` が使うものだけを `public/mch/` に写します。

## 公開（Cloudflare）

Cloudflare Workers の静的配信です（`wrangler.jsonc`、`dist/` を配信）。
Workers Builds でこのリポジトリをつなぎ、ビルドコマンド `npm run build`、デプロイコマンド `npx wrangler deploy` を設定します。
サブモジュールが取得されていない場合は、ビルドの最初（`scripts/sync-assets.mjs`）で取得します。

## ライセンス

ソースコードと文書は MIT。My Crypto Heroes の画像・BGM・効果音は対象外です（[LICENSE](LICENSE)）。
