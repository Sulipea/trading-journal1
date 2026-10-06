import type { ComponentProps } from "react";
import { cn } from "@/lib/ui/cn";

export function Card({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn("rounded-xl border border-border bg-surface p-5 shadow-xs", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<"h2">) {
  return <h2 className={cn("text-sm font-medium text-muted", className)} {...props} />;
}
