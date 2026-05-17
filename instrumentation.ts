// Next.js 16 instrumentation hook — runs once at server startup.
// Loads Sentry server/edge configs based on runtime.
// Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Capture errors from React Server Components + Route Handlers.
// Sentry v10 renamed the export to `captureRequestError`; alias to match
// Next.js 16 instrumentation contract.
export { captureRequestError as onRequestError } from "@sentry/nextjs";
