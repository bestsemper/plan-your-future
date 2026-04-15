# Auth: UVA Email + Verification + Password Reset + Tutorial Fix

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace mock Computing ID auth with real UVA email signup, Resend-powered email verification (pre-account creation), forgot password flow, and fix the tutorial to only auto-open for new accounts.

**Architecture:** Signup stores a `PendingSignup` row (with a token); a verification link in email hits `GET /api/verify-email?token=` which creates the real `User`. Password reset follows the same token pattern via `PasswordResetToken`. The tutorial auto-open is moved from a localStorage heuristic to an explicit `?newUser=1` URL param set only at the end of the email verification route.

**Tech Stack:** Next.js 16 (App Router), Prisma 6 (PostgreSQL), Resend SDK, Node.js `crypto` (already used for password hashing), Tailwind CSS.

---

## File Map

| File | Role |
|------|------|
| `prisma/schema.prisma` | Add `PendingSignup` + `PasswordResetToken` models |
| `app/actions.ts` | Replace `mockSignUp`/`mockLogin` with `initiateSignup`/`login`; add `initiatePasswordReset`, `resetPassword` |
| `lib/resend.ts` | Resend client singleton |
| `app/login/page.tsx` | Email field, `@virginia.edu` validation, forgot password link, `?reset=success` banner |
| `app/verify-email/page.tsx` | Static "check your email" page after signup |
| `app/api/verify-email/route.ts` | Token verification, `User` creation, cookie, redirect to `/?newUser=1` |
| `app/forgot-password/page.tsx` | Email input form to request a reset |
| `app/forgot-password/sent/page.tsx` | Static confirmation after requesting reset |
| `app/reset-password/page.tsx` | New password form; reads token from URL search params |
| `app/components/TutorialProvider.tsx` | Replace `!hasSeen` auto-trigger with `?newUser=1` param check |

---

## Task 1: Install Resend + update Prisma schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Install resend**

```bash
cd "/Users/johnkim/Documents/UVA/ENGR 1020/hoos-plan"
npm install resend
```

Expected: `resend` appears in `package.json` dependencies.

- [ ] **Step 2: Add `PendingSignup` and `PasswordResetToken` to schema**

Open `prisma/schema.prisma`. Add these two models at the end of the file, and add `passwordResetTokens PasswordResetToken[]` to the `User` model's relations block:

```prisma
// Add this line inside the User model, after the existing relations:
  passwordResetTokens PasswordResetToken[]

// Add these two models at the bottom of the file:

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

model PasswordResetToken {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 3: Reset the database and apply schema**

```bash
cd "/Users/johnkim/Documents/UVA/ENGR 1020/hoos-plan"
npx prisma migrate reset --force
```

Expected output includes: `Database reset successful` and `Generated Prisma Client`.

- [ ] **Step 4: Confirm Prisma client regenerated**

```bash
npx prisma generate
```

Expected: `Generated Prisma Client` with no errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma package.json package-lock.json
git commit -m "feat: add PendingSignup and PasswordResetToken models, install resend"
```

---

## Task 2: Create Resend client + email helpers

**Files:**
- Create: `lib/resend.ts`

- [ ] **Step 1: Add `RESEND_API_KEY` to `.env.local`**

Open `.env.local` (create if missing) and add:

```
RESEND_API_KEY=your_resend_api_key_here
```

Replace `your_resend_api_key_here` with the actual key from your Resend dashboard. Also add this variable to your Vercel project's environment variables (Settings → Environment Variables).

- [ ] **Step 2: Create `lib/resend.ts`**

