import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

// GET: validate the token and redirect to a confirmation page.
// We do NOT create the user here so email security scanners can't auto-verify.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(new URL('/login?error=invalid-token', request.url));
  }

  const pending = await prisma.pendingSignup.findUnique({ where: { token } });

  if (!pending || pending.expiresAt < new Date()) {
    return NextResponse.redirect(new URL('/login?error=invalid-token', request.url));
  }

  return NextResponse.redirect(new URL(`/verify-email/confirm?token=${token}`, request.url));
}

// POST: actually create the account (called by the confirm page button).
export async function POST(request: NextRequest) {
  const { token } = await request.json();

  if (!token) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  const pending = await prisma.pendingSignup.findUnique({ where: { token } });

  if (!pending || pending.expiresAt < new Date()) {
    return NextResponse.json({ error: 'invalid-token' }, { status: 400 });
  }

  // If user already exists (e.g. double-submit), just log them in
  const existing = await prisma.user.findUnique({ where: { computingId: pending.computingId } });
  if (existing) {
    await prisma.pendingSignup.deleteMany({ where: { email: pending.email } });
    if (!existing.password && pending.hashedPassword) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { password: pending.hashedPassword },
      });
    }
    const cookieStore = await cookies();
    cookieStore.set('computingId', existing.computingId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
    return NextResponse.json({ success: true });
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
  await prisma.pendingSignup.deleteMany({ where: { email: pending.email } });

  const cookieStore = await cookies();
  cookieStore.set('computingId', user.computingId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });

  return NextResponse.json({ success: true, newUser: true });
}
