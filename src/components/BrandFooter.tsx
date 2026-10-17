import React from 'react';
import { AppLogo } from './AppLogo';

interface BrandFooterProps {
  className?: string;
}

export const BrandFooter: React.FC<BrandFooterProps> = ({ className = '' }) => {
  return (
    <div className={`w-full flex flex-col items-center justify-center py-6 text-center select-none ${className}`}>
      <div className="inline-flex items-center gap-3 px-4 py-2 rounded-2xl bg-white/70 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800/80 shadow-xs">
        <AppLogo size="sm" variant="square" className="shadow-2xs" />
        <div className="text-left leading-tight">
          <div className="text-sm font-black tracking-tight">
            <span className="text-slate-900 dark:text-white">Cano</span>
            <span className="text-emerald-600 dark:text-emerald-400">Shift</span>
          </div>
          <div className="text-[10px] font-extrabold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
            by NEVO
          </div>
        </div>
      </div>
    </div>
  );
};
