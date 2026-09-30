# Backend cho web Niệm

Đây là phần "máy chủ" giúp trang web Niệm chạy được thật: lưu tài khoản khách,
đơn hàng, số dư trong một cơ sở dữ liệu dùng chung (chứ không phải lưu trong
trình duyệt của từng người như bản cũ), và tự động cộng tiền khi khách chuyển
khoản thật qua SePay.

## Trang web hiện tại KHÔNG dùng được cái này ngay

File `tang-like.html` bạn đang dùng lưu mọi thứ trong trình duyệt (localStorage),
chưa gọi tới các API dưới đây. Bạn cần nhắn Claude sửa lại phần JavaScript của
trang để gọi các API này thay vì lưu localStorage. Đây là bước làm nền trước.

## Cần chuẩn bị trước khi chạy

1. Một máy chủ để chạy code này 24/24 — gợi ý dùng **Railway.app** (dễ nhất,
   có gói miễn phí/giá rẻ, tạo Postgres kèm theo chỉ vài cú bấm).
2. Một cơ sở dữ liệu **PostgreSQL** — Railway tự tạo giúp khi bạn thêm "New →
   Database → PostgreSQL" trong cùng dự án.
3. Tài khoản **SePay** (sepay.vn) liên kết với tài khoản ngân hàng thật của
   bạn, để SePay báo cho máy chủ mỗi khi có tiền vào.

## Các bước triển khai

1. Chạy `npm install` trong thư mục này để tải các thư viện cần dùng
   (express, pg, bcryptjs, jsonwebtoken, dotenv, cors).
2. Tạo tài khoản tại railway.app, tạo dự án mới, thêm PostgreSQL, và thêm
   dịch vụ mới bằng cách tải code này lên (kéo thả thư mục hoặc kết nối qua
   Github).
3. Vào phần "Variables" của dịch vụ, thêm các biến trong `.env.example`:
   - `DATABASE_URL`: Railway tự cấp sẵn khi bạn liên kết Postgres, chỉ cần
     dùng biến `${{Postgres.DATABASE_URL}}` Railway gợi ý.
   - `JWT_SECRET`: tự gõ một chuỗi dài ngẫu nhiên bất kỳ.
   - `SEPAY_API_KEY`: lấy trong phần cấu hình Webhook của tài khoản SePay.
4. Chạy lệnh khởi tạo bảng dữ liệu một lần: `npm run migrate`
   (Railway cho chạy lệnh này trong tab "Shell" của dịch vụ).
5. Tạo tài khoản quản trị đầu tiên:
   `node src/seed-admin.js ten_dang_nhap_admin mat_khau_admin`
6. Bấm Deploy. Railway cho bạn một địa chỉ dạng
   `https://ten-du-an.up.railway.app`.
7. Vào SePay, mục Webhook, dán vào:
   `https://ten-du-an.up.railway.app/api/webhook/sepay`
   và dán đúng `SEPAY_API_KEY` bạn đã đặt ở bước 3.
8. Kiểm tra máy chủ đã chạy bằng cách mở
   `https://ten-du-an.up.railway.app/api/health` — thấy chữ `{"ok":true}`
   là được.

## Sau khi máy chủ chạy được

Gửi lại địa chỉ máy chủ (`https://ten-du-an.up.railway.app`) cho Claude, nhắn
sửa trang `tang-like.html` để gọi các API này (đăng ký, đăng nhập, đặt hàng,
nạp/rút tiền, giới thiệu) thay vì lưu trong trình duyệt như hiện tại. Từ lúc
đó, số dư và đơn hàng dùng chung thật cho mọi khách, trên mọi thiết bị, và
tiền nạp được cộng tự động khi khách chuyển khoản thật.

## Danh sách API có sẵn

| Việc | Method & đường dẫn |
|---|---|
| Đăng ký khách | POST /api/register |
| Đăng nhập khách | POST /api/login |
| Xem thông tin của mình | GET /api/me |
| Sửa tên / đổi mật khẩu | PUT /api/me |
| Đặt dịch vụ | POST /api/orders |
| Xem đơn hàng của mình | GET /api/orders |
| Xem nội dung + số tiền nạp tối thiểu | GET /api/deposit-info |
| Xem lịch sử nạp tiền | GET /api/deposits |
| Webhook SePay báo có tiền vào (tự động) | POST /api/webhook/sepay |
| Gửi yêu cầu rút tiền | POST /api/withdraws |
| Xem mã giới thiệu + hoa hồng | GET /api/referral |
| Quản trị đăng nhập | POST /api/admin/login |
| Quản trị xem đơn hàng | GET /api/admin/orders |
| Quản trị đổi trạng thái đơn (xong/huy) | POST /api/admin/orders/:id/status |
| Quản trị xem yêu cầu rút tiền | GET /api/admin/withdraws |
| Quản trị duyệt/từ chối rút tiền | POST /api/admin/withdraws/:id/status |

## Sửa giá dịch vụ, phí rút, % hoa hồng

Mở file `src/pricing.js` — mọi mức giá, phí rút 20%, hoa hồng 10%/5%, và mức
nạp tối thiểu đều nằm trong này, sửa số là áp dụng ngay cho lần chạy tiếp theo.
