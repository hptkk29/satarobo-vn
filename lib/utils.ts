import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatVnd(amount: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(amount);
}

/** Mask phone: 09xxxxxxx20 → 09xxxxx20 */
export function maskPhone(phone: string): string {
  if (phone.length < 6) return phone;
  const visible = 3;
  return phone.slice(0, visible) + "x".repeat(phone.length - visible * 2) + phone.slice(-visible);
}

/** Mask email: abc@gmail.com → ab*@gmail.com */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain || local.length <= 2) return email;
  return local.slice(0, 2) + "*".repeat(local.length - 2) + "@" + domain;
}

/** Format phone for display: "0818823720" → "0818 823 720" */
export function formatPhoneVn(phone: string): string {
  const clean = phone.replace(/\D/g, "");
  if (clean.length === 10) {
    return `${clean.slice(0, 4)} ${clean.slice(4, 7)} ${clean.slice(7)}`;
  }
  return phone;
}

/** Encode address into Google Maps search URL */
export function generateGoogleMapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
