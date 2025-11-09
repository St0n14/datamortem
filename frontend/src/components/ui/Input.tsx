import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string;
}

export function Input({ className = '', ...props }: InputProps) {
  return (
    <input
      className={`rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 bg-slate-50 text-slate-900 placeholder:text-slate-500 ${className}`}
      {...props}
    />
  );
}