```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = 'noreply@mlatuva.org';
const BASE_URL = 'https://mlatuva.org';

export async function sendVerificationEmail(email: string, token: string) {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Verify your Hoos Plan account',
    html: `
      <p>Thanks for signing up for Hoos Plan.</p>
      <p>Click the link below to verify your email and create your account. This link expires in 1 hour.</p>
      <p><a href="${BASE_URL}/api/verify-email?token=${token}">Verify my email</a></p>
      <p>If you did not sign up for Hoos Plan, you can ignore this email.</p>
    `,
  });
}

export async function sendPasswordResetEmail(email: string, token: string) {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Reset your Hoos Plan password',
    html: `
      <p>We received a request to reset the password for your Hoos Plan account.</p>
      <p>Click the link below to choose a new password. This link expires in 1 hour.</p>
      <p><a href="${BASE_URL}/reset-password?token=${token}">Reset my password</a></p>
      <p>If you did not request a password reset, you can ignore this email.</p>
    `,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/resend.ts .env.local
git commit -m "feat: add Resend email helpers for verification and password reset"
```

---

## Task 3: Add `initiateSignup` and `login` server actions

**Files:**
- Modify: `app/actions.ts`

- [ ] **Step 1: Replace `mockLogin` with `login`**

Find `export async function mockLogin(computingId: string, password: string)` (around line 340) and replace the entire function with:

```typescript
export async function login(email: string, password: string) {
  if (!email) return { error: 'Email is required' };
  if (!password) return { error: 'Password is required' };

  const emailLower = email.toLowerCase().trim();
  if (!emailLower.endsWith('@virginia.edu')) {
    return { error: 'Please use your UVA email (@virginia.edu)' };
  }

  const computingId = emailLower.split('@')[0];

  const user = await prisma.user.findUnique({ where: { computingId } });
  if (!user || !user.password) {
    return { error: 'Incorrect email or password.' };
  }

  if (!verifyPassword(password, user.password)) {
    return { error: 'Incorrect email or password.' };
  }

  const cookieStore = await cookies();
  cookieStore.set('computingId', user.computingId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });

  return { success: true };
}
```

- [ ] **Step 2: Replace `mockSignUp` with `initiateSignup`**

Find `export async function mockSignUp(computingId: string, password: string, displayName?: string)` (around line 368) and replace the entire function with:

```typescript
export async function initiateSignup(email: string, password: string, displayName: string) {
  if (!email) return { error: 'Email is required' };
  if (!password) return { error: 'Password is required' };
  if (!displayName) return { error: 'Display name is required' };

  const emailLower = email.toLowerCase().trim();
  if (!emailLower.endsWith('@virginia.edu')) {
    return { error: 'Please use your UVA email (@virginia.edu)' };
  }

  const computingId = emailLower.split('@')[0];

  const existingUser = await prisma.user.findUnique({ where: { computingId } });
  if (existingUser) {
    return { error: 'An account with this email already exists. Please log in.' };
  }

  const now = new Date();
  const existingPending = await prisma.pendingSignup.findUnique({ where: { email: emailLower } });
  if (existingPending && existingPending.expiresAt > now) {
    return { error: 'A verification email was already sent. Please check your inbox or wait 1 hour to try again.' };
  }

  // Overwrite expired pending signup if present
  if (existingPending) {
    await prisma.pendingSignup.delete({ where: { email: emailLower } });
  }

  const hashedPassword = hashPassword(password);
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour

  await prisma.pendingSignup.create({
    data: {
      email: emailLower,
      computingId,
      hashedPassword,
      displayName,
      token,
      expiresAt,
    },
  });

  const { sendVerificationEmail } = await import('../lib/resend');
  await sendVerificationEmail(emailLower, token);

  return { success: true };
}
```

- [ ] **Step 3: Add `initiatePasswordReset` and `resetPassword` actions**

Add these two functions after the `login` function in `app/actions.ts`:

