import React from 'react';
import { Employee } from '../types/planning';
import { RefreshCw, UserCheck, Bell, ChevronDown } from 'lucide-react';

interface HeaderProps {
  storeName?: string;
  currentEmployee: Employee | null;
  onOpenProfileSelector: () => void;
  onRefresh: () => void;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  isOffline: boolean;
  isRealtimeConnected?: boolean;
  onOpenNotifications?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  storeName,
  currentEmployee,
  onOpenProfileSelector,
  onRefresh,
  isSyncing,
  lastSyncTime,
  isOffline,
  isRealtimeConnected = true,
  onOpenNotifications,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-emerald-900 text-white shadow-sm border-b border-emerald-950/20">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        {/* Brand Zone */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-800 flex items-center justify-center shrink-0 border border-emerald-700/50">
            <svg
              className="w-5 h-5 text-emerald-300"
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
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm font-semibold tracking-tight text-white leading-tight truncate">
                {storeName || 'Planning'}
              </h1>
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                  isRealtimeConnected
                    ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                }`}
                title={
                  isRealtimeConnected
                    ? 'Connecté à la base de données en direct (temps réel actif)'
                    : 'Tentative de reconnexion temps réel...'
                }
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isRealtimeConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                  }`}
                />
                {isRealtimeConnected ? 'Direct' : 'Sync'}
              </span>
            </div>
            <p className="text-[11px] text-emerald-200/80 leading-tight truncate">
              Planning Équipe · Base de données
            </p>
          </div>
        </div>

        {/* Action & Profile Zone */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Refresh Action */}
          <button
            onClick={onRefresh}
            disabled={isSyncing}
            title={
              lastSyncTime
                ? `Dernière synchro: ${lastSyncTime.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : 'Synchroniser le planning'
            }
            aria-label="Synchroniser le planning"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-emerald-100 hover:text-white hover:bg-emerald-800/80 transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={`w-4 h-4 ${isSyncing ? 'animate-spin text-emerald-300' : ''}`}
            />
          </button>

          {/* Profile Switcher */}
          <button
            onClick={onOpenProfileSelector}
            className="flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-lg bg-emerald-800/80 hover:bg-emerald-800 border border-emerald-700/60 transition-colors text-left"
          >
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 shadow-xs"
              style={{ backgroundColor: currentEmployee?.color || '#166534' }}
            >
              {currentEmployee ? currentEmployee.name.charAt(0) : '?'}
            </div>
            <span className="text-xs font-medium text-white max-w-[85px] truncate">
              {currentEmployee ? currentEmployee.name : 'Choisir'}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-emerald-300/80 shrink-0" />
          </button>
        </div>
      </div>
    </header>
  );
};
