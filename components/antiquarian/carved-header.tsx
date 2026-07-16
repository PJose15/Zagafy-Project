import { EngravedSprig } from './engraved-flourish';

interface CarvedHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}

export function CarvedHeader({ title, subtitle, actions }: CarvedHeaderProps) {
  return (
    <header className="flex items-start justify-between gap-4 pb-6 border-b border-sepia-300/30">
      <div>
        {/* Editorial display scale — the one oversized voice per page,
            set in gold leaf against the dark shelf */}
        <h1 className="text-4xl md:text-[2.75rem] leading-[1.05] font-serif font-bold tracking-tight text-balance gold-leaf">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sepia-400 mt-2 text-[15px] leading-relaxed font-serif italic">{subtitle}</p>
        )}
        {/* Brass rule ending in an engraved sprig — the ornament, not an icon */}
        <div className="mt-3 flex items-center">
          <div className="h-0.5 w-16 bg-gradient-to-r from-brass-500 to-brass-400/60 rounded-full" />
          <EngravedSprig className="-ml-0.5" />
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}
