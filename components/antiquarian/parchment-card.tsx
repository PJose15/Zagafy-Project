import { forwardRef } from 'react';

type ParchmentVariant = 'default' | 'inset' | 'aged' | 'translucent';
type ParchmentPadding = 'none' | 'sm' | 'md' | 'lg';

interface ParchmentCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: ParchmentVariant;
  tornEdge?: boolean;
  hover?: boolean;
  padding?: ParchmentPadding;
}

const variantStyles: Record<ParchmentVariant, string> = {
  default: 'bg-parchment-100 border-sepia-300/50',
  inset: 'bg-parchment-200 border-sepia-300/40 inset-shadow',
  aged: 'bg-parchment-300 border-sepia-400/50',
  translucent: 'bg-parchment-100/80 backdrop-blur-sm border-sepia-300/30',
};

const paddingStyles: Record<ParchmentPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-7',
};

export const ParchmentCard = forwardRef<HTMLDivElement, ParchmentCardProps>(
  function ParchmentCard(
    { variant = 'default', tornEdge = false, hover = false, padding = 'md', className = '', children, ...props },
    ref,
  ) {
    return (
      <div
        ref={ref}
        className={[
          // text-sepia-800 default: the body is cream-on-mahogany, so any
          // un-colored text inside a parchment card would inherit near-white
          // ink on light paper. Cards always read as ink on parchment.
          'relative border rounded-xl shadow-parchment texture-parchment text-sepia-800',
          variantStyles[variant],
          paddingStyles[padding],
          tornEdge ? 'torn-edge-bottom' : '',
          hover ? 'transition-[transform,box-shadow] duration-200 hover:translate-y-[-2px] hover:shadow-card-hover cursor-pointer' : '',
          className,
        ].filter(Boolean).join(' ')}
        {...props}
      >
        {children}
      </div>
    );
  },
);
