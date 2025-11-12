import React from 'react';

interface ProgressBarProps {
  progress: number; // 0-100
  className?: string;
  showLabel?: boolean;
  label?: string;
}

export function ProgressBar({ progress, className = '', showLabel = true, label }: ProgressBarProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress));
  const displayLabel = label || `${Math.round(clampedProgress)}%`;

  return (
    <div className={`w-full ${className}`}>
      {showLabel && (
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
            {displayLabel}
          </span>
        </div>
      )}
      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden shadow-inner">
        <div
          className="h-full bg-gradient-to-r from-violet-500 via-violet-600 to-violet-700 rounded-full transition-all duration-300 ease-out relative overflow-hidden shadow-sm"
          style={{ width: `${clampedProgress}%` }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
          {clampedProgress > 0 && (
            <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent rounded-t-full" />
          )}
        </div>
      </div>
    </div>
  );
}

