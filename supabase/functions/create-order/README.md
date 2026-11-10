# Dùng chung create-order

`index.ts` là mã đầy đủ, tự chứa mọi helper. Copy toàn bộ nội dung vào function `create-order` hiện có trên Supabase rồi Deploy; không tạo function `spx-bill-tracking` và không cần copy `_shared`.

`SPX_COOKIE` đã được đặt trực tiếp trong code theo cấu hình chủ ứng dụng cung cấp. Khi phiên SPX hết hạn, thay chuỗi này bằng cookie đăng nhập hiện tại rồi Deploy lại. Không cần tạo secret `SPX_COOKIE`. `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` vẫn lấy từ môi trường Supabase.

Giữ kiểm tra JWT như function hiện tại. Các luồng tạo đơn, `cancel`, `get_order_extra` vẫn có trong cùng file.

`get_order_extra` ưu tiên GET `/shipment/order/logistic/order/get_order_info?order_sn=...&language_code=vi`, kiểm tra mã đơn/mã vận đơn khớp rồi tìm `sort_code_info` trong JSON. Khi API chi tiết chỉ có phí mà không có mã phân tuyến, hàm tiếp tục lấy `sort_code_info` từ `list_all_order`, 100 đơn/trang, duyệt tới hết kết quả trong 90 ngày. Không còn giới hạn 60 đơn đầu/7 ngày. Vẫn giữ phí lấy được từ API chi tiết nếu danh sách không có phí.

Đã kiểm tra trực tiếp ngày 21/10/2026: `VN263129740655985E` trả phí 11.000 từ API chi tiết nhưng không có trường mã phân tuyến. API danh sách trả `HCA-51-158-Q309-N`, tuyến `Q3-P09-06`, mã hoàn `DN-36-23-CL14-N`. Giao diện bill không cần thay đổi; triển khai function đầy đủ trong file này lên project `nwyxvnehuiyenjuxihro`.

Trang bill đã đổi sang POST `create-order` với body:

```json
{"action":"get_bill_tracking","order_id":"ID thực tế của dòng pancake_orders"}
```

Function tự đọc `jt_waybill_id` và `order_spx` từ bill, gọi API quản lý SPX, rồi trả trạng thái/hành trình và `tracking_info.pod_list`, `returning_start_time`, `ep_info_list`. Không công khai JSON quản lý chứa thông tin thanh toán/người gửi.

`order_spx` phải là `order_info.order_sn` đã lưu khi tạo vận đơn, không phải `sls_tn`. Đơn cũ chưa có mã này sẽ báo lỗi rõ ràng; bill vẫn dùng hành trình công khai làm dự phòng.

Deploy lại website sau khi cập nhật function để bill gọi action mới.
