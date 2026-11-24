# My Crypto Smash

スマホを **傾けて・振って・はじいて**、ヒーローのマレットをフィールドで滑らせ、
エネミーをはじき飛ばして GUM を集めるインクリメンタルゲームです。
My Crypto Heroes の非公式二次創作（無料・非営利）です。

## 遊び方

- **傾ける**：マレットが坂を転がるように滑る
- **振る**：振った方向へ勢いよく飛び出す
- **長押し→スワイプ→離す**：指で動かしてはじく（押している間は傾き・振りを使わない）
- **水平リセット**（左下）：いま持っている角度を「水平」にする

エネミーを 15 体倒すとボス。ボスを倒すとステージクリアで、ヒーローが手に入ります。
GUM で攻撃力・滑り・磁石・仲間ヒーローなどを強化していきます。

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
