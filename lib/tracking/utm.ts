export interface AttributionData {
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmTerm?: string
  utmContent?: string
  fbclid?: string
  gclid?: string
}

export function extractAttributionFromUrl(url: string): AttributionData {
  try {
    const parsed = new URL(url)
    const sp = parsed.searchParams
    return {
      utmSource: sp.get('utm_source') ?? undefined,
      utmMedium: sp.get('utm_medium') ?? undefined,
      utmCampaign: sp.get('utm_campaign') ?? undefined,
      utmTerm: sp.get('utm_term') ?? undefined,
      utmContent: sp.get('utm_content') ?? undefined,
      fbclid: sp.get('fbclid') ?? undefined,
      gclid: sp.get('gclid') ?? undefined,
    }
  } catch {
    return {}
  }
}
