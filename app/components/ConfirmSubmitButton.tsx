"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";

/** Submit button that asks first, then shows `pendingLabel` and disables itself until
 * the server action finishes — so a slow finalise isn't tapped twice.
 *
 * Asks in an in-page <dialog> rather than window.confirm(): browsers can silently
 * suppress confirm() (a "don't allow dialogs from this site" choice, some in-app
 * browsers), which made the button do nothing at all. Must be rendered inside the
 * <form>; the dialog's confirm button submits that form. */
export default function ConfirmSubmitButton({
  confirmMessage,
  className,
  pendingLabel = "Working…",
  confirmLabel = "OK",
  children,
}: {
  confirmMessage: string;
  className?: string;
  pendingLabel?: string;
  confirmLabel?: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const close = () => dialogRef.current?.close();

  return (
    <>
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        className={`${className ?? ""} disabled:cursor-wait disabled:opacity-60`}
        onClick={() => dialogRef.current?.showModal()}
      >
        {pending ? pendingLabel : children}
      </button>
      <dialog
        ref={dialogRef}
        // Tapping the dim backdrop (the dialog element itself, outside the panel) cancels.
        onClick={(e) => e.target === e.currentTarget && close()}
        className="w-[calc(100%-2rem)] max-w-md rounded-2xl p-0 backdrop:bg-black/40"
      >
        <div className="space-y-4 p-4">
          <p className="whitespace-pre-line text-sm text-gray-900">{confirmMessage}</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="min-h-[44px] rounded-lg px-4 font-medium text-gray-700 ring-1 ring-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              autoFocus
              onClick={close}
              className="min-h-[44px] rounded-lg bg-blue-700 px-4 font-medium text-white"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
