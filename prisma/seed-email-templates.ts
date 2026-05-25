import { PrismaClient, EmailTemplateTrigger } from "@prisma/client";

const TEMPLATES = [
  {
    code: "ORDER_CONFIRMATION_VI",
    name: "Xác nhận đơn hàng (Tiếng Việt)",
    trigger: EmailTemplateTrigger.ORDER_CONFIRMATION,
    isActive: true,
    subject: "Đã nhận đơn hàng {{order_code}} - Sata Robo",
    bodyText: `Xin chào {{customer_name}},

Cảm ơn anh/chị đã đặt hàng tại Sata Robo!

Thông tin đơn hàng:
- Mã đơn: {{order_code}}
- Ngày đặt: {{order_date:date}}
- Tổng tiền: {{total_amount:currency}}
- Phương thức thanh toán: {{payment_method}}

Chi tiết đơn hàng:
{{items_list}}

Đội ngũ Sata Robo sẽ liên hệ xác nhận trong vòng 24h.

Trân trọng,
Sata Robo
Hotline: 0818823720`,
    bodyHtml: `<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
<div style="text-align: center; padding: 20px; background: linear-gradient(135deg, #f97316, #7e22ce); color: white; border-radius: 8px 8px 0 0;">
  <h1 style="margin: 0;">Sata Robo</h1>
  <p style="margin: 8px 0 0;">Cảm ơn anh/chị đã đặt hàng!</p>
</div>
<div style="background: white; padding: 24px; border: 1px solid #eee; border-radius: 0 0 8px 8px;">
  <p>Xin chào <strong>{{customer_name}}</strong>,</p>
  <p>Đơn hàng của anh/chị đã được tiếp nhận. Chúng tôi sẽ liên hệ xác nhận trong vòng 24h.</p>

  <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
    <tr><td style="padding: 8px; background: #f9fafb;"><strong>Mã đơn:</strong></td><td style="padding: 8px;">{{order_code}}</td></tr>
    <tr><td style="padding: 8px; background: #f9fafb;"><strong>Ngày đặt:</strong></td><td style="padding: 8px;">{{order_date:date}}</td></tr>
    <tr><td style="padding: 8px; background: #f9fafb;"><strong>Phương thức TT:</strong></td><td style="padding: 8px;">{{payment_method}}</td></tr>
    <tr><td style="padding: 8px; background: #f9fafb;"><strong>Tổng tiền:</strong></td><td style="padding: 8px; font-size: 18px; color: #f97316;"><strong>{{total_amount:currency}}</strong></td></tr>
  </table>

  <h3 style="border-bottom: 2px solid #f97316; padding-bottom: 8px;">Chi tiết đơn hàng</h3>
  {{items_list}}

  <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;" />
  <p style="text-align: center; color: #666; font-size: 13px;">
    Mọi thắc mắc liên hệ <strong>0818823720</strong> hoặc <strong>satarobo@gmail.com</strong>
  </p>
</div>
</body></html>`,
    availableVariables: [
      "customer_name",
      "order_code",
      "total_amount",
      "payment_method",
      "items_list",
      "order_date",
    ],
  },
  {
    code: "PAYMENT_RECEIPT_VI",
    name: "Biên nhận thanh toán (Tiếng Việt)",
    trigger: EmailTemplateTrigger.PAYMENT_RECEIPT,
    isActive: true,
    subject: "Xác nhận thanh toán đơn {{order_code}} - Sata Robo",
    bodyText: `Xin chào {{customer_name}},

Đơn hàng {{order_code}} đã thanh toán thành công.

Thông tin:
- Số tiền: {{total_amount:currency}}
- Phương thức: {{payment_method}}
- Thời gian: {{paid_at:datetime}}

Đội ngũ Sata Robo sẽ tiến hành các bước tiếp theo và liên hệ với anh/chị sớm.

Trân trọng,
Sata Robo`,
    bodyHtml: `<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
<div style="background: #10b981; color: white; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
  <div style="font-size: 48px;">✓</div>
  <h2 style="margin: 8px 0 0;">Thanh toán thành công</h2>
</div>
<div style="background: white; padding: 24px; border: 1px solid #eee; border-radius: 0 0 8px 8px;">
  <p>Xin chào <strong>{{customer_name}}</strong>,</p>
  <p>Cảm ơn anh/chị đã hoàn tất thanh toán cho đơn hàng <strong>{{order_code}}</strong>.</p>
  <div style="background: #f0fdf4; padding: 16px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 4px 0;"><strong>Số tiền:</strong> <span style="color: #10b981; font-size: 18px;">{{total_amount:currency}}</span></p>
    <p style="margin: 4px 0;"><strong>Phương thức:</strong> {{payment_method}}</p>
    <p style="margin: 4px 0;"><strong>Thời gian:</strong> {{paid_at:datetime}}</p>
  </div>
  <p>Đội ngũ Sata Robo sẽ liên hệ với anh/chị sớm để tiến hành các bước tiếp theo.</p>
</div>
</body></html>`,
    availableVariables: [
      "customer_name",
      "order_code",
      "total_amount",
      "payment_method",
      "paid_at",
    ],
  },
  {
    code: "RESERVATION_NOTICE_VI",
    name: "Thông báo bảo lưu (Tiếng Việt)",
    trigger: EmailTemplateTrigger.RESERVATION_NOTICE,
    isActive: true,
    subject: "Xác nhận bảo lưu - {{student_name}}",
    bodyText: `Xin chào {{parent_name}},

Sata Robo xác nhận đã ghi nhận yêu cầu bảo lưu cho học viên {{student_name}}.

Thông tin bảo lưu:
- Ngày bắt đầu: {{started_at:date}}
- Dự kiến trở lại: {{expected_end_at:date}}
- Lý do: {{reason}}

Trong thời gian bảo lưu, chỗ học của bé sẽ được giữ. Khi sẵn sàng trở lại, vui lòng liên hệ trước 3-5 ngày để chúng tôi sắp xếp lớp phù hợp.

Trân trọng,
Sata Robo`,
    bodyHtml: `<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
<div style="background: #fef3c7; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
  <div style="font-size: 32px;">🟡</div>
  <h2 style="margin: 8px 0 0; color: #92400e;">Đã ghi nhận bảo lưu</h2>
</div>
<div style="background: white; padding: 24px; border: 1px solid #eee; border-radius: 0 0 8px 8px;">
  <p>Xin chào <strong>{{parent_name}}</strong>,</p>
  <p>Sata Robo xác nhận đã ghi nhận yêu cầu bảo lưu cho học viên <strong>{{student_name}}</strong>.</p>
  <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
    <tr><td style="padding: 8px; background: #f9fafb;"><strong>Ngày bắt đầu:</strong></td><td style="padding: 8px;">{{started_at:date}}</td></tr>
    <tr><td style="padding: 8px; background: #f9fafb;"><strong>Dự kiến trở lại:</strong></td><td style="padding: 8px;">{{expected_end_at:date}}</td></tr>
    <tr><td style="padding: 8px; background: #f9fafb;"><strong>Lý do:</strong></td><td style="padding: 8px;">{{reason}}</td></tr>
  </table>
  <div style="background: #fefce8; padding: 12px; border-left: 3px solid #facc15; margin: 16px 0; font-size: 14px;">
    Chỗ học của bé sẽ được giữ trong thời gian bảo lưu. Vui lòng liên hệ trước 3-5 ngày khi bé sẵn sàng trở lại để chúng tôi sắp xếp lớp phù hợp.
  </div>
</div>
</body></html>`,
    availableVariables: [
      "student_name",
      "parent_name",
      "started_at",
      "expected_end_at",
      "reason",
    ],
  },
];

export async function seedEmailTemplates(prisma: PrismaClient) {
  for (const tpl of TEMPLATES) {
    await prisma.emailTemplate.upsert({
      where: { code: tpl.code },
      create: tpl,
      update: {}, // không overwrite nếu admin đã sửa
    });
    console.log(`[seed] Email template: ${tpl.code} ensured`);
  }
  console.log(`Seeded ${TEMPLATES.length} email templates`);
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedEmailTemplates(prisma)
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
