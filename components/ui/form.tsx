import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

const control =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted/70 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-negative";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(control, "pr-8", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-24 resize-y", className)} {...props} />;
}

/** A labelled form control with optional hint and error. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | null | undefined;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
        {required && (
          <span className="ml-1 text-xs font-normal text-muted">(required to close)</span>
        )}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && (
        <p className="text-xs text-negative" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-foreground hover:brightness-110 shadow-sm",
  secondary: "border border-border bg-surface hover:bg-surface-muted",
  ghost: "hover:bg-surface-muted",
  danger: "border border-negative/40 text-negative hover:bg-negative/10",
};

export function buttonClass(variant: ButtonVariant = "secondary", className?: string): string {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50",
    buttonVariants[variant],
    className,
  );
}

export function Button({
  variant = "secondary",
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button type={type} className={buttonClass(variant, className)} {...props} />;
}

/** Inline status message after saving or on failure. */
export function FormStatus({ status }: { status: { kind: "saved" | "error"; message: string } | null }) {
  if (!status) return null;
  return (
    <p
      role={status.kind === "error" ? "alert" : "status"}
      className={cn("text-sm", status.kind === "error" ? "text-negative" : "text-positive")}
    >
      {status.message}
    </p>
  );
}
