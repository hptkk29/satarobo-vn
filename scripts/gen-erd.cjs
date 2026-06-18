/* Sinh ERD Mermaid (có attribute) từ prisma/schema.prisma — không cần DMMF. */
const fs = require('fs');
const path = require('path');

const SCHEMA = path.join(__dirname, '..', 'prisma', 'schema.prisma');
const OUT = path.join(__dirname, '..', 'Document', '2-architecture-design', 'ERD-database-attributes.md');

const raw = fs.readFileSync(SCHEMA, 'utf8');
// bỏ block comment /// docs giữ lại, nhưng ta xử lý theo dòng
const lines = raw.split(/\r?\n/);

// ---- 1) Thu thập tên enum & model ----
const enums = new Set();
const models = new Set();
for (const l of lines) {
  let m = l.match(/^enum\s+(\w+)\s*\{/); if (m) enums.add(m[1]);
  m = l.match(/^model\s+(\w+)\s*\{/); if (m) models.add(m[1]);
}

// ---- 2) Map kiểu Prisma -> Postgres ----
function pgType(base, dbAttr) {
  if (enums.has(base)) return base; // enum giữ tên
  const map = {
    String: 'text', Int: 'integer', BigInt: 'bigint', Boolean: 'boolean',
    // Prisma map DateTime -> timestamp(3) KHÔNG timezone theo mặc định (chỉ timestamptz nếu @db.Timestamptz).
    DateTime: 'timestamp', Decimal: 'numeric', Float: 'double', Json: 'jsonb', Bytes: 'bytea',
  };
  let t = map[base] || base;
  if (base === 'DateTime') {
    if (/@db\.Timestamptz/.test(dbAttr)) t = 'timestamptz';
    else if (/@db\.Date/.test(dbAttr)) t = 'date';
    else if (/@db\.Time\b/.test(dbAttr)) t = 'time';
  }
  if (base === 'String' && /@db\.VarChar/.test(dbAttr)) t = 'varchar';
  return t;
}

// ---- 3) Parse từng model ----
const parsed = {}; // name -> { cols:[{name,type,pk,fk,uk,list,fkTarget,relName}], rels:[{from,to,fkOpt,unique,relName,self}] }

let i = 0;
while (i < lines.length) {
  const head = lines[i].match(/^model\s+(\w+)\s*\{/);
  if (!head) { i++; continue; }
  const name = head[1];
  const body = [];
  i++;
  while (i < lines.length && !/^\}/.test(lines[i])) { body.push(lines[i]); i++; }
  i++; // skip }

  const fkFields = new Set();      // tên cột là FK
  const fkInfo = {};               // colName -> { target, relName, optional }
  const compoundPk = new Set();
  const compoundUk = new Set();    // mọi cột nằm trong bất kỳ @@unique (để gắn nhãn UK)
  const compoundUkSets = [];       // từng bộ @@unique([...]) (để xác định 1-1 chính xác)
  const fieldUnique = new Set();   // cột có @unique ở cấp field
  const rels = [];

  // pass 1: relation owner lines -> FK columns
  for (const lnRaw of body) {
    const ln = lnRaw.trim();
    if (ln.startsWith('@@id')) {
      const mm = ln.match(/@@id\(\[([^\]]+)\]/); if (mm) mm[1].split(',').forEach(s => compoundPk.add(s.trim()));
      continue;
    }
    if (ln.startsWith('@@unique')) {
      const mm = ln.match(/@@unique\(\[([^\]]+)\]/);
      if (mm) { const set = mm[1].split(',').map(s => s.trim()); set.forEach(s => compoundUk.add(s)); compoundUkSets.push(set); }
      continue;
    }
    if (/@unique\b/.test(ln) && !ln.startsWith('@@')) { const t = ln.trim().split(/\s+/)[0]; if (/^\w+$/.test(t)) fieldUnique.add(t); }
    const rel = ln.match(/@relation\(([^)]*)\)/);
    if (rel) {
      const args = rel[1];
      const fm = args.match(/fields:\s*\[([^\]]+)\]/);
      const relNameM = args.match(/"([^"]+)"/);
      const tok = ln.split(/\s+/);
      const targetType = (tok[1] || '').replace(/[\?\[\]]/g, '');
      if (fm && models.has(targetType)) {
        const fkCols = fm[1].split(',').map(s => s.trim());
        fkCols.forEach(c => { fkFields.add(c); fkInfo[c] = { target: targetType, relName: relNameM ? relNameM[1] : null }; });
      }
    }
  }

  // pass 2: columns + relation edges
  const cols = [];
  for (const lnRaw of body) {
    const ln = lnRaw.trim();
    if (!ln || ln.startsWith('//') || ln.startsWith('@@')) continue;
    const tok = ln.split(/\s+/);
    const fname = tok[0];
    if (!/^\w+$/.test(fname)) continue;
    const typeTokRaw = tok[1] || '';
    const baseType = typeTokRaw.replace(/[\?\[\]]/g, '');
    const isList = /\[\]/.test(typeTokRaw);
    const isOpt = /\?/.test(typeTokRaw);

    if (models.has(baseType)) {
      // navigation field — không phải cột. Nếu là owner (có fields:) -> tạo edge
      const rel = ln.match(/@relation\(([^)]*)\)/);
      if (rel && /fields:\s*\[/.test(rel[1])) {
        const fm = rel[1].match(/fields:\s*\[([^\]]+)\]/);
        const fkCols = fm[1].split(',').map(s => s.trim());
        const relNameM = rel[1].match(/"([^"]+)"/);
        rels.push({
          to: baseType, fromCols: fkCols, optional: isOpt,
          relName: relNameM ? relNameM[1] : null, self: baseType === name,
        });
      }
      continue;
    }

    // cột thực
    const pk = /@id\b/.test(ln) || compoundPk.has(fname);
    const uk = /@unique\b/.test(ln) || compoundUk.has(fname);
    const fk = fkFields.has(fname);
    cols.push({
      name: fname, type: pgType(baseType, ln), list: isList,
      pk, uk, fk, opt: isOpt,
      fkTarget: fk ? (fkInfo[fname] && fkInfo[fname].target) : null,
    });
  }

  // 1-1 chỉ khi FK đơn có @unique cấp field, HOẶC có @@unique trùng KHỚP đúng bộ FK.
  const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));
  for (const r of rels) {
    r.unique = (r.fromCols.length === 1 && fieldUnique.has(r.fromCols[0])) ||
      compoundUkSets.some(s => sameSet(s, r.fromCols));
  }

  parsed[name] = { cols, rels };
}

