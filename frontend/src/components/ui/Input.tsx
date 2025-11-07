import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string;
}

export function Input({ className = '', ...props }: InputProps) {
  return (
    <input
      className={`rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 ${className}`}
      {...props}
    />
  );
}
