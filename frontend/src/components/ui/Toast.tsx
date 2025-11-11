import React from 'react';
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import type { Toast as ToastType } from '../../contexts/ToastContext';

interface ToastProps {
  toast: ToastType;
  onClose: () => void;
  darkMode?: boolean;
}

export function Toast({ toast, onClose, darkMode = true }: ToastProps) {
  const getIcon = () => {
    const iconClass = darkMode ? 'text-slate-200' : 'text-slate-700';
    switch (toast.type) {
      case 'success':
        return <CheckCircle2 className={`h-5 w-5 text-emerald-500 ${iconClass}`} />;
      case 'error':
        return <AlertCircle className={`h-5 w-5 text-rose-500 ${iconClass}`} />;
      case 'warning':
        return <AlertTriangle className={`h-5 w-5 text-amber-500 ${iconClass}`} />;
      case 'info':
        return <Info className={`h-5 w-5 text-cyan-500 ${iconClass}`} />;
      default:
        return null;
    }
  };

  const getColors = () => {
    if (darkMode) {
      switch (toast.type) {
        case 'success':
          return 'bg-emerald-900/90 border-emerald-700 text-emerald-100';
        case 'error':
          return 'bg-rose-900/90 border-rose-700 text-rose-100';
        case 'warning':
          return 'bg-amber-900/90 border-amber-700 text-amber-100';
        case 'info':
          return 'bg-cyan-900/90 border-cyan-700 text-cyan-100';
        default:
          return 'bg-slate-900/90 border-slate-700 text-slate-100';
      }
    } else {
      switch (toast.type) {
        case 'success':
          return 'bg-emerald-50 border-emerald-200 text-emerald-800';
        case 'error':
          return 'bg-rose-50 border-rose-200 text-rose-800';
        case 'warning':
          return 'bg-amber-50 border-amber-200 text-amber-800';
        case 'info':
          return 'bg-cyan-50 border-cyan-200 text-cyan-800';
        default:
          return 'bg-slate-50 border-slate-200 text-slate-800';
      }
    }
  };

  return (
    <div
      className={`
        flex items-start gap-3 rounded-lg border p-4 shadow-lg
        animate-in slide-in-from-right-full fade-in
        ${getColors()}
        min-w-[320px] max-w-[420px]
      `}
      role="alert"
      aria-live="polite"
    >
      <div className="flex-shrink-0 mt-0.5">{getIcon()}</div>
      <div className="flex-1 min-w-0">
        {toast.title && (
          <div className={`font-semibold text-sm mb-1 ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
            {toast.title}
          </div>
        )}
        <div className={`text-sm ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
          {toast.message}
        </div>
      </div>
      <button
        onClick={onClose}
        className={`
          flex-shrink-0 rounded-md p-1 transition-colors
          ${darkMode 
            ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50' 
            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
          }
        `}
        aria-label="Fermer la notification"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