// ---- 4) Cụm nghiệp vụ ----
const CLUSTERS = [
  ['1. Tổ chức · Identity · RBAC', ['Center','OrgUnit','User','Account','VerificationToken','Employee','DepartmentDef','RoleDef','RolePermission','UserOrgRole','EmployeeOrgAssignment','UserPermissionGrant','RbacAuditLog','RbacShadowDiff','RoleAuditLog','UserAuditLog','PermissionGrantAuditLog']],
  ['2. Lead / CRM / Marketing', ['Lead','LeadChild','Note','LeadActivity','LeadTask','LeadDuplicate','LeadTransfer','LeadAuditLog','LeadAssignmentConfig','LeadAssignmentHistory','ConvertConflict','MessengerConversation','MessengerMessage','FacebookPageMapping','MarketingReport','MarketingCostPeriod','AdsInsightDaily','MarketingConfig','CommissionStatement','CommissionLine','CommissionRateConfig']],
  ['3. Học vụ — Course / Class / Enrollment', ['CourseCategoryDef','Course','CoursePrerequisite','CoursePackage','CourseDiscount','CourseCompletion','ClassGroup','Class','ClassSession','ClassSessionPlan','ClassAuditLog','Enrollment','EnrollmentAuditLog','Curriculum','Lesson','Room','Holiday']],
  ['4. Student & Portal phụ huynh', ['Student','StudentConsent','StudentSkillAssessment','StudentSessionFeedback','StudentAuditLog','StudentCenterHistory','StudentTransferRequest','StudentReserve','StudentRiskAlert','StudentCareTask','MakeupNeed','Attendance','ParentRequest','ParentFeedback','Survey','SurveyQuestion','SurveyResponse','ClassSessionMedia','MediaStudentTag','SataCoinTransaction','SataCoinRule','Notification','StaffNotification']],
  ['5. Giáo viên & Đánh giá', ['TeacherProfile','TeacherCourse','TeacherReview']],
  ['6. Thi & Bài tập', ['Question','Choice','Exam','ExamQuestion','ExamAttempt','ExamAnswer','Document','Assignment','AssignmentDocument','AssignmentSubmission','SubmissionRubricScore','ProgressReportLog']],
  ['7. Đơn hàng · Thanh toán · Khuyến mãi', ['PaymentMethod','PaymentMethodAuditLog','Order','OrderItem','OrderInstallment','OrderStatusHistory','Payment','Receipt','Voucher','VoucherRedemption','VoucherAuditLog','Promotion']],
  ['8. Kho / Vật tư (Inventory)', ['Product','ProductMovement','ProductAuditLog','ZMRoboKit','InventoryItem','StockBalance','StockMovement','InventoryAudit','InventoryAuditItem']],
  ['9. Trial (học thử) V1 & V2', ['TrialClass','TrialFeedback','TrialProgramConfig','TrialClassV2','TrialClassSession','TrialEnrollment','TrialAttendance']],
  ['10. HR · Chấm công · CMS · Tuyển dụng', ['WorkShiftConfig','ShiftRegistration','TimesheetAdjustmentRequest','TimesheetEditLog','CenterDayChecklist','EmployeeCheckin','JobPosting','JobApplication','Honor','News','TimelineItem','PageContent','SitePageContent','Testimonial']],
  ['11. Hệ thống · Tích hợp · Hạ tầng', ['EmailTemplate','EmailLog','EmailQueue','OtpRequest','OtpDeliveryLog','WebhookDelivery','IntegrationConfig','IntegrationLog','ZaloMessageLog','SystemSetting','CenterSetting','AuditLog','DomainEvent','IdempotencyKey','Counter']],
];

