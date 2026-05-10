export interface Pain {
  id: number
  icon: string
  label: string
  title: string
  body: string
}

export const pains: Pain[] = [
  {
    id: 1,
    icon: '❌',
    label: 'SỰ THẬT 01',
    title: 'Đề thi đã mở công khai — và đó CHÍNH LÀ vấn đề.',
    body: 'Bố mẹ tưởng "con có đề trước là lợi thế"? Sai hoàn toàn.\n\nKhi cả nước đều có đề.\nKhi cả nước đều luyện free trên Youtube.\nKhi cả nước đều có 180 phút như nhau.\n\n→ Con bố mẹ KHÔNG còn lợi thế nào cả. Ai cũng giống ai.',
  },
  {
    id: 2,
    icon: '❌',
    label: 'SỰ THẬT 02',
    title: 'Học free → Đứng cùng đám đông → Bị loại cùng đám đông.',
    body: 'Đại đa số học sinh học free đạt mức điểm gần bằng nhau — mức trung bình chung của những người tự luyện.\n\nNghe có vẻ ổn? Không hề.\n\nBTC RBT2026 không cộng điểm cho "cố gắng". BTC chỉ chọn TOP — phần còn lại bị loại.\n\nMà mức điểm "trung bình chung"… nằm trong phần BỊ LOẠI.',
  },
  {
    id: 3,
    icon: '❌',
    label: 'SỰ THẬT 03',
    title: '180 phút thi — Con không kịp làm, mất điểm OAN.',
    body: 'Cùng 1 đề. Cùng 180 phút.\n\nCó bạn làm xong dư thời gian, ăn điểm tối đa từng câu.\nCó bạn loay hoay đến phút thứ 170 vẫn chưa qua câu khó.\n\nVì sao? Vì có bạn biết MẸO di chuyển robot nhanh. Có bạn biết TRICK ưu tiên câu nào trước. Có bạn được dạy KỸ THUẬT tránh bẫy mất điểm.\n\nCòn con bố mẹ thì… tự mò trên Youtube.',
  },
]
