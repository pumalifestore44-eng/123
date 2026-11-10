# Tích hợp GomShip (SPX) trong Pumalife — thử nghiệm

> **Quy tắc AI 04/11/2026:** Khi nhận yêu cầu tạo giao hàng mới, chỉ dùng Edge Function `gomship-create-order` qua action Pumalife `create_gomship_shipment`. Không dùng function SPX trực tiếp `create-order` hay action `create_spx_shipment`. Xem [skill thực hiện yêu cầu](./skills/thuc-hien-yeu-cau/SKILL.md). Phần SPX trực tiếp ở dưới chỉ mô tả khả năng giao diện/đơn cũ, không phải lựa chọn cho AI khi tạo vận đơn mới.

> **Quy tắc kiểm tra chuyển khoản 04/11/2026:** Mở URL ảnh bill Smax bằng `manager-chrome.browser_control` profile `dang bai pumalife store`, xem screenshot; KHÔNG tải bill. Đối chiếu tiền qua Pancake API. Xem [skill kiểm tra chuyển khoản](./skills/kiem-tra-chuyen-khoan/SKILL.md).

## Sử dụng
Trong chi tiết đơn hàng > Tạo vận đơn, **GomShip → SPX Express (thử nghiệm)** được chọn mặc định.
Không cần nhập URL function hay GOMSHIP_FUNCTION_KEY; giao diện dùng
`primarySupabase.url` và `primarySupabase.anonKey` sẵn có trong `supabase-config.mjs`.
SPX trực tiếp vẫn có thể chọn thủ công; mặc định là GomShip.

**Đã ẩn toàn bộ giao diện kiểm tra:** không hiển thị Kiểm tra kết nối, Kiểm tra địa chỉ, kết quả test hay ô nhập mã hành chính GomShip. Function server vẫn có các action hỗ trợ kiểm tra nội bộ khi cần chẩn đoán.

**Tạo vận đơn GomShip** gửi `{ "action": "create", "order_id": "...", "receiver": ..., "product": ..., "cod": ... }`,
sau khi bạn bấm xác nhận việc tạo vận đơn thật (có thể phát sinh phí).

## Supabase cần chuẩn bị (cùng dự án chính)
1. Trong Supabase project có `supabase-config.mjs`, chạy `supabase/gomship_setup.sql` tại SQL Editor.
2. Triển khai `supabase/functions/gomship-create-order/index.ts` lên Edge Function `gomship-create-order`. Thay thế phiên bản cũ đang yêu cầu `GOMSHIP_FUNCTION_KEY`.
3. **Bật Verify JWT** trong Settings của Edge Function. Trình duyệt dùng JWT Supabase anon giống function SPX cũ; **không cần key riêng**.
4. Tại Edge Function Secrets / DB lưu:
   - `GOMSHIP_INITIAL_REFRESH_TOKEN` và `GOMSHIP_DEVICE_ID` ở server, để khởi tạo khi bảng `gomship_auth` chưa có bản ghi.
   - Nếu bảng `gomship_auth` đã có bản ghi id=9, phải bảo đảm refresh token và device ID là phiên hiện tại; function không tự ghi đè dữ liệu cũ.
   - Function cần `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` hoặc `SUPABASE_SECRET_KEYS.default` để ghi dữ liệu server-side.
5. Không cần thiết lập `GOMSHIP_FUNCTION_KEY` hoặc gửi header `x-gomship-admin-key` nữa.

## Kiểm soát tạo trùng
- Function chỉ chấp nhận tạo cho `order_id` tồn tại trong `pancake_orders` thuộc cùng Supabase.
- Kiểm tra đơn chưa có `jt_waybill_id`; nếu số điện thoại của đơn đã lưu khác số trong form thì yêu cầu cập nhật đơn trước.
- Mỗi đơn được lưu một idempotency key và bản ghi `gomship_shipments`.
- Không tự gửi lại request nếu trạng thái `creating` / `needs_review` hoặc mất kết nối; cần đối chiếu GomShip trước.
- Chỉ ghi mã vận đơn vào `pancake_orders` khi phản hồi chứa mã `SPXVN...` rõ ràng.
- Hỗ trợ một vận đơn GomShip cho nhóm đã gộp: xác minh thành viên trên server, giữ khóa nhóm, POST một lần, rồi đồng bộ đồng thời mọi đơn thành viên qua `finish_grouped_shipment`. Khi không xác định được kết quả, KHÔNG gửi lại.

## Bảo mật
**Lưu ý:** Supabase anon JWT được đóng gói công khai trong frontend và Verify JWT không đồng nghĩa với xác thực người quản trị. Hệ thống hiện không có Supabase Auth user session; vì vậy cách gọi giống SPX cũ này chỉ phù hợp giai đoạn thử nghiệm nội bộ. Kiểm tra đơn tồn tại và cơ chế chống tạo trùng giảm rủi ro nhưng không chặn được hoàn toàn người khác nếu họ biết thông tin đơn. Trước khi triển khai dùng thực tế, cần xác thực người dùng phía server (ví dụ Supabase Auth với quyền quản trị).

## Lỗi thường gặp
- **HTTP 503, GOMSHIP_FUNCTION_KEY:** phiên bản Edge Function cũ chưa được deploy lại.
- **HTTP 401:** Verify JWT không bật/không nhận anon JWT đúng dự án hoặc đang dùng code cũ.
- **HTTP 404:** function chưa deploy vào đúng Supabase project.
- **Token GomShip không hợp lệ:** cập nhật refresh token hiện tại trong `gomship_auth`; nếu refresh token bị xoay vòng không được khởi tạo lại bằng giá trị cũ.
- **Không nhận ra địa chỉ:** nhập chính xác mã 2 cấp GomShip của tỉnh và phường.
- **Tạo thành công nhưng chưa có mã SPXVN:** xem `gomship_shipments.response`; không bấm tạo lại.

Đã kiểm tra build và các bài test giả lập, chưa tạo vận đơn thực tế.
## Lỗi API địa chỉ HTTP 404 (02/11/2026)
- Đã xác minh trực tiếp với GomShip: `GET https://api.gomship.vn/api/v1/locations/provinces-2tier` trả HTTP 200 với 34 tỉnh/thành.
- `GET https://api.gomship.vn/api/v1/locations/wards-2tier?province=79` trả HTTP 200 với 168 phường/xã.
- Đường dẫn cũ thiếu `/locations/` gây HTTP 404; đã sửa trong `supabase/functions/gomship-create-order/index.ts`.
- Kết quả thực tế: `Thành phố Hồ Chí Minh` mã `79`; `Phường Bình Trưng` mã `27097` theo danh mục GomShip tại thời điểm kiểm tra.
- Cần **deploy lại** function lên Supabase cloud, vì build ứng dụng localhost không thay đổi code đang chạy ở Supabase.
- Sau deploy, thử `test_auth`, tiếp theo `test_address` (không tạo đơn) trước khi thực hiện tạo vận đơn thật.
## In vận đơn GomShip trong cùng cửa sổ in (02/11/2026)

Giao diện được thu gọn: không còn nút **Tải PDF GomShip** hoặc **In vận đơn GomShip** riêng ở thẻ đơn.

### Sử dụng

1. Mở đơn đã tạo qua GomShip, bấm **In bill** như với SPX trực tiếp.
2. Trong hộp thoại **In vận đơn giao hàng**, các tab xếp theo thứ tự:
   - **GomShip · PDF** (nằm đầu, tự chọn mặc định nếu trình duyệt có quyền truy cập nhãn của đơn);
   - **Mẫu 1 · SPX** (mặc định cho đơn SPX hoặc khi không có quyền xem PDF GomShip);
   - **Mẫu 2** (mẫu SPX cũ).
3. Khi chọn **GomShip · PDF**, nhãn PDF chính thức từ GomShip xuất hiện trong chính cửa sổ xem trước.
4. Bấm nút đỏ **In vận đơn** ở chân cửa sổ. File PDF mở trong trình xem PDF để in; nếu hộp thoại in không tự bật, nhấn `Ctrl+P` ở tab PDF.
5. Chuyển lại Mẫu 1/Mẫu 2 bất cứ lúc nào; luồng SPX và cơ chế đếm lần in cũ vẫn giữ nguyên.

**API lấy nhãn:** `GET https://api.gomship.vn/api/v1/orders/{gomship_order_id}/label` trả `application/pdf`. GomShip order ID dạng số không phải mã SPXVN.

### Cấu hình server

- Chạy `supabase/gomship_setup.sql` tại SQL Editor để tạo các cột `gomship_order_id`, `spx_waybill`, `label_token_hash` nếu chưa có.
- Deploy phiên bản mới `supabase/functions/gomship-create-order/index.ts` lên Supabase chính và sử dụng cùng cấu hình xác thực đang hoạt động. Chỉ chỉnh UI không yêu cầu thay đổi endpoint PDF trên server nếu code server đã chứa `action=get_label`.
- Chức năng hiển thị tab PDF phụ thuộc quyền truy cập ngẫu nhiên theo đơn được sinh sau khi tạo vận đơn qua phiên bản function hỗ trợ nhãn. Vận đơn cũ trước cơ chế cấp quyền không tự có tab PDF.
- Server so khớp `order_id` Pumalife, hash của `label_token`, trạng thái created và mã vận đơn liên kết; trình duyệt không được cung cấp một GomShip order ID tùy ý.
- Quyền nhãn lưu ở Local Storage của trình duyệt đã tạo đơn; nếu xóa dữ liệu hoặc mở ở máy khác sẽ không tự có tab GomShip. Cần bổ sung xác thực quản trị thực tế để cấp lại quyền xuyên thiết bị.
- Vì anon key là công khai và xác thực Pumalife hiện tại chưa là Supabase Auth, quyền tạo đơn vẫn cần kiểm soát tại backend nếu đưa ra internet. Tab PDF đang được bảo vệ riêng bằng token từng đơn.

### Kiểm tra

`node --test tests/gomshipIntegration.test.mjs` để thử việc chọn tab, tải nhãn PDF giả lập và khôi phục hai mẫu SPX. Build `vite` để xác thực giao diện. Không gửi yêu cầu tạo đơn thật khi chạy test.

