export default function GenesisLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] bg-parchment-200 overflow-y-auto">
      {children}
    </div>
  );
}
