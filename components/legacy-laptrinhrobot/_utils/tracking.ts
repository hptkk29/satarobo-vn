"use client";

// gtag/fbq global types declared in components/public/{ga4,meta-pixel}.tsx

export const GOOGLE_SHEET_URL =
  "https://script.google.com/macros/s/AKfycbw4Zlz8HyWqVp_no4m0DSsej61WPbmLoSwYrv9DCU6qzy-OOimZe8LtFFVl5z8k_ruK/exec";

interface LeadData {
  name?: string;
  phone?: string;
  email?: string;
  center?: string;
  course?: string;
}

export function trackFacebookLead(data: LeadData = {}): void {
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    try {
      window.fbq("track", "Lead", {
        content_name: data.course || "Khóa học Robotics",
        content_category: data.center || "Sata Robo Đà Nẵng",
        value: 0,
        currency: "VND",
      });
    } catch (err) {
      console.warn("[Pixel] Track Lead error:", err);
    }
  }
}

export function trackPixelEvent(eventName: string, data: Record<string, unknown> = {}): void {
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    try {
      window.fbq("trackCustom", eventName, data);
    } catch (err) {
      console.warn("[Pixel] Custom track error:", err);
    }
  }
}

export function trackGA4Lead(data: LeadData = {}): void {
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    try {
      window.gtag("event", "generate_lead", {
        course_name: data.course || "Không xác định",
        center: data.center || "Không xác định",
        currency: "VND",
        value: 0,
      });
    } catch (err) {
      console.warn("[GA4] Track lead error:", err);
    }
  }
}

export function trackGA4Event(eventName: string, params: Record<string, unknown> = {}): void {
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    try {
      window.gtag("event", eventName, params);
    } catch (err) {
      console.warn("[GA4] Event track error:", err);
    }
  }
}

export async function submitLeadToSheet(formData: LeadData): Promise<{ success: boolean; error?: string }> {
  try {
    const sheetPayload = JSON.stringify({
      name: formData.name || "",
      phone: formData.phone || "",
      email: formData.email || "",
      center: formData.center || "",
      course: formData.course || "",
    });

    await fetch(GOOGLE_SHEET_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: sheetPayload,
    });

    return { success: true };
  } catch (err) {
    console.error("[Sheet] Submit error:", err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function submitLeadToApi(formData: LeadData): Promise<void> {
  // Phase 4.UI.RESET.2 PART D1 — write to internal Lead table alongside Google Sheet.
  // Errors swallowed: do NOT break form submit when Lead fails.
  try {
    const eventId = `ltr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const note = [
      formData.course ? `Khoá: ${formData.course}` : null,
      formData.center ? `Cơ sở: ${formData.center}` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parentName: formData.name || "",
        phone: formData.phone || "",
        email: formData.email || "",
        source: "laptrinhrobot-landing",
        eventId,
        landingPage:
          typeof window !== "undefined" ? window.location.href : undefined,
        referrer:
          typeof document !== "undefined" ? document.referrer || undefined : undefined,
        note: note || undefined,
        consentMarketing: true,
      }),
    });
  } catch (err) {
    console.warn("[Lead API] submit failed (non-blocking):", err);
  }
}

export async function handleLeadSubmission(formData: LeadData) {
  const sheetResult = await submitLeadToSheet(formData);
  // Fire-and-forget Lead API write (non-blocking, errors logged only).
  void submitLeadToApi(formData);
  trackFacebookLead({ course: formData.course, center: formData.center });
  trackGA4Lead({ course: formData.course, center: formData.center });
  return sheetResult;
}

export function validateVietnamPhone(phone: string): boolean {
  const cleaned = phone.replace(/\s|-|\./g, "");
  return /^(0|\+84)[35789]\d{8}$/.test(cleaned);
}

export function validateEmail(email: string): boolean {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
