# Rocky Translator

日本語を『プロジェクト・ヘイル・メアリー』のロッキー風に言い換える、iPhone向けPWAです。  
GitHub Pages のフロントから Gemini を使って変換します。

## Modes

このアプリは2通りで使えます。

- `Gemini API Key を端末に保存して直接使う`:
  個人利用ならこれが最短です。GitHub Pages に置いたPWAだけで動きます。
- `Cloudflare Worker の中継APIを使う`:
  APIキーをブラウザに置きたくない場合はこちら。公開運用向けです。

中継APIが有効ならそちらを優先し、無ければ端末保存のAPIキーを使います。

## Structure

- `index.html`: UI
- `styles.css`: UIスタイル
- `app.js`: フロントの画面制御、Gemini呼び出し、設定保存
- `config.json`: 中継APIの接続先設定
- `sw.js`: PWA用 Service Worker
- `backend/cloudflare-worker.js`: Gemini API を呼ぶ Cloudflare Worker ひな形
- `backend/wrangler.toml.example`: Worker デプロイ用サンプル設定

## Fastest Setup

### 1. GitHub Pages を開く

PWAを Safari で開きます。

### 2. APIキーを保存する

画面上部の `接続設定` に Gemini APIキーを貼り付けて `キー保存` を押します。  
このキーはこの端末のブラウザ保存領域にのみ保存され、リポジトリには入りません。

### 3. 使う

文章を入力して `変換 / TRANSLATE` を押します。  
iPhoneでは共有メニューから `ホーム画面に追加` するとPWAとして使えます。

## Recommended Public Setup

APIキーをブラウザに置きたくない場合は、Cloudflare Worker の中継APIを使います。

### 1. Worker をデプロイする

`backend/cloudflare-worker.js` を Cloudflare Worker としてデプロイします。

CLI例:

```powershell
cd backend
Copy-Item wrangler.toml.example wrangler.toml
wrangler secret put GEMINI_API_KEY
wrangler deploy
```

必要なら `ALLOWED_ORIGIN` を設定してください。

```toml
[vars]
ALLOWED_ORIGIN = "https://re-km.github.io"
```

### 2. 接続先を設定する

`config.json` の `translateEndpoint` に Worker の `/translate` URL を入れます。

例:

```json
{
  "translateEndpoint": "https://your-worker-name.your-subdomain.workers.dev/translate",
  "requestTimeoutMs": 30000,
  "modeLabel": "GEMINI RELAY",
  "directModel": "gemini-2.5-flash"
}
```

### 3. GitHub Pages に反映する

```powershell
git add .
git commit -m "Add Gemini-powered PWA flow"
git push
```

## Notes

- 変換品質はルールベースではなく Gemini 依存です。
- オフラインでもPWA自体は起動できますが、Gemini変換はオンライン接続が必要です。
- 端末保存APIキー方式は個人利用向けです。公開運用では中継API方式を推奨します。
- `config.json` に入れるのは公開URLだけで、APIキーは入れません。

## Official References

- Gemini API generateContent: https://ai.google.dev/api/generate-content
- Gemini API quickstart: https://ai.google.dev/gemini-api/docs/quickstart
