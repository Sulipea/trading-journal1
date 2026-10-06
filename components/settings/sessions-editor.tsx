"use client";

import { ArrowDown, ArrowUp, Eye, EyeOff, Plus } from "lucide-react";
import { useState } from "react";
import { Button, Input } from "@/components/ui/form";
import type { SessionOption } from "@/lib/domain/types";
import { cn } from "@/lib/ui/cn";

/**
 * Edit the trading sessions offered on trades. Sessions are hidden rather
 * than deleted so trades that used them keep their name. The list is
 * submitted with the surrounding form as JSON in a hidden `sessions` field.
 */
export function SessionsEditor({ initial }: { initial: readonly SessionOption[] }) {
  const [sessions, setSessions] = useState<SessionOption[]>(() => initial.map((s) => ({ ...s })));

  const update = (index: number, patch: Partial<SessionOption>) =>
    setSessions((list) => list.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const move = (index: number, by: -1 | 1) =>
    setSessions((list) => {
      const next = [...list];
      const target = index + by;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });

  return (
    <div className="space-y-2">
      <input type="hidden" name="sessions" value={JSON.stringify(sessions)} />
      <ul className="space-y-2">
        {sessions.map((session, i) => (
          <li key={session.id || `new-${i}`} className={cn("flex items-center gap-2", !session.active && "opacity-60")}>
            <Input
              aria-label={`Session ${i + 1} name`}
              value={session.label}
              onChange={(e) => update(i, { label: e.target.value })}
              placeholder="Session name"
              className="max-w-xs"
            />
            <Button
              variant="ghost"
              className="p-1.5"
              aria-label={`Move ${session.label || "session"} up`}
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              <ArrowUp aria-hidden className="size-4" />
            </Button>
            <Button
              variant="ghost"
              className="p-1.5"
              aria-label={`Move ${session.label || "session"} down`}
              disabled={i === sessions.length - 1}
              onClick={() => move(i, 1)}
            >
              <ArrowDown aria-hidden className="size-4" />
            </Button>
            <Button
              variant="ghost"
              className="px-2 py-1 text-xs"
              aria-pressed={!session.active}
              onClick={() => update(i, { active: !session.active })}
            >
              {session.active ? <EyeOff aria-hidden className="size-3.5" /> : <Eye aria-hidden className="size-3.5" />}
              {session.active ? "Hide" : "Show"}
            </Button>
            {!session.active && <span className="text-xs text-muted">Hidden from new trades</span>}
          </li>
        ))}
      </ul>
      <Button
        className="text-xs"
        onClick={() => setSessions((list) => [...list, { id: "", label: "", active: true }])}
      >
        <Plus aria-hidden className="size-3.5" />
        Add session
      </Button>
    </div>
  );
}
