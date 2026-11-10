# Pumalife Chat Offline Desktop

Ứng dụng Electron chạy trực tiếp giao diện `smax-chat-manager - Copy (2)` trên PC.

- Khi có mạng: giao diện gọi Smax/BotBanHang như hiện tại và mỗi hội thoại được mở sẽ tự lưu xuống `../offline-data/`.
- Khi mất mạng: danh sách/tin nhắn đã lưu được đọc từ `offline-data/`.
- Dữ liệu thật nằm trong folder dự án, không phụ thuộc IndexedDB của browser.

Chạy trên PC:

```bash
cd "smax-chat-manager - Copy (2)/desktop-offline"
npm install
npm start
```

Không cần build web-app/Vercel để dùng ứng dụng desktop này.
