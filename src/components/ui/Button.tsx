"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "filled" | "tinted" | "plain" | "destructive";

const styles: Record<Variant, string> = {
  filled: "bg-blue text-white font-semibold rounded-xl px-5",
  tinted: "bg-blue/15 text-blue font-semibold rounded-xl px-5",
  plain: "text-blue",
  destructive: "text-red",
};

// Buttons say what they do ("Log Interaction", not "Submit").
export function Button({
  variant = "plain",
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button
      {...props}
      className={`text-body pressable inline-flex min-h-11 items-center justify-center gap-1.5 disabled:opacity-40 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
