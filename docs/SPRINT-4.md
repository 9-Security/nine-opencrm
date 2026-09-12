# Sprint 4 — 聯絡人活動與登入限流補強

- **日期**：2026-09-12
- **目標**：補 IA 聯絡人詳情的活動時間線，並讓 Auth.js credentials 無法繞過 first-factor 的信箱探測限流

## 完成項目

1. 聯絡人詳情可新增／勾選跟進活動（沿用活動狀態機；跨租戶 contactId 拒絕）
2. `verifyFirstFactor` 對同一 email 連續失敗後停止探測 IMAPS/POP3S；正確密碼仍可登入

## 明確不做

真發信、計費、檔案上傳、自訂報表／CSV、OAuth/SSO。
