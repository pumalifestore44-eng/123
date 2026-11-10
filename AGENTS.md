# AGENTS — Smax Chat Manager

**Khi chủ shop yêu cầu trả lời/tư vấn khách qua Smax:** bắt buộc đọc [SKILL trả lời tin nhắn khách](./skills/tra-loi-tin-nhan-khach/SKILL.md). Skill quy định thông tin cửa hàng có nguồn, tra sản phẩm/biến thể từ Supabase Primary, các câu hỏi được phép trả lời hoặc phải chuyển chủ shop, và điều kiện gửi tin nhắn thật. Chỉ gửi khi chủ shop yêu cầu rõ, đúng page + thread, đã đọc tin mới nhất; không khởi chạy chatbot/worker hay gửi tự động. Lưu ý dữ liệu hotline/Zalo trong các mã nguồn hiện chưa thống nhất, không tự chọn số để gửi khách.

**Mặc định cho lệnh lên đơn:** Đọc và áp dụng [skill xử lý đơn hàng toàn diện](./skills/xu-ly-don-hang-toan-dien/SKILL.md) khi nhận mã đơn và yêu cầu thêm/tạo sản phẩm. Phải rà soát bill và Pancake, chống trùng, hậu kiểm Primary; không tự tạo vận đơn. Quy tắc owner/CAS và thời hạn request trong PUMALIFE AGENTS.md luôn được ưu tiên.

Trước khi xử lý tạo giao hàng, phải đọc [SKILL thực hiện yêu cầu](./skills/thuc-hien-yeu-cau/SKILL.md) và `GOMSHIP_TESTING.md`. **Khi kiểm tra tiền khách chuyển khoản**, phải đọc [SKILL kiểm tra chuyển khoản](./skills/kiem-tra-chuyen-khoan/SKILL.md): lấy URL ảnh Smax, xem trực tiếp bằng AutoClick Desktop user `user_1789955358281` (không dùng manager-chrome/browser_control), không tải ảnh; đối chiếu bằng Pancake API qua `get_payment_histories` / `match_payment_history`.

**Quy tắc 04/11/2026:** Mọi yêu cầu tạo giao hàng mới của AI phải dùng GomShip và Edge Function `gomship-create-order` hoặc action `create_gomship_shipment` gọi function đó. Không dùng `create_spx_shipment` / function `create-order` cho đơn mới. `SPXVN...` là định dạng mã vận đơn từ GomShip, không phải lý do để chuyển API sang SPX trực tiếp.

Đối chiếu người nhận, COD, chống tạo trùng, trạng thái `Chờ lấy hàng` và thông báo Smax trước khi báo hoàn tất. Các tính năng tra cứu/hủy/in vận đơn cũ theo nguồn thực tế không đổi.

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

## 2026-11-08 — Đồng bộ Đơn hàng gần đây ngay khi bấm Lưu thay đổi

Sau khi bấm **Lưu thay đổi** trong cửa sổ `sideOrderEditModal` hoặc bảng quản lý đơn, thẻ tương ứng trong sidebar **Đơn hàng gần đây** được cập nhật trực tiếp từ Supabase theo khóa `pancake_orders.id`, không đợi tải lại tin nhắn.
- Nguyên nhân cũ: handler lưu đơn kiểm tra `window.activeThread` nhưng module thực tế dùng `let activeThread`, do đó điều kiện không chạy.
- Mã mới: `app.js` dùng `refreshRecentOrdersAfterSave(orderId)` ở cả hai handler. Module `recent-orders-sync.mjs` nhận order ID, tải dữ liệu đơn mới có `items:pancake_order_items(*)`, thay đúng một thẻ `.order-history-card[data-recent-order-index]`, cập nhật cache `recentOrdersForEdit` để lần nhấn `Sửa nhanh` sau dùng dữ liệu mới. Không reload tin nhắn, toàn sidebar, hay danh sách threads; giữ vị trí cuộn.
- Lỗi tải lại riêng thẻ không làm đảo trạng thái lưu đơn: chỉ fallback đọc lại lịch sử sidebar khi fetch chi tiết lỗi.
- `tests/recentOrderSaveRefresh.test.mjs` kiểm tra cập nhật người nhận, SĐT, địa chỉ, sản phẩm, số lượng, COD, tổng tiền, trạng thái; chống cập nhật sai khách khi chuyển hội thoại; và kiểm tra cả hai đường save.
- Cần deploy lại frontend Vercel để áp dụng lên Production; không cần migration SQL/Edge Function và không tạo vận đơn.

