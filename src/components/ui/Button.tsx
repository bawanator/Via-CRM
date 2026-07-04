"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "filled" | "tinted" | "plain" | "destructive";

const styles: Record<Variant, string> = {
  filled: "bg-blue text-white font-semibold rounded-xl px-5",
  tinted: "bg-blue/15 text-blue font-semibold rounded-xl px-5",
  plain: "text-blue px-2 min-w-11 rounded-lg",
  destructive: "text-red px-2 min-w-11 rounded-lg",
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
      className={`text-body pressable inline-flex min-h-11 items-center justify-center gap-1.5 focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-40 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
