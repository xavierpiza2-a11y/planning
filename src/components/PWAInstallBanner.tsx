import React, { useState } from 'react';
import { Download, X, Share, PlusSquare } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallBanner: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [isDismissed, setIsDismissed] = useState(false);
  const [showIOSTip, setShowIOSTip] = useState(false);

  if (isInstalled || isDismissed) return null;

  // Show if either install prompt is ready OR on iOS where Safari doesn't support beforeinstallprompt
  if (!isInstallable && !isIOS) return null;

  return (
    <div className="bg-emerald-900 text-white px-4 py-2.5 shadow-md flex items-center justify-between gap-3 text-xs border-b border-emerald-950">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-7 h-7 rounded-lg bg-emerald-800 flex items-center justify-center shrink-0 border border-emerald-700/60">
          <Download className="w-3.5 h-3.5 text-emerald-300" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-white truncate">Installer l'application</p>
          <p className="text-[10px] text-emerald-200/80 truncate">
            Accès 1-clic direct et consultation hors ligne
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {isInstallable ? (
          <button
            onClick={install}
            className="px-2.5 py-1 text-[11px] font-bold bg-white text-emerald-900 rounded-md hover:bg-emerald-50 transition-colors shadow-2xs"
          >
            Installer
          </button>
        ) : isIOS ? (
          <button
            onClick={() => setShowIOSTip(!showIOSTip)}
            className="px-2.5 py-1 text-[11px] font-bold bg-white text-emerald-900 rounded-md hover:bg-emerald-50 transition-colors shadow-2xs"
          >
            Astuce iPhone
          </button>
        ) : null}

        <button
          onClick={() => setIsDismissed(true)}
          className="p-1 text-emerald-300 hover:text-white rounded"
          aria-label="Fermer la bannière"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {showIOSTip && (
        <div className="fixed inset-x-4 top-16 z-50 bg-white text-slate-800 p-4 rounded-xl shadow-xl border border-slate-200 space-y-2">
          <div className="flex items-center justify-between font-bold text-xs text-slate-900">
            <span>Pour installer sur iPhone / iPad :</span>
            <button onClick={() => setShowIOSTip(false)} className="text-slate-400">
              <X className="w-4 h-4" />
            </button>
          </div>
          <ol className="text-xs text-slate-600 space-y-1.5 list-decimal pl-4">
            <li>
              Appuyez sur l'icône de partage <Share className="inline w-3 h-3 text-blue-600" /> en bas de Safari.
            </li>
            <li>
              Faites défiler et choisissez <span className="font-semibold text-slate-900">« Sur l'écran d'accueil »</span> <PlusSquare className="inline w-3 h-3 text-slate-600" />.
            </li>
            <li>
              Appuyez sur <span className="font-semibold text-slate-900">« Ajouter »</span> en haut à droite.
            </li>
          </ol>
        </div>
      )}
    </div>
  );
};
