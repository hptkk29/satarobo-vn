"use client";

// Phase 4.UI.FIX.3 PART E — uses locations data (already 2 cơ sở); dropdown auto-updates

import { useEffect, useState, type ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  GraduationCap,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Sparkles,
  User,
} from "lucide-react";
import { courseGroups, CONSULT_OPTION, type Course } from "./_data/courses-pricing";
import {
  isValidCourseSelection,
  readStoredCourseSelection,
  type CourseSelectionPayload,
} from "./_utils/courseSelection";
import { locations } from "./_data/locations";
import {
  handleLeadSubmission,
  validateVietnamPhone,
  validateEmail,
  trackPixelEvent,
  trackGA4Event,
} from "./_utils/tracking";

const ZALO_GROUP_LINK = "https://zalo.me/g/ovma9qgjuedypjy8mnxc";
const ZALO_FALLBACK = "https://zalo.me/0818823720";

interface FormData {
  name: string;
  phone: string;
  email: string;
  course: string;
  center: string;
  consent: boolean;
}

interface FormErrors {
  name?: string;
  phone?: string;
  email?: string;
  course?: string;
  center?: string;
  consent?: string;
}

export default function RegistrationForm() {
  const [formData, setFormData] = useState<FormData>({
    name: "",
    phone: "",
    email: "",
    course: "",
    center: "",
    consent: false,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(5);
  const [shouldRedirectToZalo, setShouldRedirectToZalo] = useState(true);

  useEffect(() => {
    if (!isSuccess || !shouldRedirectToZalo) return;
    if (redirectCountdown <= 0) {
      window.location.href = ZALO_GROUP_LINK;
      return;
    }
    const timer = setTimeout(() => setRedirectCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [isSuccess, shouldRedirectToZalo, redirectCountdown]);

  useEffect(() => {
    const applyCourseSelection = (payload: CourseSelectionPayload | null | unknown) => {
      if (!isValidCourseSelection(payload)) return;
      setFormData((prev) => ({ ...prev, course: payload.courseValue }));
      setErrors((prev) => ({ ...prev, course: "" }));
    };

    applyCourseSelection(readStoredCourseSelection());

    const handleCourseSelected = (event: Event) => {
      applyCourseSelection((event as CustomEvent).detail);
    };

    window.addEventListener("sata-course-selected", handleCourseSelected);
    return () => window.removeEventListener("sata-course-selected", handleCourseSelected);
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const target = e.target;
    const name = target.name as keyof FormData;
    const value = target instanceof HTMLInputElement && target.type === "checkbox"
      ? target.checked
      : target.value;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const validate = () => {
    const e: FormErrors = {};
    if (!formData.name.trim()) e.name = "Bố mẹ vui lòng nhập họ tên";
    else if (formData.name.trim().length < 2) e.name = "Họ tên quá ngắn";

    if (!formData.phone.trim()) e.phone = "Bố mẹ vui lòng nhập số điện thoại";
    else if (!validateVietnamPhone(formData.phone))
      e.phone = "Số điện thoại chưa đúng định dạng Việt Nam";

    if (formData.email && !validateEmail(formData.email)) e.email = "Email chưa đúng định dạng";
    if (!formData.course) e.course = "Bố mẹ vui lòng chọn khoá học";
    if (!formData.center) e.center = "Bố mẹ vui lòng chọn trung tâm";
    if (!formData.consent) e.consent = "Bố mẹ vui lòng đồng ý điều khoản";

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    trackPixelEvent("FormSubmitClick", { source: "registration-form" });
    trackGA4Event("form_submit_attempt", { source: "registration-form" });

    if (!validate()) {
      const firstErrorField = document.querySelector(".input-error");
      firstErrorField?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setIsSubmitting(true);
    try {
      await handleLeadSubmission({
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        course: formData.course,
        center: formData.center,
      });
      setIsSuccess(true);
    } catch (err) {
      console.error("Submit error:", err);
      alert("Có lỗi xảy ra, bố mẹ thử lại hoặc liên hệ Zalo 0818.823.720 nhé!");
    } finally {
      setIsSubmitting(false);
    }
  };

  const allCoursesList = courseGroups.flatMap((g) => g.courses);
  const selectedCourseObj = allCoursesList.find((c) => c.value === formData.course) ?? null;
  const isConsult = formData.course === CONSULT_OPTION.value;
  const fmt = (n?: number) => (n ? `${n.toLocaleString("vi-VN")}đ` : "-");
  const getDurationSummary = (course: Course) =>
    `${course.sessions} buổi - ${course.durationPerSession ?? "90 phút"}/buổi - Tổng ${course.totalDuration}`;

  if (isSuccess) {
    return (
      <section id="registration-form" className="section-padding bg-gradient-orange-purple relative overflow-hidden">
        <div className="container-site flex min-h-[34rem] items-center justify-center">
          <div className="mx-auto max-w-xl animate-fade-in rounded-3xl border-4 border-white/40 bg-white p-7 text-center shadow-2xl sm:p-10">
            <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full bg-success/10 sm:h-24 sm:w-24">
              <CheckCircle2 className="h-12 w-12 text-success sm:h-14 sm:w-14" strokeWidth={2.5} />
            </div>
            <h2 className="mb-4 text-2xl font-black text-text-dark sm:text-4xl">Đăng ký thành công!</h2>
            <p className="mb-6 text-base leading-relaxed text-text-muted sm:text-lg">
              Học viện <strong>Sata Robo</strong> đã nhận được thông tin của bố mẹ.
              <br />
              Tư vấn viên sẽ gọi trong vòng <strong className="text-primary-orange">24h</strong> để xếp lịch học trải nghiệm miễn phí.
            </p>

            {shouldRedirectToZalo ? (
              <div className="mb-6 inline-flex items-center gap-2 rounded-xl bg-soft-yellow p-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary-orange" />
                <span className="text-sm text-text-dark sm:text-base">
                  Tự động chuyển sang nhóm Zalo trong{" "}
                  <strong className="text-lg text-primary-orange">{redirectCountdown}s</strong>
                </span>
              </div>
            ) : (
              <div className="mb-6 inline-flex items-center gap-2 rounded-xl bg-soft-cream p-4">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <span className="text-sm text-text-dark sm:text-base">Thông tin đã được gửi thành công.</span>
              </div>
            )}

            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <a href={ZALO_GROUP_LINK} className="btn-primary">Tham gia nhóm Zalo ngay</a>
              <a href={ZALO_FALLBACK} target="_blank" rel="noopener noreferrer" className="btn-outline">
                Zalo cá nhân: 0818.823.720
              </a>
              {shouldRedirectToZalo && (
                <button type="button" onClick={() => setShouldRedirectToZalo(false)} className="btn-outline">
                  Ở lại trang
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="registration-form" className="section-padding bg-gradient-orange-purple relative overflow-hidden">
      <div className="absolute left-10 top-10 h-32 w-32 rounded-full bg-white/5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 h-40 w-40 rounded-full bg-white/5 blur-3xl pointer-events-none" />

      <div className="container-site relative z-10">
        <div className="mb-8 text-center sm:mb-12">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white backdrop-blur-sm sm:text-sm">
            <ClipboardList className="h-4 w-4" />
            ĐĂNG KÝ BUỔI HỌC TRẢI NGHIỆM MIỄN PHÍ
          </div>
          <h2 className="mb-4 text-3xl font-black leading-tight text-white sm:text-5xl">
            Bắt Đầu <span className="text-soft-yellow">Hành Trình</span><br />
            Của Con Ngay Hôm Nay
          </h2>
          <p className="mx-auto max-w-2xl text-base text-white/90 sm:text-lg">
            Bố mẹ vui lòng điền thông tin dưới đây - Sata Robo gọi tư vấn trong <strong>24h</strong> để xếp lịch học trải nghiệm miễn phí cho con.
          </p>
        </div>

        <div className="mx-auto max-w-2xl rounded-3xl bg-white p-6 shadow-2xl sm:p-10">
          <div className="mb-6 text-center">
            <h3 className="mb-1 flex items-center justify-center gap-2 text-xl font-black text-text-dark sm:text-2xl">
              <Sparkles className="h-6 w-6 text-primary-orange" />
              Thông Tin Đăng Ký
            </h3>
            <p className="text-xs text-text-muted sm:text-sm">
              Đăng ký tham gia học trải nghiệm miễn phí - Tư vấn lộ trình học phù hợp nhất cho con.
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div>
              <label htmlFor="name" className="mb-1.5 block text-sm font-bold text-text-dark">
                <User className="mr-1 inline h-4 w-4 text-primary-orange" />
                Họ và tên phụ huynh <span className="text-urgent">*</span>
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Ví dụ: Nguyễn Thị Lan"
                className={`w-full rounded-xl border-2 px-4 py-3 text-sm transition focus:outline-none sm:text-base ${
                  errors.name ? "input-error border-urgent animate-shake" : "border-gray-200 focus:border-primary-orange"
                }`}
              />
              {errors.name && <ErrorText>{errors.name}</ErrorText>}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="phone" className="mb-1.5 block text-sm font-bold text-text-dark">
                  <Phone className="mr-1 inline h-4 w-4 text-primary-orange" />
                  Số điện thoại <span className="text-urgent">*</span>
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="0912 345 678"
                  inputMode="tel"
                  className={`w-full rounded-xl border-2 px-4 py-3 text-sm transition focus:outline-none sm:text-base ${
                    errors.phone ? "input-error border-urgent animate-shake" : "border-gray-200 focus:border-primary-orange"
                  }`}
                />
                {errors.phone && <ErrorText>{errors.phone}</ErrorText>}
              </div>

              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-bold text-text-dark">
                  <Mail className="mr-1 inline h-4 w-4 text-primary-orange" />
                  Email <span className="text-xs font-normal text-text-muted">(không bắt buộc)</span>
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="email@gmail.com"
                  className={`w-full rounded-xl border-2 px-4 py-3 text-sm transition focus:outline-none sm:text-base ${
                    errors.email ? "input-error border-urgent animate-shake" : "border-gray-200 focus:border-primary-orange"
                  }`}
                />
                {errors.email && <ErrorText>{errors.email}</ErrorText>}
              </div>
            </div>

            <div>
              <label htmlFor="course" className="mb-1.5 block text-sm font-bold text-text-dark">
                <GraduationCap className="mr-1 inline h-4 w-4 text-primary-orange" />
                Khoá học quan tâm <span className="text-urgent">*</span>
              </label>
              <select
                id="course"
                name="course"
                value={formData.course}
                onChange={handleChange}
                className={`w-full rounded-xl border-2 bg-white px-4 py-3 text-sm transition focus:outline-none sm:text-base ${
                  errors.course ? "input-error border-urgent animate-shake" : "border-gray-200 focus:border-primary-orange"
                }`}
              >
                <option value="">-- Chọn khoá học --</option>
                {courseGroups.map((group) => (
                  <optgroup key={group.group} label={group.group}>
                    {group.courses.map((c) => (
                      <option key={c.id} value={c.value}>
                        {c.shortName}
                        {c.grade ? ` | ${c.grade}` : ""}
                        {` | ${c.sessions} buổi | ${c.durationPerSession}/buổi`}
                      </option>
                    ))}
                  </optgroup>
                ))}
                <option value={CONSULT_OPTION.value}>{CONSULT_OPTION.name}</option>
              </select>
              <p className="mt-1.5 text-[11px] text-text-muted">
                Early Bird áp dụng đến hết 31/05/2026 cho Sata1-Sata7. Sata8 là gói giá cố định, không giảm giá.
              </p>
              {errors.course && <ErrorText>{errors.course}</ErrorText>}

              {selectedCourseObj && (
                <CourseDetailBox course={selectedCourseObj} fmt={fmt} getDurationSummary={getDurationSummary} />
              )}

              {isConsult && (
                <div className="mt-3 animate-fade-in rounded-xl border border-primary-purple/30 bg-purple-50 p-4 text-sm">
                  <p className="font-semibold leading-relaxed text-primary-purple">
                    Tư vấn viên sẽ dựa trên lớp hiện tại, mục tiêu và lịch học của con để đề xuất khoá phù hợp nhất.
                  </p>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="center" className="mb-1.5 block text-sm font-bold text-text-dark">
                <MapPin className="mr-1 inline h-4 w-4 text-primary-orange" />
                Chọn cơ sở học <span className="text-urgent">*</span>
              </label>
              <select
                id="center"
                name="center"
                value={formData.center}
                onChange={handleChange}
                className={`w-full rounded-xl border-2 bg-white px-4 py-3 text-sm transition focus:outline-none sm:text-base ${
                  errors.center ? "input-error border-urgent animate-shake" : "border-gray-200 focus:border-primary-orange"
                }`}
              >
                <option value="">-- Chọn địa chỉ cơ sở --</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.address}>{loc.address}</option>
                ))}
              </select>
              {errors.center && <ErrorText>{errors.center}</ErrorText>}
            </div>

            <div>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  name="consent"
                  checked={formData.consent}
                  onChange={handleChange}
                  className="mt-0.5 h-5 w-5 flex-shrink-0 accent-primary-orange"
                />
                <span className="text-xs leading-relaxed text-text-muted sm:text-sm">
                  Tôi đồng ý nhận tin tư vấn từ <strong>Sata Robo</strong> qua điện thoại / Zalo và đồng ý với{" "}
                  <a href="/chinh-sach-bao-mat" className="text-primary-purple underline">chính sách bảo mật</a>{" "}
                  của Học viện.
                </span>
              </label>
              {errors.consent && <ErrorText>{errors.consent}</ErrorText>}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-gradient-orange-purple py-4 text-base font-black text-white shadow-lg transition hover:scale-[1.02] hover:shadow-xl active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 sm:text-lg"
            >
              {isSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Đang gửi thông tin...
                </span>
              ) : (
                "ĐĂNG KÝ NHẬN TƯ VẤN MIỄN PHÍ →"
              )}
            </button>

            <p className="border-t border-gray-100 pt-2 text-center text-xs text-text-muted">
              Thông tin của bạn được bảo mật tuyệt đối. Sata Robo cam kết không chia sẻ dữ liệu với bên thứ ba.
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}

function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p className="mt-1 flex items-center gap-1 text-xs text-urgent">
      <AlertCircle className="h-3.5 w-3.5" />
      {children}
    </p>
  );
}

interface CourseDetailBoxProps {
  course: Course;
  fmt: (n?: number) => string;
  getDurationSummary: (course: Course) => string;
}

function CourseDetailBox({ course, fmt, getDurationSummary }: CourseDetailBoxProps) {
  return (
    <div className="mt-3 animate-fade-in space-y-2 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="font-extrabold leading-tight text-text-dark">{course.name}</span>
        {course.badge && (
          <span className="flex-shrink-0 whitespace-nowrap rounded-full bg-primary-orange px-2 py-0.5 text-[10px] font-bold text-white">
            {course.badge}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
        {course.grade && <span>{course.grade}</span>}
        <span>{getDurationSummary(course)}</span>
        {course.device && <span>{course.device}</span>}
      </div>

      {course.comboPrice ? (
        <div className="space-y-1.5 border-t border-orange-200 pt-2">
          <div className="text-xs text-text-muted line-through">Giá niêm yết: {fmt(course.listPrice)}</div>
          <div className="rounded-lg bg-white/80 px-2.5 py-1.5 text-xs font-extrabold text-primary-orange">
            Giá combo: {fmt(course.comboPrice)}
          </div>
          <div className="rounded-lg bg-green-50 px-2.5 py-1.5 text-xs font-bold text-success">
            Tiết kiệm: {fmt(course.savedAmount)}
          </div>
          <p className="text-xs leading-relaxed text-text-muted">Bao gồm Robosim Master + Đấu trường Robot.</p>
        </div>
      ) : course.fixedPrice ? (
        <div className="space-y-1.5 border-t border-orange-200 pt-2">
          <div className="rounded-lg bg-white/80 px-2.5 py-1.5 text-xs font-extrabold text-primary-purple">
            Giá cố định: {fmt(course.fixedPrice)}
          </div>
          <div className="rounded-lg bg-green-50 px-2.5 py-1.5 text-xs font-bold text-success">
            Không giảm giá - Cam kết hoàn tiền 100%
          </div>
        </div>
      ) : (
        <div className="space-y-1.5 border-t border-orange-200 pt-2">
          <div className="text-xs text-text-muted line-through">Giá niêm yết: {fmt(course.listPrice)}</div>
          <div className="rounded-lg bg-white/80 px-2.5 py-1.5 text-xs font-extrabold text-primary-orange">
            Giá ưu đãi: {fmt(course.earlyBirdPrice)}
          </div>
          {course.installmentOutside && (
            <div className="rounded-lg bg-green-50 px-2.5 py-1.5 text-xs font-semibold text-success">
              Trả góp 0%: {fmt(course.installmentOutside)}/tháng
            </div>
          )}
        </div>
      )}
      <div className="border-t border-orange-200 pt-2 text-[11px] italic text-text-muted">{course.note}</div>
    </div>
  );
}
