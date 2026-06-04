'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

type Step = 'name' | 'camera' | 'capturing' | 'processing' | 'done' | 'error';

const CAPTURES_REQUIRED = 3;
const CAPTURE_INTERVAL_MS = 1500;

function EnrollPageContent() {
  const searchParams = useSearchParams();
  const workerId = searchParams.get('worker_id') || '';
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [department, setDepartment] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [captureCount, setCaptureCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [resultMsg, setResultMsg] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameRef = useRef(name);
  const employeeIdRef = useRef(employeeId);
  const departmentRef = useRef(department);
  const workerIdRef = useRef(workerId);
  nameRef.current = name;
  employeeIdRef.current = employeeId;
  departmentRef.current = department;
  workerIdRef.current = workerId;

  const stopCamera = useCallback(() => {
    if (captureTimerRef.current) {
      clearTimeout(captureTimerRef.current);
      captureTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  useEffect(() => {
    if (!workerId) return;
    let cancelled = false;
    async function loadWorker() {
      try {
        const res = await fetch(`/api/workers?id=${encodeURIComponent(workerId)}`);
        if (!res.ok) throw new Error('Worker not found');
        const worker = await res.json();
        if (cancelled) return;
        setName(worker.name || '');
        setEmployeeId(worker.employee_id || '');
        setDepartment(worker.department || '');
      } catch (err) {
        if (cancelled) return;
        setErrorMsg(err instanceof Error ? err.message : 'Unable to load worker for re-enrollment');
        setStep('error');
      }
    }
    loadWorker();
    return () => { cancelled = true; };
  }, [workerId]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      streamRef.current = stream;
      setStep('camera');
    } catch {
      setErrorMsg('Camera access denied. Please allow camera permissions and try again.');
      setStep('error');
    }
  };

  useEffect(() => {
    if (step === 'camera' || step === 'capturing') {
      if (videoRef.current && streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
    }
  }, [step]);

  const captureFrame = useCallback((): string | null => {
    if (!videoRef.current) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(videoRef.current, 0, 0, 640, 480);
    return canvas.toDataURL('image/jpeg', 0.85);
  }, []);

  const submitEnrollmentRef = useRef<(photos: string[]) => Promise<void>>(null!);

  const submitEnrollment = async (capturedPhotos: string[]) => {
    try {
      const res = await fetch('/api/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameRef.current.trim(),
          employeeId: employeeIdRef.current.trim(),
          department: departmentRef.current.trim(),
          workerId: workerIdRef.current,
          photos: capturedPhotos,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Enrollment failed');
      }

      const result = await res.json();
      stopCamera();
      setResultMsg(`Face encoding saved. ${result.photosCount} photos captured.`);
      setStep('done');
    } catch (err) {
      stopCamera();
      setErrorMsg(err instanceof Error ? err.message : 'Enrollment failed');
      setStep('error');
    }
  };

  submitEnrollmentRef.current = submitEnrollment;

  const startCapturing = useCallback(() => {
    setStep('capturing');
    setCaptureCount(0);
    setPhotos([]);

    const captured: string[] = [];
    let count = 0;

    const doCapture = () => {
      const frame = captureFrame();
      if (frame) {
        captured.push(frame);
        count++;
        setCaptureCount(count);
        setPhotos([...captured]);
      }

      if (count >= CAPTURES_REQUIRED) {
        setStep('processing');
        submitEnrollmentRef.current(captured);
        return;
      }

      captureTimerRef.current = setTimeout(doCapture, CAPTURE_INTERVAL_MS);
    };

    captureTimerRef.current = setTimeout(doCapture, 500);
  }, [captureFrame]);

  // Step: Enter Name
  if (step === 'name') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4 animate-fade-in">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gold/10 border border-gold/20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-gold" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
              </svg>
            </div>
            <h1 className="page-title text-slate-100">
              Face <span className="text-gold">Enrollment</span>
            </h1>
            <p className="text-slate-400 mt-2 text-sm">{workerId ? 'Update face data for an existing team member' : 'Add a new team member to the gatekeeper system'}</p>
          </div>

          <div className="glass-card p-6 space-y-5">
            <div>
              <label className="section-label mb-1.5 block">Full Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. John Smith"
                autoFocus
                className="input-field text-lg py-3"
              />
            </div>

            <div>
              <label className="section-label mb-1.5 block">Employee ID Number</label>
              <input
                type="text"
                inputMode="numeric"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                placeholder="e.g. 1042"
                className="input-field"
              />
            </div>

            <div>
              <label className="section-label mb-1.5 block">Department</label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Production, QC, Electrical"
                className="input-field"
              />
            </div>

            <button
              onClick={startCamera}
              disabled={!name.trim()}
              className="btn-primary w-full py-3.5 text-base flex items-center justify-center gap-2"
            >
              Continue to Camera
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </button>
          </div>

          <div className="text-center mt-5">
            <Link href="/workers" className="text-sm text-slate-500 hover:text-gold transition-colors font-medium">
              Back to Workers
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Step: Camera Preview
  if (step === 'camera') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4 animate-fade-in">
        <div className="w-full max-w-lg text-center">
          <h2 className="page-title mb-1 text-slate-100">
            Enrolling: <span className="text-gold">{name}</span>
          </h2>
          <p className="text-slate-400 mb-6 text-sm">Position your face in the frame, then tap Start</p>

          <div className="relative rounded-2xl overflow-hidden border-2 border-navy-600/50 mb-5 glass-card">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full aspect-[4/3] bg-navy-950 object-cover"
            />
            {/* Face guide overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-48 h-60 border-2 border-gold/30 rounded-[50%]" />
            </div>
            {/* Corner guides */}
            <div className="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-gold/40 rounded-tl-lg" />
            <div className="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-gold/40 rounded-tr-lg" />
            <div className="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-gold/40 rounded-bl-lg" />
            <div className="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-gold/40 rounded-br-lg" />
          </div>

          <div className="space-y-3">
            <button
              onClick={startCapturing}
              className="btn-primary w-full py-3.5 text-base flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              </svg>
              Start Capture
            </button>
            <button
              onClick={() => { stopCamera(); setStep('name'); }}
              className="btn-secondary w-full"
            >
              Back
            </button>
          </div>

          <div className="mt-5 glass-card p-3 text-xs text-slate-500 font-mono">
            Tips: Look directly at camera &middot; Good lighting &middot; Remove glasses if possible
          </div>
        </div>
      </div>
    );
  }

  // Step: Auto-capturing
  if (step === 'capturing') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="w-full max-w-lg text-center">
          <h2 className="page-title mb-1 text-slate-100">
            Capturing: <span className="text-gold">{name}</span>
          </h2>
          <p className="text-gold font-mono text-lg mb-5">
            Hold still... {captureCount}/{CAPTURES_REQUIRED}
          </p>

          <div className="relative rounded-2xl overflow-hidden border-2 border-gold/40 mb-5 shadow-lg shadow-gold/5">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full aspect-[4/3] bg-navy-950 object-cover"
            />
            {/* Flash effect */}
            <div className="absolute inset-0 bg-gold/5 animate-pulse pointer-events-none" />
            {/* Progress bar */}
            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-navy-800">
              <div
                className="h-full bg-gradient-to-r from-gold to-gold-light transition-all duration-500 ease-out"
                style={{ width: `${(captureCount / CAPTURES_REQUIRED) * 100}%` }}
              />
            </div>
          </div>

          {/* Thumbnails */}
          <div className="flex gap-3 justify-center">
            {Array.from({ length: CAPTURES_REQUIRED }).map((_, i) => (
              <div
                key={i}
                className={`w-16 h-16 rounded-xl border-2 overflow-hidden transition-all ${
                  i < photos.length ? 'border-gold shadow-sm shadow-gold/10' : 'border-navy-600/50'
                }`}
              >
                {photos[i] ? (
                  <img src={photos[i]} alt={`Capture ${i + 1}`} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-navy-800 flex items-center justify-center text-slate-600 text-xs font-mono">
                    {i + 1}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Step: Processing
  if (step === 'processing') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="text-center animate-fade-in">
          <div className="mx-auto mb-6 h-16 w-16 animate-spin rounded-full border-4 border-gold/20 border-t-gold" />
          <h2 className="page-title text-slate-100">Processing...</h2>
          <p className="text-slate-400 mt-2 font-mono text-sm">Saving photos and generating face encoding</p>
        </div>
      </div>
    );
  }

  // Step: Done
  if (step === 'done') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4 animate-fade-in">
        <div className="w-full max-w-md text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center mx-auto mb-5">
            <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="page-title mb-2 text-slate-100">
            <span className="text-gold">{name}</span> Enrolled!
          </h2>
          <p className="text-slate-400 mb-8 text-sm">{resultMsg}</p>

          <div className="space-y-3">
            <Link href="/enroll" className="btn-primary w-full py-3.5 text-base block text-center">
              Enroll Another Person
            </Link>
            <Link href="/workers" className="btn-secondary block w-full text-center">
              Back to Workers
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Step: Error
  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4 animate-fade-in">
      <div className="w-full max-w-md text-center">
        <div className="w-20 h-20 rounded-full bg-red-400/10 border border-red-400/20 flex items-center justify-center mx-auto mb-5">
          <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <h2 className="page-title mb-2 text-slate-100">Enrollment Failed</h2>
        <p className="text-slate-400 mb-8 text-sm">{errorMsg}</p>

        <div className="space-y-3">
          <button
            onClick={() => {
              setPhotos([]);
              setCaptureCount(0);
              setErrorMsg('');
              setStep('name');
            }}
            className="btn-primary w-full py-3.5 text-base"
          >
            Try Again
          </button>
          <Link href="/workers" className="btn-secondary block w-full text-center">
            Back to Workers
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function EnrollPage() {
  return (
    <Suspense fallback={null}>
      <EnrollPageContent />
    </Suspense>
  );
}