## Hủy vận đơn GomShip (02/11/2026)

GomShip đã được xác định từ DevTools trả HTTP 200 khi gọi:
`DELETE https://api.gomship.vn/api/v1/orders/{gomship_order_id}`

Đơn GomShip có **ID số** khác với mã vận đơn SPXVN. Không gọi DELETE trực tiếp từ frontend và không lấy numeric ID từ người dùng.

### Cách dùng
1. Trong thẻ đơn Pumalife hoặc bảng đơn, bấm **Hủy vận đơn** (hoặc **Hủy**).
2. Frontend gọi `action: "get_cancel_source"` để tra cứu server `gomship_shipments` theo `order_id`.
3. Nếu kết quả `source: "gomship"`, hộp thoại hỏi xác nhận hủy. Frontend gửi `action: "cancel_order"` cùng `order_id` Pumalife và `waybill_id` SPX đang hiển thị; **không cần label_token hay cùng trình duyệt tạo đơn**.
4. Function kiểm tra bản ghi GomShip liên kết với đơn Pumalife, mã SPX phải trùng thông tin trong DB, trạng thái và lấy `gomship_order_id` đã lưu. Với đơn cũ, có thể lấy ID từ response tạo đơn đã lưu. Sau khi API DELETE GomShip trả thành công mới cập nhật `pancake_orders`.
5. Nếu không phải GomShip, chương trình tiếp tục gọi function SPX `create-order` với action `cancel` như trước.

### Chạy SQL và triển khai
- **Bắt buộc** chạy lại `supabase/gomship_setup.sql` để có cột `cancel_response` và `cancelled_at`.
- Deploy lại **`supabase/functions/gomship-create-order/index.ts`** lên Supabase cloud. Code frontend một mình không thực hiện được API DELETE.
- Không cần key riêng, không cần token trong Local Storage. Việc hủy sử dụng mã đơn và mã vận đơn kiểm tra tại backend.
- Đơn GomShip cũ không có capability vẫn hủy được nếu có bản ghi `gomship_shipments` và ID GomShip trong cột `gomship_order_id` hoặc trong JSON response tạo đơn. Nếu thiếu cả hai, cần đối chiếu/hủy trực tiếp trên GomShip.
- Không hủy thực tế khi chạy test tự động. Unit test mock API: `node --test tests/gomshipCancel.test.mjs`.

### Chống trùng & khôi phục
- Trước DELETE, server chuyển `gomship_shipments.status` từ `created` sang `cancelling` bằng cập nhật có điều kiện và lưu lại mã SPX.
- Nếu kết nối mất hoặc API từ chối, trạng thái `cancel_needs_review` để kiểm tra thủ công; KHÔNG tự phát DELETE nhiều lần.
- Nếu DELETE thành công mà đồng bộ Pumalife thất bại, trạng thái `cancel_sync_failed`; lần thử lại có quyền sẽ chỉ đồng bộ đơn, không gọi DELETE lần hai.
- Sau khi đồng bộ thành công, `status=cancelled`, `cancelled_at` và phản hồi GomShip được lưu.
- Luồng SPX trực tiếp không thay đổi cách hủy, nhưng để tránh nhầm nguồn, frontend chỉ dùng API SPX sau khi tra cứu nguồn thành công.

**Giới hạn xác thực:** Vì anon JWT là công khai, xác minh bằng `order_id` và `waybill_id` chỉ tránh hủy nhầm chứ **không xác thực người quản trị**. Người khác nếu biết cả hai mã có thể yêu cầu hủy. Chỉ dùng cho thử nghiệm nội bộ; trước khi công khai nên bổ sung xác thực quản trị tại backend. Quyền in PDF vẫn dùng capability riêng và không bị thay đổi.
 
## Tạo lại vận đơn GomShip sau khi đã hủy thành công (02/11/2026)

**Đã sửa lỗi HTTP 409 `Đơn đã được gửi, kiểm tra GomShip trước khi thử lại`** khi đơn Pumalife đã hủy xong vận đơn GomShip nhưng vẫn giữ bản ghi `gomship_shipments` cũ.

### Điều kiện tạo lại
- `gomship_shipments.status = 'cancelled'` (đã hủy và đồng bộ xong).
- `pancake_orders.jt_waybill_id` của đơn đã được xóa.
- Không cho phép tạo lại ở trạng thái `cancelling`, `cancel_sync_failed`, `cancel_needs_review`, `creating` hoặc `needs_review`.
- Tạo lại với một **idempotency key mới** và thông tin đơn/địa chỉ mới. Không tái sử dụng mã GomShip hay token nhãn cũ.

### Cách hoạt động
- Edge Function gọi RPC server-only `reserve_gomship_shipment` để giữ lần tạo mới trong một giao dịch PostgreSQL.
- RPC kiểm tra Pumalife vẫn chưa có mã vận đơn và khóa bản ghi, lưu lịch sử lần hủy cũ vào `gomship_shipment_history`, rồi reset bản ghi đang dùng về trạng thái `creating` với khóa mới.
- API GomShip chỉ được gọi sau khi đặt chỗ thành công; khi thành công, kết quả và nhãn thuộc lần tạo mới.
- Nếu chưa chắc hủy thành công, hệ thống tiếp tục chặn tạo lại để tránh hai vận đơn hoạt động.

### Cần cập nhật
1. Trong **Supabase project chính** của Pumalife, chạy lại toàn bộ `supabase/gomship_setup.sql` (bao gồm bảng lịch sử và RPC vừa thêm).
2. **Deploy lại** `supabase/functions/gomship-create-order/index.ts` trên Supabase (bản cũ vẫn trả HTTP 409).
3. Không cần sửa giao diện Pumalife để tạo lại; nút tạo vận đơn có sẵn sử dụng Edge Function vừa được nâng cấp.
4. Thử lại đúng đơn Pumalife đã hủy hoàn toàn. Kiểm tra SQL `select order_id, status, gomship_order_id from public.gomship_shipments where order_id = '...';` trước khi thử nếu còn nghi ngờ.

Test không gọi API thật: `node --test tests/gomshipRecreate.test.mjs`.

## Hỗ trợ địa chỉ GomShip 3 cấp (03/11/2026)

- Trong form **Địa chỉ giao hàng**, chọn **Cũ (3 cấp)**. Frontend gửi `address_mode: "3-tier"`, kèm tên tỉnh/thành, quận/huyện, phường/xã; địa chỉ 2 cấp vẫn gửi `address_mode: "2-tier"`.
- Có thể nhập thêm 3 mã **riêng của GomShip** tại `gomshipProvinceCode`, `gomshipDistrictCode`, `gomshipWardCode`. Không lấy ID từ các dropdown SPX để dùng làm mã GomShip.
- Edge Function nhận các trường `province_code`, `province_name`, `district_code`, `district_name`, `ward_code`, `ward_name` ở cấp cao nhất, hoặc `receiver.province/district/ward.name` và `.gomship_code`. Nếu đã nhập đủ mã và tên 3 cấp, function dùng trực tiếp, **không gọi API tra địa chỉ**.
- Trường hợp chưa nhập đầy đủ mã, function sử dụng đúng danh mục GomShip 3 cấp: `GET /locations/provinces` (63 tỉnh/thành), `GET /locations/districts?province={TÊN_TỈNH}`, `GET /locations/wards?province={TÊN_TỈNH}&district={TÊN_QUẬN}`. Ba API này đã được kiểm tra trực tiếp và trả HTTP 200 ngày 03/11/2026.
- Với 2 cấp, function vẫn dùng những GET endpoint đã xác nhận `/locations/provinces-2tier` và `/locations/wards-2tier?province=...`.
- Sau khi chọn địa chỉ, thử **Kiểm tra địa chỉ** trước (action `test_address`, không tạo đơn). Khi tạo đơn thật, payload `POST /api/v1/orders` sẽ có `district_code` / `district_name` cho 3 cấp.
- Ví dụ cặp mã được người dùng cung cấp: tỉnh `79` — Thành phố Hồ Chí Minh, quận `765` — Quận Bình Thạnh, phường `26923` — Phường 05. Phải đối chiếu đúng địa chỉ đơn cần gửi; không áp cứng các mã này.
- Sau khi sửa mã nguồn, cần **deploy lại Edge Function `gomship-create-order` lên Supabase chính**, đồng thời cập nhật bản frontend đang chạy. Các bài test mock không tạo đơn vận chuyển thật.
- **Bảo mật:** Bearer token dán từ DevTools vào hội thoại có thể bị lộ; nên thu hồi/đăng nhập lại để đổi token. Chỉ dùng token do cơ chế `gomship_auth` phía server lấy tự động, tuyệt đối không hardcode token trong frontend hoặc kho mã.

## Sửa lỗi địa chỉ 3 cấp HTTP 404 / HTTP 500 (03/11/2026) — cập nhật theo API chính thức

**Lỗi cũ:** `GET /locations/provinces-3tier` trả HTTP 404. Bản trung gian từng sử dụng `provinces.open-api.vn` đã được **thay thế** trong Edge Function. Không còn gọi dịch vụ này.

**Ba endpoint GomShip chính thức đã kiểm tra bằng GET trực tiếp ngày 03/11/2026:**
- `GET https://api.gomship.vn/api/v1/locations/provinces` → HTTP 200, 63 tỉnh/thành cũ.
- `GET https://api.gomship.vn/api/v1/locations/districts?province=Thành%20phố%20Hồ%20Chí%20Minh` → HTTP 200, 22 quận/huyện cho ví dụ TP.HCM.
- `GET https://api.gomship.vn/api/v1/locations/wards?province=Thành%20phố%20Hồ%20Chí%20Minh&district=Quận%20Bình%20Thạnh` → HTTP 200, 20 phường/xã trong ví dụ Bình Thạnh.