```typescript
export async function initiatePasswordReset(email: string) {
  if (!email) return { error: 'Email is required' };

  const emailLower = email.toLowerCase().trim();
  if (!emailLower.endsWith('@virginia.edu')) {
    return { error: 'Please use your UVA email (@virginia.edu)' };
  }

  const computingId = emailLower.split('@')[0];
  const user = await prisma.user.findUnique({ where: { computingId } });

  // Always return success to avoid leaking account existence
  if (!user) return { success: true };

  // Delete any existing token for this user
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt },
  });

  const { sendPasswordResetEmail } = await import('../lib/resend');
  await sendPasswordResetEmail(emailLower, token);

  return { success: true };
}

export async function resetPassword(token: string, newPassword: string) {
  if (!token) return { error: 'Invalid reset link.' };
  if (!newPassword || newPassword.length < 8) {
    return { error: 'Password must be at least 8 characters.' };
  }

  const record = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!record || record.expiresAt < new Date()) {
    return { error: 'This link has expired or is invalid. Please request a new one.' };
  }

  const hashedPassword = hashPassword(newPassword);
  await prisma.user.update({
    where: { id: record.userId },
    data: { password: hashedPassword },
  });

  await prisma.passwordResetToken.delete({ where: { token } });

  return { success: true };
}
```

- [ ] **Step 4: Commit**

```bash
git add app/actions.ts
git commit -m "feat: replace mockLogin/mockSignUp with login/initiateSignup, add password reset actions"
```

---

## Task 4: Update login page

**Files:**
- Modify: `app/login/page.tsx`

- [ ] **Step 1: Rewrite `app/login/page.tsx`**

`useSearchParams` requires a Suspense boundary in Next.js 15+. The existing login page also stashes/restores the active theme (forcing light mode on the login page), which must be preserved. Structure the file as a `LoginForm` component (uses `useSearchParams` and theme logic) wrapped in `Suspense` at the default export.

Replace the entire file with:

