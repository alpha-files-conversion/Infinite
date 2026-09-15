"use strict";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Expose-Headers": "Content-Disposition, Content-Length",
};

function setCors(res) {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(key, value);
  }
}

function sendJson(res, statusCode, payload) {
  setCors(res);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

async function readJson(req, maxBytes = 32 * 1024) {
  if (req.body && typeof req.body === "object") return req.body;

  let size = 0;
  let raw = "";
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk);
    if (size > maxBytes) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
    raw += chunk;
  }

  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

function messageForClient(error) {
  if (error?.statusCode && error.statusCode < 500) return error.message;
  if (/unplayable|login required/i.test(error?.message || "")) {
    return "This video cannot be downloaded by the configured YouTube client.";
  }
  if (/No valid URL|streaming data|format/i.test(error?.message || "")) {
    return "YouTube did not provide a compatible media format for this video.";
  }
  return "The media request could not be completed.";
}

module.exports = {
  setCors,
  sendJson,
  readJson,
  messageForClient,
};
