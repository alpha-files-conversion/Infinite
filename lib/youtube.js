"use strict";

let runtimePromise;

/** * youtubei.js is loaded lazily so Vercel can reuse the initialized client * between warm invocations without doing a cold-start import on every request. */
async function getRuntime() {
  if (!runtimePromise) {
    runtimePromise = import("youtubei.js").then(
      async ({ Innertube, UniversalCache, Utils }) => ({
        youtube: await Innertube.create({
          // Vercel's filesystem is ephemeral; keep the cache in memory only.
          cache: new UniversalCache(false),
          generate_session_locally: true,
        }),
        streamToIterable: Utils.streamToIterable,
      })
    );
  }

  return runtimePromise;
}

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtube-nocookie.com",
]);

function extractVideoId(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) {
    return null;
  }

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(url.protocol)) return null;

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!YOUTUBE_HOSTS.has(hostname)) return null;

  let id = null;
  if (hostname === "youtu.be") {
    id = url.pathname.split("/").filter(Boolean)[0] || null;
  } else if (url.pathname === "/watch") {
    id = url.searchParams.get("v");
  } else {
    const match = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/i);
    id = match ? match[1] : null;
  }

  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

function publicVideoInfo(info) {
  const basic = info.basic_info || {};
  const thumbnails = Array.isArray(basic.thumbnail) ? basic.thumbnail : [];
  const thumbnail =
    thumbnails[0]?.url || `https://i.ytimg.com/vi/${basic.id}/hqdefault.jpg`;

  return {
    id: basic.id,
    title: basic.title || "Untitled video",
    author: basic.author || basic.channel?.name || "Unknown channel",
    channelId: basic.channel_id || basic.channel?.id || null,
    duration: Number.isFinite(basic.duration) ? basic.duration : null,
    thumbnail,
    isLive: Boolean(basic.is_live || basic.is_live_content),
    isUpcoming: Boolean(basic.is_upcoming),
  };
}

function assertAuthorized(info) {
  const allowed = (process.env.ALLOWED_CHANNEL_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  // Set ALLOWED_CHANNEL_IDS in Vercel for a contract-restricted deployment.
  if (allowed.length && !allowed.includes(info.channelId)) {
    const error = new Error("This channel is not enabled for downloads.");
    error.statusCode = 403;
    throw error;
  }

  if (info.isLive || info.isUpcoming) {
    const error = new Error(
      "Live and upcoming videos are not supported by this endpoint."
    );
    error.statusCode = 422;
    throw error;
  }
}

function downloadOptions(type) {
  if (type === "audio") {
    // iOS currently exposes a directly downloadable M4A audio format.
    return {
      client: "IOS",
      type: "audio",
      quality: "best",
      format: "mp4",
    };
  }

  // Android currently exposes the reliable MP4 video+audio fallback.
  // Keeping this fixed avoids returning a silent video-only stream.
  return {
    client: "ANDROID",
    type: "video+audio",
    quality: "360p",
    format: "mp4",
  };
}

async function getInfo(videoId, client = "ANDROID") {
  const { youtube } = await getRuntime();
  return youtube.getBasicInfo(videoId, { client });
}

async function prepareDownload(videoId, type) {
  const options = downloadOptions(type);
  const { youtube } = await getRuntime();
  const info = await youtube.getBasicInfo(videoId, options);
  const metadata = publicVideoInfo(info);
  assertAuthorized(metadata);

  let format;
  try {
    format = info.chooseFormat(options);
  } catch (error) {
    const wrapped = new Error(
      "No compatible media format is available for this video."
    );
    wrapped.statusCode = 422;
    wrapped.cause = error;
    throw wrapped;
  }

  const stream = await info.download(options);
  return { metadata, format, stream };
}

function safeFilename(title, extension) {
  const cleaned =
    String(title || "infinite-download")
      .replace(/[\\/:*?"<>|\u0000-\u001F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "infinite-download";

  return {
    ascii: `${cleaned.replace(/[^\x20-\x7E]/g, "_")}.${extension}`,
    utf8: `${cleaned}.${extension}`,
  };
}

module.exports = {
  getRuntime,
  extractVideoId,
  publicVideoInfo,
  assertAuthorized,
  getInfo,
  prepareDownload,
  safeFilename,
};
