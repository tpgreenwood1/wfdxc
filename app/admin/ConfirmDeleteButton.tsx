"use client";

import { useState, useTransition } from "react";

export default function ConfirmDeleteButton({
  action,
  fieldName,
  fieldValue,
  confirmMessage,
  label = "Delete",
}: {
  action: (formData: FormData) => Promise<{ error?: string } | void>;
  fieldName: string;
  fieldValue: string;
  confirmMessage: string;
  label?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (!confirm(confirmMessage)) return;
    setError(null);
    const formData = new FormData();
    formData.set(fieldName, fieldValue);
    startTransition(async () => {
      try {
        const result = await action(formData);
        if (result?.error) setError(result.error);
      } catch {
        setError("Couldn't delete — please try again.");
      }
    });
  }

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        className="min-h-[36px] px-2 text-sm text-red-600 disabled:opacity-50"
        disabled={isPending}
        onClick={handleClick}
      >
        {isPending ? "Deleting…" : label}
      </button>
      {error && (
        <span role="alert" className="max-w-xs text-xs text-red-700">
          {error}
        </span>
      )}
    </span>
  );
}
