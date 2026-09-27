const googleClientId = process.env.GOOGLE_CLIENT_ID || "";
const geminiApiKey = process.env.GEMINI_API_KEY || "";
import { generateWithFallback } from "./_generate.mjs";
const maxBodyBytes = 64 * 1024;

function json(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

function corsHeaders(request) {
  const origin = request.headers.get("origin");
  if (!origin) return {};

  const sameOrigin = new URL(request.url).origin;
  const allowedOrigins = (process.env.ALLOWED_ORIGIN || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (origin === sameOrigin || allowedOrigins.includes(origin)) {
    return { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
  }
  return { Vary: "Origin" };
}

function configured(value) {
  return Boolean(value && !/^YOUR_|^your_/i.test(value));
}

async function verifyGoogleToken(token) {
  if (!token || !googleClientId) return null;
  try {
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
    if (!response.ok) return null;
    const payload = await response.json();
    const validIssuer = payload.iss === "accounts.google.com" || payload.iss === "https://accounts.google.com";
    if (!validIssuer || payload.aud !== googleClientId || !payload.sub || Number(payload.exp || 0) <= Math.floor(Date.now() / 1000)) return null;
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

export function OPTIONS(request) {
  const headers = corsHeaders(request);
  return new Response(null, {
    status: 204,
    headers: {
      ...headers,
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function POST(request) {
  const headers = corsHeaders(request);

  if (!configured(geminiApiKey) || !configured(googleClientId)) {
    return json({ error: "Vercel 환경 변수에 Google Client ID와 Gemini API 키를 설정해 주세요." }, 503, headers);
  }

  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!await verifyGoogleToken(token)) {
    return json({ error: "Google 로그인 세션이 유효하지 않아요. 다시 로그인해 주세요." }, 401, headers);
  }

  let rawBody;
  try {
    rawBody = await request.text();
  } catch {
    return json({ error: "요청 형식이 올바르지 않아요." }, 400, headers);
  }
  if (new TextEncoder().encode(rawBody).byteLength > maxBodyBytes) return json({ error: "요청이 너무 커요." }, 413, headers);
  let body;
  try { body = JSON.parse(rawBody || "{}"); } catch { return json({ error: "요청 형식이 올바르지 않아요." }, 400, headers); }
  const prompt = String(body?.prompt || "").trim().slice(0, 4000);
  if (!prompt) return json({ error: "질문을 입력해 주세요." }, 400, headers);

  const context = body?.context && typeof body.context === "object" ? body.context : {};
  const contextText = JSON.stringify({
    today: context.today,
    exam: context.exam,
    level: context.level,
    tasks: context.tasks,
    instructions: context.instructions,
  }).slice(0, 9000);
  const contents = [
    ...normalizeHistory(body.history),
    { role: "user", parts: [{ text: `학습자 정보와 오늘 계획을 바탕으로 답해줘.\n학습 맥락: ${contextText}\n질문: ${prompt}` }] },
  ];

  const generated = await generateWithFallback({
    apiKey: geminiApiKey,
    systemInstruction: { parts: [{ text: "너는 용자라는 고등학생 학습 플래너의 AI 튜터야. 한국어로 답하고, 등록된 문제집·진도·학습 수준을 근거로 실행 가능한 다음 행동을 짧게 제안해. 모르는 내용은 추측하지 말고 확인이 필요한 부분을 알려줘." }] },
    contents,
    generationConfig: { temperature: 0.7, maxOutputTokens: 600 },
  });
  if (!generated.ok) return json({ error: generated.error, detail: generated.detail }, generated.status >= 500 ? 502 : generated.status, headers);
  if (!generated.text) return json({ error: "Gemini가 비어 있는 답변을 보냈어요." }, 502, headers);
  return json({ text: generated.text, model: generated.model, fallbackUsed: generated.fallbackUsed }, 200, headers);
}
