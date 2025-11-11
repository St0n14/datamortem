import React from 'react';
import { useToast } from '../../contexts/ToastContext';
import { Toast } from './Toast';

interface ToastContainerProps {
  darkMode?: boolean;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
}

export function ToastContainer({ 
  darkMode = true, 
  position = 'top-right' 
}: ToastContainerProps) {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) {
    return null;
  }

  const getPositionClasses = () => {
    switch (position) {
      case 'top-right':
        return 'top-4 right-4';
      case 'top-left':
        return 'top-4 left-4';
      case 'top-center':
        return 'top-4 left-1/2 -translate-x-1/2';
      case 'bottom-right':
        return 'bottom-4 right-4';
      case 'bottom-left':
        return 'bottom-4 left-4';
      case 'bottom-center':
        return 'bottom-4 left-1/2 -translate-x-1/2';
      default:
        return 'top-4 right-4';
    }
  };

  return (
    <div
      className={`
        fixed z-50 flex flex-col gap-3 pointer-events-none
        ${getPositionClasses()}
      `}
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto animate-in slide-in-from-right-full fade-in duration-300"
        >
          <Toast
            toast={toast}
            onClose={() => removeToast(toast.id)}
            darkMode={darkMode}
          />
        </div>
      ))}
    </div>
  );
}

