# Kết nối Supabase

Ứng dụng chỉ dùng project `nwyxvnehuiyenjuxihro` để đọc, hiển thị, ghi dữ liệu và gọi Edge Functions. Cấu hình public nằm trong `supabase-config.mjs`.

Trang chính, trang bill và API J&T không còn ghi backup sang project khác. Không có hàng đợi backup, tác vụ thử lại backup hay cơ chế đọc dự phòng từ database cũ. Các mục backup cũ còn lưu trong localStorage không được thực thi.

Function dùng chung: `https://nwyxvnehuiyenjuxihro.supabase.co/functions/v1/create-order`.

Nếu gặp `PGRST205` dù bảng tồn tại, có thể kiểm tra bằng `check_primary_api_access.sql`. Ngày 21/10/2026, API đã đọc được bảng sau khi làm mới cấu hình và schema cache; không cần tạo lại bảng hay thay đổi quyền.

## Gộp giao hàng

Chạy toàn bộ `supabase/enable_grouped_shipments.sql` trong SQL Editor của project `nwyxvnehuiyenjuxihro` một lần trước khi dùng tính năng, rồi build/deploy website. File có thể chạy lại. Không cần sửa hay deploy lại Edge Function `create-order` cho tính năng này.

Chạy thêm `supabase/sync_shipment_printing.sql` để dùng chung trạng thái/số lần in theo mã vận đơn. File cũng sửa các nhóm cũ chỉ có một thành viên được ghi nhận đã in. In từ bất kỳ đơn nào sẽ cập nhật tất cả đơn cùng mã và tải lại bộ lọc hiện tại. In lại cần xác nhận; cửa sổ cũ chưa biết vận đơn vừa được in sẽ bị chặn và yêu cầu tải lại. Nếu đổi sang mã vận đơn mới, số lần in của mã mới bắt đầu lại từ 0. Đây là ghi nhận gửi lệnh in của ứng dụng; trình duyệt không báo được giấy đã in thành công hay người dùng hủy hộp thoại in.

Riêng bộ lọc **Chờ in**, các đơn chung mã vẫn hiện đủ nhưng chỉ đơn đầu tiên đang hiển thị có nút In bill và ô chọn in hàng loạt. Các dòng còn lại hiện nút vô hiệu hóa “In chung với đơn #…”. Nếu tìm kiếm/phân trang chỉ hiển thị một thành viên thì thành viên đó được phép in. Sau khi in, đồng bộ số lần in chung đưa tất cả thành viên sang bộ lọc Đã in.

Nếu đã cài bản giao gộp cũ và bị chặn tạo lại sau khi hủy, chạy `supabase/fix_recreate_cancelled_shipment.sql` một lần. Bản này cho phép tạo lại đơn/nhóm ở trạng thái 6 khi mã cũ đã được xóa và không có khóa tạo vận đơn chưa xử lý. Không gỡ khóa tự động, không bỏ kiểm tra mã cũ hoặc trạng thái đã lấy/giao/xóa. File `enable_grouped_shipments.sql` cũng đã cập nhật điều kiện này cho lần cài mới.

## Dùng vận đơn SPX có sẵn

Chạy `supabase/attach_existing_spx_shipment.sql` một lần sau các file giao gộp và sửa tạo lại, rồi deploy web. Trong cửa sổ tạo SPX, chọn **Dùng mã SPX có sẵn**, nhập mã SPX, Order SN nếu biết và COD thực tế của kiện, xác nhận thông tin rồi lưu. Không cần chọn lại địa chỉ hay kho trong form tạo mới. Kho đang gắn với đơn được giữ nguyên. Mã được lưu vào đơn hoặc toàn bộ nhóm trong một transaction; trạng thái ứng dụng chuyển Chờ lấy hàng. Đây là liên kết thủ công, chưa xác minh trạng thái thực tế của mã với SPX. Không gọi API tạo/sửa vận đơn; tiền của từng đơn bán hàng được giữ riêng.

Nếu mã đã gắn với đơn/nhóm khác, ứng dụng yêu cầu dùng Gộp giao hàng thay vì tự liên kết chéo. Nếu đơn đang có mã, có yêu cầu tạo mã chưa xử lý hoặc đã lấy/giao/xóa, thao tác bị chặn như luồng tạo mới.

Đơn chưa có mã có nút **Gộp giao hàng** ở danh sách đơn và lịch sử đơn của khách. Có thể chọn đơn cùng số điện thoại chưa có mã hoặc đang chờ lấy hàng đã có mã. Nếu đơn đích thuộc nhóm, toàn bộ hai nhóm được liên kết. Người nhận và địa chỉ mặc định lấy từ đơn đích; đơn bán hàng, sản phẩm, cọc và tiền từng đơn được giữ riêng.

Với nhóm chưa có mã, tạo giao hàng từ bất kỳ thành viên nào sẽ gom sản phẩm/mã đơn, cộng COD để người dùng kiểm tra lại phí ship, tạo một vận đơn rồi lưu cùng mã cho cả nhóm. Bill của cả hai mẫu hiển thị mọi mã đơn và sản phẩm của nhóm, dùng COD thực tế đã gửi SPX. In hàng loạt chỉ in một bill cho mỗi mã vận đơn. Trạng thái vận chuyển và thao tác hủy mã được đồng bộ cho các thành viên.

Gộp vào mã vận đơn đã có chỉ liên kết dữ liệu trong ứng dụng; người dùng phải kiểm tra/cập nhật nội dung kiện và COD trên SPX. COD của kiện được giữ nguyên, không cộng tự động vào vận đơn đã tạo.

Khóa tạo vận đơn được lưu ở database, giúp ngăn hai cửa sổ cùng tạo mã cho một nhóm. Nếu mất kết nối sau khi gửi SPX hoặc SPX đã trả mã nhưng lưu database thất bại, khóa được giữ để tránh tạo trùng. Đối chiếu SPX trước khi xử lý: nếu đã tạo, lưu mã bằng RPC `finish_grouped_shipment` với `p_order_id`, `p_token` lấy từ `shipment_claim_token`, `p_waybill`, `p_order_sn`, `p_warehouse_id`, `p_cod`; chỉ gọi `release_grouped_shipment` khi đã xác nhận yêu cầu cũ không tạo ra vận đơn. Không xóa khóa rồi gửi lại khi chưa xác minh.

Kiểm thử: `tests/shipmentGroups.test.mjs` kiểm tra cộng sản phẩm/COD và giữ dữ liệu gốc; `.tmp/verify-shipment-sql.cjs` chạy migration và RPC trên PostgreSQL tạm với dữ liệu giả; `.tmp/verify-shipment-ui.cjs` kiểm tra hộp chọn nhóm và luồng tạo mã; `.tmp/verify-grouped-waybill.cjs` kiểm tra cả hai mẫu bill và giải mã QR/barcode. Không dùng đơn thật để kiểm thử tạo/hủy vận đơn.