const assigned = new Set();
CLUSTERS.forEach(([, ms]) => ms.forEach(m => assigned.add(m)));
const leftovers = [...models].filter(m => !assigned.has(m));
if (leftovers.length) CLUSTERS.push(['12. Khác (chưa phân cụm)', leftovers]);

const clusterOf = {};
CLUSTERS.forEach(([title, ms]) => ms.forEach(m => { clusterOf[m] = title; }));

// ---- 5) Render Mermaid ----
function keyTag(c) {
  const t = [];
  if (c.pk) t.push('PK');
  if (c.fk) t.push('FK');
  if (c.uk && !c.pk) t.push('UK');
  return t.join(',');
}
function comment(c) {
  const bits = [];
  if (c.fk && c.fkTarget) bits.push('-> ' + c.fkTarget);
  if (c.list) bits.push('array');
  if (c.opt) bits.push('null');
  return bits.length ? `"${bits.join(' ')}"` : '';
}

let out = `# ERD chuẩn (PostgreSQL) — Sata Robo VN\n\n`;
out += `> Sinh tự động từ \`prisma/schema.prisma\` bằng \`scripts/gen-erd.cjs\` (snapshot ${new Date().toISOString().slice(0,10)}).\n`;
out += `> ${models.size} bảng, ${enums.size} enum. Mỗi cụm là 1 \`erDiagram\` Mermaid **có đầy đủ cột + kiểu Postgres + PK/FK/UK**.\n`;
out += `> Mở bằng VS Code (*Markdown Preview Mermaid Support*) hoặc GitHub để render.\n>\n`;
out += `> Ký hiệu khóa: **PK** primary key · **FK** foreign key · **UK** unique. Cột FK ghi chú \`-> Bảng đích\`; \`null\` = nullable; \`array\` = mảng Postgres.\n`;
out += `> Cardinality: \`||--o{\` 1—n (con optional) · \`||--o|\` 1—1 · \`(self)\` quan hệ tự tham chiếu.\n>\n`;
out += `> ⚠️ Kiểu \`timestamp\` ở đây phản ánh **hiện trạng** (Prisma map \`DateTime\` → \`timestamp(3)\` KHÔNG timezone vì schema chưa dùng \`@db.Timestamptz\`). Đây là một lỗi thiết kế — xem [ERD-review.md](./ERD-review.md) mục [5]. Đích cần đạt là \`timestamptz\`.\n\n`;
out += `**Mục lục cụm:**\n\n`;
CLUSTERS.forEach(([title]) => { out += `- ${title}\n`; });
out += `\n---\n\n`;

const crossAll = [];

for (const [title, ms] of CLUSTERS) {
  out += `## ${title}\n\n`;
  out += '```mermaid\nerDiagram\n';
  const inCluster = new Set(ms.filter(m => parsed[m]));
  // entities
  for (const m of ms) {
    if (!parsed[m]) continue;
    out += `    ${m} {\n`;
    for (const c of parsed[m].cols) {
      const kt = keyTag(c);
      const cm = comment(c);
      out += `        ${c.type} ${c.name}${kt ? ' ' + kt : ''}${cm ? ' ' + cm : ''}\n`;
    }
    out += `    }\n`;
  }
  // edges (intra-cluster); cross-cluster gom riêng
  const cross = [];
  for (const m of ms) {
    if (!parsed[m]) continue;
    for (const r of parsed[m].rels) {
      const right = r.unique ? 'o|' : 'o{';
      const label = (r.relName ? r.relName : r.fromCols.join('+')) + (r.self ? ' (self)' : '');
      const line = `    ${r.to} ||--${right} ${m} : "${label}"`;
      if (inCluster.has(r.to)) out += line + '\n';
      else cross.push({ from: m, to: r.to, label, toCluster: clusterOf[r.to] || '?' });
    }
  }
  out += '```\n\n';
  if (cross.length) {
    out += `<details><summary>FK liên cụm (${cross.length})</summary>\n\n`;
    for (const x of cross) out += `- \`${x.from}.${x.label}\` → \`${x.to}\` *(cụm ${x.toCluster})*\n`;
    out += `\n</details>\n\n`;
    crossAll.push(...cross);
  }
  out += `---\n\n`;
}

// thống kê
const totalCols = Object.values(parsed).reduce((a, p) => a + p.cols.length, 0);
out += `## Thống kê\n\n`;
out += `- Bảng: **${models.size}** · Enum: **${enums.size}** · Tổng cột: **${totalCols}** · Quan hệ liên cụm: **${crossAll.length}**.\n`;

fs.writeFileSync(OUT, out, 'utf8');
console.log('WROTE', OUT);
console.log('models', models.size, 'enums', enums.size, 'cols', totalCols, 'leftovers', leftovers.length, leftovers.join(','));
