# Rocky Translator

日本語の文章を『プロジェクト・ヘイル・メアリー』のロッキー風に変換する、静的Webアプリです。  
GitHub Pagesでそのまま配信でき、iPhoneではホーム画面に追加してPWAとして使えます。

## Features

- 完全オフライン対応の静的PWA
- 日本語入力をロッキー風の短文に変換
- iPhone Safariからホーム画面に追加可能
- GitHub Pages向けの相対パス構成

## Files

- `index.html`: 画面構成
- `styles.css`: UIスタイル
- `app.js`: 変換ロジックと画面制御
- `manifest.json`: PWA設定
- `sw.js`: オフライン用Service Worker

## Local Preview

静的ファイルとして動作します。ローカルで確認するときは、簡易HTTPサーバー経由で開いてください。

例:

```powershell
python -m http.server 8000
```

その後、`http://localhost:8000/` を開きます。

## Deploy To GitHub Pages

1. GitHub にリポジトリを作成して push します。
2. GitHub の `Settings > Pages` で、`Deploy from a branch` を選びます。
3. Branch は `main`、フォルダは `/ (root)` を指定します。
4. 公開URLを iPhone の Safari で開きます。
5. 共有メニューから `ホーム画面に追加` を選ぶと、PWAとして使えます。

## Notes

- 変換は辞書ベース + 文末ルールベースです。
- 外部APIやバックエンドは使っていません。
- 作品の雰囲気を楽しむためのパロディ表現であり、厳密な再現ではありません。
