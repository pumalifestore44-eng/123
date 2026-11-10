import {readFileSync,writeFileSync} from 'node:fs';
const path="smax-chat-manager - Copy (2)/GOMSHIP_TESTING.md";
let s=readFileSync(path,'utf8');
const edits=[
["Trong chi tiết đơn hàng > Tạo vận đơn, chọn **GomShip → SPX Express (thử nghiệm)**.","Trong chi tiết đơn hàng > Tạo vận đơn, **GomShip → SPX Express (thử nghiệm)** được chọn mặc định."],
["SPX trực tiếp vẫn giữ nguyên và được chọn mặc định.","SPX trực tiếp vẫn có thể chọn thủ công; mặc định là GomShip."],
["Có hai nút thử an toàn:\n- **Kiểm tra kết nối (không tạo đơn)**: `{ \"action\": \"test_auth\" }`. Chỉ làm mới Bearer token GomShip.\n- **Kiểm tra địa chỉ**: `{ \"action\": \"test_address\", \"receiver\": ... }`. Kiểm tra mã tỉnh/phường 2 cấp.",
"**Đã ẩn toàn bộ giao diện kiểm tra:** không hiển thị Kiểm tra kết nối, Kiểm tra địa chỉ, kết quả test hay ô nhập mã hành chính GomShip. Function server vẫn có các action hỗ trợ kiểm tra nội bộ khi cần chẩn đoán."],
];
for(const [a,b] of edits){if(s.includes(a))s=s.replace(a,b);}
s+='\n## Ẩn giao diện kiểm tra GomShip — 03/11/2026\n\n- GomShip là carrier mặc định trên form, và mỗi khi mở một đơn mới từ \u0060openSpxCreateModal\u0060. SPX trực tiếp vẫn có trong danh sách lựa chọn.\n- Xóa toàn bộ bảng kiểm tra/kỹ thuật GomShip trên giao diện: nút kết nối, nút kiểm tra địa chỉ, kết quả kiểm tra, ô nhập mã hành chính. Không gỡ những API/action hỗ trợ nội bộ phía server.\n- Các trường ẩn vẫn giữ \u0060gomshipProvinceCode\u0060/\u0060gomshipDistrictCode\u0060/\u0060gomshipWardCode\u0060 rỗng để function tự tra địa chỉ; \u0060gomshipProductValue=999999\u0060 và \u0060gomshipNote=[CHO THỬ HÀNG]\u0060 được gửi như cũ.\n- Nếu địa chỉ không xác định được, vẫn hiển thị cảnh báo lỗi khi tạo đơn và **không gửi yêu cầu tạo thêm**; chỉ ẩn bước kiểm tra thử, không bỏ xác thực đầu vào.\n- Đã chạy 31/31 test liên quan thành công; không gọi tạo đơn thật. Cần deploy lại frontend trên Vercel để áp dụng, không cần deploy lại Edge Function cho riêng thay đổi giao diện này.\n';
writeFileSync(path,s);console.log('Updated guide');