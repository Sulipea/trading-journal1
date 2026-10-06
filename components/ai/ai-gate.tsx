import Link from "next/link";
import type { AiStatus } from "@/lib/domain/types";

/** Explains why AI features aren't available and how to turn them on. */
export function AIUnavailable({ status }: { status: AiStatus }) {
  return (
    <p className="text-sm text-muted">
      {status === "NOT_CONFIGURED" ? (
        <>AI isn&apos;t configured on the server. The journal works fully without it.</>
      ) : status === "DISABLED" ? (
        <>
          AI is turned off. You can turn it on in <Link href="/settings" className="text-accent hover:underline">Settings</Link>.
        </>
      ) : (
        <>
          AI is available but not turned on. Turn it on in{" "}
          <Link href="/settings" className="text-accent hover:underline">
            Settings
          </Link>
          .
        </>
      )}
    </p>
  );
}
