'use client';

import { forwardRef } from 'react';

interface InkStampButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  loading?: boolean;
}

const variantStyles = {
  primary:
    'bg-forest-700 text-cream-50 border-2 border-forest-800 hover:bg-forest-600 active:bg-forest-800',
  danger:
    'bg-wax-700 text-cream-50 border-2 border-wax-800 hover:bg-wax-600 active:bg-wax-800',
  ghost:
    'bg-transparent text-sepia-600 border-2 border-transparent hover:text-sepia-800 hover:bg-sepia-300/20',
};

const sizeStyles = {
  sm: 'text-xs px-3 py-1.5 gap-1.5',
  md: 'text-sm px-4 py-2 gap-2',
  lg: 'text-base px-5 py-2.5 gap-2',
};

export const InkStampButton = forwardRef<HTMLButtonElement, InkStampButtonProps>(
  function InkStampButton({ variant = 'primary', size = 'md', icon, loading, children, className = '', disabled, ...props }, ref) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={[
          'inline-flex items-center justify-center font-semibold rounded-lg transition duration-150',
          'active:translate-y-[1px] active:scale-[0.97]',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-y-0 disabled:active:scale-100',
          variantStyles[variant],
          sizeStyles[size],
          className,
        ].join(' ')}
        {...props}
      >
        {loading ? (
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full" style={{ animation: 'ink-swirl 1s linear infinite' }} />
        ) : icon ? (
          <span className="shrink-0">{icon}</span>
        ) : null}
        {children}
      </button>
    );
  },
);
