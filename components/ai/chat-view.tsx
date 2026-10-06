"use client";

import { useCallback, useState, type FormEvent } from "react";
import { MessageSquarePlus, Send, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button, FormStatus, Textarea } from "@/components/ui/form";
import { httpTransport } from "@/lib/ai/client";
import { CHAT_RECENT_TRADES } from "@/lib/ai/context-builder";
import { chatOutputSchema } from "@/lib/ai/schemas";
import type { AIConversation, AIMessage } from "@/lib/domain/types";
import { getRepositories, type JournalRepositories } from "@/lib/repositories";
import { sendChatMessage } from "@/lib/services/ai";
import { useAIState } from "@/lib/ui/ai";
import { cn } from "@/lib/ui/cn";
import { errorMessage, useJournalQuery } from "@/lib/ui/use-journal";
import { AIUnavailable } from "./ai-gate";
import { StatementList } from "./statements";

/** Dedicated analytical questions (spec §32), one click each. */
const PRESETS = [
  "Which setups have the best and worst expectancy, and how sure can I be?",
  "What do my losing trades have in common?",
  "How do my emotions relate to my results and rule-following?",
  "What does breaking my rules cost me?",
  "Which sessions and hours suit me best?",
  "How well do I trade according to my forecasts?",
];

export function ChatView() {
  const ai = useAIState();
  const [activeId, setActiveId] = useState<string | null>(null);
  const loadConversations = useCallback((repos: JournalRepositories) => repos.ai.listConversations(), []);
  const conversations = useJournalQuery(loadConversations);
  const loadMessages = useCallback(
    async (repos: JournalRepositories): Promise<AIMessage[]> => (activeId ? repos.ai.listMessages(activeId) : []),
    [activeId],
  );
  const messages = useJournalQuery(loadMessages);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AIConversation | null>(null);

  const enabled = ai.status === "ready" && ai.data.status === "ENABLED";

  async function ask(text: string) {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const id = await sendChatMessage(getRepositories(), activeId, text, httpTransport);
      setQuestion("");
      setActiveId(id);
      conversations.reload();
      messages.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void ask(question);
  }

  const list = conversations.status === "ready" ? conversations.data : [];
  const thread = messages.status === "ready" ? messages.data : [];

  return (
    <div className="animate-in grid items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <Card className="space-y-2 p-3">
        <Button className="w-full" onClick={() => setActiveId(null)}>
          <MessageSquarePlus aria-hidden className="size-4" />
          New conversation
        </Button>
        {list.length === 0 ? (
          <p className="px-1 py-2 text-xs text-muted">Your conversations are saved in this browser.</p>
        ) : (
          <ul className="space-y-0.5">
            {list.map((c) => (
              <li key={c.id} className="group flex items-center">
                <button
                  type="button"
                  aria-current={c.id === activeId ? "true" : undefined}
                  onClick={() => setActiveId(c.id)}
                  className={cn(
                    "min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm focus-visible:outline-2 focus-visible:outline-ring",
                    c.id === activeId ? "bg-surface-muted font-medium" : "text-muted hover:text-foreground",
                  )}
                >
                  {c.title}
                </button>
                <Button
                  variant="ghost"
                  className="p-1.5 opacity-60 group-hover:opacity-100"
                  aria-label={`Delete conversation ${c.title}`}
                  onClick={() => setDeleting(c)}
                >
                  <Trash2 aria-hidden className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="space-y-4">
        {ai.status === "ready" && !enabled && (
          <Card>
            <AIUnavailable status={ai.data.status} />
          </Card>
        )}

        <Card className="space-y-5">
          {thread.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted">
                Ask about your own trading. Each question sends a summary of your journal — statistics, breakdowns and
                your {CHAT_RECENT_TRADES} most recent closed trades as compact rows, without notes or screenshots. The AI
                explains and asks questions; it doesn&apos;t tell you what to trade.
              </p>
              {enabled && (
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((p) => (
                    <Button key={p} className="py-1 text-xs" disabled={busy} onClick={() => ask(p)}>
                      {p}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <ol className="space-y-5" aria-label="Conversation">
              {thread.map((m) => (
                <li key={m.id}>
                  {m.role === "USER" ? (
                    <p className="ml-auto w-fit max-w-[85%] rounded-xl bg-accent/12 px-3 py-2 text-sm">{m.text}</p>
                  ) : m.error ? (
                    <p className="text-sm text-negative" role="alert">
                      {m.error}
                    </p>
                  ) : (
                    <Answer message={m} />
                  )}
                </li>
              ))}
            </ol>
          )}
          {busy && (
            <p className="text-sm text-muted" role="status">
              Thinking about your journal…
            </p>
          )}

          {enabled && (
            <form onSubmit={onSubmit} className="space-y-2 border-t border-border pt-4">
              <Textarea
                aria-label="Your question"
                rows={2}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void ask(question);
                  }
                }}
                placeholder="Ask about your trades, setups, rules, psychology or forecasts…"
                maxLength={4000}
              />
              <div className="flex items-center gap-3">
                <Button type="submit" variant="primary" disabled={busy || !question.trim()}>
                  <Send aria-hidden className="size-4" />
                  Ask
                </Button>
                <FormStatus status={error ? { kind: "error", message: error } : null} />
              </div>
            </form>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this conversation?"
        confirmLabel="Delete conversation"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          const target = deleting;
          setDeleting(null);
          if (!target) return;
          await getRepositories().ai.deleteConversation(target.id);
          if (activeId === target.id) setActiveId(null);
          conversations.reload();
        }}
      >
        The conversation is removed from this browser. Your journal isn&apos;t affected.
      </ConfirmDialog>
    </div>
  );
}

function Answer({ message }: { message: AIMessage }) {
  const parsed = chatOutputSchema.safeParse(message.output);
  if (!parsed.success) return <p className="text-sm text-negative">This answer couldn&apos;t be read.</p>;
  return (
    <div className="space-y-1">
      <StatementList statements={parsed.data.statements} refs={message.refs} />
      <p className="text-[11px] text-muted">{message.model}</p>
    </div>
  );
}
