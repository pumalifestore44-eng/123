---
name: thuc-hien-yeu-cau
description: Thực hiện yêu cầu tạo giao hàng Pumalife/Smax bằng GomShip
---

# Skill: Thực hiện yêu cầu giao hàng

**Quy tắc hiệu lực 04/11/2026:** Khi AI nhận yêu cầu "tạo giao hàng", "lên đơn giao hàng", "tạo vận đơn" hoặc "gửi hàng", bắt buộc sử dụng **GomShip** qua Supabase Edge Function `gomship-create-order`. Tuyệt đối KHÔNG gọi `create_spx_shipment` hay function SPX trực tiếp `create-order` để tạo vận đơn mới. Mã `SPXVN...` do GomShip trả về vẫn thuộc luồng GomShip.

"**Lên đơn**" đơn thuần chỉ là tạo/cập nhật đơn nội bộ; không được tự suy ra lệnh tạo giao hàng.

## Đường gọi chuẩn
- Function: `smax-chat-manager - Copy (2)/supabase/functions/gomship-create-order/index.ts` (action `create`).
- Frontend mẫu: `smax-chat-manager - Copy (2)/gomship-integration.mjs`.
- Action AI: `create_gomship_shipment` của Pumalife, cài ở `quản lý bán hàng pumalife/src/gomship.mjs`.
- Nếu connector chưa expose action, dùng `run_command`: `executable=node`, `args=["quản lý bán hàng pumalife/pumalife-action.mjs","create_gomship_shipment","<JSON>"]`, `confirm=true`. JSON phải có `confirm:true`.

Tham số cần thiết từ dữ liệu đơn thực: `identifier`, `province_name`, `ward_name`; dùng `address_mode:"2-tier"` mặc định hoặc `"3-tier"` kèm `district_name`. Có thể truyền `weight_kg`, `product_value`, `goods_name`, `warehouse_id`, `cod`, `detail_address`, `note`, `notify_customer`. Không lấy mã địa giới SPX thay mã GomShip và không bịa phần địa chỉ thiếu.

## Kiểm tra tiền bắt buộc
Đọc [skill kiểm tra chuyển khoản](../kiem-tra-chuyen-khoan/SKILL.md) trước mọi yêu cầu có bill chuyển khoản. Dùng AutoClick Desktop đúng profile để đọc hội thoại, xem ảnh và thao tác trên giao diện https://pumalifeorder.vercel.app/ khi phù hợp; xác minh tiền vào bằng Pancake API. Không ghi nhận tiền chỉ dựa vào ảnh. Không dùng chức năng tải ảnh và không coi ảnh bill tự nó là bằng chứng đã nhận tiền.

## Quy trình không được bỏ qua
1. `get_order`, đọc đúng hội thoại Smax; nếu có ảnh chuyển khoản, **xem ảnh từ giao diện Pumalife Order hoặc lấy URL attachment và mở trực tiếp bằng AutoClick Desktop** đúng user `user_1789955358281` theo skill kết nối, thực sự nhìn và đọc số tiền/mã giao dịch. KHÔNG `download_image` và không tải bill về máy. Đối chiếu bằng Pancake API `get_payment_histories`/`match_payment_history`, chỉ khi giao dịch nhận tiền đã khớp mới cập nhật prepaid/COD; `get_order` hậu kiểm. Đọc skill `skills/kiem-tra-chuyen-khoan/SKILL.md`.
2. Xác minh đủ thông tin người nhận, địa giới GomShip, COD, khối lượng, kho và ngày gửi; từ chối nếu đơn hoặc nhóm đã có mã vận đơn.
3. Gọi **một lần** `create_gomship_shipment` → function `gomship-create-order`. Function tự chống trùng qua `gomship_shipments`; với đơn gộp dùng `finish_grouped_shipment`.
4. Kiểm tra kết quả `spx_waybill` dạng `SPXVN...`; không dùng ID số/`GSS-...` làm vận đơn. Đọc lại `pancake_orders` trên Supabase Primary, xác nhận mã, kho, COD và trạng thái `Chờ lấy hàng` của tất cả đơn trong nhóm (nếu có).
5. Gửi tin đúng hội thoại Smax: mã vận đơn, người nhận/SĐT/địa chỉ, COD, link `https://pumalifeorder.vercel.app/bill.html?id=<MA_DON>`, yêu cầu khách kiểm tra. Nếu gửi lỗi, đọc lại hội thoại, chỉ gửi bổ sung một lần, KHÔNG tạo lại vận đơn.
6. Lỗi/timeout, `creating`, `needs_review`, thiếu mã hay lỗi lưu DB: **KHÔNG tự retry, không fallback SPX**. Đối chiếu `gomship_shipments`/GomShip trước. Chỉ kết thúc `ai_agent_requests` khi thật sự thành công và đã hậu kiểm.

**Phân biệt:** Tra cứu trạng thái SPXVN, hủy đúng nguồn hoặc in bill của vận đơn cũ vẫn được phép; thay đổi này chỉ cấm tạo **mới** bằng SPX trực tiếp.

Xem `quản lý bán hàng pumalife/PROJECT_OPERATING_GUIDE.md` và `smax-chat-manager - Copy (2)/GOMSHIP_TESTING.md`. Không lưu token hay thông tin bí mật vào skill.