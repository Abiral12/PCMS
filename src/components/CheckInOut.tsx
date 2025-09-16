'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

interface CheckInOutProps {
  employeeId: string;
  employeeName: string;
  onCheckInOut: (data: { type: 'checkin' | 'checkout'; timestamp: Date; employeeId: string }) => void;
}

export default function CheckInOut({ employeeId, employeeName, onCheckInOut }: CheckInOutProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<string>('');
  const [statusType, setStatusType] = useState<'checkin' | 'checkout' | 'error'>();
  const [isLoading, setIsLoading] = useState(false);
  const [hasCamera, setHasCamera] = useState(true);
  const [showVideo, setShowVideo] = useState(true); // 👈 force-remove video from DOM on stop

  // Robust stop that also removes the <video> from DOM (iOS/Android quirk)
  const stopCamera = useCallback(async () => {
    try {
      const s = streamRef.current;
      if (s) {
        // Stop all tracks, both video and audio (defensive)
        try { s.getTracks().forEach(t => { try { t.stop(); } catch {} }); } catch {}
        try { s.getVideoTracks().forEach(t => { try { t.stop(); } catch {} }); } catch {}
        try { s.getAudioTracks().forEach(t => { try { t.stop(); } catch {} }); } catch {}
        streamRef.current = null;
      }

      // Give the browser a tick to process the stops (works around a race)
      await Promise.resolve();

      const v = videoRef.current;
      if (v) {
        try {
          v.pause();
        } catch {}
        try {
          // @ts-expect-error runtime property
          v.srcObject = null;
        } catch {}
        try { v.removeAttribute('src'); } catch {}
        try { v.load?.(); } catch {}
      }

      // 👇 iOS Safari & some Chromium builds fully release only after removal from DOM
      setShowVideo(false);

      // Optional: after a short delay, re-allow mounting for the next open
      setTimeout(() => {
        // Do NOT immediately remount unless you are about to start camera again;
        // leave it false until startCamera() runs.
      }, 0);
    } catch {}
  }, []);

  const startCamera = useCallback(async () => {
    // Ensure old resources are gone and remount <video>
    await stopCamera();
    setShowVideo(true); // mount <video> back before attaching stream

    // Wait a microtask so React actually re-renders the video element
    await Promise.resolve();

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user',
      },
      audio: false,
    });

    streamRef.current = stream;

    const v = videoRef.current;
    if (v) {
      try {
        // @ts-expect-error runtime property
        v.srcObject = stream;
        await v.play().catch(() => {});
      } catch {}
    }

    setHasCamera(true);
  }, [stopCamera]);

  useEffect(() => {
    (async () => {
      try {
        await startCamera();
      } catch (error) {
        console.error('Error accessing camera:', error);
        setHasCamera(false);
        setStatus('Camera access denied. Please check permissions.');
        setStatusType('error');
      }
    })();

    return () => {
      // Hard stop on unmount
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  // Extra safety: if the tab/app goes to background, stop
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) stopCamera();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [stopCamera]);

  const saveAttendance = async (type: 'checkin' | 'checkout', imageData: string | null) => {
    const payload = { employeeId, employeeName, type, imageData };
    const response = await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const responseData = await response.json();
    if (!response.ok) {
      throw new Error(responseData.error || `Failed to save attendance (Status: ${response.status})`);
    }
    return responseData;
  };

  const captureImage = () => {
    try {
      const v = videoRef.current;
      if (!v || v.videoWidth === 0) return null;
      const canvas = document.createElement('canvas');
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.7);
    } catch (e) {
      console.warn('Could not capture image:', e);
      return null;
    }
  };

  const handleCheck = async (type: 'checkin' | 'checkout') => {
    setIsLoading(true);
    setStatus(type === 'checkin' ? 'Processing check-in...' : 'Processing check-out...');
    try {
      const imageData = captureImage();
      await saveAttendance(type, imageData);

      // ✅ HARD STOP immediately on success
      await stopCamera();

      onCheckInOut({
        type,
        timestamp: new Date(),
        employeeId,
      });

      setStatus(
        `Successfully ${type === 'checkin' ? 'checked in' : 'checked out'} at ${new Date().toLocaleTimeString()}`
      );
      setStatusType(type);
    } catch (error: any) {
      console.error(`Error during ${type}:`, error);
      setStatus(`Error: ${error.message}`);
      setStatusType('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckIn = () => handleCheck('checkin');
  const handleCheckOut = () => handleCheck('checkout');

  if (!hasCamera) {
    return (
      <div style={{ padding: '20px', border: '2px dashed #ccc', borderRadius: '8px', textAlign: 'center', margin: '20px 0' }}>
        <p style={{ color: '#666', marginBottom: '15px' }}>
          Camera access is required for check-in/out. Please enable camera permissions.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{ padding: '10px 20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          Retry Camera Access
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', border: '2px solid #e0e0e0', borderRadius: '8px', margin: '20px 0', textAlign: 'center' }}>
      <h3 style={{ marginBottom: '15px' }}>Camera Check-in/out</h3>

      <div style={{ marginBottom: '15px' }}>
        {showVideo && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%',
              maxWidth: '400px',
              height: 'auto',
              border: '2px solid #007bff',
              borderRadius: '4px',
              background: '#000'
            }}
          />
        )}
      </div>

      <div style={{ marginBottom: '15px' }}>
        <button
          onClick={async () => {
            setStatus('Testing API connection...');
            try {
              const response = await fetch('/api/attendance');
              const data = await response.json();
              setStatus(`API test successful: ${data.message}`);
              setStatusType(undefined);
            } catch (error: any) {
              setStatus(`API test failed: ${error.message}`);
              setStatusType('error');
            }
          }}
          style={{ padding: '10px 20px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '10px' }}
        >
          Test API
        </button>

        <button
          onClick={handleCheckIn}
          disabled={isLoading}
          style={{ padding: '12px 24px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: isLoading ? 'not-allowed' : 'pointer', marginRight: '10px', opacity: isLoading ? 0.6 : 1 }}
        >
          {isLoading ? 'Processing...' : 'Check In'}
        </button>

        <button
          onClick={handleCheckOut}
          disabled={isLoading}
          style={{ padding: '12px 24px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.6 : 1 }}
        >
          {isLoading ? 'Processing...' : 'Check Out'}
        </button>
      </div>

      {status && (
        <div style={{
          padding: '10px',
          borderRadius: '4px',
          backgroundColor: statusType === 'error' ? '#f8d7da' :
                          statusType === 'checkin' ? '#d4edda' :
                          statusType === 'checkout' ? '#d1ecf1' : '#f8f9fa',
          color: statusType === 'error' ? '#721c24' :
                 statusType === 'checkin' ? '#155724' :
                 statusType === 'checkout' ? '#0c5460' : '#6c757d',
          border: `1px solid ${statusType === 'error' ? '#f5c6cb' :
                              statusType === 'checkin' ? '#c3e6cb' :
                              statusType === 'checkout' ? '#bee5eb' : '#e9ecef'}`
        }}>
          {status}
        </div>
      )}
    </div>
  );
}
