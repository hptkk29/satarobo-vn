/**
 * 🔴 MỘT VÒNG HỌC THẬT, bằng trình duyệt.
 *
 * Vì sao spec này tồn tại: bản kiểm đối chiếu mã thật (27/08/2026) cho ra kết quả
 * khó chịu — module gần đủ mã, 6009 test đơn vị xanh, mà **chưa ai đi hết được một
 * vòng nào**. Trang chủ khu là khung tạm 0 link, `/elearning/hoc/{id}` chưa bao giờ
 * có tệp dù ba thông báo trỏ vào đó, và `/elearning/soan-khoa` là link chết.
 *
 * Không test nào bắt được, vì hai spec e2e duy nhất của khu (`employee-gate`,
 * `host-routing`) đều là `fixme`: job CI `e2e-elearning` chạy mỗi lần, xanh mỗi
 * lần, và **chưa từng mở một trang e-learning nào**.
 *
 * ⚠️ Spec này KHÔNG kiểm logic — logic đã có 6009 test. Nó kiểm ĐƯỜNG ĐI: người
 * thật, trình duyệt thật, bấm từ trang chủ tới khi khoá chuyển sang hoàn thành. Đó
 * là thứ duy nhất phân biệt "mã chạy đúng" với "dùng được".
 */
import { test, expect, type Page } from "@playwright/test";
import { login } from "../_helpers/auth";
import {
  dungVongHoc,
  trangThaiGhiDanh,
  type BoDuLieu,
} from "./_helpers/seed-elearning";

/**
 * ⚠️ CHẠY TUẦN TỰ, cố ý.
 *
 * Cấu hình chung bật `fullyParallel`, nên các ca trong cùng tệp chia cho nhiều
 * worker và chạy KHÔNG theo thứ tự viết. Tệp này là một hành trình: ca "cổng đồng ý
 * chặn" chỉ đúng khi người học CHƯA xác nhận, mà ca cuối lại xác nhận để học tiếp.
 * Chạy song song thì hai ca đó tráo nhau và ca đầu đỏ oan — đã đỏ đúng như vậy một
 * lần trước khi thêm dòng này.
 *
 * Đây KHÔNG phải cách vá test rung. Một vòng học là chuỗi có trước có sau; ép nó
 * song song mới là mô tả sai việc thật.
 */
test.describe.configure({ mode: "serial" });

let d: BoDuLieu;

test.beforeAll(async () => {
  d = await dungVongHoc();
});

async function vaoKhu(page: Page, email: string) {
  await login(page, { email, callbackUrl: "/elearning" });
  await expect(page).toHaveURL(/\/elearning/);
}

/**
 * Xác nhận chính sách theo dõi học tập.
 *
 * ⚠️ KHÔNG seed sẵn ở DB. Đây là cổng đầu tiên mọi người mới đâm vào, và chính chỗ
 * spec này chết ở lần chạy đầu: màn chặn bảo "vào mục Dữ liệu của tôi rồi xác nhận"
 * mà không có link nào tới đó, còn thanh điều hướng của người học thuần cũng không
 * có mục ấy. Seed sẵn cờ đồng ý là bước qua đúng cái lỗ cần canh.
 */
async function xacNhanChinhSach(page: Page) {
  await page.goto("/elearning/du-lieu-cua-toi");
  // Đã xác nhận ở một ca trước trong cùng tệp thì nút không còn — không phải lỗi.
  const nut = page.getByRole("button", { name: /^Tôi xác nhận bản/ });
  if ((await nut.count()) === 0) {
    await expect(page.getByText("Bạn đã xác nhận bản")).toBeVisible();
    return;
  }
  await nut.click();
  await expect(page.getByText("Bạn đã xác nhận bản")).toBeVisible();
}

