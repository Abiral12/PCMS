'use client';

import AdminLogin from '@/components/AdminLogin';
import Link from 'next/link';

export default function AdminLoginPage() {
  return (
    <div className="admin-container">
      {/* Background elements */}
      <div className="background-shapes">
        <div className="shape shape-1"></div>
        <div className="shape shape-2"></div>
        <div className="shape shape-3"></div>
        <div className="shape shape-4"></div>
      </div>

      {/* Main card */}
      <div className="admin-card">
        {/* Header with icon */}
        <div className="admin-header">
          <div className="admin-icon">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 12C14.7614 12 17 9.76142 17 7C17 4.23858 14.7614 2 12 2C9.23858 2 7 4.23858 7 7C7 9.76142 9.23858 12 12 12Z" stroke="currentColor" strokeWidth="2"/>
              <path d="M20.5899 22C20.5899 18.13 16.7399 15 11.9999 15C7.25991 15 3.40991 18.13 3.40991 22" stroke="currentColor" strokeWidth="2"/>
            </svg>
          </div>
          <h1 className="admin-title">Admin Portal</h1>
          <p className="admin-subtitle">Secure access to your dashboard</p>
        </div>

        {/* Login form */}
        <AdminLogin />
        <div className="admin-link" style={{color:'white'}}>
          <Link href="/">Employee Login</Link>
        </div>

        {/* Footer */}
        <div className="admin-footer">
          <p>Need help? Contact support</p>
        </div>
      </div>

      <style jsx>{`
        .admin-container {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
          background-size: 400% 400%;
          animation: gradientShift 8s ease infinite;
          font-family: 'Inter', 'Segoe UI', sans-serif;
          position: relative;
          overflow: hidden;
        }

        .background-shapes {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
        }

        .shape {
          position: absolute;
          border-radius: 50%;
          background: linear-gradient(45deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05));
          backdrop-filter: blur(5px);
          animation: float 6s ease-in-out infinite;
        }

        .shape-1 {
          width: 80px;
          height: 80px;
          top: 20%;
          left: 10%;
          animation-delay: 0s;
        }

        .shape-2 {
          width: 120px;
          height: 120px;
          top: 60%;
          right: 15%;
          animation-delay: 2s;
        }

        .shape-3 {
          width: 60px;
          height: 60px;
          bottom: 20%;
          left: 20%;
          animation-delay: 4s;
        }

        .shape-4 {
          width: 100px;
          height: 100px;
          top: 30%;
          right: 25%;
          animation-delay: 1s;
        }

        .admin-card {
          background: rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 50px 40px;
          border-radius: 24px;
          box-shadow: 
            0 25px 50px rgba(0, 0, 0, 0.25),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
          width: 100%;
          max-width: 420px;
          text-align: center;
          animation: cardEntrance 0.8s cubic-bezier(0.23, 1, 0.32, 1);
          position: relative;
          z-index: 2;
        }

        .admin-header {
          margin-bottom: 35px;
        }

        .admin-icon {
          width: 70px;
          height: 70px;
          margin: 0 auto 20px;
          background: linear-gradient(135deg, rgba(255,255,255,0.15), rgba(255,255,255,0.05));
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.9);
          backdrop-filter: blur(10px);
        }

        .admin-icon svg {
          width: 32px;
          height: 32px;
        }

        .admin-title {
          margin-bottom: 8px;
          font-size: 32px;
          font-weight: 700;
          color: #fff;
          letter-spacing: 0.5px;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }

        .admin-subtitle {
          font-size: 15px;
          color: rgba(255, 255, 255, 0.7);
          font-weight: 400;
          margin: 0;
        }

        /* Form styling */
        .admin-card :global(form) {
          margin-top: 25px;
        }

        .admin-card :global(label) {
          display: block;
          margin-bottom: 8px;
          font-size: 14px;
          font-weight: 500;
          color: rgba(35, 33, 33, 0.9);
          text-align: left;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .admin-card :global(input) {
          width: 100%;
          padding: 16px 20px;
          border: none;
          border-radius: 12px;
          font-size: 16px;
          background: rgba(23, 22, 22, 0.08);
          color: #1f1e1eff;
          outline: none;
          margin-bottom: 20px;
          transition: all 0.3s ease;
          border: 1px solid rgba(0, 0, 0, 0.1);
          backdrop-filter: blur(10px);
        }

        .admin-card :global(input)::placeholder {
          color: rgba(0, 0, 0, 0.5);
        }

        .admin-card :global(input):focus {
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(0, 0, 0, 0.3);
          box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.1);
          transform: translateY(-1px);
        }

        .admin-card :global(input):hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .admin-card :global(button) {
          width: 100%;
          padding: 18px;
          border: none;
          border-radius: 12px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          margin-top: 10px;
          position: relative;
          overflow: hidden;
        }

        .admin-card :global(button):hover {
          transform: translateY(-2px);
          box-shadow: 
            0 12px 25px rgba(102, 126, 234, 0.3),
            0 0 0 1px rgba(255, 255, 255, 0.1);
        }

        .admin-card :global(button)::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
          transition: left 0.5s ease;
        }

        .admin-card :global(button):hover::before {
          left: 100%;
        }

        .admin-footer {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .admin-footer p {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.6);
          margin: 0;
        }

        .admin-footer a {
          color: rgba(255, 255, 255, 0.8);
          text-decoration: none;
          transition: color 0.3s ease;
        }

        .admin-footer a:hover {
          color: #fff;
        }

        /* Animations */
        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        @keyframes cardEntrance {
          0% {
            opacity: 0;
            transform: translateY(30px) scale(0.95);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes float {
          0%, 100% {
            transform: translateY(0) rotate(0deg);
          }
          33% {
            transform: translateY(-20px) rotate(5deg);
          }
          66% {
            transform: translateY(10px) rotate(-5deg);
          }
        }

        /* Responsive design */
        @media (max-width: 480px) {
          .admin-card {
            padding: 35px 25px;
            margin: 20px;
            border-radius: 20px;
          }

          .admin-title {
            font-size: 28px;
          }

          .admin-icon {
            width: 60px;
            height: 60px;
          }

          .admin-icon svg {
            width: 28px;
            height: 28px;
          }
        }

        /* Loading state animation */
        .admin-card :global(button:disabled) {
          opacity: 0.8;
          cursor: not-allowed;
        }

        .admin-card :global(button:disabled)::after {
          content: '';
          width: 16px;
          height: 16px;
          border: 2px solid transparent;
          border-top: 2px solid #fff;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          display: inline-block;
          margin-left: 10px;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}