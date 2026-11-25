SHIROSEHOME 旧版移植版（検証前）
旧版 app(20261121-120101).zip の管理画面・ログイン・各機能の処理を移植。
React/Next.js/npm は公開時不要。独自のDOM描画処理 runtime.js を使用。
js/core/config.js に Project URL と Publishable Key を設定すること。秘密鍵は記載しない。
GitHub Pages の公開ルートに HTML/CSS/JS を配置する。file:// ではなく HTTP(S) で開く。
YouTube取得は同梱の supabase/functions/youtube-video/index.ts を Edge Function に別途デプロイし、YOUTUBE_API_KEY を Secrets に設定する必要あり。supabase フォルダは公開サイトに配置不要。
既存DBの変更SQLはなし。旧版の操作処理を移植したが、実DB接続・ブラウザ操作検証は未完了。JS構文検査のみ実施。
SNSアイコンの外部取得（unavatar.io）は旧版の仕様を維持。

画面別の JS は js/pages、共通処理は js/core と js/shared に配置。旧 admin.js は分割済み。旧版と混在させず新しいフォルダに展開してください。