test.describe("[EL-VÒNG] người học đi từ trang chủ tới hết khoá", () => {
  test("🔴 trang chủ khu LIỆT KÊ khoá được giao, và bấm được vào", async ({
    page,
  }) => {
    // Trang này từng là khung tạm 16 dòng với ĐÚNG 0 link, trong khi mục menu "Học
    // tập nội bộ" dẫn thẳng vào đó — nên mọi màn đã dựng không ai tới được.
    await vaoKhu(page, d.hocVienEmail);
    await expect(page.getByRole("heading", { name: "Khoá của tôi" })).toBeVisible();

    const link = page.getByRole("link", { name: "E2E Khoá an toàn lao động" });
    await expect(link).toBeVisible();
    await link.click();

    await expect(page).toHaveURL(new RegExp(`/elearning/hoc/${d.enrollmentId}$`));
  });

  test("🔴 màn đề cương hiện đủ bài, và bài ĐỌC bấm được", async ({ page }) => {
    // `/elearning/hoc/{enrollmentId}` chưa bao giờ có tệp, mà BA chỗ sinh thông báo
    // trỏ vào nó: "được giao khoá", "quá hạn", và chuông. Bấm thông báo = 404.
    await vaoKhu(page, d.hocVienEmail);
    await page.goto(`/elearning/hoc/${d.enrollmentId}`);

    await expect(
      page.getByRole("heading", { name: "E2E Khoá an toàn lao động" }),
    ).toBeVisible();
    await expect(page.getByText("Bài đọc mở đầu")).toBeVisible();
    await expect(page.getByText("Buổi thực hành tại xưởng")).toBeVisible();

    await page.getByRole("link", { name: "Bài đọc mở đầu" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/elearning/hoc/${d.enrollmentId}/${d.baiDocId}`),
    );

    // 🔴 Cổng đồng ý chặn ở đây — ĐÚNG chính sách, nhưng lời chặn phải kèm đường đi.
    // Bản trước chỉ có nút "Về trang chủ khu đào tạo": người mới bị chặn ở mọi bài,
    // đọc một câu bảo đi đâu đó, rồi tự đi tìm.
    await expect(
      page.getByRole("heading", { name: "Cần xác nhận trước khi bắt đầu" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Xem và xác nhận" }).click();
    await expect(page).toHaveURL(/\/elearning\/du-lieu-cua-toi/);

    const nut = page.getByRole("button", { name: /^Tôi xác nhận bản/ });
    await expect(nut).toBeVisible();
    await nut.click();

    // Màn hình phải THÔI nói "chưa xác nhận" ngay, không bắt người dùng tự F5.
    //
    // ⚠️ Canh câu do MÁY CHỦ dựng, KHÔNG canh dòng "✓ Đã xác nhận" của nút. Dòng ấy
    // là trạng thái thoáng qua: `router.refresh()` xong thì cả nút lẫn dòng ấy biến
    // mất, và trên bản build thật refresh nhanh tới mức nó gần như không kịp hiện.
    // Bản đầu canh đúng vào đó — xanh ở `pnpm dev`, ĐỎ ở chế độ CI. Nếu không chạy
    // thử đường CI thì lỗi này rơi vào lần merge.
    await expect(page.getByText("Bạn đã xác nhận bản")).toBeVisible();
    await expect(page.getByText("Bạn chưa xác nhận bản nào")).toHaveCount(0);

    // Quay lại đúng bài đó — giờ mới thấy nội dung thật, không phải trang trắng.
    await page.goto(`/elearning/hoc/${d.enrollmentId}/${d.baiDocId}`);
    await expect(page.getByText("Nội dung bài đọc dùng cho e2e")).toBeVisible();
  });

  test("🔴 bài BUỔI TRỰC TIẾP không dựng link — nói rõ thay vì dẫn vào ngõ cụt", async ({
    page,
  }) => {
    // Người học không tự bấm xong buổi trực tiếp được; giảng viên tick. Dựng link
    // để họ bấm vào rồi nhận một câu từ chối là bắt đi một vòng vô ích.
    await vaoKhu(page, d.hocVienEmail);
    await page.goto(`/elearning/hoc/${d.enrollmentId}`);
    await expect(
      page.getByRole("link", { name: "Buổi thực hành tại xưởng" }),
    ).toHaveCount(0);
    // Và phải NÓI VÌ SAO. Một dòng chữ xám không bấm được, không kèm lý do, đọc ra
    // thành "bạn chưa được phép" — trong khi sự thật là giảng viên điểm danh hộ.
    await expect(
      page.getByText("giảng viên điểm danh, bạn không cần mở"),
    ).toBeVisible();
  });
});

test.describe("[EL-VÒNG] thanh điều hướng gác theo quyền", () => {
  test("người học thuần KHÔNG thấy mục Chấm bài / Báo cáo", async ({ page }) => {
    // Thấy một cánh cửa mở ra sẽ bị từ chối thì người ta nghĩ mình mất quyền, chứ
    // không nghĩ mục đó không dành cho mình.
    await vaoKhu(page, d.hocVienEmail);
    const nav = page.locator("nav").first();
    await expect(nav.getByRole("link", { name: "Khoá của tôi" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Chấm bài" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Báo cáo" })).toHaveCount(0);
  });

  test("người Đào tạo THẤY đủ mục của mình", async ({ page }) => {
    await vaoKhu(page, d.daoTaoEmail);
    const nav = page.locator("nav").first();
    for (const nhan of ["Chương trình", "Chấm bài", "Báo cáo"]) {
      await expect(nav.getByRole("link", { name: nhan })).toBeVisible();
    }
  });
});

test.describe("[EL-VÒNG] người Đào tạo tick buổi ⇒ khoá KHÉP", () => {
  test("🔴 tick 'đã dự' rồi khoá chuyển sang hoàn thành", async ({ page }) => {
    // Đây là ca đắt nhất của cả spec. `diemDanhBuoiAction` từng là action MỒ CÔI
    // (0 màn nào gọi), và `cauHinhDiemDanhBuoi` KHÔNG gọi `cuonKhoaSauKhiXongBai`.
    // Hai lỗi cộng lại: bài `LIVE_SESSION` không bao giờ xong, nên MỌI khoá kết hợp
    // đứng mãi ở "đang học" — chứng nhận không cấp được, báo cáo đếm thiếu.
    //
    // Không ai tự nhận ra: người tick thấy ô đã tích, người học thấy bài đã xong.

    // (1) Người học đọc xong bài đọc — đi qua đường ghi tiến độ thật.
    await vaoKhu(page, d.hocVienEmail);
    await xacNhanChinhSach(page);
    await page.goto(`/elearning/hoc/${d.enrollmentId}/${d.baiDocId}`);
    await expect(page.getByText("Nội dung bài đọc dùng cho e2e")).toBeVisible();

    // ⚠️ Ở LẠI trang bài cho tới khi SERVER xác nhận xong.
    //
    // Bản đầu của ca này quay về đề cương mỗi 3 giây để dò chữ "đã xong" — nhưng
    // rời trang là gỡ luôn bộ đo, nên nhịp 15 giây không bao giờ bắn và 60 giây
    // chờ kia dò một thứ không đời nào tới. Test sai, mã đúng.
    //
    // Và canh dòng do server trả về (`done`), KHÔNG canh đồng hồ client: đồng hồ
    // client nói "đủ thời gian" từ giây thứ 10, trong khi số thật là số đã bị kẹp
    // ở server. Canh nhầm chỗ là test xanh trong lúc hệ thống chưa ghi gì.
    await expect(page.getByText("✓ Đã hoàn thành bài này")).toBeVisible({
      timeout: 60_000,
    });

    await page.goto(`/elearning/hoc/${d.enrollmentId}`);
    await expect(page.getByText("đã xong").first()).toBeVisible();

    // (2) Người Đào tạo tick "đã dự" cho buổi trực tiếp.
    await page.context().clearCookies();
    await vaoKhu(page, d.daoTaoEmail);
    await page.goto(`/elearning/soan/${d.baiBuoiId}`);
    await expect(page.getByText("Điểm danh buổi trực tiếp")).toBeVisible();

    const o = page.getByRole("checkbox").first();
    await expect(o).toBeVisible();
    // ⚠️ `.click()` chứ KHÔNG `.check()`. Ô này là controlled: `checked` lấy từ dữ
    // liệu máy chủ, chỉ đổi sau khi action chạy xong và `router.refresh()` dựng lại
    // trang. `.check()` bấm rồi đòi trạng thái đổi NGAY, thấy chưa đổi thì bấm lại —
    // vừa sai vừa nguy hiểm, vì mỗi lần bấm là một lần ghi điểm danh thật.
    await o.click();
    // Chờ con số của máy chủ, không chờ đồng hồ: `waitForTimeout` chỉ giấu lỗi.
    await expect(
      page.getByText("1/1 người đã được ghi có mặt"),
    ).toBeVisible({ timeout: 20_000 });

    // (3) Khoá phải KHÉP ở tầng dữ liệu — đây là khẳng định thật, không phải câu
    // chữ trên màn hình.
    await expect(async () => {
      const tt = await trangThaiGhiDanh(d.enrollmentId);
      expect(tt?.status).toMatch(/^COMPLETED/);
    }).toPass({ timeout: 30_000 });
  });
});
