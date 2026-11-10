---
name: kiem-tra-chuyen-khoan
description: Xác minh ảnh chuyển khoản Smax bằng AutoClick Desktop đúng user, đối chiếu lịch sử tiền vào Pancake; không tải ảnh
---

# SKILL — Kiểm tra khách đã chuyển khoản chưa (04/11/2026)

**QUY TẮC ƯU TIÊN HIỆN HÀNH:** Khi cần xác minh tiền cọc/thanh toán của khách Pumalife, **không dùng `download_image` và không lưu ảnh bill xuống `downloads/smax`**. Sau khi tìm được **URL ảnh chuyển khoản thật** từ đúng hội thoại Smax, mở trực tiếp URL bằng **AutoClick Desktop** user **`user_1789955358281`**, partition **`persist:autoclick-user_1789955358281`**, xem ảnh hiển thị trên tab và trích thông tin. **Chỉ** dùng API/action Pancake `get_payment_histories` và `match_payment_history` để đối chiếu giao dịch nhận tiền. Chụp màn hình của trình duyệt để **xem**, không coi là lệnh tải file ảnh về máy.

## Trình tự bắt buộc

1. Dùng `get_order` đọc đúng đơn, `page_id`, `conversation_id`, `prepaid`, `cod`, trạng thái và hội thoại liên quan. Gọi `get_smax_messages` theo đúng `page_pid` và `tid` để tìm các ảnh bill, card chuyển khoản, ngày giờ và tin nhắn liên quan. Phân biệt ảnh bill mới với ảnh sản phẩm, bill cũ hay bill của đơn khác; không tự mặc định tiền shop yêu cầu là tiền khách đã gửi.
2. Trích **đúng URL HTTP(S) gốc** của attachment ảnh chuyển khoản. Kiểm tra URL đến từ tin nhắn Smax thực; không đoán URL, không biến đổi query/token có thể làm hết hạn, không mở `file:`, `javascript:` hoặc URL không phải HTTP(S). Không ghi URL có token lên báo cáo/log công khai.
3. Dùng **chỉ AutoClick Desktop** với user `user_1789955358281`, partition `persist:autoclick-user_1789955358281`, theo `autoclick/AUTOCLICK_DESKTOP_BROWSER_GUIDE.md` và skill kết nối AutoClick Desktop. Mở URL ảnh HTTP(S) trực tiếp từ Smax API, quan sát hình thực tế và đọc thông tin; không mở trang Smax/Lark, không dùng `manager-chrome`, `mcp__CHATGPT__browser_control` hoặc `download_image`. Nếu công cụ không hiển thị ảnh đọc được, ghi rõ chưa đọc và dừng xác minh, không giả vờ đã xem.
4. Trích từ nội dung **nhìn thấy trên bill**: số tiền giao dịch, ngày/giờ, mã giao dịch/tham chiếu, tên người chuyển, ngân hàng/tài khoản nhận và nội dung chuyển khoản (chỉ khi hiển thị). Các trường không thấy rõ phải ghi "không đọc được", không bịa. Có thể có nhiều ảnh/bill, cần đối chiếu từng khoản độc lập.
5. Gọi `get_payment_histories` đọc dữ liệu **lịch sử giao dịch tiền vào từ API Pancake**, chọn ngày/khoảng thời gian và phân trang thích hợp. Gọi `match_payment_history` với số tiền **đọc từ ảnh** cùng các thông tin thực có trên ảnh (`amount`, `transaction_id`, `sender_name`, `recipient_name`, `recipient_account`, `transfer_time`, `window_minutes`). `get_payment_histories` và `match_payment_history` chỉ dùng API Pumalife/Pancake, **không mở Pancake bằng browser để thay thế API**.
6. Chỉ xác nhận khách **đã chuyển khoản thành công và đã nhận tiền** nếu thực tế bản ghi Pancake khớp, `status = "matched"`, `received = true` và `matched_transaction` hợp ngữ cảnh (đúng số tiền, mã giao dịch, thời điểm/nội dung và không trùng khoản đã ghi nhận). Tên người chuyển **không bắt buộc** trùng tên Facebook/Pancake. Nếu `not_found`, `ambiguous`, thiếu dữ liệu hoặc có nhiều giao dịch nghi trùng thì **chưa xác nhận tiền**; mở rộng lịch sử và điều tra, không suy đoán.
7. Chỉ sau khi xác minh mới cập nhật `prepaid` = **tổng tiền thực nhận đã xác minh của đơn**, tránh cộng trùng cọc/đợt chuyển trước; tính lại `cod` theo số tiền còn thu. `update_order` có `confirm:true`, không đổi trạng thái đơn nếu không được yêu cầu, `get_order` lại trên Supabase Primary để hậu kiểm. Không tạo giao hàng GomShip khi COD vẫn chưa được xác minh nếu đang cần xử lý giao hàng.
8. Báo kết quả phân biệt rõ: **ảnh bill đã xem/chưa xem**; **khớp lịch sử Pancake/không thấy giao dịch/chưa đủ chứng cứ**; số tiền và thời gian xác minh; `prepaid`/`cod` đã ghi hoặc chưa ghi. Không nói "đã nhận tiền" chỉ dựa vào screenshot, tin khách báo chuyển hay lời nhắc của shop.

## Hạn chế, lỗi và cách khắc phục

- Trình duyệt chỉ để mở và **đọc ảnh bill**. Lịch sử thanh toán, `match_payment_history`, `update_order`, `get_order` vẫn phải dùng API/action của dự án và Supabase Primary. Khi tool thanh toán không expose trực tiếp, dùng CLI `pumalife-action.mjs` qua `run_command` theo `TOOL_CALLING_GUIDE.md`.
- Khi ảnh không mở được/URL hết hạn, thử xem URL còn hiệu lực trong hội thoại và thử hiển thị lại trong **đúng AutoClick Desktop user**; không lưu ảnh về đĩa và không bịa nội dung. Nếu cần URL mới, kiểm tra dữ liệu Smax trước khi hỏi khách.
- Không in URL ký tên, token/cookie, ảnh nhạy cảm, mã tài khoản đầy đủ hoặc danh sách giao dịch ngân hàng không liên quan ra log. Không thay đổi profile hoặc đăng nhập lại bằng bí mật của chủ shop.
- Không đánh dấu `ai_agent_requests` là `completed` cho tác vụ xác minh tiền chưa thật sự đạt. Ghi lỗi cụ thể và để đối soát, không tự cập nhật số dư.
- Quy trình này thay thế **mọi hướng dẫn cũ** yêu cầu `download_image` để kiểm tra bill chuyển khoản. Việc upload/tải ảnh cho nghiệp vụ khác không nằm trong thay đổi này.

Tài liệu liên quan: `quản lý bán hàng pumalife/PROJECT_OPERATING_GUIDE.md` mục 16–19, `quản lý bán hàng pumalife/SHARED_OPERATIONS_MEMORY.md`, `quản lý bán hàng pumalife/TOOL_CALLING_GUIDE.md`, `smax-chat-manager - Copy (2)/skills/thuc-hien-yeu-cau/SKILL.md`.