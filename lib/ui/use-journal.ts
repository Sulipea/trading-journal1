"use client";

import { useCallback, useEffect, useState } from "react";
import { getRepositories, type JournalRepositories } from "@/lib/repositories";

export type JournalQuery<T> =
  | { status: "loading"; reload: () => void }
  | { status: "error"; error: Error; reload: () => void }
  | { status: "ready"; data: T; reload: () => void };

/**
 * Load data from the local journal on the client.
 * `load` should be stable or wrapped in useCallback; `reload` re-runs it.
 */
export function useJournalQuery<T>(load: (repos: JournalRepositories) => Promise<T>): JournalQuery<T> {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<
    { status: "loading" } | { status: "error"; error: Error } | { status: "ready"; data: T }
  >({ status: "loading" });
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => load(getRepositories()))
      .then(
        (data) => !cancelled && setState({ status: "ready", data }),
        (error: unknown) =>
          !cancelled &&
          setState({
            status: "error",
            error: error instanceof Error ? error : new Error("Could not read the local journal."),
          }),
      );
    return () => {
      cancelled = true;
    };
  }, [load, version]);

  return { ...state, reload };
}

/** Turn any thrown value into a user-facing message. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
