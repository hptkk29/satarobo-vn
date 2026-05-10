import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { db } from '@/lib/db'
import { leadCreateSchema } from '@/lib/validators/lead'
import { sendMetaCapi, sendGa4Event } from '@/lib/tracking'

// In-memory rate limit. Replace with Upstash or Redis when scaling beyond one instance.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_MAX = 3
const RATE_LIMIT_WINDOW_MS = 60_000

export async function POST(req: NextRequest) {
  try {
    const headersList = await headers()
    const ip =
      headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      headersList.get('x-real-ip') ??
      'unknown'

    // Read body before rate limiting so validation probes and bot traps do not
    // consume the real lead submission quota.
    const body = await req.json()

    if (typeof body?.website === 'string' && body.website.length > 0) {
      console.warn('[POST /api/leads] honeypot triggered, ip:', ip)
      return NextResponse.json({ ok: true, leadId: 'hp-' + Date.now() })
    }

    const parsed = leadCreateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Dữ liệu không hợp lệ', issues: parsed.error.issues },
        { status: 400 },
      )
    }

    const data = parsed.data

    if (data.timeOnPage !== undefined && data.timeOnPage < 3) {
      console.warn('[POST /api/leads] suspicious timeOnPage:', data.timeOnPage, 'ip:', ip)
      return NextResponse.json({ ok: true, leadId: 'ab-' + Date.now() })
    }

    const now = Date.now()
    const limit = rateLimitMap.get(ip)
    if (limit && limit.resetAt > now) {
      if (limit.count >= RATE_LIMIT_MAX) {
        return NextResponse.json(
          { ok: false, error: 'Quá nhiều request, vui lòng thử lại sau 1 phút' },
          { status: 429 },
        )
      }
      limit.count++
    } else {
      rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    }

    let courseId = data.courseId
    if (!courseId && data.source) {
      const course = await db.course.findUnique({ where: { slug: data.source } })
      courseId = course?.id
    }

    const lead = await db.lead.create({
      data: {
        parentName: data.parentName.trim(),
        childName: data.childName?.trim(),
        childAge: data.childAge,
        phone: data.phone,
        email: data.email || undefined,
        centerId: data.centerId,
        courseId,
        source: data.source,
        status: 'NEW',
        utmSource: data.utmSource,
        utmMedium: data.utmMedium,
        utmCampaign: data.utmCampaign,
        utmTerm: data.utmTerm,
        utmContent: data.utmContent,
        fbclid: data.fbclid,
        gclid: data.gclid,
        fbp: data.fbp,
        fbc: data.fbc,
        landingPage: data.landingPage,
        referrer: data.referrer,
        eventId: data.eventId,
        consentMarketing: data.consentMarketing,
        ipAddress: ip,
        userAgent: headersList.get('user-agent') ?? undefined,
        note: data.note,
      },
    })

    Promise.all([
      sendMetaCapi({
        eventName: 'Lead',
        eventId: data.eventId,
        eventSourceUrl: data.landingPage,
        userData: {
          phone: data.phone,
          email: data.email,
          fbp: data.fbp,
          fbc: data.fbc,
          clientIpAddress: ip,
          clientUserAgent: headersList.get('user-agent') ?? undefined,
        },
        customData: {
          content_name: data.source,
          content_category: 'lead',
        },
      }),
      sendGa4Event({
        clientId: data.fbp ?? data.eventId,
        eventName: 'generate_lead',
        params: {
          source: data.source,
          utm_source: data.utmSource,
          utm_medium: data.utmMedium,
          utm_campaign: data.utmCampaign,
        },
      }),
    ]).catch((err) => {
      console.error('[tracking-error]', err)
    })

    return NextResponse.json({ ok: true, leadId: lead.id })
  } catch (error) {
    console.error('[POST /api/leads]', error)
    return NextResponse.json({ ok: false, error: 'Lỗi hệ thống' }, { status: 500 })
  }
}
