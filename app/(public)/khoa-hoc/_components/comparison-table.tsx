import { CheckCircle, Minus } from 'lucide-react'

interface Row {
  criteria: string
  sp1: string
  sp2: string
  sp3: string
  sp4: string
}

const ROWS: Row[] = [
  {
    criteria: 'Đối tượng',
    sp1: 'HS lớp 3–9',
    sp2: 'HS lớp 1–9',
    sp3: 'Trường K-12',
    sp4: 'HS K-12',
  },
  {
    criteria: 'Hình thức',
    sp1: 'Online 100%',
    sp2: 'Offline tại trung tâm',
    sp3: 'B2B tại trường',
    sp4: 'Trải nghiệm thực địa',
  },
  {
    criteria: 'Thời gian',
    sp1: 'Linh hoạt, tự học',
    sp2: '2–5 năm (lộ trình)',
    sp3: 'Theo dự án / học kỳ',
    sp4: '1–3 ngày / tour',
  },
  {
    criteria: 'Học phí',
    sp1: '490.000đ+',
    sp2: '1.990.000đ+',
    sp3: 'Báo giá',
    sp4: 'Báo giá',
  },
  {
    criteria: 'Phù hợp với',
    sp1: 'Tự học, luyện thi nhanh',
    sp2: 'Học bài bản, dài hạn',
    sp3: 'Trường muốn STEM hoá',
    sp4: 'Phụ huynh, trường tổ chức đoàn',
  },
  {
    criteria: 'Học cụ riêng',
    sp1: 'Không (sa bàn ảo)',
    sp2: 'Có — bộ riêng cho học viên',
    sp3: 'Có — Lab đầy đủ',
    sp4: 'Có tại địa điểm trải nghiệm',
  },
  {
    criteria: 'Chứng chỉ',
    sp1: 'Chứng nhận hoàn thành',
    sp2: 'Chứng nhận cấp độ',
    sp3: 'Theo chương trình trường',
    sp4: 'Chứng nhận tham gia',
  },
]

const HEADERS = [
  { key: 'sp1', label: 'SP1 — RoboSim', color: '#F97316' },
  { key: 'sp2', label: 'SP2 — Offline', color: '#7C3AED' },
  { key: 'sp3', label: 'SP3 — Inno School', color: '#1D4ED8' },
  { key: 'sp4', label: 'SP4 — SATAGO', color: '#059669' },
]

export function ComparisonTable() {
  return (
    <section
      className="section-padding"
      style={{ background: 'linear-gradient(160deg, #f5f3ff 0%, #ffffff 60%, #fff9f5 100%)' }}
    >
      <div className="container-site">
        <div className="text-center mb-12">
          <span className="badge-purple mb-3 inline-block">So sánh</span>
          <h2 className="heading-2 text-text-dark">
            Bảng so sánh{' '}
            <span className="text-gradient-orange-purple">4 sản phẩm</span>
          </h2>
          <p className="text-text-muted mt-3">
            Chọn đúng sản phẩm phù hợp — một cái nhìn tổng quan
          </p>
        </div>

        {/* Wrapper scroll horizontal trên mobile */}
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr>
                <th className="text-left p-4 text-text-muted font-semibold w-[160px]">
                  Tiêu chí
                </th>
                {HEADERS.map((h) => (
                  <th key={h.key} className="p-4 text-center">
                    <span
                      className="inline-block px-3 py-1.5 rounded-full text-white font-bold text-xs"
                      style={{ background: h.color }}
                    >
                      {h.label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                <tr
                  key={row.criteria}
                  className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}
                >
                  <td className="p-4 font-semibold text-text-dark rounded-l-xl">
                    {row.criteria}
                  </td>
                  {HEADERS.map((h) => {
                    const val = row[h.key as keyof Row]
                    return (
                      <td key={h.key} className="p-4 text-center text-text-muted last:rounded-r-xl">
                        {val === 'Có' ? (
                          <CheckCircle className="w-5 h-5 text-success mx-auto" />
                        ) : val === 'Không' ? (
                          <Minus className="w-4 h-4 text-gray-300 mx-auto" />
                        ) : (
                          val
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
