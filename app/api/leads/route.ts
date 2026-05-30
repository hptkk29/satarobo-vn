import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { db } from '@/lib/db'
import { leadCreateSchema } from '@/lib/validators/lead'
import { sendMetaCapi, sendGa4Event } from '@/lib/tracking'
import { rateLimit } from '@/lib/rate-limit'
import { findRecentDuplicate, logDuplicateAttempt } from '@/lib/lead/dedup'
import { autoAssignNewLead } from '@/lib/lead/auto-assign'

// Rate limit — uses Upstash Redis when env vars set, in-memory fallback otherwise.
const RATE_LIMIT_MAX = 5
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

    const limit = await rateLimit({
      key: `leads:${ip}`,
      max: RATE_LIMIT_MAX,
      windowMs: RATE_LIMIT_WINDOW_MS,
    })

    if (!limit.success) {
      return NextResponse.json(
        { ok: false, error: 'Quá nhiều request, vui lòng thử lại sau 1 phút' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((limit.resetAt - Date.now()) / 1000)),
            'X-RateLimit-Remaining': String(limit.remaining),
            'X-RateLimit-Reset': String(limit.resetAt),
          },
        },
      )
    }

    // ─── Chống trùng SĐT trong 90 ngày (Phase T1.3) ─────────────────
    // Nếu trùng → KHÔNG tạo lead mới, log vào lead gốc + trả về lead cũ.
    const duplicate = await findRecentDuplicate(data.phone)
    if (duplicate) {
      await logDuplicateAttempt(duplicate.id, data.phone, data.source ?? null)
      return NextResponse.json({ ok: true, leadId: duplicate.id, duplicate: true })
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

    // ─── Consult lead notification (Phase 5.13.1.FINAL) ──────────────
    // Chỉ gửi cho lead từ ConsultModal — detect qua source là course slug.
    const CONSULT_SLUGS = new Set([
      'sata1', 'sata2', 'sata3', 'sata4', 'sata5',
      'sata6', 'sata7', 'sata8', 'combo-sata1-sata2',
    ])
    if (data.source && CONSULT_SLUGS.has(data.source.toLowerCase())) {
      const noteText = data.note ?? ''
      const courseNameMatch = noteText.match(/Khóa quan tâm:\s*(.+?)(?:\n|$)/)
      const courseName = courseNameMatch?.[1]?.trim() ?? data.source
      const preferredTimeMatch = noteText.match(/Thời gian muốn liên hệ:\s*(.+?)(?:\n|$)/)
      const preferredTime = preferredTimeMatch?.[1]?.trim()

      const { sendConsultLeadNotification } = await import(
        '@/lib/email/consult-notification'
      )

      sendConsultLeadNotification({
        leadId: lead.id,
        parentName: lead.parentName,
        phone: lead.phone,
        email: lead.email,
        childName: lead.childName,
        courseSlug: data.source,
        courseName,
        preferredTime,
        landingPage: lead.landingPage,
        createdAt: lead.createdAt,
      }).catch((err) =>
        console.error('[/api/leads] consult notification error:', err),
      )
    }

    // ─── Auto-assign theo cơ sở → chế độ (Module CRM PHẦN 2) ─────────
    // Lead web chưa có assignedToId → định cơ sở rồi chia theo chế độ cơ sở.
    // Await để đảm bảo gán (serverless có thể kill fire-and-forget).
    await autoAssignNewLead(lead.id, {
      actorId: null,
      actorName: 'Hệ thống (web)',
    }).catch((err) => console.error('[/api/leads] auto-assign error:', err))

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