**Xử lý trong `gomship-create-order`:**
- Với địa chỉ 3 cấp, khi thiếu mã GomShip, gọi ba endpoint trên **bằng tên hành chính**, `encodeURIComponent` query `province` và `district`. Danh sách trả về có `code`, `name`. Đối chiếu đúng tỉnh/quận/phường và xác nhận mã nhập thủ công nếu có; `Phường 05` và `Phường 5` được coi là tương đương.
- Nếu đủ `province_code/name`, `district_code/name` và `ward_code/name` từ đầu, giữ chế độ không gọi danh mục. Không dùng mã ID của SPX làm mã GomShip.
- Giữ nguyên địa chỉ 2 cấp: `/locations/provinces-2tier` và `/locations/wards-2tier?province=...`.
- `action: "test_address"` chỉ trả về mã và tên đã phân giải, **không tạo đơn**. Chỉ `action: "create"` mới POST vận đơn thật.

**Kiểm thử:** `node --test tests/gomshipLegacyAddress.test.mjs tests/gomshipIntegration.test.mjs tests/gomshipCancel.test.mjs tests/gomshipCancelBackend.test.mjs tests/gomshipRecreate.test.mjs` → **39/39 bài test đạt**, các test tạo vận đơn đều mock, không tạo đơn thật.

**Triển khai:** Sau khi sửa code phải deploy lại **Edge Function `gomship-create-order` trên Supabase chính** từ `supabase/functions/gomship-create-order/index.ts`. Nếu chưa deploy cloud thì lỗi trên web vẫn không thay đổi. Ở thời điểm ghi nhận chưa có bằng chứng bản cập nhật đã được deploy lên cloud.

## Khắc phục lỗi tên viết tắt "TP. Hồ Chí Minh" (03/11/2026)

**Biểu hiện:** Supabase Logs báo `HTTP 500: Không xác định duy nhất địa chỉ "TP. Hồ Chí Minh"`. Đây không phải lỗi kết nối hay lỗi `/locations/*` 404; mã cũ khớp nguyên văn giữa SPX (`TP. Hồ Chí Minh`) và GomShip (`Thành phố Hồ Chí Minh`).

**Đã sửa:** `canonicalPlaceName` quy chuẩn các tiền tố `TP.` → `Thành phố`, `Q.` → `Quận`, `P.` → `Phường` (và `H.`, `TX.`, `TT.`), đồng thời coi `Phường 05` và `Phường 5` tương đương. Không tự diễn giải tên mơ hồ: vẫn yêu cầu đúng một mục trong danh mục. Sau khi khớp tên, function dùng tên chính thức của GomShip trong URL `districts`, `wards` và payload tạo đơn.

**Kiểm tra GET thực tế:** `TP. Hồ Chí Minh` / `Q. Bình Thạnh` / `Phường 05` đã phân giải thành `79` / `765` / `26923` qua ba endpoint chính thức của GomShip (HTTP 200). Không gọi POST tạo đơn. Tất cả 41/41 bài test GomShip (bao gồm alias) đạt.

**Cần triển khai cloud:** File đã sửa nằm ở `supabase/functions/gomship-create-order/index.ts`. Phải deploy lại **chính function `gomship-create-order`** trong Supabase. Xem **Edge Functions → gomship-create-order → Code** và thay nội dung bằng bản mới, sau đó **Deploy updates**. Làm mới trang, chọn Cũ (3 cấp) và bấm Kiểm tra địa chỉ. Khi cloud còn bản cũ, lỗi sẽ tiếp tục xuất hiện dù workspace đã sửa. Chưa có xác nhận deploy cloud.

**Tuyệt đối không** sao chép Bearer token GomShip từ DevTools vào code. Dùng luồng refresh token server hiện có.

## Tên hàng trên vận đơn tự điền mã đơn Pumalife (03/11/2026)

- Khi mở **Tạo vận đơn** từ đơn Pumalife, app đọc `display_id` (mã đơn hiện trên bảng bán hàng, thay vì UUID nội bộ) và `items:pancake_order_items(*)` đã tải. Giá trị `jtGoodsName` được tạo với dạng **`Mã đơn #<display_id> - <tên sản phẩm đầy đủ> (Mã SP; Size; Màu) x<số lượng>`**.
- Nếu nhiều sản phẩm, giữ đủ tất cả sản phẩm, ngăn cách bằng `|`. Nếu giao gộp (SPX trực tiếp), ghi các mã đơn trong nhóm và mã gốc của từng dòng hàng.
- Chỉ thêm SKU, size, màu, tên biến thể khi có trong dữ liệu; không bịa các trường thiếu. Tránh lặp thông tin đã có trong tên sản phẩm.
- Trường **Tên sản phẩm** chuyển thành ô đa dòng để không bị cắt khi tên dài. Có thể chỉnh tay trước khi gửi.
- GomShip lấy `product.name` trực tiếp từ `jtGoodsName`, Edge Function dùng nó để gửi `product_name` tới GomShip. Chức năng SPX trực tiếp cũng sử dụng giá trị này.
- Test: `node --test tests/shipmentProductName.test.mjs tests/gomshipIntegration.test.mjs tests/gomshipLegacyAddress.test.mjs tests/shipmentGroups.test.mjs` → 31/31 thành công, không tạo vận đơn thật.
- **Triển khai:** Các thay đổi này nằm ở frontend (`app.js`, `index.html`, `shipment-product-name.mjs`), nên **phải build/deploy lại frontend lên Vercel**. Không cần deploy lại `gomship-create-order` chỉ để thay nội dung `product_name` (nếu cloud đã chạy bản nhận trường `product.name`).

## Tạo một vận đơn GomShip cho nhiều đơn đã gộp (03/11/2026)

**Ví dụ:** Nhóm Pumalife `#16607`, `#16868` sẽ gửi một `POST /api/v1/orders` đến GomShip. `product_name` giữ cả hai mã đơn và toàn bộ sản phẩm. COD là tổng COD của nhóm đang hiển thị; cần kiểm tra trước khi gửi.

**Các thay đổi:**
- Frontend `app.js` bỏ chặn "Chưa hỗ trợ tạo đơn gộp qua GomShip", gửi `group_order_ids` và `warehouse_id` qua `submitGomshipForm`. Nút tạo đơn vẫn yêu cầu xác nhận để tránh phát sinh phí ngoài ý muốn.
- Edge Function đọc nhóm thật từ `pancake_orders.shipping_group_id`, so khớp danh sách thành viên với dữ liệu đã thấy trên form, xác nhận tất cả chưa có mã vận đơn, cùng điện thoại, cùng root; không cho phép client giả tạo nhóm. `gomship_shipments` và idempotency key được lưu chỉ trên **đơn gốc**.
- Trước khi POST GomShip, function gọi `claim_grouped_shipment` để khóa nhóm (ngăn đổi thành viên và tạo trùng bằng SPX trực tiếp) rồi gọi `reserve_gomship_shipment` để bảo vệ lần gọi GomShip. Nếu đặt chỗ bị từ chối rõ ràng thì nhả khóa nhóm, không POST. Nếu lỗi không rõ đã gửi chưa thì **giữ khóa**, không gửi lại.
- Sau một phản hồi GomShip thành công có mã SPXVN, function gọi `finish_grouped_shipment` để lưu cùng mã vận đơn, trạng thái 9, COD và kho cho tất cả đơn trong một transaction. SQL mới từ `supabase/enable_grouped_shipments.sql` kiểm tra số bản ghi, tránh cập nhật nửa nhóm. Frontend không tự PATCH một đơn gốc với vận đơn nhóm.
- Khi sync sau POST thất bại, trả `created_on_gomship: true` và yêu cầu đối chiếu thủ công; **không bấm tạo vận đơn lần nữa**. Các trạng thái `creating`/`needs_review` hay khoá `shipment_claim_token` không tự hết hạn.
- Tra cứu/hủy GomShip từ một **đơn thành viên** được ánh xạ về đơn gốc và kiểm tra mã vận đơn trùng. Nút In bill từ thành viên dùng quyền nhãn GomShip của đơn gốc. Nếu hủy thành công, trigger `sync_grouped_shipment` đồng bộ cho toàn nhóm.
- Chỉ kích hoạt chatbot sau khi xử lý nhóm **một lần theo đơn gốc**, tránh gửi tin nhắn lặp cho cùng khách.

**BẮT BUỘC để triển khai tính năng mới:**
1. Chạy lại bản cập nhật `supabase/enable_grouped_shipments.sql` ở SQL Editor của dự án Supabase chính để cập nhật `finish_grouped_shipment` (bản SQL này idempotent, không xóa đơn hàng).
2. Deploy bản mới `supabase/functions/gomship-create-order/index.ts` lên Edge Function `gomship-create-order`, không nhúng access token GomShip vào mã nguồn.
3. Deploy frontend gồm `app.js`, `gomship-integration.mjs` và các file liên quan lên Vercel.
4. Tải lại trang, mở nhóm đã gộp, kiểm tra danh sách mã đơn/sản phẩm/COD và địa chỉ, bấm **Kiểm tra địa chỉ** trước khi xác nhận tạo thật.
5. Sau khi tạo, kiểm tra hai (hoặc nhiều) đơn cùng `jt_waybill_id`, `status=9`, `shipment_cod`. Tạo đơn thực tế có thể phát sinh phí.

**Kiểm thử giả lập:** `node --test tests/gomshipGroupedCreate.test.mjs tests/gomshipGroupedCancel.test.mjs tests/gomshipRecreate.test.mjs tests/gomshipIntegration.test.mjs tests/gomshipCancelBackend.test.mjs tests/gomshipCancel.test.mjs tests/shipmentGroups.test.mjs tests/shipmentProductName.test.mjs` — 65/65 đạt ở nhóm bài kiểm thử GomShip và giao hàng liên quan, không tạo vận đơn thật. **Chưa deploy cloud, chưa xác thực bằng đơn GomShip thật.**
**Bổ sung nhận diện mã SPX:** Server trả `spx_waybill` riêng; frontend ưu tiên mã `SPXVN...` và không nhận `GSS-...` hoặc ID số của GomShip làm vận đơn. Xác nhận tạo nhóm hiển thị danh sách mã đơn thành viên, không chỉ mã đơn gốc.
## PDF GomShip nằm đầu và mặc định khi in (03/11/2026)

