import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import Anthropic from "@anthropic-ai/sdk";

const app = new Hono();

const ai = new Anthropic({
  baseURL: process.env.SANTAI_AI_BASE_URL,
  apiKey: process.env.SANTAI_AI_TOKEN || "placeholder",
});

// In-memory session store: sessionId -> messages[]
const sessions = new Map<string, { role: "user" | "assistant"; content: string }[]>();

app.post("/api/chat", async (c) => {
  const { message, sessionId } = await c.req.json();
  if (!message || !sessionId) return c.json({ error: "Missing message or sessionId" }, 400);

  const history = sessions.get(sessionId) ?? [];
  history.push({ role: "user", content: message });

  try {
    const response = await ai.messages.create({
      model: "anthropic-claude-bedrock4.5-haiku",
      max_tokens: 1024,
      system:
        "You are a helpful, friendly, and concise AI assistant. Respond naturally and warmly. Use markdown formatting when it helps clarity (code blocks, lists, bold), but keep replies focused.",
      messages: history,
    });

    const reply = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");

    history.push({ role: "assistant", content: reply });
    sessions.set(sessionId, history);

    // Trim to last 40 messages to avoid unbounded growth
    if (history.length > 40) sessions.set(sessionId, history.slice(-40));

    return c.json({ reply });
  } catch (err: any) {
    console.error("AI error:", err?.message ?? err);
    return c.json({ error: "AI unavailable. Make sure SANTAI_AI_BASE_URL is set." }, 503);
  }
});

app.post("/api/reset", async (c) => {
  const { sessionId } = await c.req.json();
  if (sessionId) sessions.delete(sessionId);
  return c.json({ ok: true });
});

app.use("/*", serveStatic({ root: `${import.meta.dir}/public` }));

export default {
  port: process.env.PORT || 3000,
  fetch: app.fetch,
};
