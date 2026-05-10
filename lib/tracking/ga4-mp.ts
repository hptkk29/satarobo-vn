const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID
const GA4_SECRET = process.env.GA4_API_SECRET

interface Ga4Input {
  clientId: string
  userId?: string
  eventName: string
  params?: Record<string, unknown>
}

export async function sendGa4Event(
  input: Ga4Input,
): Promise<{ ok: boolean; error?: string }> {
  if (!GA4_ID || !GA4_SECRET) {
    console.warn('[ga4-mp] GA4_ID hoặc GA4_API_SECRET chưa set, skip')
    return { ok: false, error: 'NOT_CONFIGURED' }
  }

  try {
    const body = {
      client_id: input.clientId,
      user_id: input.userId,
      events: [
        {
          name: input.eventName,
          params: input.params ?? {},
        },
      ],
    }

    const res = await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${GA4_ID}&api_secret=${GA4_SECRET}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    )

    if (!res.ok) {
      const err = await res.text()
      return { ok: false, error: err }
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}
