// app/api/auth/me/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getUserAndPerms } from '@/lib/serverAuth';

export async function GET(req: NextRequest) {
  const { user, role, permissions } = await getUserAndPerms(req);
  return NextResponse.json({ user, role, permissions });
}
