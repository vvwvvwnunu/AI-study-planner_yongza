const geminiApiKey = process.env.GEMINI_API_KEY || "";
const googleClientId = process.env.GOOGLE_CLIENT_ID || "";
import { GEMINI_MODELS } from "./_generate.mjs";

function configured(value) {
  return Boolean(value && !/^YOUR_|^your_/i.test(value));
}

export function GET() {
  return Response.json({
    ok: true,
    geminiConfigured: configured(geminiApiKey),
    googleConfigured: configured(googleClientId),
    model: GEMINI_MODELS[0],
    fallbackModels: GEMINI_MODELS.slice(1),
  }, { headers: { "Cache-Control": "no-store" } });
}
