// lib/auth-server.ts
import { cookies } from 'next/headers';

export async function readSessionToken() {
  const cookieStore = await cookies();   // <-- await is required
  return cookieStore.get('session')?.value ?? null;
}
