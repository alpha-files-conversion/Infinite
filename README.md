# Infinite — authorized YouTube media delivery

A small Vercel project with:

- `index.html`: the pure-black / white Infinite frontend.
- `api/info.js`: validates a YouTube URL and returns metadata.
- `api/download.js`: extracts an authorized MP4 video or M4A audio stream server-side and streams it to the browser.
- `lib/youtube.js`: URL validation, channel allowlisting, format selection, and lazy `youtubei.js` initialization.

The extractor is server-side. The frontend receives metadata only; it does not receive a direct stream URL.

## Important deployment limits

This project intentionally uses the reliable directly downloadable formats exposed by the selected YouTube clients:

- MP4 video with audio at 360p.
- M4A audio at the best available audio format.

Vercel Functions are time-limited. The download function is configured for a maximum of 300 seconds, so this is suitable for short or moderate authorized files, not a full media archive. For long or high-resolution files, use a long-running Node/Docker service with persistent storage instead of a free serverless function.

## Run locally

Requirements: Node.js 20 or later.

```bash
npm install
npx vercel dev
```

Open the local URL shown by Vercel, usually `http://localhost:3000`.

To restrict downloads to your contracted channels, copy `.env.example` to `.env.local` and set:

```dotenv
ALLOWED_CHANNEL_IDS=UCxxxxxxxxxxxxxxxxxxxxxx,UCyyyyyyyyyyyyyyyyyyyyyy
```

An empty value allows any video that the configured extractor can access. Set the allowlist in production if your agreement covers only specific channels.

## Deploy to Vercel

### One-click dashboard flow

1. Put this folder in a GitHub repository.
2. Sign in at Vercel and choose **Add New → Project**.
3. Import the repository.
4. Leave the framework preset as **Other**. No build command or output directory is needed.
5. In **Settings → Environment Variables**, add `ALLOWED_CHANNEL_IDS` for Production, Preview, or both.
6. Click **Deploy**.
7. Open the generated Vercel URL. The frontend calls `/api/info` and `/api/download` on the same origin.

### CLI flow

```bash
npm install
npx vercel login
npx vercel
npx vercel --prod
```

When prompted, use the current directory as the project and accept the defaults.

## API contract

### `POST /api/info`

Request:

```json
{ "url": "https://www.youtube.com/watch?v=VIDEO_ID" }
```

Response:

```json
{
  "video": {
    "id": "VIDEO_ID",
    "title": "…",
    "author": "…",
    "channelId": "…",
    "duration": 213,
    "thumbnail": "https://…",
    "isLive": false,
    "isUpcoming": false
  },
  "formats": [
    { "type": "video", "label": "MP4 video · 360p", "extension": "mp4" },
    { "type": "audio", "label": "M4A audio · best available", "extension": "m4a" }
  ]
}
```

### `GET /api/download`

```text
/api/download?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DVIDEO_ID&type=video
```

`type` can be `video` or `audio`. The endpoint replies with `Content-Disposition: attachment`, so a phone browser can save the file normally.

## Security notes

- Do not put a YouTube or Google API key in `index.html`.
- The API key pasted into a chat or repository should be rotated/restricted in Google Cloud if it is still active.
- `Access-Control-Allow-Origin: *` is included because it was requested. For a private production deployment, replace `*` with your exact frontend origin and add authentication/rate limiting.
- Keep the channel allowlist enabled when the contract is limited to particular channels.
- Do not add cookies, OAuth tokens, or private account credentials to this project or to frontend code.

## If the contract requires the official YouTube Data API

The Data API can be added for metadata/authorization checks with a server-only `YOUTUBE_API_KEY`. It does not by itself return downloadable MP4/M4A media. The stream-delivery method must remain the one explicitly approved in the contract.
