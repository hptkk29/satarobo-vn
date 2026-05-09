import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Sata Robo — Hệ sinh thái Robotics & STEM giáo dục",
  description:
    "Sata Robo cung cấp các khóa học Lập trình Robot, Luyện thi RoboSim và giải pháp STEM toàn diện cho học sinh lớp 1-8 tại Đà Nẵng.",
  openGraph: {
    title: "Sata Robo — Hệ sinh thái Robotics & STEM giáo dục",
    description: "Khóa học Robotics & STEM hàng đầu tại Đà Nẵng cho học sinh lớp 1-8.",
    type: "website",
  },
};

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-orange-50 via-white to-purple-50 py-20 md:py-32">
        <div className="container mx-auto px-4 text-center">
          <div className="mx-auto max-w-3xl">
            <h1 className="mb-6 text-4xl font-bold leading-tight text-gray-900 md:text-5xl lg:text-6xl">
              Sata Robo —{" "}
              <span className="text-[#F97316]">Hệ sinh thái</span>
              <br />
              <span className="text-[#7C3AED]">Robotics & STEM</span> giáo dục
            </h1>
            <p className="mb-8 text-lg text-gray-600 md:text-xl">
              Trang bị kỹ năng công nghệ cho thế hệ tương lai. Khóa học Lập trình Robot, Luyện thi
              RoboSim và giải pháp STEM toàn diện dành cho học sinh lớp 1-8.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
              <Button
                asChild
                size="lg"
                className="bg-[#F97316] hover:bg-[#ea6c0a] text-white text-base"
              >
                <Link href="/lien-he">Đăng ký tư vấn miễn phí</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="text-base border-[#7C3AED] text-[#7C3AED] hover:bg-purple-50">
                <Link href="/khoa-hoc">Xem khoá học</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* 4 Sản phẩm — placeholder */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <h2 className="mb-10 text-center text-3xl font-bold text-gray-900">4 Dòng sản phẩm</h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              { code: "SP1", name: "RoboSim Online", color: "bg-orange-100 text-orange-700", href: "/khoa-hoc/luyen-thi-robosim" },
              { code: "SP2", name: "Robotics Offline", color: "bg-purple-100 text-purple-700", href: "/khoa-hoc/lap-trinh-robot" },
              { code: "SP3", name: "Sata Inno School", color: "bg-blue-100 text-blue-700", href: "/khoa-hoc" },
              { code: "SP4", name: "SATAGO Du lịch", color: "bg-green-100 text-green-700", href: "/khoa-hoc" },
            ].map((sp) => (
              <Link
                key={sp.code}
                href={sp.href}
                className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${sp.color} mb-3`}>
                  {sp.code}
                </span>
                <h3 className="text-lg font-semibold text-gray-900">{sp.name}</h3>
                <p className="mt-2 text-sm text-gray-500">Nội dung đang cập nhật...</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Stats placeholder */}
      <section className="bg-gray-50 py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4 text-center">
            {[
              { value: "4+", label: "Cơ sở tại Đà Nẵng" },
              { value: "1000+", label: "Học viên đã học" },
              { value: "5+", label: "Năm kinh nghiệm" },
              { value: "98%", label: "Phụ huynh hài lòng" },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="text-4xl font-bold text-[#F97316]">{stat.value}</div>
                <div className="mt-2 text-sm text-gray-600">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="bg-[#7C3AED] py-16 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="mb-4 text-3xl font-bold">Sẵn sàng cho hành trình STEM?</h2>
          <p className="mb-8 text-purple-200">Đăng ký tư vấn miễn phí — chúng tôi sẽ liên hệ trong vòng 24 giờ</p>
          <Button
            asChild
            size="lg"
            className="bg-[#F97316] hover:bg-[#ea6c0a] text-white text-base"
          >
            <Link href="/lien-he">Đăng ký ngay</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
