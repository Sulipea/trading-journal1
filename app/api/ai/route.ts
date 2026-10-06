/**
 * AI endpoint (spec §33). The browser sends only the context relevant to one
 * task; this route adds the server-side credentials, calls the configured
 * provider and returns validated output. Nothing is stored here — the
 * journal stays in the browser.
 */
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { systemPrompt } from "@/lib/ai/prompts";
import { AIOutputError, AIRefusalError, getAIProvider, type ProviderContent } from "@/lib/ai/provider";
import { AI_OUTPUT_SCHEMAS, aiRequestSchema, type AIErrorCode, type AIResponse, type AIStatusResponse } from "@/lib/ai/schemas";

export const maxDuration = 120;

/** Reject oversized bodies before parsing (screenshots are downscaled in the browser). */
const MAX_BODY_BYTES = 6 * 1024 * 1024;

const MAX_TOKENS = { TRADE_REVIEW: 8000, PERIOD_REVIEW: 8000, PATTERNS: 8000, CHAT: 4000 } as const;

function fail(code: AIErrorCode, error: string, status: number) {
  return NextResponse.json<AIResponse>({ ok: false, code, error }, { status });
}

export async function GET() {
  const provider = getAIProvider();
  return NextResponse.json<AIStatusResponse>({
    configured: provider !== null,
    provider: provider?.name ?? null,
    model: provider?.model ?? null,
  });
}

export async function POST(request: Request) {
  const provider = getAIProvider();
  if (!provider) {
    return fail("NOT_CONFIGURED", "AI isn't configured on the server. Set ANTHROPIC_API_KEY to enable it.", 503);
  }

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return fail("BAD_REQUEST", "The request is too large.", 413);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("BAD_REQUEST", "The request wasn't valid JSON.", 400);
  }
  const parsed = aiRequestSchema.safeParse(body);
  if (!parsed.success) return fail("BAD_REQUEST", "The request didn't match the expected format.", 400);
  const req = parsed.data;

  const content: ProviderContent[] = [{ type: "text", text: `Journal data (JSON):\n${JSON.stringify(req.context)}` }];
  if (req.task === "TRADE_REVIEW") {
    for (const [i, image] of req.images.entries()) {
      content.push({ type: "text", text: `Screenshot ${i + 1}${image.caption ? `: ${image.caption}` : ""}` });
      content.push({ type: "image", mediaType: image.mediaType, data: image.data });
    }
  }
  const history = req.task === "CHAT" ? req.messages.slice(0, -1) : undefined;
  if (req.task === "CHAT") content.push({ type: "text", text: `Question: ${req.messages.at(-1)!.text}` });

  try {
    const output = await provider.generate({
      system: systemPrompt(req.task),
      content,
      history,
      schema: AI_OUTPUT_SCHEMAS[req.task],
      maxTokens: MAX_TOKENS[req.task],
    });
    // Validate again against our own schema before returning it.
    const checked = AI_OUTPUT_SCHEMAS[req.task].safeParse(output);
    if (!checked.success) return fail("INVALID_OUTPUT", "The AI's answer didn't match the expected structure.", 502);
    return NextResponse.json<AIResponse>({ ok: true, model: provider.model, output: checked.data });
  } catch (error) {
    if (error instanceof AIRefusalError) return fail("REFUSED", error.message, 422);
    if (error instanceof AIOutputError) return fail("INVALID_OUTPUT", error.message, 502);
    if (error instanceof Anthropic.AuthenticationError) {
      return fail("NOT_CONFIGURED", "The AI provider rejected the server's credentials.", 503);
    }
    if (error instanceof Anthropic.RateLimitError) return fail("RATE_LIMITED", "The AI provider is busy. Try again shortly.", 429);
    if (error instanceof Anthropic.APIError) {
      return fail("PROVIDER_ERROR", `The AI provider returned an error (${error.status ?? "network"}).`, 502);
    }
    return fail("PROVIDER_ERROR", "The AI request failed.", 502);
  }
}
