import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile?.(".env");
} catch {
  // Environment variables can also be provided by the hosting platform.
}

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const port = Number(process.env.PORT || 4173);
const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const geminiApiKey = process.env.GEMINI_API_KEY || "";
const googleClientId = process.env.GOOGLE_CLIENT_ID || "";
const allowedOrigin = process.env.ALLOWED_ORIGIN || "";
const maxBodyBytes = 64 * 1024;
const hasConfiguredValue = (value) => Boolean(value && !/^YOUR_|^your_/i.test(value));

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

function sendJson(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  response.end(JSON.stringify(body));
}

function corsHeaders(request) {
  const origin = request.headers.origin;
  if (!origin) return {};
  return { "Access-Control-Allow-Origin": allowedOrigin || origin, Vary: "Origin" };
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) throw new Error("요청이 너무 커요.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function getBearerToken(request) {
  const value = request.headers.authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

async function verifyGoogleToken(token) {
  if (!token || !googleClientId) return null;
  try {
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
    if (!response.ok) return null;
    const payload = await response.json();
    const issuerIsValid = payload.iss === "accounts.google.com" || payload.iss === "https://accounts.google.com";
    if (!issuerIsValid || payload.aud !== googleClientId || !payload.email || Number(payload.exp || 0) <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.slice(-8).map((item) => ({
    role: item?.role === "assistant" || item?.role === "model" ? "model" : "user",
    parts: [{ text: String(item?.text || "").slice(0, 2000) }],
  })).filter((item) => item.parts[0].text);
}

async function handleGemini(request, response) {
  const headers = corsHeaders(request);
  if (!hasConfiguredValue(geminiApiKey) || !hasConfiguredValue(googleClientId)) {
    sendJson(response, 503, { error: "서버에 Google Client ID와 Gemini API 키가 설정되지 않았어요." }, headers);
    return;
  }
  const user = await verifyGoogleToken(getBearerToken(request));
  if (!user) {
    sendJson(response, 401, { error: "Google 로그인 세션이 유효하지 않아요. 다시 로그인해 주세요." }, headers);
    return;
  }
  const body = await readJson(request);
  const prompt = String(body.prompt || "").trim().slice(0, 4000);
  if (!prompt) {
    sendJson(response, 400, { error: "질문을 입력해 주세요." }, headers);
    return;
  }
  const context = body.context && typeof body.context === "object" ? body.context : {};
  const contextText = JSON.stringify({ level: context.level, tasks: context.tasks, instructions: context.instructions }).slice(0, 9000);
  const contents = [
    ...normalizeHistory(body.history),
    { role: "user", parts: [{ text: `학습자 정보와 오늘 계획을 바탕으로 답해줘.\n학습 맥락: ${contextText}\n질문: ${prompt}` }] },
  ];
  const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": geminiApiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: "너는 용자라는 고등학생 학습 플래너의 AI 튜터야. 한국어로 답하고, 등록된 문제집·진도·학습 수준을 근거로 실행 가능한 다음 행동을 짧게 제안해. 모르는 내용은 추측하지 말고 확인이 필요한 부분을 알려줘." }] },
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 600 },
    }),
  });
  const result = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const message = upstream.status === 429 ? "Gemini 무료 사용량을 잠시 초과했어요. 잠시 후 다시 시도해 주세요." : "Gemini API에서 답변을 받지 못했어요.";
    sendJson(response, upstream.status >= 500 ? 502 : upstream.status, { error: message, detail: result?.error?.message || undefined }, headers);
    return;
  }
  const text = result?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text) {
    sendJson(response, 502, { error: "Gemini가 비어 있는 답변을 보냈어요." }, headers);
    return;
  }
  sendJson(response, 200, { text, model: geminiModel, user: { name: user.name, email: user.email } }, headers);
}

async function serveStatic(request, response, pathname) {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = normalize(join(root, relative));
  if (!filePath.startsWith(root) || !existsSync(filePath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  response.writeHead(200, { "Content-Type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-cache" });
  createReadStream(filePath).pipe(response);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    if (request.method === "OPTIONS") {
      response.writeHead(204, { ...corsHeaders(request), "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "POST, OPTIONS" });
      response.end();
      return;
    }
    try {
      if (url.pathname === "/api/health" && request.method === "GET") {
        sendJson(response, 200, { ok: true, geminiConfigured: hasConfiguredValue(geminiApiKey), googleConfigured: hasConfiguredValue(googleClientId), model: geminiModel }, corsHeaders(request));
      } else if (url.pathname === "/api/gemini" && request.method === "POST") {
        await handleGemini(request, response);
      } else {
        sendJson(response, 404, { error: "API 경로를 찾을 수 없어요." }, corsHeaders(request));
      }
    } catch (error) {
      sendJson(response, 400, { error: error instanceof SyntaxError ? "요청 형식이 올바르지 않아요." : error.message || "서버 오류가 발생했어요." }, corsHeaders(request));
    }
    return;
  }
  await serveStatic(request, response, decodeURIComponent(url.pathname));
});

server.listen(port, () => {
  console.log(`Yongja is running at http://127.0.0.1:${port}`);
  console.log(`Gemini API: ${hasConfiguredValue(geminiApiKey) ? "configured" : "missing GEMINI_API_KEY"}`);
  console.log(`Google ID verification: ${hasConfiguredValue(googleClientId) ? "configured" : "missing GOOGLE_CLIENT_ID"}`);
});
