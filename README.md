# PocketTuner

iPhone で動く、GuitarTuna 風のギター／ベース／ウクレレ用チューナーです。
ネイティブアプリではなく PWA（Web アプリ）として作ってあるので、App Store を通さずに
Safari で開くだけで使え、「ホーム画面に追加」すると全画面のアプリとして起動します。

## 機能

- マイクで音を拾って、音名・オクターブ・ずれ（cent）をメーターで表示
- **自動モード**: 弾いた弦を自動で判定してハイライト
- **手動モード**: 弦をタップして狙いの弦を固定。参考音も鳴らせる
- チューニングが合うと緑色になり、0.5 秒キープで弦に ✓ が付く
- チューニングプリセット
  - ギター: スタンダード / ドロップD / 半音下げ / 全音下げ / ドロップC / DADGAD / オープンG / オープンD / オープンE / 7弦
  - ベース: 4弦 / ドロップD / 半音下げ / 5弦
  - ウクレレ: High G / Low G / バリトン
  - クロマチック（全音階）
- 基準ピッチ A4 の変更（415〜466 Hz）
- オフラインでも動作（Service Worker）、画面のスリープ防止
- 音声は端末内だけで処理され、どこにも送信されません

## iPhone で使う

マイクは **HTTPS** のページでしか使えないため、どこかに公開する必要があります。
一番簡単なのは GitHub Pages です。

1. このリポジトリの **Settings › Pages** を開く
2. **Build and deployment › Source** を「Deploy from a branch」にし、ブランチとフォルダ `/ (root)` を選んで保存
3. 数分後に `https://<ユーザー名>.github.io/<リポジトリ名>/` で開ける
4. iPhone の Safari でその URL を開き、「チューナーを開始」→ マイクを **許可**
5. 共有ボタン → **ホーム画面に追加** でアプリ化（任意）

同じ Wi-Fi 上の Mac から試す場合は `npm start` で `http://localhost:8080` が立ちますが、
iPhone からは HTTPS でないとマイクが使えない点に注意してください
（`localhost` は例外なので、Mac 上の Safari では動作確認できます）。

## 開発

```sh
npm test      # ピッチ検出のユニットテスト
npm start     # ローカルサーバー (http://localhost:8080)
```

- `js/pitch.js` — McLeod Pitch Method (NSDF) によるピッチ検出。Node でもブラウザでも動く
- `js/tunings.js` — 楽器とチューニングの定義。ここに追記すればプリセットが増える
- `js/app.js` — マイク入力、メーター、弦ボタン、参考音、設定など UI 全般
- `css/style.css` — スタイル（ダークテーマ、iPhone のセーフエリア対応）
- `sw.js` / `manifest.webmanifest` — PWA 用

## 動作環境

iOS 16.4 以降の Safari を想定しています。ホーム画面に追加した状態でもマイクが使えます。
