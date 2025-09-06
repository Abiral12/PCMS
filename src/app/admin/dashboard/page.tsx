// app/admin/dashboard/page.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import ClientDashboard from './ClientDashboard';

export const runtime = 'nodejs'; // ensure Node (safer for jwt/cookies)

export default async function Page() {
  // Some Next versions return a sync store; others return a Promise on Edge.
  // This form works in both. The ts-ignore avoids noisy types on older versions.
  // @ts-ignore
  const store = await cookies();
  const token = store?.get('admin_token')?.value;

  if (!token) {
    redirect('/admin'); // send to admin login
  }

  return <ClientDashboard />;
}
