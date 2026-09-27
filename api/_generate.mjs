export const GEMINI_MODELS = Object.freeze([
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.5-flash",
]);

const RETRYABLE_STATUSES = new Set([408, 429]);

function isRetryableStatus(status) {
  return RETRYABLE_STATUSES.has(status) || status >= 500;
}

export async function generateWithFallback({
  apiKey,
  contents,
  systemInstruction,
  generationConfig,
  fetchImpl = fetch,
  waitImpl = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  let lastFailure = null;

  for (let index = 0; index < GEMINI_MODELS.length; index += 1) {
    const model = GEMINI_MODELS[index];
    try {
      const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({ systemInstruction, contents, generationConfig }),
        signal: AbortSignal.timeout(15_000),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok) {
        const text = result?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || "";
        return { ok: true, text, model, fallbackUsed: index > 0 };
      }

      lastFailure = {
        status: response.status,
        detail: result?.error?.message,
        retryable: isRetryableStatus(response.status),
      };
      if (!lastFailure.retryable) break;
      if (index < GEMINI_MODELS.length - 1) await waitImpl(500 * (2 ** index) + Math.floor(Math.random() * 250));
    } catch (error) {
      lastFailure = { status: 502, detail: error?.message, retryable: true };
      if (index < GEMINI_MODELS.length - 1) await waitImpl(500 * (2 ** index) + Math.floor(Math.random() * 250));
    }
  }

  const status = lastFailure?.status || 502;
  const error = status === 429
    ? "Gemini 모델의 사용량이 혼잡해 대체 모델까지 시도했어요. 잠시 후 다시 시도해 주세요."
    : lastFailure?.retryable
      ? "Gemini 모델에 일시적인 문제가 있어 대체 모델까지 시도했어요. 잠시 후 다시 시도해 주세요."
      : "Gemini API 요청이 거부됐어요. 서버의 API 키와 모델 접근 권한을 확인해 주세요.";
  return { ok: false, status, error, detail: lastFailure?.detail };
}