## 2026-11-08 — GomShip: chọn người trả phí vận chuyển khi tạo đơn

Đã thêm mục **Người trả phí vận chuyển** trong form `jtCreateOrderModal` (chỉ hiện khi `shipmentCarrier=gomship`) ở `index.html`:
- `gomshipPaymentMethod=0`: **Người gửi trả (shop trả cước)**, là giá trị mặc định cũ, reset về 0 khi mở form tạo vận đơn tiếp theo.
- `gomshipPaymentMethod=1`: **Người nhận trả (khách trả cước)**. Khi chọn sẽ không tự động cộng cước vào `jtCodMoney`; GomShip tính tiền thu dựa trên lựa chọn và cước thực.
- `gomship-integration.mjs`: xác thực giá trị `0/1`, truyền `payment_method` vào payload POST Function; hiển thị người trả phí trong hộp xác nhận trước khi tạo đơn thật; ẩn điều khiển khi chuyển SPX trực tiếp.
- `supabase/functions/gomship-create-order/index.ts`: `orderPayload()` truyền `input.payment_method` vào GomShip `POST /orders` thay vì cố định `0`; chỉ chấp nhận `0/1`. Thiếu trường ở client cũ vẫn mặc định `0` để tương thích.
- Theo tài liệu GomShip, shop trả cước chỉ hợp lệ nếu COD lớn hơn phí; COD=0 cần người nhận trả. Form hiển thị lưu ý này, phí thực tế do GomShip xác thực.
- Unit tests: mặc định/người nhận trong cả 2 cấp & 3 cấp, chuyển GomShip-SPX, xác nhận và JSON request, Function mapping và giá trị sai, hồi quy. **89/89 tests liên quan pass; Vite build thành công**.
- **Chưa deploy production**; cần cập nhật Vercel frontend và Supabase Edge Function `gomship-create-order` cùng lúc. Không cần chạy SQL. Không gửi vận đơn thật khi kiểm thử.

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

## 2026-11-10 — Chọn nhiều ảnh thực tế sản phẩm trong một lần

Trong form chỉnh sửa đơn tại dashboard và modal "Sửa đơn hàng" ở sidebar, input `real-image-input-<orderId>` và `side-real-image-input` đã có `multiple`. Nút đổi nhãn thành "Thêm nhiều ảnh". Không thay đổi upload ảnh ghi chú hoặc ảnh sản phẩm gốc.

- `app.js`: `handleRealImageUpload` và `handleSideRealImageUpload` dùng chung batch uploader, không còn chuyển qua input tạm/DataTransfer chỉ chứa một file. Có tiến độ n/N, tránh upload trùng đồng thời cùng đơn, và cập nhật thumbnail hai bề mặt sau khi lưu.
- `real-image-batch-upload.mjs`: upload lần lượt từng file ảnh, ghi nhận lỗi từng ảnh; nếu có ảnh thành công thì đọc lại danh sách ảnh mới nhất để nối và loại bỏ URL trùng; chỉ một lần PATCH/POST Supabase cho toàn bộ batch. Ảnh cũ luôn được giữ.
- `real-image-upload-controller.mjs`: gọi Pancake POS contents, đọc `pancake_orders` tìm `display_id`, đọc/ghi `chatbot_images.hinhanh`; không tạo đơn hay thay đổi tiền/giao hàng.
- `tests/realImageBatchUpload.test.mjs`: kiểm thử tải 3 ảnh, thêm vào ảnh có sẵn, tạo hàng mới, lỗi một phần, lỗi toàn bộ, URL trùng và cả hai input. Tổng **106/106** bài kiểm thử liên quan đạt. Vite production build thành công với `dist/assets/main-BSPCilB9.js`.
- **Chưa deploy lên Vercel**, chưa upload ảnh thật vào đơn Production. Cần deploy frontend; không cần migration SQL/Edge Function.

## 2026-11-10 — GomShip lấy đúng kho gửi hàng thay vì hardcode 24

Nguyên nhân ảnh người dùng: Pumalife dùng `jtWarehouseSelect` (danh mục `public.warehouses` SPX/Pumalife) để chọn kho khác, nhưng Edge Function `supabase/functions/gomship-create-order/index.ts` trong `orderPayload` luôn gửi `warehouse_id: 24` nên GomShip nhận kho mặc định bất kể lựa chọn.

