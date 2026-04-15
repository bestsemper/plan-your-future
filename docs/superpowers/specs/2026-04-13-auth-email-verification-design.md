# Auth: UVA Email + Verification + Password Reset + Tutorial Fix

**Date:** 2026-04-13  
**Status:** Approved

---

## Overview

1. Replace Computing ID input with UVA email (`@virginia.edu`); derive computing ID from email prefix.
2. Add pre-account-creation email verification via Resend.
3. Add forgot password / password reset via Resend.
4. Fix tutorial to only auto-open for genuinely new accounts, not returning logins.

Existing mock user data will be cleared (`prisma migrate reset`). Guest access (courses, forum browsing, prereq tree) remains unchanged — all existing auth guards on forum interaction, plan creation, and profile page are already correct and untouched.

---

## Database

### New model: `PendingSignup`

Stores signup intent before the user is verified. Deleted once the user clicks the verification link and a `User` row is created.

```prisma
model PendingSignup {
  id             String   @id @default(cuid())
  email          String   @unique
  computingId    String
  hashedPassword String
  displayName    String
  token          String   @unique
  expiresAt      DateTime
  createdAt      DateTime @default(now())
}
```

### New model: `PasswordResetToken`

```prisma
model PasswordResetToken {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

Add the inverse relation to `User`:

```prisma
passwordResetTokens PasswordResetToken[]
```

No other changes to `User`. Every `User` row is, by definition, verified — verification happens before `User` creation.

### Migration

Run `prisma migrate reset` to drop existing data and apply the new schema.

---

## Sign-up Flow

1. User fills in: Display Name, UVA Email, Password, Confirm Password.
2. Client validates `@virginia.edu` format before submit (regex: `/^[a-z0-9]+@virginia\.edu$/i`).
3. Server action `initiateSignup(email, password, displayName)`:
   - Rejects emails not ending in `@virginia.edu`.
   - Extracts `computingId` from email prefix (e.g. `abc1de@virginia.edu` → `abc1de`).
   - Returns error if a `User` already exists with that `computingId`.
   - Returns error if a non-expired `PendingSignup` already exists for that email.
   - Hashes the password (existing `hashPassword` utility).
   - Generates a cryptographically random token (`randomBytes(32).toString('hex')`).
   - Creates `PendingSignup` row with 1-hour expiry.
   - Sends verification email via Resend.
   - Returns `{ success: true }`.
4. Login page redirects to `/verify-email` on success.
5. `/verify-email` page: static "Check your UVA email for a verification link" message.

---

## Email Verification Route

`GET /api/verify-email?token=xxx`

1. Look up `PendingSignup` by token.
2. If not found or expired: redirect to `/login?error=invalid-token`.
3. Create `User` + `GoalProfile` (same fields as current `mockSignUp`).
4. Delete the `PendingSignup` row.
5. Set `computingId` session cookie (same as current auth).
6. Redirect to `/?newUser=1`.

---

## Login Flow

Server action renamed: `mockLogin` → `login(email, password)`.

1. Validate email format (`@virginia.edu`).
2. Extract `computingId` from email prefix.
3. Look up `User` by `computingId`.
4. Verify password with existing `verifyPassword` utility.
5. Set session cookie.
6. Return `{ success: true }`.

Login page redirects to `/` (no `?newUser=1`) on success. "Forgot password?" link shown below the password field on the login form.

---

## Forgot Password Flow

### Step 1 — Request reset

`/forgot-password` page: single UVA email input + submit button. "Back to login" link.

Server action `initiatePasswordReset(email)`:
- Validates `@virginia.edu` format.
- Extracts `computingId`.
- Looks up `User`. If not found, still returns `{ success: true }` (don't leak existence).
- If found: deletes any existing `PasswordResetToken` for that user, generates new token, sets 1-hour expiry, saves to DB, sends reset email via Resend.
- Returns `{ success: true }`.

Page redirects to `/forgot-password/sent` on success.

`/forgot-password/sent` page: static "If that email is registered, a reset link is on its way."

### Step 2 — Reset password

`/reset-password?token=xxx` page: New Password + Confirm Password fields. Token read from URL search params.

Server action `resetPassword(token, newPassword)`:
- Looks up `PasswordResetToken` by token.
- If not found or expired: returns `{ error: 'This link has expired or is invalid.' }`.
- Validates new password length (min 8 chars).
- Hashes new password, updates `User.password`.
- Deletes the `PasswordResetToken`.
- Returns `{ success: true }`.

On success: page redirects to `/login?reset=success`. Login page shows a success banner when `reset=success` is in the URL.

---

## Email (Resend)

New file: `lib/resend.ts` — instantiates Resend client using `RESEND_API_KEY` env var.

**Verification email:**
- From: `noreply@mlatuva.org`
- Subject: `Verify your Hoos Plan account`
- Body: HTML with link to `https://mlatuva.org/api/verify-email?token={token}`

**Password reset email:**
- From: `noreply@mlatuva.org`
- Subject: `Reset your Hoos Plan password`
- Body: HTML with link to `https://mlatuva.org/reset-password?token={token}`

Required env var: `RESEND_API_KEY` (add to `.env.local` and Vercel project settings).

---

## Tutorial Fix

Changes in `TutorialProvider.tsx`:

- **Remove** the `useEffect` that auto-opens the tutorial when `!hasSeen && pathname === "/"`. This caused the tutorial to fire for returning users on a new device (empty localStorage).
- **Add** a `useEffect` that reads the `newUser` search param on mount. If `newUser=1` is present and the user is authenticated, auto-open the tutorial and call `router.replace('/')` to strip the param from the URL.
- Help button behavior unchanged — always allows manual tutorial launch.

---

## Files Changed / Created

| File | Action |
|------|--------|
| `prisma/schema.prisma` | Add `PendingSignup`, `PasswordResetToken` models; add `passwordResetTokens` relation to `User` |
| `app/actions.ts` | `mockLogin` → `login`; `mockSignUp` → `initiateSignup`; add `initiatePasswordReset`, `resetPassword` |
| `app/login/page.tsx` | Email field + `@virginia.edu` validation; forgot password link; `reset=success` banner; remove mock disclaimer |
| `app/verify-email/page.tsx` | New — static "check your email" page |
| `app/api/verify-email/route.ts` | New — token lookup, user creation, cookie, redirect |
| `app/forgot-password/page.tsx` | New — email input form |
| `app/forgot-password/sent/page.tsx` | New — static confirmation page |
| `app/reset-password/page.tsx` | New — new password form (reads token from URL) |
| `lib/resend.ts` | New — Resend client singleton |
| `app/components/TutorialProvider.tsx` | Replace `!hasSeen` auto-trigger with `?newUser=1` URL param check |

---

## Out of Scope

- Resend verification email link on the `/verify-email` page.
- OAuth / SSO with UVA NetBadge.
