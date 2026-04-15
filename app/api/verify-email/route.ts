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

  // Double-click protection: if user already exists, ensure password is set then log them in
  const existing = await prisma.user.findUnique({ where: { computingId: pending.computingId } });
  if (existing) {
    await prisma.pendingSignup.delete({ where: { token } });
    // If the account existed without a password (e.g. seeded/test account), set it now
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
