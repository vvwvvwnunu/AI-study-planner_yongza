import assert from "node:assert/strict";
import test from "node:test";
import { generateWithFallback, GEMINI_MODELS } from "../api/_generate.mjs";

const response = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

test("tries Gemini 3.8, 3.7, then 3.5 on transient errors", async () => {
  const calls = [];
  const queue = [
    response(429, { error: { message: "busy" } }),
    response(503, { error: { message: "unavailable" } }),
    response(200, { candidates: [{ content: { parts: [{ text: "답변" }] } }] }),
  ];
  const result = await generateWithFallback({
    apiKey: "test-key",
    contents: [],
    systemInstruction: {},
    generationConfig: {},
    waitImpl: async () => {},
    fetchImpl: async (url) => { calls.push(url); return queue.shift(); },
  });

  assert.deepEqual(GEMINI_MODELS, ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.5-flash"]);
  assert.deepEqual(calls.map((url) => decodeURIComponent(url.match(/models\/([^:]+)/)[1])), GEMINI_MODELS);
  assert.equal(result.ok, true);
  assert.equal(result.text, "답변");
  assert.equal(result.model, "gemini-3.5-flash");
  assert.equal(result.fallbackUsed, true);
});

test("does not retry non-transient errors such as a rejected API key", async () => {
  let attempts = 0;
  const result = await generateWithFallback({
    apiKey: "test-key",
    contents: [],
    systemInstruction: {},
    generationConfig: {},
    waitImpl: async () => {},
    fetchImpl: async () => { attempts += 1; return response(403, { error: { message: "forbidden" } }); },
  });

  assert.equal(attempts, 1);
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
});

test("moves to the next model if the upstream connection fails", async () => {
  const models = [];
  const result = await generateWithFallback({
    apiKey: "test-key",
    contents: [],
    systemInstruction: {},
    generationConfig: {},
    waitImpl: async () => {},
    fetchImpl: async (url) => {
      models.push(decodeURIComponent(url.match(/models\/([^:]+)/)[1]));
      if (models.length === 1) throw new Error("network unavailable");
      return response(200, { candidates: [{ content: { parts: [{ text: "연결 후 답변" }] } }] });
    },
  });

  assert.deepEqual(models, GEMINI_MODELS.slice(0, 2));
  assert.equal(result.model, "gemini-3.7-flash");
  assert.equal(result.fallbackUsed, true);
});

test("Vercel routes export HTTP method handlers that return responses", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  process.env.GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";
  const health = await import("../api/health.mjs");
  const gemini = await import("../api/gemini.mjs");

  assert.equal(typeof health.GET, "function");
  assert.equal("default" in health, false);
  const healthResponse = await health.GET(new Request("https://example.test/api/health"));
  const healthBody = await healthResponse.json();
  assert.equal(healthResponse.status, 200);
  assert.equal(healthBody.model, "gemini-3.8-flash");
  assert.deepEqual(healthBody.fallbackModels, ["gemini-3.7-flash", "gemini-3.5-flash"]);

  assert.equal(typeof gemini.POST, "function");
  assert.equal(typeof gemini.OPTIONS, "function");
  assert.equal("default" in gemini, false);
  const optionsResponse = await gemini.OPTIONS(new Request("https://example.test/api/gemini", { method: "OPTIONS" }));
  assert.equal(optionsResponse.status, 204);
  const postResponse = await gemini.POST(new Request("https://example.test/api/gemini", { method: "POST", body: JSON.stringify({ prompt: "hi" }) }));
  assert.equal(postResponse.status, 401);
});