```typescript
"use client";

import { useState, useEffect, Suspense } from 'react';
import { login, initiateSignup } from '../actions';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Icon } from '../components/Icon';

const UVA_EMAIL_REGEX = /^[a-z0-9]+@virginia\.edu$/i;

function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const router = useRouter();
  const { setTheme } = useTheme();
  const searchParams = useSearchParams();
  const resetSuccess = searchParams.get('reset') === 'success';
  const tokenError = searchParams.get('error') === 'invalid-token';

  useEffect(() => {
    const currentTheme = window.localStorage.getItem('theme');
    const stashed = window.localStorage.getItem('stashed-theme');
    if (currentTheme && currentTheme !== 'light' && !stashed) {
      window.localStorage.setItem('stashed-theme', currentTheme);
    }
    setTheme('light');
  }, [setTheme]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    if (!UVA_EMAIL_REGEX.test(email.trim())) {
      setError('Please enter a valid UVA email (e.g. abc1de@virginia.edu)');
      return;
    }

    if (isSignUp) {
      const displayName = formData.get('displayName') as string;
      const confirmPassword = formData.get('confirmPassword') as string;
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      const res = await initiateSignup(email, password, displayName);
      if (res?.error) {
        setError(res.error);
      } else {
        router.push('/verify-email');
      }
    } else {
      const res = await login(email, password);
      if (res?.error) {
        setError(res.error);
      } else {
        const stashedTheme = window.localStorage.getItem('stashed-theme');
        if (stashedTheme) {
          setTheme(stashedTheme);
          window.localStorage.removeItem('stashed-theme');
        }
        router.push('/');
      }
    }
  }

  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      <div className="max-w-lg mx-auto bg-panel-bg border border-panel-border shadow-sm p-8 rounded-3xl">
        <div className="flex flex-col mb-7 border-b border-panel-border pb-6">
          <div className="flex justify-between items-center mb-2">
            <h1 className="text-3xl font-bold text-heading">{isSignUp ? 'Create Account' : 'Sign In'}</h1>
            <span className="bg-badge-orange-bg text-uva-orange border border-uva-orange/60 px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
              <Icon name="lock" color="currentColor" width={12} height={12} />
              NetBadge
            </span>
          </div>
          <p className="text-text-secondary text-sm font-medium">
            {isSignUp
              ? 'Join Hoos Plan to build and track your 4-year academic journey.'
              : 'Log in to keep your 4-year academic journey on track.'}
          </p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          {resetSuccess && (
            <div className="bg-green-500/10 border border-green-500/50 text-green-600 px-4 py-3 rounded-xl text-sm font-semibold flex items-center gap-2">
              <Icon name="check-circle" color="currentColor" width={16} height={16} />
              <span>Password reset successfully. Please log in.</span>
            </div>
          )}
          {tokenError && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-3 rounded-xl text-sm font-semibold flex items-center gap-2">
              <Icon name="alert-circle" color="currentColor" width={16} height={16} />
              <span>That verification link is invalid or has expired. Please sign up again.</span>
            </div>
          )}
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-3 rounded-xl text-sm font-semibold flex items-center gap-2" role="alert">
              <Icon name="alert-circle" color="currentColor" width={16} height={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            {isSignUp && (
              <div>
                <label className="block text-sm font-bold text-heading mb-1.5 uppercase tracking-wide text-text-secondary w-fit text-[11px]">Display Name</label>
                <input
                  type="text"
                  name="displayName"
                  className="w-full p-3 border border-panel-border rounded-full bg-input-bg text-text-primary outline-none transition-colors focus:border-uva-blue"
                  required
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-bold text-heading mb-1.5 uppercase tracking-wide text-text-secondary w-fit text-[11px]">UVA Email</label>
              <input
                type="email"
                name="email"
                placeholder="abc1de@virginia.edu"
                className="w-full p-3 border border-panel-border rounded-full bg-input-bg text-text-primary outline-none transition-colors focus:border-uva-blue"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-heading mb-1.5 uppercase tracking-wide text-text-secondary w-fit text-[11px]">Password</label>
              <input
                type="password"
                name="password"
                className="w-full p-3 border border-panel-border rounded-full bg-input-bg text-text-primary outline-none transition-colors focus:border-uva-blue"
                required
              />
            </div>
            {isSignUp && (
              <div>
                <label className="block text-sm font-bold text-heading mb-1.5 uppercase tracking-wide text-text-secondary w-fit text-[11px]">Confirm Password</label>
                <input
                  type="password"
                  name="confirmPassword"
                  className="w-full p-3 border border-panel-border rounded-full bg-input-bg text-text-primary outline-none transition-colors focus:border-uva-blue"
                  required
                />
              </div>
            )}
          </div>

          {!isSignUp && (
            <div className="text-right -mt-2">
              <a href="/forgot-password" className="text-xs text-uva-blue hover:underline font-medium">
                Forgot password?
              </a>
            </div>
          )}

          <div className="flex flex-col gap-4 mt-8">
            <button
              type="submit"
              className="w-full bg-uva-blue text-white px-5 py-3 rounded-full hover:bg-uva-blue-dark font-bold transition-colors cursor-pointer flex justify-center items-center gap-2"
            >
              {isSignUp ? 'Create Account' : 'Log In'}
              {!isSignUp && <Icon name="arrow-right" color="currentColor" width={16} height={16} />}
            </button>

            <div className="relative flex items-center justify-center py-2">
              <div className="border-t border-panel-border w-full absolute"></div>
              <span className="bg-panel-bg px-3 text-text-secondary text-xs font-semibold relative uppercase tracking-wider">or</span>
            </div>

            <button
              type="button"
              onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
              className="w-full bg-panel-bg-alt border border-panel-border text-text-primary px-5 py-3 rounded-full hover:bg-hover-bg font-bold transition-colors cursor-pointer"
            >
              {isSignUp ? 'Already have an account? Log In' : "Don't have an account? Sign Up"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="max-w-5xl mx-auto py-10 px-4 text-center text-text-secondary">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/login/page.tsx
git commit -m "feat: update login page for UVA email, signup flow, forgot password link"
```

---

