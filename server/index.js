import http from "node:http";
import { decorateNode, DataError, listStacks, resolvePath } from "./hrcData.js";

const PORT = Number(process.env.API_PORT ?? 5174);

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url) {
      sendJson(res, 400, { error: "Missing URL" });
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    setCors(res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/stacks") {
      sendJson(res, 200, { stacks: listStacks(), defaultStack: "15bb" });
      return;
    }

    const nodeMatch = url.pathname.match(/^\/api\/stacks\/([^/]+)\/nodes\/(\d+)$/);
    if (req.method === "GET" && nodeMatch) {
      const [, stack, nodeId] = nodeMatch;
      sendJson(res, 200, decorateNode(stack, Number(nodeId)));
      return;
    }

    const resolveMatch = url.pathname.match(/^\/api\/stacks\/([^/]+)\/resolve-path$/);
    if (req.method === "POST" && resolveMatch) {
      const [, stack] = resolveMatch;
      const body = await readBody(req);
      sendJson(res, 200, resolvePath(stack, body.path ?? []));
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    if (error instanceof DataError) {
      sendJson(res, error.status, { error: error.message });
      return;
    }
    console.error(error);
    sendJson(res, 500, { error: "Internal server error" });
  }
});

server.listen(PORT, () => {
  console.log(`HRC API listening on http://localhost:${PORT}`);
});

function sendJson(res, status, payload) {
  setCors(res);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function setCors(res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new DataError(413, "Request body too large"));
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new DataError(400, "Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}
