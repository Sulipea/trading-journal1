/**
 * AI provider abstraction. Server-side only: credentials come from the
 * server environment and never reach the browser.
 *
 * Configure with:
 *   ANTHROPIC_API_KEY  — enables the Anthropic provider
 *   AI_MODEL           — optional, defaults to claude-sonnet-5
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

export type ProviderContent =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string };

export interface GenerateRequest {
  system: string;
  content: ProviderContent[];
  /** Earlier conversation turns, oldest first (chat only). */
  history?: { role: "user" | "assistant"; text: string }[];
  /** Output structure; the result is still re-validated by the caller. */
  schema: z.ZodType;
  maxTokens: number;
}

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  generate(request: GenerateRequest): Promise<unknown>;
}

/** The model declined to answer (e.g. a safety classifier). */
export class AIRefusalError extends Error {
  override name = "AIRefusalError";
}

/** The model's output didn't match the expected structure. */
export class AIOutputError extends Error {
  override name = "AIOutputError";
}

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";

class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;

  constructor(readonly model: string) {
    this.client = new Anthropic();
  }

  async generate(request: GenerateRequest): Promise<unknown> {
    const messages: Anthropic.MessageParam[] = [
      ...(request.history ?? []).map((m) => ({ role: m.role, content: m.text })),
      {
        role: "user",
        content: request.content.map((c): Anthropic.ContentBlockParam =>
          c.type === "text"
            ? { type: "text", text: c.text }
            : { type: "image", source: { type: "base64", media_type: c.mediaType, data: c.data } },
        ),
      },
    ];

    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: request.maxTokens,
      system: request.system,
      messages,
      output_config: { format: zodOutputFormat(request.schema) },
    });

    if (response.stop_reason === "refusal") {
      throw new AIRefusalError("The AI declined to answer this request.");
    }
    if (response.stop_reason === "max_tokens") {
      throw new AIOutputError("The AI's answer was cut off before it finished.");
    }
    if (response.parsed_output === null || response.parsed_output === undefined) {
      throw new AIOutputError("The AI's answer couldn't be read.");
    }
    return response.parsed_output;
  }
}

/** The configured provider, or null when AI isn't set up on the server. */
export function getAIProvider(): AIProvider | null {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) {
    return new AnthropicProvider(process.env.AI_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL);
  }
  return null;
}
