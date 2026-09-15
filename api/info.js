"use strict";

const {
  extractVideoId,
  prepareDownload,
  safeFilename,
  getRuntime,
} = require("../lib/youtube");
const {
  setCors,
  sendJson,
  readJson,
  messageForClient,
} = require("../lib/http");

function queryFromRequest(req) {
  try {
    return new URL(req.url || "/", "http://localhost").searchParams;
  } catch {
    return new URLSearchParams();
  }
}

function getDownloadRequest(req, body) {
  const query = queryFromRequest(req);
  return {
    url: body?.url || query.get("url") || "",
    type: body?.type || query.get("type") || "video",
  };
}

function waitForDrain(res) {
  return new Promise((resolve) => {
    const cleanup = () => {
      res.removeListener("drain", onDrain);
      res.removeListener("close", onClose);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      resolve();
    };
    res.once("drain", onDrain);
    res.once("close", onClose);
  });
}

async function pipeStream(stream, streamToIterable, res) {
  for await (const chunk of streamToIterable(stream)) {
    if (res.destroyed) return;
    if (!res.write(Buffer.from(chunk))) await waitForDrain(res);
  }
  if (!res.destroyed) res.end();
}

async function handler(req, res) {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    sendJson(res, 405, { error: "Use GET or POST for this endpoint." });
    return;
  }

  try {
    const body = req.method === "POST" ? await readJson(req) : null;
    const { url, type } = getDownloadRequest(req, body);
    const videoId = extractVideoId(url);

    if (!videoId) {
      sendJson(res, 400, { error: "Enter a valid YouTube video URL." });
      return;
    }
    if (!["video", "audio"].includes(type)) {
      sendJson(res, 400, { error: "The type must be video or audio." });
      return;
    }

    const prepared = await prepareDownload(videoId, type);
    const extension = type === "audio" ? "m4a" : "mp4";
    const filename = safeFilename(prepared.metadata.title, extension);
    const contentType = type === "audio" ? "audio/mp4" : "video/mp4";

    setCors(res);
    res.statusCode = 200;
    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${ filename.ascii }"; filename*=UTF-8''${encodeURIComponent(filename.utf8)}`
    );
    res.setHeader("Cache-Control", "no-store, private");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (
      Number.isSafeInteger(prepared.format.content_length) &&
      prepared.format.content_length > 0
    ) {
      res.setHeader("Content-Length", String(prepared.format.content_length));
    }

    const { streamToIterable } = await getRuntime();
    await pipeStream(prepared.stream, streamToIterable, res);
  } catch (error) {
    if (res.headersSent) {
      if (!res.destroyed) res.destroy(error);
      return;
    }
    sendJson(res, error.statusCode || 500, { error: messageForClient(error) });
  }
}

module.exports = handler;
module.exports.config = { maxDuration: 300 };