Đã thay đổi:
- Backend `gomship-create-order`: bỏ hardcode `24`, bổ sung `list_warehouses` đọc danh sách kho thực đã đăng ký từ **GET `/warehouses` với tài khoản GomShip store 9**, và `validatePickupWarehouse` xác minh `input.warehouse_id` là mã số kho nằm trong tài khoản trước khi bất kỳ POST tạo đơn/claim/reserve nào xảy ra. Gửi đúng `warehouse_id` vào GomShip `POST /orders`.
- Frontend `gomship-warehouse.mjs` và `gomship-integration.mjs`: phân biệt **ID kho Pumalife** với **ID kho GomShip**, đối chiếu theo số nhà/địa chỉ chi tiết và số điện thoại hoặc tên kho. Nếu trùng duy nhất thì tự chọn kho đúng; nếu không, không tự rơi về mặc định. Tải danh mục GomShip mỗi lần mở modal, có nút ↻ tải lại.
- Giao diện `index.html`: hiển thị selector "Kho lấy hàng trên GomShip" và trạng thái đối chiếu bên dưới picker kho Pumalife. Form gửi `warehouse_id` số của GomShip và `pumalife_warehouse_id` ID nội bộ riêng biệt; bước xác nhận hiển thị tên, ID và địa chỉ kho GomShip.
- `app.js`: option kho Pumalife lưu metadata name/phone/detail address để so khớp; thay kho trong menu phát event change, bộ đồng bộ chọn lại warehouse GomShip; thêm kho xong cũng đồng bộ. Khi tạo đơn gộp, `finish_grouped_shipment` vẫn nhận **`pumalife_warehouse_id`** cho trường nội bộ, không nhầm ID carrier.
- **Giới hạn:** Một kho mới chỉ được thêm ở Pumalife mà chưa đăng ký kho tương ứng trên GomShip thì chưa thể gửi qua GomShip; app báo cần đăng ký/sửa kho ở GomShip và chặn tạo sai địa chỉ, không tự tạo kho trên carrier bằng API chưa được xác minh. Giữ luồng SPX trực tiếp nguyên trạng.
- Tests mới `tests/gomshipWarehouse.test.mjs`, cập nhật `gomshipIntegration.test.mjs` và kiểm thử hồi quy: **111/111 tests pass**. Vite build Production thành công: `dist/assets/main-CHLQ5H_S.js`.
- **Chưa deploy frontend Vercel hoặc Supabase Edge Function**, chưa gọi POST tạo đơn thật. Để hoạt động cần deploy cả hai; chưa đủ chứng cứ xác nhận shape của `GET /warehouses` ở store thật nên cần thử read-only catalog trên Production trước khi dùng tạo đơn.

## 2026-11-10 14:47 — Sửa lỗi HTTP 500 khi chọn kho mặc định GomShip

Người dùng báo lỗi khi tạo GomShip (kho PUMALIFE mặc định): `GomShip: HTTP 500: Chưa chọn mã kho GomShip hợp lệ; không tự dùng kho mặc định`. Lỗi xuất phát từ thay đổi cũ: yêu cầu `warehouse_id` numeric GomShip có sẵn và frontend chỉ tự khớp kho khi địa chỉ & số điện thoại giống gần như tuyệt đối; khi chưa khớp, payload thiếu ID hoặc là UUID kho nội bộ.

