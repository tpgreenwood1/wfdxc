"use client";

/** Last-resort boundary for errors in the root layout itself (error.tsx can't catch
 * those). Has to render its own <html>/<body>, so kept dependency-free. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 16, maxWidth: 420, margin: "0 auto" }}>
        <h1 style={{ fontSize: 20 }}>Something went wrong</h1>
        <p>Check your signal and try again. Anything already marked as saved is safe.</p>
        <button
          type="button"
          onClick={reset}
          style={{ minHeight: 48, width: "100%", fontSize: 16, fontWeight: 600 }}
        >
          Try again
        </button>
        <p>
          <a href="/">Home</a>
        </p>
      </body>
    </html>
  );
}
