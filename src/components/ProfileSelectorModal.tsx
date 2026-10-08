import React from 'react';
import { Employee } from '../types/planning';
import { Check, X, ArrowRight, LockKeyhole } from 'lucide-react';

interface ProfileSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  currentEmployee: Employee | null;
  onSelectEmployee: (emp: Employee) => void;
  onLockToTokenGate?: () => void;
}

export const ProfileSelectorModal: React.FC<ProfileSelectorModalProps> = ({
  isOpen,
  onClose,
  employees,
  currentEmployee,
  onSelectEmployee,
  onLockToTokenGate,
}) => {
  if (!isOpen) return null;

  const handleChooseEmployee = (emp: Employee) => {
    onSelectEmployee(emp);
    onClose();
  };

  const handleLockAndExit = () => {
    if (onLockToTokenGate) {
      onLockToTokenGate();
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Choisir mon profil
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Sélectionnez votre profil pour consulter votre planning
            </p>
          </div>
          {currentEmployee && (
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Employee List */}
        <div className="p-4 overflow-y-auto space-y-2">
          {employees.map((emp) => {
            const isSelected = currentEmployee?.name === emp.name;
            return (
              <button
                key={emp.name}
                onClick={() => handleChooseEmployee(emp)}
                className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left ${
                  isSelected
                    ? 'border-emerald-600 bg-emerald-50/60 ring-1 ring-emerald-600/30'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 active:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-xs shrink-0"
                    style={{ backgroundColor: emp.color }}
                  >
                    {emp.name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">
                        {emp.name}
                      </span>
                      {emp.role && (
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                          {emp.role}
                        </span>
                      )}
                      {(emp.isAdmin ||
                        (emp.role && emp.role.trim().toLowerCase().includes('responsable')) ||
                        emp.name.trim().toLowerCase() === 'responsable') && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold border border-emerald-200 flex items-center gap-1">
                          <span>Admin</span>
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-500">
                      Consulter le planning
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {isSelected ? (
                    <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center text-white">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  ) : (
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer: Quitter vers l'écran de sécurité (Token Gate) */}
        {onLockToTokenGate && (
          <div className="p-3 bg-slate-50 border-t border-slate-100 text-center">
            <button
              onClick={handleLockAndExit}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors border border-rose-200/60 active:scale-[0.99]"
            >
              <LockKeyhole className="w-3.5 h-3.5 text-rose-600" />
              <span>Verrouiller & Revenir à l'écran de sécurité</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
