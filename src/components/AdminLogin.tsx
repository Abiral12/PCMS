// components/AdminLogin.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLogin() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok || !data?.success) {
        setError(data?.error || 'Invalid credentials');
        return;
      }

      // Cookie is set by the API (HttpOnly)
      router.replace('/admin/dashboard');
    } catch (err: any) {
      setError(err?.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit}>
      <label htmlFor="username">Admin Login</label>
      <input id="username" value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" required />
      <input id="password" type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required />
      <button disabled={submitting} type="submit">{submitting ? 'Signing in…' : 'Login'}</button>
      {error && <div style={{marginTop:12,color:'#f87171',fontWeight:600}}>{error}</div>}
    </form>
  );
}
