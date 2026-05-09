import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Users, UserPlus, BookOpen, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  MANAGER: "Quản lý",
  SALES: "Sales",
  TEACHER: "Giáo viên",
  MARKETING: "Marketing",
  ACCOUNTANT: "Kế toán",
};

const STATS = [
  { title: "Tổng lead", value: "0", icon: Users, color: "text-blue-600 bg-blue-50" },
  { title: "Lead mới hôm nay", value: "0", icon: UserPlus, color: "text-orange-600 bg-orange-50" },
  { title: "Lớp đang chạy", value: "0", icon: BookOpen, color: "text-purple-600 bg-purple-50" },
  { title: "Doanh thu tháng", value: "0 ₫", icon: TrendingUp, color: "text-green-600 bg-green-50" },
];

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const roleLabel = ROLE_LABELS[session.user.role] ?? session.user.role;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Chào {session.user.name ?? "Admin"} 👋
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Vai trò: <span className="font-medium text-[#7C3AED]">{roleLabel}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="border-0 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">{stat.title}</CardTitle>
                <div className={`rounded-lg p-2 ${stat.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
                <p className="mt-1 text-xs text-gray-400">Dữ liệu sẽ cập nhật sau</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-8 rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center text-gray-400">
        <p className="text-sm">Các widget dashboard sẽ được xây dựng ở Phase 2</p>
      </div>
    </div>
  );
}
