# Sprint 6 — 邀請信（Resend）

- **日期**：2026-09-12
- **目標**：邀請同事時真的寄信；連結用公開 `AUTH_URL`，不要把 token 打進 log

## 完成項目

1. `RESEND_API_KEY` + `RESEND_FROM` 寄出邀請／重新產生連結的信件
2. 邀請 URL 以 `AUTH_URL` 為 origin；寄信失敗仍回傳複製用連結
3. request log 會 scrub `invite_url` 與 `/invites/<token>` 字串
4. `npm run email:setup` 診斷 Resend（send-only key）與 Cloudflare zone；目前 token 若沒有 Zone.DNS Edit 就不會改 DNS
5. 2FA 重新綁定時，開始綁定不消耗備用碼
6. 公司詳情的「新增工單」依 `tickets:write` 顯示

## 營運注意

- Resend 網域 `nine-security.com` 需在 Resend 後台完成驗證（send-only key 無法用 API 建網域）
- Cloudflare token 目前可讀 zone，寫 DNS 需 Zone.DNS Edit
- 正式環境 `AUTH_URL` 必須是使用者打得開的公開 origin
