'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('employee', JSON.stringify(data.employee));
      localStorage.setItem('permissions', JSON.stringify(data.employee.permissions));

      router.push('/dashboard');
    } catch (err: any) {
      setError('Something went wrong');
      console.error(err);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="login-title">Employee Login</h1>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="text"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button type="submit" className="submit-btn">Login</button>
        </form>
        
        <div className="admin-link">
          <Link href="/admin">Admin Login</Link>
        </div>
      </div>

      <style jsx>{`
        .login-container {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          background: linear-gradient(135deg, #1a2a6c, #18283bc4, #b49758ff);
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-size: 300% 300%;
          animation: gradientShift 15s ease infinite;
        }

        .login-card {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          padding: 40px 35px;
          border-radius: 20px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          width: 100%;
          max-width: 380px;
          text-align: center;
          animation: fadeIn 0.6s ease-in-out;
        }

        .login-title {
          margin-bottom: 25px;
          font-size: 26px;
          font-weight: 600;
          color: #fff;
          letter-spacing: 1px;
        }

        .form-group {
          margin-bottom: 18px;
          text-align: left;
        }

        .form-group label {
          display: block;
          margin-bottom: 6px;
          font-size: 14px;
          font-weight: 500;
          color: #eee;
        }

        .form-group input {
          width: 100%;
          padding: 12px;
          border: none;
          border-radius: 10px;
          font-size: 15px;
          background: rgba(255, 255, 255, 0.15);
          color: #fff;
          outline: none;
          transition: all 0.3s ease;
        }

        .form-group input::placeholder {
          color: rgba(255, 255, 255, 0.6);
        }

        .form-group input:focus {
          background: rgba(255, 255, 255, 0.25);
          box-shadow: 0 0 8px rgba(255, 255, 255, 0.3);
        }

        .error-text {
          color: #ff6b6b;
          font-size: 14px;
          margin: 10px 0;
          text-align: center;
        }

        .submit-btn {
          width: 100%;
          padding: 14px;
          border: none;
          border-radius: 10px;
          background: linear-gradient(135deg, #6dd5ed, #215fb0ff);
          color: white;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .submit-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
        }

        .admin-link {
          margin-top: 18px;
        }

        .admin-link a {
          color: #f1f1f1;
          text-decoration: none;
          font-size: 14px;
          transition: all 0.2s ease;
        }

        .admin-link a:hover {
          text-decoration: underline;
          color: #fff;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(15px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
    </div>
  );
}
