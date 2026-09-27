const geminiApiKey = process.env.GEMINI_API_KEY || "";
const googleClientId = process.env.GOOGLE_CLIENT_ID || "";
import { GEMINI_MODELS } from "./_generate.mjs";

function configured(value) {
  return Boolean(value && !/^YOUR_|^your_/i.test(value));
}

export default function handler(request) {
  if (request.method !== "GET") return Response.json({ error: "GET 요청만 지원해요." }, { status: 405 });
  return Response.json({
    ok: true,
    geminiConfigured: configured(geminiApiKey),
    googleConfigured: configured(googleClientId),
    model: GEMINI_MODELS[0],
    fallbackModels: GEMINI_MODELS.slice(1),
  }, { headers: { "Cache-Control": "no-store" } });
}
