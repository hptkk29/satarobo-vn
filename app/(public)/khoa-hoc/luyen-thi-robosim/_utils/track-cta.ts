type CourseLevel = 'R1' | 'R2'

const SLUGS: Record<CourseLevel, string> = {
  R1: 'robotics/khoa-hoc/full-de-luyen-thi-vong-loai-robosim-hau-can-thong-minh-bang-r1-cuoc-thi-sang-tao-robotics-2026',
  R2: 'robotics/khoa-hoc/full-de-luyen-thi-vong-loai-robosim-hau-can-thong-minh-bang-r2-cuoc-thi-sang-tao-robotics-2026',
}

export function trackAndOpen(level: CourseLevel, eventName: string) {
  if (typeof window === 'undefined') return

  if (window.gtag) {
    window.gtag('event', eventName, { event_category: 'CTA', event_label: level })
  }
  if (window.fbq) {
    window.fbq('track', 'Lead', { content_name: level })
  }

  const url = `https://sataworld.vn/${SLUGS[level]}?utm_source=luyenthirobosim&utm_medium=${eventName}&utm_campaign=rbt2026`
  window.open(url, '_blank', 'noopener,noreferrer')
}