## Task 5: Add verify-email page and API route

**Files:**
- Create: `app/verify-email/page.tsx`
- Create: `app/api/verify-email/route.ts`

- [ ] **Step 1: Create `app/verify-email/page.tsx`**

```typescript
export default function VerifyEmailPage() {
  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      <div className="max-w-lg mx-auto bg-panel-bg border border-panel-border shadow-sm p-8 rounded-3xl text-center">
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-full bg-uva-blue/10 flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-uva-blue">
              <rect x="2" y="4" width="20" height="16" rx="2"/>
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
            </svg>
          </div>
        </div>
        <h1 className="text-2xl font-bold text-heading mb-3">Check your UVA email</h1>
        <p className="text-text-secondary text-sm font-medium">
          We sent a verification link to your <span className="font-semibold text-text-primary">@virginia.edu</span> address.
          Click the link in that email to create your account.
        </p>
        <p className="text-text-secondary text-xs mt-4">
          The link expires in 1 hour. If you don&apos;t see the email, check your spam folder.
        </p>
        <a href="/login" className="inline-block mt-6 text-sm text-uva-blue hover:underline font-medium">
          Back to login
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `app/api/verify-email/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(new URL('/login?error=invalid-token', request.url));
  }

  const pending = await prisma.pendingSignup.findUnique({ where: { token } });

  if (!pending || pending.expiresAt < new Date()) {
    return NextResponse.redirect(new URL('/login?error=invalid-token', request.url));
  }

  // Check if user was already created (double-click protection)
  const existing = await prisma.user.findUnique({ where: { computingId: pending.computingId } });
  if (existing) {
    await prisma.pendingSignup.delete({ where: { token } });
    const cookieStore = await cookies();
    cookieStore.set('computingId', existing.computingId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
    return NextResponse.redirect(new URL('/', request.url));
  }

  const user = await prisma.user.create({
    data: {
      computingId: pending.computingId,
      displayName: pending.displayName,
      password: pending.hashedPassword,
      major: 'Undeclared',
    },
  });

  await prisma.goalProfile.create({ data: { userId: user.id } });
  await prisma.pendingSignup.delete({ where: { token } });

  const cookieStore = await cookies();
  cookieStore.set('computingId', user.computingId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });

  return NextResponse.redirect(new URL('/?newUser=1', request.url));
}
```

- [ ] **Step 3: Commit**

```bash
git add app/verify-email/page.tsx app/api/verify-email/route.ts
git commit -m "feat: add verify-email page and API route for account creation"
```

---

## Task 6: Add forgot password pages

**Files:**
- Create: `app/forgot-password/page.tsx`
- Create: `app/forgot-password/sent/page.tsx`
- Create: `app/reset-password/page.tsx`

- [ ] **Step 1: Create `app/forgot-password/page.tsx`**

```typescript
"use client";

import { useState } from 'react';
import { initiatePasswordReset } from '../../actions';
import { useRouter } from 'next/navigation';
import { Icon } from '../../components/Icon';

