import React, { useState } from 'react';
import { verifyApiToken, setApiToken } from '../services/api';
import { KeyRound, ShieldCheck, ArrowRight, AlertCircle, Eye, EyeOff } from 'lucide-react';

interface TokenGateProps {
  storeName?: string;
  infoMessage?: string;
  onTokenSuccess: (token: string) => void;
}

export const TokenGate: React.FC<TokenGateProps> = ({ storeName, infoMessage, onTokenSuccess }) => {
  const [tokenInput, setTokenInput] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const entered = tokenInput.trim().toUpperCase();

    if (!entered) {
      setErrorMessage("Veuillez saisir la clé d'accès.");
      return;
    }

    setIsValidating(true);
    setErrorMessage('');

    // Validation via base de données du serveur
    const isValid = await verifyApiToken(entered);

    if (isValid) {
      setApiToken(entered);
      setTimeout(() => {
        setIsValidating(false);
        onTokenSuccess(entered);
      }, 200);
    } else {
      setIsValidating(false);
      setErrorMessage("Clé d'accès incorrecte.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background styling elements */}
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-emerald-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-emerald-800/25 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm z-10 space-y-6">
        {/* App Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-emerald-700/80 border border-emerald-500/40 text-white flex items-center justify-center mx-auto shadow-lg shadow-emerald-900/50">
            <svg
              className="w-9 h-9"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12c0-3.5 1.5-6.5 4-8.5" />
              <path d="M8 12c2-4 6-4 8 0" />
              <path d="M12 8v8" />
            </svg>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            {storeName || 'Planning'}
          </h1>
          <p className="text-xs text-emerald-200/80 font-medium">
            Planning du Personnel & Équipe
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl p-6 shadow-2xl border border-slate-100 space-y-5">
          <div className="text-center space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 text-[11px] font-semibold mb-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Accès Sécurisé Équipe</span>
            </div>
            <h2 className="text-base font-bold text-slate-900">
              Clé d'accès requise
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Pour accéder aux plannings, saisissez votre clé d'accès (Clé initiale : <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">PLANNING</span>).
            </p>
          </div>

          {infoMessage && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2 shadow-xs">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="font-medium leading-relaxed">{infoMessage}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">
                Clé / Jeton d'accès :
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showToken ? 'text' : 'password'}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck="false"
                  autoFocus
                  placeholder="ex: PLANNING"
                  value={tokenInput}
                  onChange={(e) => {
                    setTokenInput(e.target.value);
                    setErrorMessage('');
                  }}
                  className="w-full pl-10 pr-10 py-3 text-sm font-mono tracking-wider font-semibold rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent uppercase placeholder:normal-case placeholder:font-sans placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errorMessage && (
                <div className="flex flex-col gap-1 text-rose-600 text-xs font-medium pt-1">
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Saisissez la clé neutre par défaut : <strong className="font-mono text-emerald-800">PLANNING</strong>
                  </p>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isValidating || !tokenInput.trim()}
              className="w-full py-3 px-4 rounded-xl text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg active:scale-[0.98]"
            >
              {isValidating ? (
                <span>Vérification...</span>
              ) : (
                <>
                  <span>Déverrouiller l'accès</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="pt-2 border-t border-slate-100 text-center">
            <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1">
              <span>Ce jeton sera mémorisé sur cet appareil</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
