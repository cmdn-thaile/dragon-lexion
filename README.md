# Dragon Lexicon (Next.js)

Game học từ vựng tiếng Anh C1–C2: trả lời đúng để chém rồng. Có đăng nhập bằng Auth0, lưu tiến độ lên MongoDB và bảng xếp hạng riêng cho từng màn.

**Stack:** Next.js 16 (App Router) · `@auth0/nextjs-auth0` v4 · Prisma 6.19 + MongoDB Atlas · TypeScript.

> Prisma 7 chưa hỗ trợ MongoDB nên dự án dùng Prisma 6.19. Đừng nâng lên Prisma 7 cho tới khi Prisma công bố hỗ trợ MongoDB.

## Cấu trúc

```
app/
  page.tsx                 đọc session Auth0, render <GameClient/>
  api/scores/route.ts      POST điểm sau mỗi trận (server tự tính lại điểm)
  api/leaderboard/route.ts GET top 20 của một màn + hạng của bạn
  api/progress/route.ts    GET/PUT tiến độ (cloud save)
components/
  GameClient.tsx           tải dữ liệu, khởi động engine, gửi điểm/tiến độ
  GameMarkup.tsx           markup tĩnh mà engine điều khiển qua id
  Leaderboard.tsx          bảng xếp hạng dạng popup
  UserSlot.tsx             nút đăng nhập / avatar
lib/
  game/engine.js           toàn bộ logic game (canvas, âm thanh, chiến đấu)
  score.ts                 công thức điểm, dùng chung cho game và API
  auth0.ts  prisma.ts  user.ts  stages.ts  api.ts
proxy.ts                   proxy Next.js 16 mount /auth/login, /auth/logout, /auth/callback
prisma/schema.prisma       User, BestScore
public/data/words.json     16 màn + kho 1.625 từ (tải lúc chạy, không nằm trong bundle JS)
public/sprites, public/bg  sprite hiệp sĩ, rồng, ảnh nền
```

## Chạy ở máy

```bash
npm install
cp .env.example .env.local   # điền các biến bên dưới
npx prisma db push           # tạo collection + index trên MongoDB
npm run dev                  # http://localhost:3000
```

Chưa điền Auth0 hoặc MongoDB thì game vẫn chạy ở **chế độ khách**: lưu tiến độ trong trình duyệt, không ghi lên bảng xếp hạng.

### 1. Auth0

1. Auth0 Dashboard → Applications → **Create Application** → loại **Regular Web Application**.
2. Mục Settings:
   - **Allowed Callback URLs:** `http://localhost:3000/auth/callback, https://<tên-app>.vercel.app/auth/callback`
   - **Allowed Logout URLs:** `http://localhost:3000, https://<tên-app>.vercel.app`
   - **Allowed Web Origins:** `http://localhost:3000, https://<tên-app>.vercel.app`
3. Chép Domain, Client ID, Client Secret vào `.env.local`. `AUTH0_DOMAIN` chỉ là tên miền, **không** có `https://`.
4. Tạo `AUTH0_SECRET` bằng `openssl rand -hex 32`.

### 2. MongoDB Atlas

1. Tạo cluster miễn phí M0, tạo database user.
2. **Network Access:** thêm `0.0.0.0/0` (Vercel không có IP cố định).
3. Lấy connection string, nhớ thêm tên database vào đường dẫn: `...mongodb.net/dragon-lexicon?retryWrites=true&w=majority`.
4. Chạy `npx prisma db push`. MongoDB không dùng migration, lệnh này tạo index `@@unique` và `@@index` theo schema.

## Deploy lên Vercel

1. Đẩy code lên GitHub, vào Vercel → **Add New Project** → chọn repo.
2. **Environment Variables:** thêm đủ 6 biến trong `.env.example`. Đặt `APP_BASE_URL` = URL production, ví dụ `https://dragon-lexicon.vercel.app`.
3. Deploy. Script `build` đã chạy `prisma generate` trước `next build`.
4. Thêm URL Vercel vào ba mục URL của Auth0 như ở bước 1.

## Điểm và bảng xếp hạng

```
điểm = sát thương gây ra
     + 1000 nếu thắng (+ tối đa 300 nếu thắng nhanh: 300 − 10 × số câu)
     + độ chính xác (%) × 5
     + chuỗi đúng dài nhất × 25
```

- Mỗi người chơi có **một dòng kỷ lục cho mỗi màn** (collection `BestScore`). Chỉ cập nhật khi điểm mới cao hơn, đồng thời đếm số lượt chơi.
- Có bảng xếp hạng cho 16 màn chủ đề và 2 kho C1, C2. Màn Ôn tập là màn cá nhân nên không xếp hạng.
- Server **tự tính lại điểm** từ số liệu trận đấu và giới hạn từng chỉ số theo máu rồng của màn. Ví dụ không thể "thắng" nếu sát thương chưa đủ máu rồng.
- Game chạy hoàn toàn ở trình duyệt, nên người cố tình gian lận vẫn có thể giả số liệu trong giới hạn hợp lệ. Muốn chặt hơn thì phải chuyển phần chấm câu hỏi lên server (server ra đề, giữ đáp án, tính giờ).

## Nguồn tài nguyên

- **Từ vựng:** danh sách từ và nhãn C1/C2 lấy từ file người dùng cung cấp. Định nghĩa, nghĩa tiếng Việt, IPA và câu ví dụ là nội dung viết mới.
- **Sprite hiệp sĩ, ảnh rồng, ảnh nền:** do người dùng cung cấp. Kiểm tra giấy phép từng nguồn trước khi phát hành công khai.
