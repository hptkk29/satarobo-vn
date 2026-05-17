// Sentry server-side init (Node runtime — pages/api, app router server actions, RSC).
// Docs: https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    // Don't send detailed Prisma queries with PII to Sentry
    sendDefaultPii: false,
    integrations: [
      // Capture HTTP errors from outgoing fetch (Resend, Meta CAPI, GA4 MP).
      // (Sentry v10+ tự auto-trace HTTP — không cần option `tracing`.)
      Sentry.httpIntegration(),
      // Prisma integration auto-instruments query spans
      // Sentry.prismaIntegration() — enable manually if needed
    ],
    beforeSend(event) {
      // Strip cookies + auth headers from server events
      if (event.request) {
        delete event.request.cookies;
        if (event.request.headers) {
          delete event.request.headers["authorization"];
          delete event.request.headers["cookie"];
        }
      }
      return event;
    },
  });
}
