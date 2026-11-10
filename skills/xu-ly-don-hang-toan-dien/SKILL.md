---
name: xu-ly-don-hang-toan-dien
description: Khi nhận lệnh lên đơn PUMALIFE, thực thi từ Smax đến tra/tạo sản phẩm, biến thể, thêm item, đối chiếu chuyển khoản Pancake và hậu kiểm Primary.
---

# Skill xử lý đơn hàng toàn diện

## Kích hoạt
Áp dụng cho "lên đơn", "thêm sản phẩm vào đơn", hoặc mã đơn + SKU/size/giá, kể cả câu lệnh ngắn. "Lên đơn" chỉ là nghiệp vụ nội bộ: **không tạo vận đơn**. Chỉ lệnh "lên đơn giao hàng", "tạo giao hàng", "tạo vận đơn", "gửi hàng" rõ ràng mới chuyển sang `../thuc-hien-yeu-cau/SKILL.md`.

Đọc trước `quản lý bán hàng pumalife/AGENTS.md`, `PROJECT_OPERATING_GUIDE.md`, `TOOL_CALLING_GUIDE.md`, `SHARED_OPERATIONS_MEMORY.md` và skill `../kiem-tra-chuyen-khoan/SKILL.md`. Chỉ dùng Supabase Primary.

## Quyền thực thi
- Nếu yêu cầu ở `ai_agent_requests`: đọc row live, chỉ xử lý nếu `created_at` hợp lệ trong 24 giờ, không ở tương lai. Claim `pending -> processing` bằng CAS. Theo ủy quyền mới 10/11/2026, với `processing` còn hạn phải dùng Pumalife Order web đúng AutoClick Desktop `user_1789955358281` kiểm tra đã làm xong chưa; nếu còn thiếu thì tiếp tục hoàn tất, không chặn mặc định vì thiếu owner/lease. Tuy nhiên phải xác minh worker không đang thao tác cùng việc, không xóa claim và không ghi/tạo trùng; kiểm tra các bước đã được worker/người làm. Yêu cầu hết hạn không thực thi.
- Dùng action qua `node quản lý bán hàng pumalife/pumalife-action.mjs <ACTION> <JSON>` với workspace `run_command` nếu cần; action ghi cần confirm=true tại tool và JSON. Kiểm tra exitCode, ok và error.

## Quy trình bắt buộc
1. `get_order` đúng mã: ghi nhận items hiện tại, giá, phí ship, prepaid, COD, người nhận, trạng thái và waybill.
2. Dùng `get_smax_threads`/`get_smax_messages` **hoặc** mở `https://pumalifeorder.vercel.app/` bằng AutoClick Desktop đúng user `user_1789955358281` để đọc đúng hội thoại: tin mới nhất, ảnh hàng, size, số lượng, tên/SĐT/địa chỉ và bill. Không mở website `smax.ai`/Lark. Được kết hợp các nguồn đọc để xác minh.
3. SKU cần giữ chính xác từng ký tự (đặc biệt JL3197 khác JI3197/JS3197). Với tên yêu cầu lấy từ mạng, tra nguồn chính hãng/đáng tin có SKU khớp chính xác. Không bịa tên khi chưa xác minh. Giữ ảnh sản phẩm thật từ yêu cầu/hội thoại.
4. `get_products`/`get_product` tìm SKU trước. Chỉ `create_product` khi chưa có. Kiểm tra size/màu/giá biến thể; tạo variation bằng action phù hợp khi thiếu, không tạo trùng.
5. Đọc lại items rồi `add_order_item` đúng sản phẩm, variation, số lượng, giá được yêu cầu **chỉ khi chưa có**. Đọc lại đơn xác minh không trùng, không thay đổi item khác.
6. Nếu Smax có thông tin nhận rõ ràng thì `update_order` cho tên/SĐT/địa chỉ/ghi chú theo quy tắc dự án; không phỏng đoán phần thiếu hoặc tự đổi status.
7. Rà soát cọc: xem ảnh bill thực tế qua giao diện Pumalife Order **hoặc** URL ảnh Smax API bằng AutoClick Desktop user `user_1789955358281`, partition `persist:autoclick-user_1789955358281`; không manager-chrome/browser_control, không tải ảnh. `get_payment_histories` và `match_payment_history` Pancake để khớp số tiền, mã GD, thời gian, nội dung. Chỉ ghi cọc mới khi `status=matched`, `received=true`, đủ chứng cứ và giao dịch chưa được ghi/phân bổ cho đơn khác. Nếu không có bill/giao dịch mới hoặc `not_found`/`ambiguous`, giữ nguyên prepaid và nêu blocker.
8. Dùng `update_order` **hoặc chỉnh trực tiếp trên web Pumalife Order** để đặt prepaid bằng **tổng tiền thực nhận hợp lệ đã phân bổ** (không cộng trùng), tính COD theo tổng đơn + ship hợp lệ - prepaid. Chọn một đường ghi, không đồng thời ghi cả hai; sau đó đọc lại Primary. Không tự sửa phí ship hoặc status.
9. `get_order` hậu kiểm Primary đối chiếu SKU, product/variation ID, size, qty, giá, tổng, phí ship, prepaid trước/sau, COD, địa chỉ và status. Kết quả ghi không rõ thì đọc lại trước, không retry mù.
10. Chỉ CAS request sang `completed` khi mọi phần bắt buộc đã hậu kiểm, trạng thái còn hợp lệ và không xung đột với worker khác; ủy quyền xử lý `processing` không cho phép ghi đè mù. Nếu chưa xong, ghi blocker đúng quyền và bàn giao theo skill AutoClick Desktop; không đánh dấu hoàn tất giả. Completed request không phải trạng thái Hoàn thành của đơn.

## Báo cáo
Mã đơn/request, nguồn tên SKU, product ID/variation ID, thêm item hay đã có, bill đã xem/chưa xem, kết quả Pancake matched/not_found/ambiguous, cọc trước/sau, COD, tổng/ship, trạng thái, bước chưa hoàn thành. Ẩn dữ liệu nhạy cảm.

## Prompt mẫu ngắn
Lên đơn #17258, adidas JL3197, tên lấy từ mạng đúng SKU, size 42, số lượng 1, giá 1.224.000đ. Tự làm đầy đủ: đọc Smax, tìm/tạo sản phẩm và size, thêm 1 item nếu chưa có, rà soát bill và đối chiếu Pancake, cập nhật cọc/COD chỉ khi khớp, hậu kiểm Primary. Không tạo vận đơn.