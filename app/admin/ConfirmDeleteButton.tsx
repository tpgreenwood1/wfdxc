"use client";

import { useTransition } from "react";

export default function ConfirmDeleteButton({
  action,
  fieldName,
  fieldValue,
  confirmMessage,
}: {
  action: (formData: FormData) => Promise<void>;
  fieldName: string;
  fieldValue: string;
  confirmMessage: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm(confirmMessage)) return;
    const formData = new FormData();
    formData.set(fieldName, fieldValue);
    startTransition(async () => {
      try {
        await action(formData);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to delete");
      }
    });
  }

  return (
    <button
      type="button"
      className="text-xs text-red-600 disabled:opacity-50"
      disabled={isPending}
      onClick={handleClick}
    >
      {isPending ? "Deleting…" : "Delete"}
    </button>
  );
}
