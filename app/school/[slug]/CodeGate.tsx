"use client";

import { useFormState, useFormStatus } from "react-dom";
import { usePathname, useSearchParams } from "next/navigation";
import { unlockSchoolAction, type UnlockState } from "./actions";

function OpenButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-[48px] w-full rounded-lg bg-blue-600 font-semibold text-white disabled:opacity-50"
    >
      {pending ? "Checking…" : "Open"}
    </button>
  );
}

/** Shown in place of any school page until this device has been unlocked with the
 * school's code (once — it's remembered for a year). */
export default function CodeGate({ slug }: { slug: string }) {
  const pathname = usePathname();
  const cameFromBadLink = useSearchParams().get("codeError") === "1";
  const [state, formAction] = useFormState<UnlockState, FormData>(
    unlockSchoolAction.bind(null, slug),
    { error: cameFromBadLink ? "That link's code has changed — enter your current school code." : null }
  );

  return (
    <form action={formAction} className="space-y-3 rounded-lg border p-4">
      <label htmlFor="school-code" className="block font-semibold">
        Enter your school code
      </label>
      <input type="hidden" name="returnTo" value={pathname} />
      <input
        id="school-code"
        name="code"
        required
        autoFocus
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        maxLength={12}
        placeholder="e.g. K7P4QX"
        className="min-h-[48px] w-full rounded-lg border px-3 text-center font-mono text-xl uppercase tracking-widest"
      />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <OpenButton />
      <p className="text-sm text-gray-600">
        Your code is on the link from the league organiser. You only need to enter it
        once on this phone.
      </p>
    </form>
  );
}