- Sắp xếp tab **GomShip · PDF** đầu tiên, sau đó đến **Mẫu 1 · SPX**, **Mẫu 2**.
- Khi mở cửa sổ In bill, chương trình chuẩn bị và hiển thị nhãn SPX như bình thường; khi nhãn PDF GomShip của đơn gốc có quyền truy cập trong trình duyệt, tự chọn tab GomShip và tải PDF **sau khi cửa sổ mở xong**.
- Nếu không có quyền PDF cho đơn này, tab GomShip ẩn và Mẫu 1 · SPX được chọn mặc định. Người dùng vẫn chuyển qua lại giữa ba tab như trước.
- Cơ chế cấp quyền PDF GomShip theo từng đơn không thay đổi. Đối với đơn gộp, kiểm tra quyền nhãn theo mã đơn gốc.
- Kiểm thử: `node --test tests/gomshipIntegration.test.mjs` → 13/13 đạt; JavaScript syntax pass. Không gọi tạo vận đơn thật.
- **Cần deploy lại frontend Vercel** (các file `index.html`, `app.js`, `gomship-print-preview.mjs`). Riêng thay đổi thứ tự/mặc định tab không cần deploy Supabase function hoặc chạy SQL.

## Ẩn giao diện kiểm tra GomShip — 03/11/2026

- GomShip là carrier mặc định trên form, và mỗi khi mở một đơn mới từ `openSpxCreateModal`. SPX trực tiếp vẫn có trong danh sách lựa chọn.
- Xóa toàn bộ bảng kiểm tra/kỹ thuật GomShip trên giao diện: nút kết nối, nút kiểm tra địa chỉ, kết quả kiểm tra, ô nhập mã hành chính. Không gỡ những API/action hỗ trợ nội bộ phía server.
- Các trường ẩn vẫn giữ `gomshipProvinceCode`/`gomshipDistrictCode`/`gomshipWardCode` rỗng để function tự tra địa chỉ; `gomshipProductValue=999999` và `gomshipNote=[CHO THỬ HÀNG]` được gửi như cũ.
- Nếu địa chỉ không xác định được, vẫn hiển thị cảnh báo lỗi khi tạo đơn và **không gửi yêu cầu tạo thêm**; chỉ ẩn bước kiểm tra thử, không bỏ xác thực đầu vào.
- Đã chạy 31/31 test liên quan thành công; không gọi tạo đơn thật. Cần deploy lại frontend trên Vercel để áp dụng, không cần deploy lại Edge Function cho riêng thay đổi giao diện này.

## Sửa lỗi tên địa chỉ "Hà Nội" → "Thành phố Hà Nội" (03/11/2026)

- **Biểu hiện:** GomShip `HTTP 500` khi chọn địa chỉ cũ 3 cấp: `Hà Nội → Quận Cầu Giấy → Phường Yên Hòa`. Lỗi nội bộ: `Không xác định duy nhất địa chỉ "Hà Nội"`.
- **Nguyên nhân:** Tên tỉnh từ SPX/Pumalife là `Hà Nội`; danh mục GomShip trả `Thành phố Hà Nội`. Hàm `canonicalPlaceName` cũ yêu cầu trùng tên sau chuẩn hóa, chưa cho phép thiếu tiền tố `Thành phố`.
- **Sửa:** Chuẩn hóa tiền tố `Thành phố` tùy chọn khi so khớp **duy nhất** một tên trong danh mục; vẫn kiểm tra mã/tên quận và phường. Sau khi khớp, tiếp tục dùng **tên chính thức GomShip** cho các truy vấn `districts` / `wards` và payload, không dùng trực tiếp tên viết tắt.
- **Đã xác minh trực tiếp GET API GomShip:** `Thành phố Hà Nội` mã `01`; `Quận Cầu Giấy` mã `005`; `Phường Yên Hoà` mã `00172`. Cách viết `Hòa` trên Pumalife và `Hoà` trên GomShip được đối chiếu bằng Unicode normalization. Đã chạy đầy đủ 3 API GET thật qua code mới và phân giải ra đúng các mã trên.
- **Kiểm thử:** `node --test tests/gomshipLegacyAddress.test.mjs tests/gomshipIntegration.test.mjs tests/gomshipCarrierDefault.test.mjs` đạt 24/24, có cả trường hợp kiểm tra mã tỉnh sai bị từ chối.
- **Cần deploy:** Chỉ cần deploy lại Edge Function `gomship-create-order` từ `supabase/functions/gomship-create-order/index.ts` lên Supabase chính để website nhận bản sửa. Không cần thay đổi frontend hoặc SQL riêng cho lỗi này. Chưa tạo đơn thật và chưa xác nhận deploy cloud.

## PDF GomShip không yêu cầu đăng nhập lần hai (03/11/2026) — bản mới nhất

**Mục tiêu:** Người dùng đăng nhập Pumalife tại màn hình chính một lần, sau đó mở **In bill** ở bất kỳ trình duyệt nào sẽ xem/in được PDF GomShip. Không hiện ô `Đăng nhập quyền in PDF GomShip`, không cần đăng nhập website GomShip và không cần copy token từ trình duyệt tạo đơn.

**Đã sửa mã nguồn:**
- `pumalife-session.mjs` dùng Supabase Auth password grant trên **màn hình đăng nhập chính Pumalife**; tự lưu access/refresh token, tự làm mới trước khi hết hạn, xóa cả hai khi đăng xuất. Không lưu mật khẩu; không dùng `localStorage.is_logged_in` để xác thực PDF.
- `app.js` đăng nhập bằng `signInPumalife(email, password)` và khôi phục phiên bằng `getPumalifeAccessToken()`. Không còn so sánh mật khẩu cố định ngay trong JavaScript. Khi người dùng bấm Đăng xuất, xóa phiên ký tên.
- `index.html` và `gomship-print-preview.mjs` bỏ hoàn toàn form/mật khẩu đăng nhập quyền in PDF, chỉ giữ 3 tab chọn nhãn và khung xem.
- `gomship-label-client.mjs` dùng JWT đã đăng nhập Pumalife để gọi `action: get_label_by_order` cùng `order_id`. Người dùng có token nhãn cũ vẫn có fallback `get_label` khi phiên app vắng mặt, nhằm không làm hỏng nhãn cũ.
- Edge Function `gomship-create-order` dùng `db.auth.getUser` xác minh JWT, cho phép chính tài khoản Pumalife có email `PUMALIFE_LOGIN_EMAIL` (mặc định `pumalifestore@gmail.com`) xem PDF. Không còn biến `GOMSHIP_PRINT_ALLOWED_EMAILS` / `GOMSHIP_PRINT_ALLOWED_USER_IDS` để cấu hình một danh sách quyền in riêng.
- Server vẫn tìm `gomship_shipments` theo đơn gốc, xác nhận trạng thái `created`, kiểm tra mã SPX khớp ở `pancake_orders` rồi lấy file nhãn từ GomShip. Không chấp nhận client cung cấp `gomship_order_id` tùy ý, không trả PDF chỉ dựa trên anon key.

**BẮT BUỘC CHUẨN BỊ TRƯỚC KHI DEPLOY (để không bị khóa khỏi app):**
1. Trong Supabase chính → **Authentication → Users**, tạo/kiểm tra tài khoản Supabase Auth email `pumalifestore@gmail.com` (hoặc đặt `PUMALIFE_LOGIN_EMAIL` trong Edge Function Secrets nếu tài khoản chính dùng email khác). Dùng mật khẩu an toàn do bạn quản lý. Tài khoản này là tài khoản **đăng nhập Pumalife**, không phải tài khoản in riêng.
2. **Xác nhận đăng nhập ở một môi trường kiểm thử bằng email/mật khẩu Supabase Auth này**. Bản đăng nhập frontend cũ kiểm tra mật khẩu trên trình duyệt, còn bản mới dùng Auth chính thức, nên **nếu tài khoản Supabase Auth chưa tồn tại thì không được deploy frontend mới**.
3. Deploy Edge Function `supabase/functions/gomship-create-order/index.ts` lên Supabase chính (Verify JWT bật như hiện tại).
4. Deploy frontend Vercel gồm `index.html`, `app.js`, `pumalife-session.mjs`, `gomship-label-client.mjs`, `gomship-print-preview.mjs`.
5. Sau khi deploy, đăng nhập Pumalife một lần trên mỗi trình duyệt → mở In bill → tab GomShip PDF được chọn và tải nhãn. Không có bước đăng nhập thứ hai.
6. Không cần thay đổi SQL chỉ cho tính năng này. Người dùng đã đăng nhập bằng cờ localStorage cũ sẽ cần đăng nhập lại một lần theo Auth mới sau khi nâng cấp.

**Kiểm thử mock:** `node --test tests/pumalifeSession.test.mjs tests/gomshipCrossBrowserPrint.test.mjs tests/gomshipPrintUiAcrossBrowsers.test.mjs tests/gomshipIntegration.test.mjs` và toàn bộ bộ test GomShip hiện có. Chưa thực hiện POST tạo vận đơn thật, chưa deploy cloud.
## GomShip tự đăng xuất trên trình duyệt sau khi function tạo đơn (04/11/2026)

**Triệu chứng:** Khi dùng `shop.gomship.vn`, DevTools → Application → Local Storage có `access_token`, `refresh_token`, `device_id`; Cookies không có mục tương ứng. Sau khi tạo đơn qua Edge Function, phiên web đôi khi mất hiệu lực.

**Phân tích mã nguồn (đã kiểm tra):**
- Edge Function **không gọi `/auth/login` khi tạo từng đơn**. Nó dùng `gomship_auth` (Supabase chính), chỉ gọi `POST /auth/refresh` khi access token gần hết hạn hoặc API GomShip trả 401.
- Nếu `gomship_auth.refresh_token` đã được sao chép từ Local Storage của trang GomShip, hai phía có thể đang dùng chung **một refresh token / phiên thiết bị**. Khi refresh token được xoay vòng, phiên web đang giữ token cũ có thể không tiếp tục làm mới. **Cần xác minh cách GomShip cấp phiên, vì nhà cung cấp chưa xác nhận có hỗ trợ nhiều phiên đồng thời.**
- Cơ chế cập nhật mới trong `access(force, rejectedToken)` tái sử dụng token còn hạn, và khi một request khác đã lưu access token mới thì ưu tiên lấy token mới trước khi refresh. `test_auth` không còn gọi ép `access(true)`. Đây là tối ưu tránh refresh thừa, **không phải đảm bảo hết logout nếu vẫn dùng chung phiên**.
- Dùng cùng `device_id` với web và token copy từ web là điều cần kiểm tra; không ghi token/refresh token lên log hoặc chia sẻ hình DevTools chứa token.

