'use client';

import { forwardRef } from 'react';

interface BrassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
}

const sizeStyles = {
  sm: 'text-xs px-3 py-1.5 gap-1.5',
  md: 'text-sm px-4 py-2 gap-2',
  lg: 'text-base px-5 py-2.5 gap-2',
};

export const BrassButton = forwardRef<HTMLButtonElement, BrassButtonProps>(
  function BrassButton({ size = 'md', icon, children, className = '', ...props }, ref) {
    return (
      <button
        ref={ref}
        className={[
          'inline-flex items-center justify-center font-semibold rounded-lg transition duration-150',
          'bg-gradient-to-b from-brass-500 to-brass-700 text-sepia-900 border border-brass-600',
          'shadow-brass hover:from-brass-400 hover:to-brass-600',
          'active:from-brass-700 active:to-brass-500 active:translate-y-[1px]',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          sizeStyles[size],
          className,
        ].join(' ')}
        {...props}
      >
        {icon && <span className="shrink-0">{icon}</span>}
        {children}
      </button>
    );
  },
);
