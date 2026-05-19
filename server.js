import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const port = Number.parseInt(process.env.PORT ?? "5177", 10);
const ffmpegProxyPrefix = "/vendor/ffmpeg/";
const ffmpegPackages = new Map([
  ["ffmpeg", { name: "@ffmpeg/ffmpeg", versions: new Set(["0.12.10"]) }],
  ["util", { name: "@ffmpeg/util", versions: new Set(["0.12.1"]) }],
  ["core", { name: "@ffmpeg/core", versions: new Set(["0.12.10"]) }]
]);

const types = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".wasm", "application/wasm"]
]);

async function proxyFfmpegAsset(pathname, response) {
  if (!pathname.startsWith(ffmpegProxyPrefix)) return false;

  const [packageKey, version, ...assetParts] = pathname
    .slice(ffmpegProxyPrefix.length)
    .split("/");
  const packageConfig = ffmpegPackages.get(packageKey);
  const invalidAssetPath = assetParts.length === 0 || assetParts.some((part) => !part || part === "." || part === "..");

  if (!packageConfig || !packageConfig.versions.has(version) || invalidAssetPath) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return true;
  }

  const assetPath = assetParts.map((part) => encodeURIComponent(part)).join("/");
  const upstreamURL = `https://cdn.jsdelivr.net/npm/${packageConfig.name}@${version}/${assetPath}`;

  try {
    const upstream = await fetch(upstreamURL);
    if (!upstream.ok || !upstream.body) {
      response.writeHead(upstream.status || 502, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Failed to load FFmpeg asset");
      return true;
    }

    response.writeHead(200, {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream"
    });
    Readable.fromWeb(upstream.body).pipe(response);
  } catch {
    response.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Failed to load FFmpeg asset");
  }

  return true;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  response.setHeader("Cache-Control", "no-store");

  try {
    if (await proxyFfmpegAsset(url.pathname, response)) return;

    const requestedPath = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const filePath = resolve(publicDir, requestedPath);
    if (!filePath.startsWith(resolve(publicDir))) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }
    const stat = statSync(filePath);
    if (!stat.isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": types.get(extname(filePath)) ?? "application/octet-stream",
      "Content-Length": stat.size
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Audio Video Sync Lab running at http://127.0.0.1:${port}`);
});
