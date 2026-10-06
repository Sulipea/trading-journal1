/**
 * Browser side of the AI boundary: calls /api/ai and validates what comes
 * back. Nothing here can write to the journal.
 */
import {
  AI_OUTPUT_SCHEMAS,
  aiResponseSchema,
  aiStatusResponseSchema,
  type AIErrorCode,
  type AIOutput,
  type AIRequest,
  type AIStatusResponse,
  type AITask,
} from "./schemas";

export class AIClientError extends Error {
  override name = "AIClientError";
  constructor(
    message: string,
    readonly code: AIErrorCode | "NETWORK",
  ) {
    super(message);
  }
}

/** Calls the AI with one request and returns its validated output. */
export type AITransport = <T extends AITask>(request: Extract<AIRequest, { task: T }>) => Promise<{ model: string; output: AIOutput<T> }>;

export async function fetchAIStatus(): Promise<AIStatusResponse> {
  try {
    const response = await fetch("/api/ai", { cache: "no-store" });
    return aiStatusResponseSchema.parse(await response.json());
  } catch {
    return { configured: false, provider: null, model: null };
  }
}

export const httpTransport: AITransport = async (request) => {
  let body: unknown;
  try {
    const response = await fetch("/api/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    body = await response.json();
  } catch {
    throw new AIClientError("Couldn't reach the AI service. Check your connection and try again.", "NETWORK");
  }
  const parsed = aiResponseSchema.safeParse(body);
  if (!parsed.success) throw new AIClientError("The AI service sent an unexpected response.", "INVALID_OUTPUT");
  if (!parsed.data.ok) throw new AIClientError(parsed.data.error, parsed.data.code);
  const output = AI_OUTPUT_SCHEMAS[request.task].safeParse(parsed.data.output);
  if (!output.success) throw new AIClientError("The AI's answer didn't match the expected structure.", "INVALID_OUTPUT");
  return { model: parsed.data.model, output: output.data as AIOutput<typeof request.task> };
};
