// Sentry client-side init.
// Auto-loaded by Next.js when present at project root.
// Docs: https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    // Sample 10% of regular traces. Increase if traffic is low; decrease if billing cap.
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    // Replay always for errors, 10% sessions for general UX investigation
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    // Don't capture noise we can't act on
    ignoreErrors: [
      // Browser extensions / network noise
      "ResizeObserver loop limit exceeded",
      "Non-Error promise rejection captured",
      "Network request failed",
      "Failed to fetch",
      // Common AdBlock/extension errors
      /chrome-extension/,
      /moz-extension/,
    ],
    beforeSend(event, hint) {
      // Strip PII from URL params if present (e.g. `phone=...`)
      if (event.request?.url) {
        try {
          const url = new URL(event.request.url);
          ["phone", "email", "parentName", "childName"].forEach((p) => {
            if (url.searchParams.has(p)) url.searchParams.set(p, "[REDACTED]");
          });
          event.request.url = url.toString();
        } catch {
          // Ignore parse errors
        }
      }
      return event;
    },
  });
}
