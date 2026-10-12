import React from 'react';
import { Calendar, Users, BarChart3, ShieldCheck } from 'lucide-react';

export type TabId = 'my-planning' | 'team-planning' | 'hours-analytics' | 'admin';

interface BottomNavProps {
  activeTab: TabId;
  onChangeTab: (tab: TabId) => void;
  showAdminTab?: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onChangeTab,
  showAdminTab = false,
}) => {
  const tabs = [
    {
      id: 'my-planning' as TabId,
      label: 'Mon Planning',
      icon: Calendar,
    },
    {
      id: 'team-planning' as TabId,
      label: 'Équipe',
      icon: Users,
    },
    {
      id: 'hours-analytics' as TabId,
      label: 'Heures',
      icon: BarChart3,
    },
    ...(showAdminTab
      ? [
          {
            id: 'admin' as TabId,
            label: 'Admin',
            icon: ShieldCheck,
          },
        ]
      : []),
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/80 shadow-[0_-4px_16px_rgba(0,0,0,0.04)]">
      <div
        className={`max-w-md mx-auto grid ${
          showAdminTab ? 'grid-cols-4' : 'grid-cols-3'
        } h-16 items-center px-1`}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onChangeTab(tab.id)}
              className={`flex flex-col items-center justify-center min-h-[48px] py-1 transition-colors select-none relative ${
                isActive ? 'text-emerald-700' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-transform duration-200 ${
                    isActive ? 'scale-110 stroke-[2.4]' : 'stroke-[1.8]'
                  }`}
                />
                {isActive && (
                  <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-emerald-600" />
                )}
              </div>
              <span
                className={`text-[10px] sm:text-[11px] mt-1 font-medium tracking-tight truncate max-w-full px-0.5 ${
                  isActive ? 'font-semibold text-emerald-800' : ''
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

