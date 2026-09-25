/** What teacher-facing server actions return instead of throwing — Next hides thrown
 * messages in production, so the teacher would only ever see a generic error. */
export type ActionResult<T extends object = object> =
  | ({ error?: undefined } & T)
  | { error: string };

/** Runs a server action body, turning a thrown error into `{ error }`. */
export async function toActionResult<T extends object>(
  fn: () => Promise<T>
): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong." };
  }
}
