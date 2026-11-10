# GomShip Extension — Đã ngừng hoạt động (v0.4.0)

Tạo vận đơn GomShip đã được chuyển lại về **Supabase Edge Function `gomship-create-order`** trong giao diện Pumalife. Extension này không còn nhận hoặc xử lý hàng đợi và **không gửi request tạo đơn qua API GomShip**.

## Cập nhật Chrome
1. Mở `chrome://extensions`, chọn Pumalife · GomShip Worker và nhấn **Reload**; popup phải báo "GomShip — Supabase Function", phiên bản **0.4.0**.
2. Có thể chọn **Remove** để gỡ Extension cũ, tránh vô tình kích hoạt bản cũ.
3. Các yêu cầu trong bảng `gomship_extension_requests` vẫn giữ nguyên; không tự động gửi lại các job `submitting` hoặc `needs_review`.

## Sử dụng
- Tạo đơn bằng giao diện Pumalife → **Tạo vận đơn GomShip**; gọi function `gomship-create-order` và lưu mã SPXVN vào Supabase.
- Function hỗ trợ 2/3 cấp, đơn gộp và PDF như triển khai sẵn; nếu Function yêu cầu phiên backend riêng, cấu hình `GOMSHIP_AUTH_SESSION_MODE=dedicated` và `gomship_auth` tương ứng trước khi tạo.
- Cần deploy phần frontend `gomship-integration.mjs` và `app.js` để thay đổi lên Vercel. Không cần chạy lại SQL queue, không tự xóa hàng đợi.

**Lưu ý:** Bản code đã sửa tại workspace, chưa deploy hoặc tạo đơn thật. Hãy đối chiếu các yêu cầu queue cũ để không tạo trùng.
