import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string;
}

export function Input({ className = '', ...props }: InputProps) {
  return (
    <input
      className={`rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2
        border-slate-300 bg-slate-50 text-slate-900 placeholder:text-slate-500
        dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400
        focus:ring-violet-500 dark:focus:ring-violet-600
        ${className}`}
      {...props}
    />
  );
}
