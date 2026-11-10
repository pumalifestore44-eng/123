# Smax Chat Manager – lưu đơn hàng không trùng khóa chính

## Lỗi 23505 (03/11/2026)

Khi lưu đơn, Postgres có thể trả:
`duplicate key value violates unique constraint "pancake_order_items_pkey"`.

### Đã sửa trong mã nguồn

- `app.js`: hai luồng lưu đơn chính/phần sidebar chuyển sang `saveEditedOrderSafely` trong `order-item-sync.mjs`. Dòng sản phẩm cũ được nhận diện bằng `data-order-item-id` và PATCH theo ID. Không còn xóa toàn bộ rồi POST lại; các lần nhấn Lưu lặp trong cùng giao diện được khóa theo order ID.
- `order-item-sync.mjs`: ưu tiên gọi RPC lưu trong một transaction nếu đã cài; nếu RPC chưa cài thì fallback giữ ID cũ, insert dòng mới **trước** khi cập nhật/xóa dòng cũ và hậu kiểm số dòng. Nếu INSERT gặp 23505 thì không sửa/xóa các dòng cũ và hiển thị lỗi sequence cần sửa. Fallback không thể bảo đảm atomic tuyệt đối nếu kết nối mất giữa các bước, vì vậy RPC vẫn là giải pháp dài hạn.
- `tests/orderItemSave.test.mjs`: kiểm thử 8 tình huống, có cập nhật lại cùng ID, thêm mới, 23505 và kết quả sau sửa sequence.

### BẮT BUỘC: sửa sequence trên Supabase Primary

1. Đăng nhập Supabase Dashboard với tài khoản **chủ dự án Primary** (không phải chỉ API anon).
2. Mở **SQL Editor** của project có URL Supabase kết thúc bằng `nwyxvnehuiyenjuxihro.supabase.co` và mở tệp `supabase/repair_pancake_order_items_id_sequence.sql`.
3. Chạy toàn bộ SQL và kiểm tra thông báo `NOTICE` (max ID cũ, last_value cũ, next ID mới).
4. Tệp chỉ chỉnh **sequence cấp ID**, không xóa đơn, không sửa giá, sản phẩm hay COD.
5. Khởi động lại Vite / đóng và mở lại ứng dụng Smax Chat Manager để thực sự tải `app.js` mới. Trước đây lỗi có thêm cụm “Lỗi đồng bộ sản phẩm đơn hàng”, nhưng mã mới không còn chuỗi đó. Nếu vẫn xuất hiện nguyên văn, đó là dấu hiệu phiên ứng dụng còn dùng mã cũ hoặc một bản build khác.
6. Thử mở một đơn có sẵn, thay một số lượng/ghi chú rồi lưu; thử thêm một dòng sản phẩm mới và lưu. Kiểm tra lại sản phẩm, size, giá, COD. Không dùng một đơn thật có tiền để thử xóa hàng loạt.

**Tùy chọn sau bước 2:** chạy `supabase/fix_order_item_sequence_and_save.sql` để cài RPC `pumalife_save_order_edits` — toàn bộ cập nhật đơn + dòng sản phẩm trong một transaction. Tệp này đã tách khỏi bước sửa sequence để khi cài RPC thất bại không làm ảnh hưởng đến kết quả sửa bộ đếm. Chỉ chạy khi đã kiểm tra quyền/RLS của project và bảng tồn tại đúng schema.

### Tình trạng xác minh

- API đọc production cho thấy `pancake_order_items` có max ID `39491`, nhưng các bản ghi mới từng có ID ~12.243. Đây là dấu hiệu sequence lệch, **chưa phải số last_value xác minh trực tiếp**.
- Kết nối hiện có chỉ mang API key ứng dụng, không phải tài khoản SQL admin. Supabase Dashboard trong profile browser kiểm tra đã chuyển đến trang đăng nhập, nên **chưa chạy SQL ở production**, chưa thể xác nhận lỗi 23505 đã hết.
- `node --test "smax-chat-manager - Copy (2)/tests/orderItemSave.test.mjs"`: 8/8 đạt.
- Vite build chạy với thư mục project làm root: thành công; các thẻ script không-module có cảnh báo dự kiến.
- Không thao tác sửa/xóa bất kỳ đơn hàng thật nào trong quy trình xác minh.

### Nếu vẫn lỗi sau sửa sequence

Kiểm tra `pg_get_serial_sequence('public.pancake_order_items','id')`, `MAX(id)` và `last_value` trong SQL Editor, xác minh đang trỏ đúng Primary. Nếu bảng có bộ sinh ID khác sequence owned thì **dừng**, không tự đặt ID bằng số ngẫu nhiên hoặc dùng `ON CONFLICT DO NOTHING` để nuốt lỗi. Gửi lại mã đơn và lỗi mới để rà soát chính xác.


## 10/11/2026 — Tự cập nhật đơn ngay sau khi bấm Lưu ở bảng Quản lý đơn hàng

- Nguyên nhân: save tại bảng chỉ làm mới thẻ đơn ở sidebar Tin nhắn, không cập nhật cặp dòng tóm tắt + chi tiết đã render trong `dashboardOrdersTableBody`.
- `app.js`: trích `renderDashboardOrderRows(order)` dùng chung cho tải bảng và cập nhật một đơn; cả lưu trực tiếp trong bảng và lưu ở `sideOrderEditModal` đều gọi `refreshDashboardOrderAfterSave(orderId)`.
- `dashboard-order-sync.mjs`: tải đúng đơn và `pancake_order_items` mới nhất từ Supabase (cache no-store), kèm link sản phẩm và kho nếu có; thay đúng hai dòng đơn sau khi xác minh mã đơn khớp. Nếu người dùng đổi trang/tìm kiếm trong lúc đọc, bỏ phản hồi cũ, không ghi đè nội dung bảng khác.
- Giữ nguyên accordion chi tiết đang mở, scroll và các dòng đơn khác. Sau khi thay, khôi phục icon, ảnh sản phẩm, ảnh ghi chú, sự kiện paste và thông tin khách hàng.
- Nếu dữ liệu đã lưu nhưng việc refresh lỗi, hiển thị thông điệp `Đã lưu vào Supabase, nhưng chưa làm mới được dòng đơn` thay vì khẳng định lưu thất bại.
- `tests/dashboardOrderSaveRefresh.test.mjs`: kiểm tra cập nhật tên/SĐT/địa chỉ/sản phẩm/giá/total/COD/status, giữ panel, chống cập nhật sai trang, lỗi GET, và hai đường save.
- Kiểm thử liên quan 21/21 đạt; Vite build Production thành công, bundle `main-uHoMEf07.js`. **Chưa deploy Vercel**, chưa ghi dữ liệu đơn hàng production khi kiểm thử. Để áp dụng website cần cập nhật frontend `app.js` và `dashboard-order-sync.mjs`.