const UVA_EMAIL_REGEX = /^[a-z0-9]+@virginia\.edu$/i;

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;

    if (!UVA_EMAIL_REGEX.test(email.trim())) {
      setError('Please enter a valid UVA email (e.g. abc1de@virginia.edu)');
      return;
    }

    setLoading(true);
    const res = await initiatePasswordReset(email);
    setLoading(false);

    if (res?.error) {
      setError(res.error);
    } else {
      router.push('/forgot-password/sent');
    }
  }

  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      <div className="max-w-lg mx-auto bg-panel-bg border border-panel-border shadow-sm p-8 rounded-3xl">
        <div className="mb-7 border-b border-panel-border pb-6">
          <h1 className="text-3xl font-bold text-heading mb-2">Reset password</h1>
          <p className="text-text-secondary text-sm font-medium">
            Enter your UVA email and we&apos;ll send you a reset link.
          </p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-3 rounded-xl text-sm font-semibold flex items-center gap-2" role="alert">
              <Icon name="alert-circle" color="currentColor" width={16} height={16} />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-bold text-heading mb-1.5 uppercase tracking-wide text-text-secondary w-fit text-[11px]">UVA Email</label>
            <input
              type="email"
              name="email"
              placeholder="abc1de@virginia.edu"
              className="w-full p-3 border border-panel-border rounded-full bg-input-bg text-text-primary outline-none transition-colors focus:border-uva-blue"
              required
            />
          </div>

          <div className="flex flex-col gap-4">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-uva-blue text-white px-5 py-3 rounded-full hover:bg-uva-blue-dark font-bold transition-colors cursor-pointer disabled:opacity-60"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
            <a
              href="/login"
              className="text-center text-sm text-text-secondary hover:text-text-primary font-medium transition-colors"
            >
              Back to login
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `app/forgot-password/sent/page.tsx`**

```typescript
export default function ForgotPasswordSentPage() {
  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      <div className="max-w-lg mx-auto bg-panel-bg border border-panel-border shadow-sm p-8 rounded-3xl text-center">
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-full bg-uva-blue/10 flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-uva-blue">
              <rect x="2" y="4" width="20" height="16" rx="2"/>
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
            </svg>
          </div>
        </div>
        <h1 className="text-2xl font-bold text-heading mb-3">Check your email</h1>
        <p className="text-text-secondary text-sm font-medium">
          If that email is registered, a password reset link is on its way.
          Check your <span className="font-semibold text-text-primary">@virginia.edu</span> inbox.
        </p>
        <p className="text-text-secondary text-xs mt-4">
          The link expires in 1 hour. If you don&apos;t see the email, check your spam folder.
        </p>
        <a href="/login" className="inline-block mt-6 text-sm text-uva-blue hover:underline font-medium">
          Back to login
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `app/reset-password/page.tsx`**

```typescript
"use client";

import { useState, Suspense } from 'react';
import { resetPassword } from '../../actions';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '../../components/Icon';

function ResetPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    const res = await resetPassword(token, password);
    setLoading(false);

    if (res?.error) {
      setError(res.error);
    } else {
      router.push('/login?reset=success');
    }
  }

  if (!token) {
    return (
      <div className="max-w-lg mx-auto bg-panel-bg border border-panel-border shadow-sm p-8 rounded-3xl text-center">
        <p className="text-red-500 font-semibold">Invalid reset link.</p>
        <a href="/forgot-password" className="inline-block mt-4 text-sm text-uva-blue hover:underline font-medium">
          Request a new one
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto bg-panel-bg border border-panel-border shadow-sm p-8 rounded-3xl">
      <div className="mb-7 border-b border-panel-border pb-6">
        <h1 className="text-3xl font-bold text-heading mb-2">Choose a new password</h1>
        <p className="text-text-secondary text-sm font-medium">Must be at least 8 characters.</p>
      </div>

      <form className="space-y-6" onSubmit={handleSubmit}>
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-3 rounded-xl text-sm font-semibold flex items-center gap-2" role="alert">
            <Icon name="alert-circle" color="currentColor" width={16} height={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-heading mb-1.5 uppercase tracking-wide text-text-secondary w-fit text-[11px]">New Password</label>
            <input
              type="password"
              name="password"
              minLength={8}
              className="w-full p-3 border border-panel-border rounded-full bg-input-bg text-text-primary outline-none transition-colors focus:border-uva-blue"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-heading mb-1.5 uppercase tracking-wide text-text-secondary w-fit text-[11px]">Confirm Password</label>
            <input
              type="password"
              name="confirmPassword"
              minLength={8}
              className="w-full p-3 border border-panel-border rounded-full bg-input-bg text-text-primary outline-none transition-colors focus:border-uva-blue"
              required
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-uva-blue text-white px-5 py-3 rounded-full hover:bg-uva-blue-dark font-bold transition-colors cursor-pointer disabled:opacity-60"
        >
          {loading ? 'Saving…' : 'Set new password'}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      <Suspense fallback={<div className="max-w-lg mx-auto p-8 text-center text-text-secondary">Loading…</div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add app/forgot-password/page.tsx app/forgot-password/sent/page.tsx app/reset-password/page.tsx
git commit -m "feat: add forgot password and reset password pages"
```

---

## Task 7: Fix TutorialProvider — only open on new account

**Files:**
- Modify: `app/components/TutorialProvider.tsx`

- [ ] **Step 1: Find and replace the auto-open `useEffect`**

Find this block in `TutorialProvider.tsx` (around line 566–577):

```typescript
useEffect(() => {
  if (!isAuthenticated) {
    return;
  }

  const hasSeen = loadStorageFlag(STORAGE_SEEN_KEY);
  if (!hasSeen && pathname === "/" && window.innerWidth >= 1024) {
    setCurrentStepId(orderedFlowStepIds[0]);
    setIsOpen(true);
    window.localStorage.setItem(STORAGE_SEEN_KEY, "1");
  }
}, [isAuthenticated, pathname]);
```

Replace it with:

```typescript
useEffect(() => {
  if (!isAuthenticated) return;

  const params = new URLSearchParams(window.location.search);
  if (params.get('newUser') === '1' && window.innerWidth >= 1024) {
    setCurrentStepId(orderedFlowStepIds[0]);
    setIsOpen(true);
    window.localStorage.setItem(STORAGE_SEEN_KEY, "1");
    // Strip ?newUser=1 from the URL without a navigation
    const url = new URL(window.location.href);
    url.searchParams.delete('newUser');
    window.history.replaceState({}, '', url.toString());
  }
}, [isAuthenticated]);
```

- [ ] **Step 2: Verify the help button still works**

Search for `canStartTutorial` and `startTutorial` in `TutorialProvider.tsx`. Confirm these are still wired up to the context value (they should be untouched — only the auto-open `useEffect` changed).

- [ ] **Step 3: Commit**

```bash
git add app/components/TutorialProvider.tsx
git commit -m "fix: only auto-open tutorial on new account signup via ?newUser=1 param"
```

---

## Task 8: Verify the full flow end-to-end

- [ ] **Step 1: Start dev server**

```bash
cd "/Users/johnkim/Documents/UVA/ENGR 1020/hoos-plan"
npm run dev
```

- [ ] **Step 2: Test signup → verification → tutorial**

1. Go to `http://localhost:3000/login`
2. Click "Don't have an account? Sign Up"
3. Fill in Display Name, a `@virginia.edu` email, password (≥ 8 chars), confirm password
4. Submit → should redirect to `/verify-email`
5. Check the inbox for the `@virginia.edu` email → click the verification link
6. Should land on `/?newUser=1`, tutorial should auto-open (on desktop width ≥ 1024px)
7. URL should strip to `/` immediately

- [ ] **Step 3: Test login**

1. Go to `/login`, enter the same email + password
2. Should redirect to `/` with no tutorial popup

- [ ] **Step 4: Test forgot password**

1. Go to `/forgot-password`
2. Enter your `@virginia.edu` email, submit → should go to `/forgot-password/sent`
3. Check inbox for reset email → click link → should land on `/reset-password?token=...`
4. Enter new password (≥ 8 chars), confirm, submit → should redirect to `/login?reset=success`
5. Login page should show the green "Password reset successfully" banner
6. Log in with the new password → should work

- [ ] **Step 5: Test error cases**

- Non-`@virginia.edu` email on signup → inline error message
- Non-matching passwords on signup → inline error message
- Wrong password on login → "Incorrect email or password."
- Expired/invalid verification token → `/login?error=invalid-token` banner
- Expired/invalid reset token → inline error on reset page

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: verify auth flow complete"
```
