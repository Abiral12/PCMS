"use client";
import { useEffect, useState } from "react";

interface WorkingPromptProps {
  onConfirm: () => void | Promise<void>;
}

export default function WorkingPrompt({ onConfirm }: WorkingPromptProps) {
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setShowPrompt(true);
    }, 15 * 60 * 1000); // every 15 mins

    return () => clearInterval(interval);
  }, []);

  const handleClick = async () => {
    await onConfirm();
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
      <div className="bg-white p-6 rounded-xl shadow-md text-center">
        <p className="text-lg font-semibold mb-4">
          Are you working?
        </p>
        <button
          onClick={handleClick}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          I’m working
        </button>
      </div>
    </div>
  );
}