Đã sửa:
- `gomship-warehouse.mjs`: phân biệt hai namespace ID; ưu tiên khớp địa chỉ, sau đó đối với **PUMALIFE warehouse có is_default=true** dùng kho GomShip đã đánh dấu mặc định. Khi API cũ không có cờ mặc định, fallback `24` chỉ nếu ID 24 còn tồn tại trong catalog GomShip store 9; nếu chỉ có duy nhất một kho thì nhận kho đó. Không fallback mặc định cho kho PUMALIFE khác. Hỗ trợ cấu trúc address object, cờ mặc định string/boolean.
- `app.js`: `loadSpxWarehouses` đặt `data-local-default` trong option để frontend biết kho PUMALIFE nào là mặc định.
- `gomship-integration.mjs`: tự chọn đúng kho theo `suggestGomshipWarehouse`. Cho phép **người dùng chọn thủ công một kho từ chính catalog GomShip** nếu dữ liệu địa chỉ khác nhau; bảng xác nhận POST tiếp tục hiển thị rõ tên/địa chỉ/ID kho. Kho khác không tự chọn kho mặc định.
- `supabase/functions/gomship-create-order/index.ts`: `validatePickupWarehouse` hỗ trợ `warehouse_id` là UUID PUMALIFE từ frontend phiên bản cũ, đọc bảng `warehouses` và resolve sang ID GomShip; với kho default mới dùng fallback có điều kiện như trên. Vẫn xác minh ID numeric có trong danh sách kho GomShip, **trước khi claim/reservation/POST**. Nếu lỗi kho trả `HTTP 400` với `reason=invalid_pickup_warehouse` thay vì HTTP 500; không tự tạo đơn.
- Tests `gomshipWarehouse.test.mjs`, `gomshipIntegration.test.mjs`, `gomshipGroupedCreate.test.mjs`: đủ trường hợp default, catalog cũ, non-default, manual selection, backend nhận local UUID, và lỗi 400 trước carrier POST. **120/120 regression tests pass**, TypeScript Edge Function parse pass, Vite production build pass: `dist/assets/main-D3WmT8Zf.js`.
- **Chưa deploy Production**, chưa gọi tạo vận đơn thật. Phải deploy cả frontend Vercel và Edge Function `gomship-create-order` ở Supabase Primary thật; chỉ update một phía có thể tái gây lỗi. Môi trường hiện tại không có Vercel/Supabase CLI credentials, Supabase MCP chỉ liệt kê một project khác nên không triển khai sai project.

## 2026-11-10 16:52 — GomShip GET/POST /warehouses theo DevTools người dùng cung cấp

Nguồn: ảnh user xác nhận **GET `https://api.gomship.vn/api/v1/warehouses` trả 200 OK**, **POST cùng endpoint trả 201 Created**. Mẫu payload POST từ DevTools chứa `name,contact_name,contact_phone,address,city,district,province_code,ward,ward_code,is_default` (ảnh minh hoạ dùng địa chỉ 2 cấp, district trống). Ảnh **không cung cấp phần Response JSON cho GET**; parser thiết kế dung nạp common wrappers, cần kiểm tra bằng tài khoản store thật trước khi tuyên bố live.

Đã sửa mã nguồn:
- Edge Function `supabase/functions/gomship-create-order/index.ts`: `list_warehouses` gọi `gomship("/warehouses",token)` đúng GET có Authorization Bearer + X-Store-Id 9; parser đệ quy xử lý array trong `data,items,warehouses,list,results,records,rows,result`, trả `count` và các trường warehouse chính thức `id,name,contact_name,contact_phone,address,city,district,ward,province_code,ward_code,is_default`. `create_warehouse` gọi POST đúng fields theo ảnh và `is_default:false` nhưng chỉ sau khi xác minh Supabase Auth PUMALIFE với `verifyGomshipPrintOperator`, kiểm tra cặp province/ward code+name qua catalog GomShip 2 cấp và người dùng xác nhận rõ trong UI. Không tự tạo khi mở form; không retry POST khi kết quả không chắc chắn.
- `gomship-warehouse.mjs`: parser raw/projected data, nested address, chuẩn tên/địa chỉ, nguồn GET và URL tạo kho; `formatGomshipWarehouse` hiển thị đủ tên/ID/địa chỉ/phường/thành phố/số điện thoại, `buildGomshipWarehouseCreatePayload` kiểm tra đầu vào. Không dùng ID kho PUMALIFE thay GomShip.
- `gomship-integration.mjs`: danh sách GomShip lấy qua `list_warehouses` đúng backend, có nút ↻. Kho được chọn thủ công vẫn giữ sau refresh nếu ID còn tồn tại; có thể chọn ID hợp lệ dù không có kho PUMALIFE tương ứng. `create_warehouse` dùng phiên Supabase PUMALIFE từ `getPumalifeAccessToken()` (không đưa bearer GomShip lên frontend), tải tỉnh/phường 2 cấp thật, xác nhận trước POST, làm mới catalog và chọn warehouse đã tạo.
- `index.html`: form **Tạo kho mới trực tiếp trên GomShip**, nhập tên/liên hệ/SĐT/địa chỉ, chọn province/ward từ API GomShip, không đổi default và không tự tạo. Khi chọn GomShip, `jtWarehouseSelect` nội bộ PUMALIFE không còn là required input.
- `app.js`: khi tạo đơn từ kho GomShip do user chọn thủ công nhưng không khớp kho local, **không PATCH sai ID kho PUMALIFE**; khi có mapping đáng tin thì giữ ID nội bộ riêng cho đồng bộ đơn và nhóm.
- Tests `tests/gomshipWarehouseApi.test.mjs` mock GET/POST + auth + code mapping, cùng tất cả test liên quan: **127/127 passed**. Frontend Vite build `dist/assets/main-sKRcS_TE.js`; Edge Function TypeScript parse success. Không gọi POST live, không tạo kho/đơn thật, chưa deploy.
- **Cần deploy đồng thời frontend Vercel và Edge Function `gomship-create-order` ở đúng Supabase Primary `nwyxvnehuiyenjuxihro`.** Supabase connector trong phiên chỉ nhìn thấy dự án khác nên KHÔNG deploy nhầm. Không cần chạy migration SQL. Kiểm tra danh sách thực qua action `list_warehouses` ở Production trước khi tạo vận đơn thật. Nếu API GET dùng envelope khác ngoài các dạng đã hỗ trợ, cần lấy tab DevTools **Response** JSON của GET (ẩn token), vì screenshot hiện chỉ có Headers.

