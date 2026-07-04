"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

// Form controls rendered as grouped-list rows, Settings style.
// Wrap a set of fields in <FieldGroup> inside a form.

export function FieldGroup({ header, footer, children }: { header?: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-5">
      {header ? <h3 className="text-footnote mb-1.5 px-4 uppercase tracking-wide text-label-2">{header}</h3> : null}
      <div className="hairline-rows overflow-hidden rounded-xl bg-card">{children}</div>
      {footer ? <p className="text-footnote mt-1.5 px-4 text-label-2">{footer}</p> : null}
    </div>
  );
}

export function TextField({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex min-h-11 items-center gap-4 px-4 py-1.5">
      <span className="text-body w-32 shrink-0 text-label">{label}</span>
      <input
        {...props}
        className="text-body min-h-8 w-full min-w-0 flex-1 rounded-md bg-transparent text-label placeholder:text-label-3 focus:outline-none focus-visible:outline-2 focus-visible:outline-blue"
      />
    </label>
  );
}

export function DateField(props: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <TextField type="date" {...props} />;
}

export function SelectField({
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) {
  return (
    <label className="flex min-h-11 items-center gap-4 px-4 py-1.5">
      <span className="text-body w-32 shrink-0 text-label">{label}</span>
      <select
        {...props}
        className="text-body min-h-8 w-full min-w-0 flex-1 appearance-none rounded-md bg-transparent text-right text-label focus:outline-none focus-visible:outline-2 focus-visible:outline-blue"
      >
        {children}
      </select>
    </label>
  );
}

export function TextAreaField({
  label,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className="block px-4 py-2.5">
      <span className="text-footnote mb-1 block uppercase tracking-wide text-label-2">{label}</span>
      <textarea
        {...props}
        rows={props.rows ?? 4}
        className="text-body w-full resize-y rounded-md bg-transparent text-label placeholder:text-label-3 focus:outline-none focus-visible:outline-2 focus-visible:outline-blue"
      />
    </label>
  );
}
