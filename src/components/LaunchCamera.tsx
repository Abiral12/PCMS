'use client';
import { useEffect, useRef, useState } from 'react';

type Props = {
  employeeId: string;
  type: 'lunch-start' | 'lunch-end';
  onDone: () => void;      // called after successful POST
  onCancel: () => void;    // close modal without posting
};

function buildAuthHeaders(): Record<string, string> {
  try {
    if (typeof window === 'undefined') return {};
    const raw = localStorage.getItem('employee');
    if (!raw) return {};
    const id = JSON.parse(raw)?.id;
    return id ? { 'x-user-id': String(id) } : {};
  } catch {
    return {};
  }
}

export default function LunchCam({ employeeId, type, onDone, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function start() {
      setError(null);
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' }, audio: false
        });
        if (!mounted) {
          s.getTracks().forEach(t => t.stop());
          return;
        }
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play();
        }
      } catch (e: any) {
        setError(e?.message || 'Unable to access camera. (Tip: use https or localhost)');
      }
    }

    start();
    return () => {
      mounted = false;
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function takePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setPhoto(dataUrl);
  }

  function retake() {
    setPhoto(null);
  }

  async function submit() {
    if (!photo) return;
    setSending(true);
    try {
      const res = await fetch('/api/lunch/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildAuthHeaders() },
        body: JSON.stringify({
          employeeId,
          type,                 // 'lunch-start' | 'lunch-end'
          imageData: photo,     // base64 data URL
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Failed to save lunch log');
      onDone();
    } catch (e: any) {
      setError(e?.message || 'Failed to save lunch log');
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'grid', gap: 12 }}>
        {error && (
          <div style={{ background: '#fff2f0', color: '#b91c1c', padding: 10, borderRadius: 8 }}>
            {error}
          </div>
        )}

        {!photo ? (
          <>
            <video ref={videoRef} playsInline muted style={{ width: '100%', borderRadius: 12, background: '#000' }} />
            <button className="btn primary" onClick={takePhoto}>Capture</button>
          </>
        ) : (
          <>
            <img src={photo} alt="Captured" style={{ width: '100%', borderRadius: 12 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn secondary" onClick={retake}>Retake</button>
              <button className="btn primary" onClick={submit} disabled={sending}>
                {sending ? 'Saving…' : 'Use Photo'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* hidden canvas for capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