**Thông tin thực tế từ người dùng:** Cùng tài khoản GomShip có thể đăng nhập trên nhiều trình duyệt mà không bị đá phiên. Vấn đề xuất hiện **khi Edge Function sử dụng chung `refresh_token` với một trình duyệt đang dùng**. Điều này củng cố chẩn đoán token refresh bị xoay vòng trong cùng một phiên, không phải GomShip chỉ cho đăng nhập một thiết bị.

**Cách tách phiên để khắc phục:**
1. Mở **một hồ sơ trình duyệt riêng, chỉ dùng để cấp phiên backend** (ví dụ profile `gomship-api-bootstrap`), đăng nhập GomShip **mới** tại đó. Không lấy token từ profile GomShip dùng hằng ngày. Không dùng cách copy `refresh_token` cũ và chỉ thay `device_id`: token và thiết bị phải thuộc cùng một lần đăng nhập độc lập.
2. Lấy **cặp `refresh_token` + `device_id` từ cùng phiên mới** và lưu bằng quyền quản trị vào bản ghi `public.gomship_auth` có `id=9` trong Supabase **chính**. Đồng thời xóa `access_token`, `expires_at` để lần gọi tiếp theo refresh qua phiên backend. Tạm ngừng các yêu cầu tạo/hủy/in trong lúc cập nhật để tránh ghi đè do request song song. Không gửi token trong chat, không đưa vào frontend, source code hay log.
3. Đóng hồ sơ dùng để cấp phiên backend **mà không bấm Đăng xuất**; từ đây chỉ function sử dụng, làm mới và ghi lại token của phiên này. Các trình duyệt GomShip đang sử dụng hằng ngày duy trì những phiên khác.
4. Kiểm tra tạo một **yêu cầu đọc, không tạo đơn** sau khi cập nhật, rồi theo dõi `gomship_auth.updated_at`, phản hồi API và trạng thái đăng nhập của trình duyệt thường. Không chạy lặp các thao tác tạo đơn thật để thử phiên.
5. **Quan trọng:** `GOMSHIP_INITIAL_REFRESH_TOKEN` và `GOMSHIP_DEVICE_ID` trong Secrets chỉ dùng khi bảng `gomship_auth` **chưa có** dòng id=9. Chỉ đổi Secrets mà không cập nhật dòng hiện hữu **không đổi được phiên backend**. Nếu refresh token của profile bootstrap bị xoay vòng, không sao chép lại token cũ vào DB.

**Giới hạn:** Không thể cấp phiên độc lập chỉ bằng một thay đổi code hay tạo `device_id` ngẫu nhiên khi không có lần đăng nhập hợp lệ do GomShip cấp. Quy trình trên dựa trên quan sát nhiều trình duyệt có phiên riêng; cần thử một lần với phiên backend mới để xác nhận GomShip không ràng buộc thêm thiết bị, hạn dùng hoặc chính sách thu hồi. Nếu có API token chuyên biệt cho tích hợp server, nên sử dụng API đó thay việc giữ refresh token từ browser.

**Test mock:** `node --test tests/gomshipAuthRefresh.test.mjs tests/gomshipGroupedCreate.test.mjs tests/gomshipRecreate.test.mjs tests/gomshipCancelBackend.test.mjs`. Không tạo đơn, không xoay token thật.

**Triển khai:** Sửa mã tại `supabase/functions/gomship-create-order/index.ts` chỉ có tác dụng sau khi redeploy Edge Function. Không cần deploy Vercel hoặc chạy SQL chỉ cho việc giảm refresh thừa. **Chưa deploy hoặc xác minh đăng xuất thực tế.**

## Chặn xoay refresh token khi còn dùng chung phiên browser (04/11/2026)

**Đã sửa code Edge Function:** `access()` không gọi `POST /auth/refresh` nếu thiếu `GOMSHIP_AUTH_SESSION_MODE=dedicated`. Mặc định `shared`. Access token còn hạn có thể tiếp tục dùng; khi token hết hạn hoặc GomShip báo 401, function **trả lỗi có hướng dẫn tách phiên** thay vì làm mất phiên website GomShip. Log Supabase chỉ ghi lý do `token_expired` hoặc `carrier_401`, **không ghi token**. Đây là cơ chế ngăn làm web bị logout, có thể khiến tạo/hủy/in vận đơn tạm dừng khi token cũ hết hạn.

**Để vừa tạo vận đơn liên tục vừa không đăng xuất web:**
1. Đăng nhập GomShip ở profile mới **chỉ dành cho Edge Function**. Nhận `refresh_token` và `device_id` của **cùng lần đăng nhập độc lập** (không lấy từ profile GomShip thường ngày).
2. Tạm ngừng request GomShip, cập nhật dòng `gomship_auth.id=9` trên Supabase chính bằng cặp giá trị mới, xóa `access_token` và `expires_at`. Không thay bằng device_id tự tạo hay token khác phiên.
3. Sau khi hoàn tất bước 2, trong Edge Function Secrets đặt `GOMSHIP_AUTH_SESSION_MODE=dedicated` (tên biến phải chính xác). Bước này xác nhận token backend đã độc lập; **không được đặt dedicated khi vẫn dùng refresh_token của trình duyệt đang mở**.
4. Deploy lại `supabase/functions/gomship-create-order/index.ts` lên Supabase. Không cần thay frontend hay SQL cho bản sửa guard. Thực hiện một GET kiểm tra và theo dõi log `GOMSHIP AUTH dedicated refresh` nếu token cần làm mới. Không tạo đơn thật nhiều lần để thử.

**Đã chạy test:** 30/30 test giả lập của refresh + tạo/hủy GomShip. Chưa xác minh trên GomShip live hoặc deploy. Không đính kèm hay ghi lại token vào chat/tài liệu.

### Cập nhật bắt buộc: chặn mọi yêu cầu bằng phiên GomShip dùng chung (04/11/2026)

Sau khi người dùng báo vẫn bị GomShip tự đăng xuất, `access()` đã được siết lại: **nếu chưa thiết lập `GOMSHIP_AUTH_SESSION_MODE=dedicated`, mọi lệnh lấy token sẽ bị từ chối NGAY CẢ KHI `access_token` còn hạn**. Việc này tránh function tiếp tục gọi API bằng token thuộc phiên trình duyệt. Log cảnh báo chỉ ghi `store_id`, không chứa token.

**Ảnh hưởng có chủ đích:** bản function mới sẽ **không thể tạo/hủy/lấy PDF GomShip** cho đến khi có phiên backend riêng và đặt biến Secrets như trên. Cần cung cấp phiên backend độc lập trước khi triển khai để không gián đoạn giao hàng. Đặt biến `dedicated` mà vẫn dùng token sao chép từ trình duyệt thường ngày **KHÔNG** giải quyết vấn đề. Không gọi API `/auth/login` từ function vì chưa xác minh hợp đồng xác thực GomShip cho API này.

Đã chạy `node --test tests/gomshipAuthRefresh.test.mjs tests/gomshipGroupedCreate.test.mjs tests/gomshipCancelBackend.test.mjs tests/gomshipRecreate.test.mjs` → 30/30 test giả lập đạt. **Chưa deploy và chưa cấu hình phiên backend thực tế.**

## Phương án thử nghiệm không dùng Edge Function tạo GomShip — Chrome Extension (04/11/2026)

Theo yêu cầu người dùng, đã tạo thư mục `extensions/gomship-worker/` (Manifest V3), gồm popup điều khiển và worker đọc Supabase, content script gọi API trong chính tab `shop.gomship.vn`.

- Bảng mới: `public.gomship_extension_requests` với SQL đầy đủ `supabase/gomship_extension_queue.sql` (chưa chạy trên Supabase thật). Chống tạo trùng bằng idempotency và RPC kiểm tra/khóa/cập nhật nhóm theo giao dịch.
- Form GomShip ở `gomship-integration.mjs` gửi yêu cầu vào RPC `enqueue_gomship_extension_request`, không gọi `gomship-create-order` khi tạo mới; `app.js` thông báo **đã xếp hàng, chưa có vận đơn**.
- Extension sử dụng access token trong Local Storage của tab GomShip, không dùng refresh token hoặc đăng nhập API từ server; khi lỗi/timeout sau POST chuyển `needs_review`, không tự retry.
- Chưa chuyển phần AI/CLI `quản lý bán hàng pumalife/src/gomship.mjs` hay chức năng in/hủy sang extension. Không gọi action AI/CLI tạo GomShip cũ trong thời gian chuyển đổi để tránh logout web.
- Bản thử nghiệm mặc định tắt và không tạo đơn thật. **57/57 bài test liên quan đạt**, chưa deploy SQL, frontend hoặc cài extension.

**Xem `extensions/gomship-worker/README.md` để cài đặt, cấu hình và các giới hạn an toàn.**

## GomShip Worker v0.2.0 — bản cập nhật thay thế đường tạo cũ (04/11/2026)

Đã hoàn thiện quy trình **assisted UI**, không tự động POST từ Extension: đọc hàng đợi Supabase và khóa đơn, điền form GomShip bằng script trên tab `shop.gomship.vn` đã đăng nhập, nhận phản hồi *mã ID số + SPXVN* từ website nếu có, yêu cầu người dùng đối chiếu trước khi lưu qua RPC. Không đọc/sao chép `Authorization` hoặc `refresh_token` GomShip. Chrome badge đọc số `pending` theo chu kỳ nhưng **không claim hoặc tạo đơn tự động**.

