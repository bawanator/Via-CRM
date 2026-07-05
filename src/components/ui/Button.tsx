"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "filled" | "tinted" | "plain" | "destructive";

const styles: Record<Variant, string> = {
  filled: "bg-blue text-white font-semibold rounded-lg px-3.5",
  tinted: "bg-blue/15 text-blue font-semibold rounded-lg px-3.5",
  plain: "text-blue px-2 min-w-9 rounded-lg",
  destructive: "text-red px-2 min-w-9 rounded-lg",
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
      className={`text-body pressable control-h inline-flex items-center justify-center gap-1.5 focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-40 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
