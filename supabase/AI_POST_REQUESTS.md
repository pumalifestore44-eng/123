# Yêu cầu đăng bài

Chạy toàn bộ `create_ai_post_requests_table.sql` trong SQL Editor của project `nwyxvnehuiyenjuxihro`, rồi deploy web mới.

- **Yêu cầu chung**: đọc/ghi bảng `ai_agent_requests` như trước.
- **Yêu cầu đăng bài**: đọc/ghi bảng riêng `ai_post_requests`, nội dung ở `request_text`, ảnh/link đính kèm ở `metadata.image_urls` và trong nội dung gửi.
- Đổi loại yêu cầu cũng đổi lịch sử đang xem; lịch sử được phân trang và cập nhật trạng thái từ đúng bảng.

Mỗi yêu cầu mới có `status='pending'`. Agent xử lý đăng bài cần lấy việc từ `ai_post_requests`, cập nhật `processing`, rồi `completed`/`failed`, `response_text`/`error_text` và thời điểm tương ứng. Giao diện chỉ đưa yêu cầu vào hàng đợi; không xác nhận bài đã đăng khi chưa có kết quả từ agent xử lý.

Không cần cột `request_post` trong bảng cũ. Dữ liệu cũ không bị xóa, tự chuyển hay đưa lại vào hàng đợi để tránh thực thi trùng.
