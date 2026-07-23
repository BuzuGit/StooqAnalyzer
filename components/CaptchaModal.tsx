'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';

interface CaptchaModalProps {
  sessionToken: string;
  onSolved: () => void;
  onCancel: () => void;
}

export default function CaptchaModal({ sessionToken, onSolved, onCancel }: CaptchaModalProps) {
  const [code, setCode] = useState('');
  const [imgSrc, setImgSrc] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const refreshImage = useCallback(() => {
    setImgSrc(`/api/stooq/captcha?session=${encodeURIComponent(sessionToken)}&_=${Date.now()}`);
    setCode('');
    setErrorMsg(null);
  }, [sessionToken]);

  useEffect(() => {
    refreshImage();
  }, [refreshImage]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (code.trim().length === 0) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/stooq/captcha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: sessionToken, code: code.trim() }),
      });
      const result = await res.json();
      if (result.ok) {
        onSolved();
      } else {
        setErrorMsg(result.error || 'Incorrect code — try the new image.');
        refreshImage();
      }
    } catch {
      setErrorMsg('Could not reach the server. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-panel rounded-lg shadow-xl w-full max-w-sm p-5">
        <h2 className="text-lg font-bold text-content">Stooq CAPTCHA</h2>
        <p className="mt-1 text-sm text-muted">
          Stooq requires solving this CAPTCHA before it will serve downloads. Type the 4
          characters shown below.
        </p>

        <div className="mt-4 flex flex-col items-center gap-2">
          <div className="border border-line rounded bg-panel-2 p-2 min-h-[74px] flex items-center justify-center">
            {imgSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imgSrc} alt="Stooq CAPTCHA" width={200} height={70} />
            ) : (
              <span className="text-sm text-subtle">Loading…</span>
            )}
          </div>
          <button
            type="button"
            onClick={refreshImage}
            className="text-xs text-blue-600 hover:underline"
          >
            ↻ New image
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-3">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={8}
            autoFocus
            placeholder="Enter code"
            className="w-full px-3 py-2 border border-line rounded-lg text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errorMsg && <p className="mt-2 text-sm text-red-600">{errorMsg}</p>}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-line rounded-lg text-content hover:bg-panel-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || code.trim().length === 0}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
            >
              {submitting ? 'Checking…' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
