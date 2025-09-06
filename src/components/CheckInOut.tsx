'use client';

import { useRef, useState, useEffect } from 'react';

interface CheckInOutProps {
  employeeId: string;
  employeeName: string;
  onCheckInOut: (data: { type: 'checkin' | 'checkout'; timestamp: Date; employeeId: string }) => void;
}

export default function CheckInOut({ employeeId, employeeName, onCheckInOut }: CheckInOutProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<string>('');
  const [statusType, setStatusType] = useState<'checkin' | 'checkout' | 'error'>();
  const [isLoading, setIsLoading] = useState(false);
  const [hasCamera, setHasCamera] = useState(true);

  const saveAttendance = async (type: 'checkin' | 'checkout', imageData: string | null) => {
    try {
      const payload = {
        employeeId: employeeId,
        employeeName: employeeName,
        type: type,
        imageData: imageData
      };

      console.log('Sending to /api/attendance:', { 
        employeeId: payload.employeeId,
        type: payload.type,
        hasImage: !!payload.imageData 
      });

      const response = await fetch('/api/attendance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      const responseData = await response.json();
      
      if (!response.ok) {
        console.error('API Error Response:', responseData);
        throw new Error(responseData.error || `Failed to save attendance (Status: ${response.status})`);
      }
      
      console.log('API Success:', responseData);
      return responseData;
      
    } catch (error) {
      console.error('Error in saveAttendance:', error);
      throw error;
    }
  };

  const testApiConnection = async () => {
    try {
      setStatus('Testing API connection...');
      const response = await fetch('/api/attendance');
      const data = await response.json();
      setStatus(`API test successful: ${data.message}`);
      setStatusType(undefined);
    } catch (error: any) {
      setStatus(`API test failed: ${error.message}`);
      setStatusType('error');
    }
  };

  useEffect(() => {
    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: { ideal: 640 },
            height: { ideal: 480 }
          } 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setHasCamera(true);
      } catch (error) {
        console.error('Error accessing camera:', error);
        setHasCamera(false);
        setStatus('Camera access denied. Please check permissions.');
        setStatusType('error');
      }
    };

    initCamera();

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleCheckIn = async () => {
    setIsLoading(true);
    setStatus('Processing check-in...');
    
    try {
      let imageData: string | null = null;
      
      try {
        const canvas = document.createElement('canvas');
        if (videoRef.current && videoRef.current.videoWidth > 0) {
          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            imageData = canvas.toDataURL('image/jpeg', 0.7);
          }
        }
      } catch (imageError) {
        console.warn('Could not capture image:', imageError);
      }
      
      await saveAttendance('checkin', imageData);
      
      onCheckInOut({
        type: 'checkin',
        timestamp: new Date(),
        employeeId
      });
      
      setStatus(`Successfully checked in at ${new Date().toLocaleTimeString()}`);
      setStatusType('checkin');
      
    } catch (error: any) {
      console.error('Error during check-in:', error);
      setStatus(`Error: ${error.message}`);
      setStatusType('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckOut = async () => {
    setIsLoading(true);
    setStatus('Processing check-out...');
    
    try {
      let imageData: string | null = null;
      
      try {
        const canvas = document.createElement('canvas');
        if (videoRef.current && videoRef.current.videoWidth > 0) {
          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            imageData = canvas.toDataURL('image/jpeg', 0.7);
          }
        }
      } catch (imageError) {
        console.warn('Could not capture image:', imageError);
      }
      
      await saveAttendance('checkout', imageData);
      
      onCheckInOut({
        type: 'checkout',
        timestamp: new Date(),
        employeeId
      });
      
      setStatus(`Successfully checked out at ${new Date().toLocaleTimeString()}`);
      setStatusType('checkout');
      
    } catch (error: any) {
      console.error('Error during check-out:', error);
      setStatus(`Error: ${error.message}`);
      setStatusType('error');
    } finally {
      setIsLoading(false);
    }
  };

  if (!hasCamera) {
    return (
      <div style={{ 
        padding: '20px', 
        border: '2px dashed #ccc', 
        borderRadius: '8px', 
        textAlign: 'center',
        margin: '20px 0'
      }}>
        <p style={{ color: '#666', marginBottom: '15px' }}>
          Camera access is required for check-in/out. Please enable camera permissions.
        </p>
        <button 
          onClick={() => window.location.reload()}
          style={{
            padding: '10px 20px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Retry Camera Access
        </button>
      </div>
    );
  }

  return (
    <div style={{ 
      padding: '20px', 
      border: '2px solid #e0e0e0', 
      borderRadius: '8px', 
      margin: '20px 0',
      textAlign: 'center'
    }}>
      <h3 style={{ marginBottom: '15px' }}>Camera Check-in/out</h3>
      
      <div style={{ marginBottom: '15px' }}>
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
            borderRadius: '4px'
          }}
        />
      </div>

      <div style={{ marginBottom: '15px' }}>
        <button
          onClick={testApiConnection}
          style={{
            padding: '10px 20px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            marginRight: '10px'
          }}
        >
          Test API
        </button>
        
        <button
          onClick={handleCheckIn}
          disabled={isLoading}
          style={{
            padding: '12px 24px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            marginRight: '10px',
            opacity: isLoading ? 0.6 : 1
          }}
        >
          {isLoading ? 'Processing...' : 'Check In'}
        </button>
        
        <button
          onClick={handleCheckOut}
          disabled={isLoading}
          style={{
            padding: '12px 24px',
            backgroundColor: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            opacity: isLoading ? 0.6 : 1
          }}
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