- Cập nhật Extension từ 0.1.x: `chrome://extensions` → **Reload**, F5 tab GomShip, mở **Tạo đơn hàng**, kiểm tra tab, nhận một yêu cầu, đối chiếu địa chỉ/kho/cân nặng/giá/COD, đánh dấu chuẩn bị gửi, tự bấm Tạo đơn trên web, xác minh mã rồi lưu Supabase.
- Không chạy lại SQL nếu bảng và RPC hàng đợi đã tồn tại và hoạt động.
- Không dùng đường tạo GomShip của Edge Function/AI CLI song song. Chưa chuyển chức năng hủy/in PDF sang extension.
- **69/69 test liên quan đạt bằng giả lập**; chưa thực thi đơn thật hoặc reload Extension trên Chrome người dùng. Cần thử nghiệm thực tế trước khi khẳng định form website tương thích.

Chi tiết xem `extensions/gomship-worker/README.md`.

## Khôi phục tạo GomShip qua Supabase Edge Function (05/11/2026) — áp dụng mới nhất

Theo yêu cầu hiện tại, **dừng luồng Chrome Extension** và tạo vận đơn mới bằng Edge Function `gomship-create-order` như trước. Đã khôi phục `gomship-integration.mjs` gọi `callGomshipFunction(payload)`, `app.js` sử dụng ngay kết quả mã vận đơn, hỗ trợ đơn gộp/PDF như cũ.

- `extensions/gomship-worker/manifest.json` v0.4.0 là trạng thái **ngừng hoạt động**, không background/content scripts/permissions. Phải **Reload hoặc Remove** Extension cũ trong Chrome để ngắt thực sự phiên đang cài.
- **Không xử lý tiếp** các job cũ `gomship_extension_requests`. Không xóa hoặc tự đặt lại `submitting`/`needs_review`; đối chiếu GomShip và Supabase để tránh tạo trùng. Khi dùng Function cho đơn có request cũ, xác minh không có vận đơn đang xử lý.
- Giữ giới hạn bảo vệ trên Edge Function: `GOMSHIP_AUTH_SESSION_MODE=dedicated` nếu đang dùng bản backend yêu cầu phiên tách biệt. Không tự thay đổi/chia sẻ refresh token trình duyệt để vượt qua cơ chế này; nếu chưa cấu hình thì Function có thể từ chối tạo.
- Không chạy SQL tự động, không tự tạo vận đơn thật. Frontend cần được deploy lên Vercel để thay đổi có hiệu lực. Edge Function đang có nếu tương thích thì không cần deploy lại.

Các ghi chú trước đây về tạo GomShip từ Extension chỉ là lịch sử và không còn là quy trình đang áp dụng.

## Khôi phục xác thực GomShip dùng chung — 05/11/2026 (mới nhất)

Theo yêu cầu của chủ cửa hàng, Edge Function `supabase/functions/gomship-create-order/index.ts` **không còn sử dụng biến `GOMSHIP_AUTH_SESSION_MODE`** và không còn chặn phiên chưa được đánh dấu `dedicated`. Việc xác thực quay về đọc `access_token`, `refresh_token`, `device_id`, `expires_at` từ `public.gomship_auth` cho cửa hàng 9. Ưu tiên token còn hạn; khi hết hạn hoặc API trả HTTP 401 mới thử refresh theo logic cũ. Không xóa/sửa thủ công idempotency, tracking hoặc đơn đã tạo.

- Secret `GOMSHIP_AUTH_SESSION_MODE` hiện **không còn được mã mới đọc**, có thể xóa trong Supabase Secrets để tránh hiểu nhầm (không bắt buộc).
- Cần **deploy lại Edge Function `gomship-create-order`** để bản đang chạy trên Supabase nhận thay đổi. Chỉ sửa source không làm Function đang deploy thay đổi. Frontend Vercel đã trỏ đến Function nên không cần deploy lại chỉ để thay đổi chế độ xác thực.
- **Cảnh báo:** dùng chung phiên và refresh token có thể làm nhiều trình duyệt GomShip đồng loạt đăng xuất; user đã yêu cầu chấp nhận rủi ro này. Nếu refresh vẫn trả HTTP 401 thì phải có token/device hợp lệ trong `gomship_auth`; bỏ chặn dedicated không tự giải quyết lỗi 401.
- Không thử gửi lại các yêu cầu cũ đang `submitting` hoặc `needs_review` (ví dụ `local_16766`), và đối chiếu trạng thái GomShip trước khi tạo lại bất kỳ đơn nào.

## 05/11/2026 — Phân biệt mã vận đơn và khóa tạo nhóm (bản mới nhất)

- **Chỉ `pancake_orders.jt_waybill_id`** quyết định đơn đã được **ghi nhận có mã vận đơn** hay chưa. `shipment_claim_token` không phải là mã vận đơn.
- `shipment_claim_token` vẫn giữ làm khóa chống hai yêu cầu POST SPX/GomShip chạy đồng thời. Khóa có thể còn khi kết quả carrier chưa xác định; **không tự xóa chỉ vì `jt_waybill_id` trống**.
- `supabase/20261105_group_claim_waybill_diagnostic.sql`: cập nhật RPC `claim_grouped_shipment` để thông báo rõ đơn nào có mã/đơn nào bị khóa, phân biệt kiểm tra trạng thái; không tự giải phóng khóa cũ. Bản gốc `enable_grouped_shipments.sql` cũng đã được đồng bộ.
- Edge Function `gomship-create-order`: trường hợp group-claim dự kiến trả HTTP 409 (không phải 500); lỗi RPC `reserve_gomship_shipment` **trước POST** thì nhả claim nhóm; bản ghi GomShip `created` nhưng `jt_waybill_id` trống trả lỗi cần đồng bộ thay vì nhầm là đã lưu vận đơn.
- Cần **chạy riêng migration SQL mới** trong Primary Supabase và **deploy lại Edge Function** mới có hiệu lực. Không chạy migration/xóa khóa trên Production tự động.
- Với nhóm trong ảnh `local_16685` / `local_16766`: kiểm tra `jt_waybill_id`, `shipment_claim_token`, `shipment_claimed_at`, lịch sử `gomship_shipments` và `gomship_extension_requests`; xác minh trên GomShip/SPX trước khi gỡ khóa để tránh tạo trùng.

## 05/11/2026 — Sửa đối chiếu tên tỉnh địa chỉ GomShip 3 cấp

Trong `supabase/functions/gomship-create-order/index.ts`, `canonicalPlaceName` trước đây chỉ bỏ tiền tố `Thành phố` nhưng không bỏ tiền tố `Tỉnh`. Ví dụ SPX gửi `Cà Mau` hoặc `Quảng Bình` nhưng danh mục GomShip có thể trả `Tỉnh Cà Mau` / `Tỉnh Quảng Bình`, dẫn đến thông báo sai `Không xác định duy nhất địa chỉ`. Mã mới so khớp chính xác sau chuẩn hóa tiền tố `Tỉnh/Thành phố`; tiếp tục dùng **tên và mã thực tế do API GomShip trả về** khi truy vấn quận/huyện, phường/xã và tạo vận đơn.

- Không tự chuyển đổi tỉnh sau sáp nhập hoặc đoán mã cũ/mới; nếu API không trả tỉnh 3 cấp, thông báo rõ `Không tìm thấy`, số mục trong catalog.
- Nếu một tên khớp nhiều mã khác nhau, không tạo đơn và yêu cầu mã GomShip cụ thể. Bản ghi trùng hệt mã được phép dùng.
- Có unit test mô phỏng Cà Mau, Quảng Bình, TP.HCM, Hà Nội, mã sai, không có tỉnh trong catalog, trùng tên khác mã. **Các bản ghi mock không chứng minh catalog GomShip Production thực sự có tỉnh đó**.
- Địa chỉ 2 cấp tiếp tục dùng riêng `/locations/provinces-2tier`, `/locations/wards-2tier` như trước; không chỉnh payload hay RPC nhóm.
- Chỉ thay đổi mã Function. Cần deploy lại `gomship-create-order` để áp dụng. Chưa chạy API tạo đơn thật.

## 05/11/2026 — Giao diện 3 cấp dùng trực tiếp danh mục GomShip (mới nhất)

Người dùng xác định lỗi chọn tỉnh 3 cấp do frontend Pumalife trước đây tải danh mục SPX `fetchSpxRegions` nên tên/mã có thể không trùng catalog GomShip. Đã thay luồng:

- **Chọn GomShip + Cũ (3 cấp):** các dropdown `jtProvince`, `jtDistrict`, `jtWard` lấy trực tiếp từ Supabase Edge Function `gomship-create-order` action `list_locations` làm proxy. Function gọi GomShip `/locations/provinces`, `/locations/districts?province=<tên chính thức>`, `/locations/wards?province=<tên tỉnh>&district=<tên huyện>`; trả mảng `{code,name}`. Giao diện lưu code GomShip vào option.value, tên chính thức vào data-name.
- `gomship-integration.mjs` yêu cầu cả ba option có `dataset.source === 'gomship'` và gửi các mã GomShip đã chọn trong `province_code,district_code,ward_code`. Không lấy SPX `location_id` hay các ô mã thủ công đã cũ cho 3 cấp. Function dùng tên và mã đã khớp này để tạo payload.
- **Mới (2 cấp)** và **SPX trực tiếp** giữ nguyên cách tải SPX như trước; đổi hãng hoặc cấp địa chỉ sẽ reset và tải lại danh sách phù hợp. Có generation guard ngăn response từ tỉnh/huyện cũ ghi đè.
- Không tự thay tỉnh do sáp nhập, không đoán mã. Nếu catalog GomShip thiếu tỉnh, tỉnh đó không xuất hiện trong dropdown; lỗi tải API không tự fallback sang SPX gây chọn sai.
- Tự điền SPX fuzzy trong trường hợp GomShip 3 cấp chỉ chọn khi tên hành chính khớp chính xác sau bỏ tiền tố `Tỉnh/Thành phố/Quận/...`; không chọn theo chuỗi bao hàm có thể sai.
- **Deploy cả** Edge Function `gomship-create-order` và frontend Pumalife lên Vercel (files `app.js`, `gomship-integration.mjs`). Không cần chạy SQL hoặc sửa dữ liệu đơn.
- Đã chạy unit tests mô phỏng tỉnh Cà Mau, Quảng Bình, cascade và chuyển nguồn; **chưa chạy thử request GET GomShip Production qua dashboard và chưa gửi đơn thật**.

