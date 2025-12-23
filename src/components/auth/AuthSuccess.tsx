"use client";

interface AuthSuccessProps {
  message: string;
  className?: string;
}

export default function AuthSuccess({ message, className = "" }: AuthSuccessProps) {
  if (!message) return null;

  return (
    <div
      className={`rounded-lg bg-green-50 border border-green-200 p-4 ${className}`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <svg
          className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="text-sm text-green-800">{message}</p>
      </div>
    </div>
  );
}