## 10/11/2026 — Mặc định ALL khi mở Xem Chat từ Đơn hàng

- Trong `app.js`, đường dẫn `#tin-nhan?pid=...&tid=...` có `pid` chỉ để xác định đúng Page sở hữu hội thoại. Không coi `pid` là một lần người dùng chọn bộ lọc Page.
- Khi điều hướng vào `#tin-nhan` từ Đơn hàng, tab hoặc deep link: gọi `resetSmaxPageFilterToAll()`, hiển thị nhãn **ALL**, đánh dấu ALL trong menu, tải lại danh sách đa kênh nếu trước đó đang lọc Page.
- Khi mở tin nhắn, vẫn dùng `pid` của link để tải đúng hội thoại; tìm thread phải khớp cả tid và Page khi có pid. Không chuyển `selectedPagePid` sang pid tự động.
- Chỉ sự kiện click một mục trong `#channelFilterMenu` mới đổi `selectedPagePid`; khi chỉ mở một thread từ bộ lọc đã chọn không tự chuyển bộ lọc khác.
- `tests/chatPageDefaultAll.test.mjs` có 5 test. Chạy cùng `allConversations.test.cjs`, `conversationSearch.test.mjs` và `dashboardOrderSaveRefresh.test.mjs` trong thư mục ứng dụng: tổng 21/21 test đạt. Vite build thành công, bundle `main-3zxkjt1z.js`.
- Chưa deploy frontend Vercel; cần deploy bản mới lên `pumalifeorder.vercel.app` để thay đổi có hiệu lực. Không sửa dữ liệu đơn hoặc hội thoại trên production.

## 10/11/2026 — AI Agent: ảnh upload phải dùng URL HTTPS Pancake, không dùng blob:

- Upload ảnh AI Agent sử dụng POST multipart `https://pos.pancake.vn/api/v1/contents?api_key=...` (từ `window.SMAX_PANCAKE_UPLOAD`). API trả `content_url` / `data.content_url` / `url`. Chỉ nhận URL HTTPS công khai; response thành công nhưng trả `blob:`/`data:` hoặc không có link sẽ báo lỗi, không lưu vào queue.
- `ai-agent.js`: ảnh đang upload có thể dùng `URL.createObjectURL(file)` **chỉ để xem trước**. Khi upload xong, hiển thị `item.url` từ Pancake thay vì `item.previewUrl`, gắn link mở URL thật, thu hồi blob preview bằng `URL.revokeObjectURL` và xóa tham chiếu tạm.
- Khi POST `ai_agent_requests` hoặc `ai_post_requests`, chỉ đưa các URL HTTPS đã upload vào `request_text` và `metadata.image_urls/attachments`. Nếu upload lỗi/không có link hợp lệ, nút gửi bị khóa. Lịch sử cũ có blob URL không render các liên kết tạm hỏng.
- `ai-agent.css`: thumbnail hiển thị bình thường khi bọc trong link ảnh Pancake.
- `tests/aiAgentPancakeUpload.test.mjs`: 8 bài kiểm thử upload giả lập, URL hợp lệ, lỗi, Blob preview, bảo đảm request không chứa blob. Vite build thành công, bundle `main-DSs98sSZ.js` chứa mã mới.
- **Chưa triển khai website Production** và không thực hiện POST upload thật trong kiểm thử. Cần deploy frontend Vercel mới để bản đang chạy nhận sửa đổi.
