import crypto from 'crypto'

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID
const CAPI_TOKEN = process.env.META_CAPI_TOKEN

function hash(value: string): string {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
}

interface MetaCapiInput {
  eventName: 'Lead' | 'Purchase' | 'Contact'
  eventId: string
  eventTime?: number
  eventSourceUrl?: string
  userData: {
    phone?: string
    email?: string
    fbp?: string
    fbc?: string
    clientIpAddress?: string
    clientUserAgent?: string
  }
  customData?: Record<string, unknown>
  actionSource?: 'website' | 'phone_call' | 'email'
}

export async function sendMetaCapi(
  input: MetaCapiInput,
): Promise<{ ok: boolean; error?: string }> {
  if (!PIXEL_ID || !CAPI_TOKEN) {
    console.warn('[meta-capi] PIXEL_ID hoặc CAPI_TOKEN chưa set, skip')
    return { ok: false, error: 'NOT_CONFIGURED' }
  }

  try {
    const userData: Record<string, string> = {}
    if (input.userData.phone)
      userData.ph = hash(input.userData.phone.replace(/\D/g, ''))
    if (input.userData.email) userData.em = hash(input.userData.email)
    if (input.userData.fbp) userData.fbp = input.userData.fbp
    if (input.userData.fbc) userData.fbc = input.userData.fbc
    if (input.userData.clientIpAddress)
      userData.client_ip_address = input.userData.clientIpAddress
    if (input.userData.clientUserAgent)
      userData.client_user_agent = input.userData.clientUserAgent

    const body = {
      data: [
        {
          event_name: input.eventName,
          event_id: input.eventId,
          event_time: input.eventTime ?? Math.floor(Date.now() / 1000),
          action_source: input.actionSource ?? 'website',
          event_source_url: input.eventSourceUrl,
          user_data: userData,
          custom_data: input.customData ?? {},
        },
      ],
    }

    const res = await fetch(
      `https://graph.facebook.com/v18.0/${PIXEL_ID}/events?access_token=${CAPI_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    )

    if (!res.ok) {
      const err = await res.text()
      console.error('[meta-capi] error:', err)
      return { ok: false, error: err }
    }

    return { ok: true }
  } catch (err) {
    console.error('[meta-capi] exception:', err)
    return { ok: false, error: String(err) }
  }
}
