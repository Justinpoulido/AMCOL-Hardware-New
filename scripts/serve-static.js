#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 3000);
const HOST = "127.0.0.1";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
};

function send(res, status, body, type) {
  res.writeHead(status, {
    "Content-Type": type || "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function resolveRequestPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const requested = decoded === "/" ? "/index.html" : decoded;
  const absolutePath = path.resolve(ROOT, "." + requested);
  if (!absolutePath.startsWith(ROOT)) {
    return null;
  }
  return absolutePath;
}

function productDetailFallbackPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  if (!/^\/.+-[0-9]+\.html$/i.test(decoded)) return null;
  return path.join(ROOT, "product-detail.html");
}

const server = http.createServer((req, res) => {
  const filePath = resolveRequestPath(req.url || "/");
  if (!filePath) {
    send(res, 403, "Forbidden");
    return;
  }

  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      const fallbackPath = productDetailFallbackPath(req.url || "/");
      if (fallbackPath) {
        res.writeHead(200, {
          "Content-Type": TYPES[".html"],
          "Cache-Control": "no-store",
        });
        fs.createReadStream(fallbackPath).pipe(res);
        return;
      }
      send(res, 404, "Not found");
      return;
    }

    const type = TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": "no-store",
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Close the other server or change PORT.`);
  } else {
    console.error(error.message);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`AMCOL dev server running at http://${HOST}:${PORT}/index.html`);
});
