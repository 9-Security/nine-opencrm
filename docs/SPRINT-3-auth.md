# Sprint 3 — IMAPS/POP3S 登入與 2FA

- **日期**：2026-09-12
- **目標**：在既有 Auth.js Credentials 上增加信箱伺服器認證，並啟用 TOTP 兩步驟驗證

## 完成項目

1. 第一因素：本機 bcrypt **或** IMAPS (993) / POP3S (995) TLS 登入（租戶設定或 `MAIL_AUTH_*` 環境變數）
2. 信箱密碼只用來連線驗證，不落地儲存
3. TOTP 2FA（Authenticator App）+ 一次性備用碼；租戶可強制要求
4. 登入兩段式：`/api/auth/first-factor` → 可選 `/api/auth/2fa/verify` → Auth.js session
5. `/account/security` 綁定／關閉 2FA；設定頁可填 IMAPS/POP3S 主機

## 明確不做

OAuth/SSO、Magic link、明文 IMAP/POP3（110/143）、把信箱密碼存進 CRM。