## 05/11/2026 — Đối chiếu đúng danh mục API 3 cấp GomShip (cập nhật mới nhất)

Chủ shop đã cung cấp phản hồi thực tế `GET https://api.gomship.vn/api/v1/locations/provinces` với **63 tỉnh/thành phố**. Đặc biệt:
- **`95` = Tỉnh Bạc Liêu**, **`96` = Tỉnh Cà Mau** (test cũ nhầm `95` cho Cà Mau — đã sửa).
- **`44` = Tỉnh Quảng Bình**, **`01` = Thành phố Hà Nội**, **`79` = Thành phố Hồ Chí Minh**.
- Phải giữ nguyên mã dạng chuỗi, kể cả số 0 đầu (`01`, `02`, `04`), **không dùng SPX location_id** cho GomShip 3 cấp.

Đã sửa và hậu kiểm:
- Frontend `app.js` chỉ tải GomShip qua RPC action `list_locations` khi chọn **GomShip + Cũ (3 cấp)**. Ba cấp kế tiếp dùng đúng tên/mã catalog GomShip. Chuyển sang 2 cấp hoặc SPX trực tiếp không bị thay nguồn. Có guard tránh danh sách tỉnh/huyện/phường trả về trễ ghi đè lựa chọn mới và bảo đảm dropdown SPX được bật lại sau khi load.
- `gomship-integration.mjs` chỉ gửi 3 mã `province_code/district_code/ward_code` từ option có `dataset.source='gomship'`; không gửi mã SPX hoặc các mã nhập tay cũ.
- `gomship-create-order` action `list_locations` chỉ dùng **GET không cần Authorization GomShip** để lấy catalog 3 cấp, dựa trên Network response do người dùng cung cấp; không gọi refresh token chỉ để nạp danh sách. Tạo đơn vẫn qua Function với xác thực/token quản lý như trước.
- Bộ test snapshot đủ **63 tỉnh** được cung cấp trong `tests/gomshipProvinceCatalog3Tier.test.mjs`; test các trường hợp Bạc Liêu/Cà Mau, Quảng Bình, giữ mã có số 0 đầu, HTTP lỗi, chuyển nguồn, gửi đúng mã.
- Đã chạy **52/52 bài test liên quan đạt (mock)**; không gửi API tạo đơn thật. Việc GET không cần bearer được quan sát trong network của người dùng, chưa được kiểm chứng trực tiếp từ Edge runtime Production.

**Để đưa vào sử dụng trên website:** cần deploy lại Supabase Edge Function `gomship-create-order` và frontend Pumalife `app.js` / `gomship-integration.mjs` trên Vercel. Chưa tự triển khai. Không chạy SQL hay tự xử lý đơn cũ đang khóa.

## 05/11/2026 — GomShip 2 cấp: danh mục chính thức 34 tỉnh (áp dụng mới nhất)

Đã đối chiếu phản hồi người dùng cung cấp từ `GET https://api.gomship.vn/api/v1/locations/provinces-2tier`: **34 tỉnh/thành phố**, phân biệt hoàn toàn với **63 tỉnh/thành phố 3 cấp**. Những mã trùng nhưng khác nghĩa: `44` = **Tỉnh Quảng Trị (2 cấp)**, nhưng **Tỉnh Quảng Bình (3 cấp)**; `46` = **Thành phố Huế (2 cấp)**, **Tỉnh Thừa Thiên Huế (3 cấp)**; `52` = **Tỉnh Gia Lai (2 cấp)**, **Tỉnh Bình Định (3 cấp)**; `96` = Tỉnh Cà Mau trong cả hai.

- **GomShip + Mới (2 cấp):** frontend `app.js` lấy danh sách `provinces-2tier` và `wards-2tier?province=<GomShip province code>` qua `gomship-create-order` action `list_locations` (read-only). Trường `jtDistrict` thực chất là Phường/Xã, nhãn hiển thị đúng, không có cấp huyện.
- **GomShip + Cũ (3 cấp):** frontend tiếp tục lấy `provinces`, `districts?province=<tên>`, `wards?province=<tên>&district=<tên>` của GomShip.
- **SPX trực tiếp (2/3 cấp):** giữ nguyên danh mục SPX `fetchSpxRegions`, không thay đổi.
- Khi tạo GomShip `2-tier`, `gomship-integration.mjs` gửi `province_code` từ `jtProvince` và `ward_code` từ `jtDistrict` với `dataset.source='gomship'`; không lấy SPX location_id hoặc ô mã nhập thủ công cũ.
- Cả hai chế độ GomShip chỉ tự chọn từ fuzzy search khi tên hành chính khớp chính xác sau chuẩn hóa; không đoán tỉnh/phường khác do sáp nhập.
- `supabase/functions/gomship-create-order/index.ts` hỗ trợ `list_locations` level `provinces-2tier` / `wards-2tier` bằng GET địa giới không refresh GomShip session. Tạo đơn thật vẫn qua Function và cơ chế chống trùng cũ.
- `tests/gomshipProvinceCatalog2Tier.test.mjs` có snapshot đủ 34 tỉnh theo API user cung cấp; tests giao diện và payload 2/3 cấp kiểm tra chuyển nguồn và giữ mã `01`. Đây là kiểm thử mock, không phải xác nhận đã chạy GET/POST thật từ Supabase Production.
- **Cần deploy cả frontend Vercel và Supabase Edge Function `gomship-create-order`**; không cần SQL migration, không tự tạo lại các đơn đang khóa.

## 06/11/2026 — Tự điền GomShip không còn sử dụng SPX fuzzy search (mới nhất)

Bug từ ảnh: nút **Tự điền** khi đã chọn **GomShip** vẫn gọi endpoint SPX `detail_address_fuzzy_search`; dữ liệu SPX `TP. Hồ Chí Minh` không chọn được vào catalog GomShip và báo `Không tìm thấy Tỉnh/Thành phố TP. Hồ Chí Minh`. Địa chỉ mẫu người dùng: `60/5J ấp Thới Tây 2, Xã Hóc Môn, Thành phố Hồ Chí Minh`; UI đang ở Cũ (3 cấp) dù địa chỉ chỉ có **xã + tỉnh/thành (2 cấp)**.

Đã sửa `app.js` và tạo `gomship-address-autofill.mjs`:
- Khi chọn nhà vận chuyển GomShip, nút tự điền **không gọi SPX fuzzy API**. Phân tích các thành phần địa chỉ đã nhập (không làm mất thông tin số nhà, ấp, tên đường) và khớp **chính xác, duy nhất** tên hành chính với dropdown GomShip (cho phép tên đầy đủ hoặc bỏ tiền tố `Tỉnh/Thành phố/TP./Quận/Huyện/Phường/Xã`).
- Tên cấp hành chính cụ thể theo input: `Xã Hóc Môn` + `Thành phố Hồ Chí Minh` và không có huyện ⇒ tự chọn **Mới (2 cấp)**, nạp `provinces-2tier`, `wards-2tier`, chọn tỉnh theo mã GomShip `79`, phường/xã theo đúng mã trả từ API. Nếu đủ 3 cấp thì tự chọn **Cũ (3 cấp)** và nạp đủ huyện, phường.
- Không chọn bừa khi tên không có, trùng tên hoặc API GomShip chưa trả dữ liệu. Hiển thị đúng tên không tìm thấy, để người dùng chọn trực tiếp. Giữ nguyên luồng tự điền của nhà vận chuyển **SPX trực tiếp**.
- Tests mô phỏng `tests/gomshipAddressAutofill.test.mjs` gồm địa chỉ mẫu Hóc Môn, alias `TP. Hồ Chí Minh`, 3 cấp cũ, ward không tồn tại và chống dùng mã SPX. **72/72 bài kiểm thử liên quan đạt**, `node --check` hợp lệ; chưa chạy API GomShip Production.
- Chỉ có thay đổi ở frontend. **Cần deploy frontend Vercel** bao gồm cả file module `gomship-address-autofill.mjs`; **không cần deploy lại GomShip Edge Function** chỉ để sửa Tự điền, trừ khi Function cũ chưa có `list_locations`. Không tự gọi POST tạo đơn hay giải phóng claim cũ.

## 06/11/2026 — Tự điền còn rơi vào SPX khi chọn GomShip (sửa mới nhất)

Bằng chứng ảnh user: khi popup đơn vị vận chuyển hiển thị GomShip và tỉnh hiển thị placeholder "GomShip 3 cấp", nút Tự điền lại cảnh báo `Không thể tự điền địa chỉ từ SPX: Không tìm thấy Tỉnh/Thành phố Lâm Đồng`. Đây là sự cố **phân nhánh nguồn dữ liệu của frontend**, không phải lỗi gửi API GomShip.

Đã chỉnh:
- `gomship-address-autofill.mjs`: `resolveAddressAutofillCarrier` kiểm tra trực tiếp select `shipmentCarrier`, nhãn option và các option tỉnh `dataset.source='gomship'`. Nếu nhà vận chuyển là SPX nhưng danh mục vẫn của GomShip ⇒ báo trạng thái không khớp, **không gửi SPX fuzzy API**. Nếu thiếu trạng thái ⇒ báo chọn lại thay vì âm thầm dùng SPX.
- `app.js`: nút tự điền chỉ gọi SPX fuzzy khi `currentCarrier==='spx'`; khi GomShip chọn địa chỉ từ GomShip API. Trường hợp tên tỉnh nhập ngắn (`Lâm Đồng`, không có `Tỉnh`) được coi là candidate và **phải khớp chính xác một mục từ danh mục GomShip thực tế** trước khi chọn.
- `index.html`: nút hiển thị `Tự điền · GomShip` hoặc `Tự điền · SPX` tương ứng nguồn đang chọn. Đây cũng là dấu hiệu dễ thấy để biết Vercel đã nhận bản sửa.
- Kiểm thử mô phỏng 76/76 đạt, Vite production build thành công (dist `assets/main-CdwW219J.js`). Khi kiểm tra URL Production, JS đang phục vụ là `assets/main-Be3VHpas.js` (bản trước): **cần deploy bản mới trên Vercel và tải lại trang**. Không cần deploy lại Supabase Function cho riêng sửa này.
- Không thay đổi dữ liệu/khóa vận đơn hoặc gọi POST tạo đơn thật.

