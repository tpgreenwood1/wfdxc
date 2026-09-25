"use client";

import { useFormStatus } from "react-dom";

/** Plain form submit button that disables itself and shows `pendingLabel` while the
 * form's server action runs. Must be rendered inside the <form>. */
export default function SubmitButton({
  className,
  pendingLabel = "Saving…",
  children,
}: {
  className?: string;
  pendingLabel?: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className ?? ""} disabled:cursor-wait disabled:opacity-60`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