## 06/11/2026 — Sửa Tự điền GomShip 3 cấp với "Tân Bình, Hồ Chí Minh" (mới nhất)

Người dùng gửi hai ảnh: địa chỉ 2 cấp chọn được TP.HCM; khi chuyển Cũ (3 cấp) và bấm Tự điền lại báo "Không thể tự điền địa chỉ từ SPX: Không tìm thấy Tỉnh/Thành phố TP. Hồ Chí Minh". Địa chỉ có dạng `2b Phổ Quang, phường 2, Tân Bình, Hồ Chí Minh`. Chẩn đoán:
- Browser có thể giữ JS cũ, vì nút trong ảnh chỉ ghi "Tự điền" (bản mới có nhãn "Tự điền · GomShip"). Kiểm tra live Vercel thời điểm này cho thấy `assets/main-CdwW219J.js` đã lên Production (gồm guard nguồn địa chỉ), nhưng chưa bao gồm bản sửa mới cho huyện không có tiền tố.
- Parser `gomship-address-autofill.mjs` trước đó chỉ nhận huyện nếu bắt đầu bằng `Quận`, `Huyện`, `Thị xã`; chuỗi `Tân Bình` nằm giữa `Phường 2` và `Hồ Chí Minh` bị bỏ qua, dễ tự chuyển sang Mới (2 cấp) không đúng.
- Parser mới nhận đoạn không tiền tố giữa phường và tỉnh **là ứng viên huyện**, sau đó bắt buộc `findGomshipAdministrativeOption` match chính xác, duy nhất với **danh mục huyện thực tế của GomShip** trước khi chọn. Nếu không khớp, báo lỗi, không gán mã SPX, không tạo vận đơn.
- Chế độ chỉ tỉnh+phường `60/5J ấp Thới Tây 2, Xã Hóc Môn, Thành phố Hồ Chí Minh` vẫn tự chuyển Mới (2 cấp). Chế độ `Phường 2, Quận Tân Bình, TP. Hồ Chí Minh` hoặc `Phường 2, Tân Bình, Hồ Chí Minh` hoạt động với danh mục 3 cấp.
- Test mô phỏng đã bổ sung trường hợp ảnh (tỉnh `79`, huyện tên `Quận Tân Bình`, phường tên `Phường 2`), trường hợp huyện không khớp và không fallback SPX. **78/78 tests liên quan pass**, production Vite build pass, bundle mới `assets/main-DCTJYseH.js`. Mã huyện/phường trong test là fixture, không phải mã Production thực tế.
- **Chưa deploy bản `main-DCTJYseH.js` lên Vercel.** Cần triển khai frontend và Ctrl+Shift+R tab đang mở. Nên kiểm tra network để thấy asset mới thay cho `main-CdwW219J.js`. Không cần SQL/Function deploy chỉ để sửa parser, không gửi POST carrier hoặc xóa claim.

## 2026-11-08 — GomShip Tự điền thiếu tiền tố Phường/Xã ("105 Mô Xoài, Bà Rịa, Hồ Chí Minh")

Lỗi ảnh user: khi chọn **GomShip + Mới (2 cấp)** hoặc **Cũ (3 cấp)**, tự điền địa chỉ `105 mô xoài, bà rịa, hồ chí minh` báo `Địa chỉ cần có tên tỉnh/thành và phường/xã ngăn cách bằng dấu phẩy`. Nguyên nhân: parser cũ chỉ nhận `ward` nếu segment bắt đầu bằng `Phường/Xã/Thị trấn`, không xử lý tên phường viết ngắn `Bà Rịa`.

- Đã sửa `gomship-address-autofill.mjs`: cấu trúc **địa chỉ chi tiết, tên địa phương không tiền tố, tỉnh/thành** với đúng ba đoạn phân cách dấu phẩy được hiểu là **ứng viên phường/xã 2 cấp**. Ví dụ `105 Mô Xoài, Bà Rịa, Hồ Chí Minh` ⇒ province candidate `Hồ Chí Minh`, ward candidate `Bà Rịa`, chọn **Mới (2 cấp)**.
- `app.js` tiếp tục bắt buộc đối chiếu **duy nhất** `Bà Rịa` với `Phường Bà Rịa` trong danh mục `wards-2tier` GomShip thuộc `Thành phố Hồ Chí Minh` (province_code `79`). Mã phường lấy **từ API GomShip tại runtime**, không hardcode, không dùng SPX và không suy diễn mã. Giữ nguyên trường `jtReceiverAddress` đầy đủ. Nếu không có kết quả hoặc trùng, báo lỗi rõ và không tạo đơn.
- Nếu form đang ở Cũ (3 cấp) nhưng địa chỉ chỉ cung cấp địa phương + tỉnh, app tự chuyển Mới (2 cấp) trước khi tra mã. Địa chỉ chỉ có `Bà Rịa, Hồ Chí Minh` (không có chi tiết đường), hoặc tên huyện được ghi rõ nhưng thiếu phường, vẫn không tự đoán ward.
- Bài kiểm thử mới `tests/gomshipAddressAutofill.test.mjs` phủ đúng chuỗi user, cả 2/3 cấp, tên viết hoa/thường, và trường hợp không thể đối chiếu. **93/93 bài kiểm thử liên quan đạt**, Vite build frontend mới `dist/assets/main-xTiSZ9Oh.js`.
- **Chưa deploy Production**, chưa gọi tạo vận đơn thật; chỉ cần deploy frontend Vercel để áp dụng. Không cần sửa Supabase Function hoặc SQL cho bug parser này.

## 2026-11-09 — Tự điền GomShip 3 cấp với tên phường/huyện/tỉnh không có tiền tố

Ảnh người dùng báo lỗi `Địa chỉ cần có tên tỉnh/thành và phường/xã ngăn cách bằng dấu phẩy` khi nhập `Phước Bửu, Xuyên Mộc, Bà Rịa Vũng Tàu` và `5/10 Nguyễn Huệ, Phước Hòa, ...` ở GomShip Cũ (3 cấp). Nguyên nhân: `parseGomshipAdministrativeAddress` cũ chỉ nhận `ward` khi có tiền tố `Phường/Xã/Thị trấn`, dù các danh mục GomShip trả về tên chính thức.

Đã sửa `gomship-address-autofill.mjs`:
- Tách từ cuối chuỗi: tỉnh/thành, quận/huyện, phường/xã; hỗ trợ **tên các cấp viết ngắn** không tiền tố và có/không có số nhà ở đầu. Các chuỗi phân tích được chỉ là ứng viên, không gán mã trực tiếp.
- Phân biệt rõ `105 Mô Xoài, Bà Rịa, Hồ Chí Minh` (2 cấp, có địa chỉ đường ở đầu) với `Phước Bửu, Xuyên Mộc, Bà Rịa Vũng Tàu` (3 cấp, không có địa chỉ đường). Chỉ chọn nếu tên khớp duy nhất với danh mục GomShip thực tế tại từng cấp. Với địa chỉ có cấp huyện ghi rõ nhưng xã viết ngắn, suy ra xã ngay trước huyện.
- Đã gọi **GET API GomShip Production, không tạo đơn**, xác nhận tỉnh `Tỉnh Bà Rịa - Vũng Tàu` mã `77`, huyện `Huyện Xuyên Mộc` mã `751`, `Thị trấn Phước Bửu` mã `26620`, huyện `Thành phố Phú Mỹ` mã `754`, `Phường Phước Hoà` mã `26713`. Các mã chỉ thuộc các địa giới được xác minh, không đoán mapping cho nơi khác.
- Thêm regression tests với các địa chỉ đó, trường hợp ghi nhãn cấp huyện/không ghi và trường hợp district không tồn tại. Cùng toàn bộ các test liên quan: **99/99 passed**; Vite build thành công: `dist/assets/main-UMCu1cZh.js`.
- Chưa deploy Vercel; khi kiểm tra website đang phục vụ `/assets/main-xTiSZ9Oh.js`. Có `.vercel/project.json` nhưng môi trường không có Vercel CLI/token phiên đã đăng nhập để deploy Production. Chỉ cần deploy frontend để áp dụng, không cần thay đổi SQL/Supabase Function cho parser.

## 10/11/2026 — Đồng bộ kho GomShip theo kho gắn trên đơn

- GET /api/v1/warehouses được Edge Function gomship-create-order gọi bằng action list_warehouses; frontend phân tích toàn bộ phản hồi, chỉ sử dụng ID số kho chính thức của GomShip.
- Khi mở tạo vận đơn từ đơn đã có warehouse_id, giao diện ưu tiên UUID kho PUMALIFE được lưu trên đơn; không tự đổi về kho mặc định. Nếu kho đó ngừng hoạt động, yêu cầu chọn lại.
- Mở đơn mới không kế thừa lựa chọn kho GomShip thủ công của đơn trước. Nút Tải lại danh sách trong cùng đơn vẫn giữ lựa chọn hợp lệ.
- POST /api/v1/warehouses chỉ gọi sau khi xác nhận và kiểm tra quyền; backend hỗ trợ các dạng ID lồng trong phản hồi. Sau tạo, frontend tải lại danh mục để xác minh kho mới.
- Đã chạy 45/45 unit tests phần kho và tích hợp liên quan; Vite production build thành công. Kiểm tra read-only Primary lúc 10/11/2026 trả lỗi upstream HTTP 401 khi refresh phiên GomShip. Cần chủ shop khôi phục phiên đăng nhập và đồng bộ token hợp lệ để xác minh tải kho thực tế.
- Cần deploy frontend Vercel (app.js, gomship-integration.mjs) và Edge Function gomship-create-order để áp dụng thay đổi; chưa tạo kho thật, vận đơn thật hoặc sửa dữ liệu đơn.
