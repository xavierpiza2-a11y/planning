import React, { useState, useEffect, useMemo } from 'react';
import { Employee, MonthItem, Tableau2ShiftOption } from '../types/planning';
import { DEFAULT_TABLEAU2_SHIFTS } from '../config/constants';
import { fetchAvailableShifts, updateShiftInSheet, getStoredTableau2Shifts, getStoredDayNotes } from '../services/api';
import { CATEGORY_COLORS } from '../config/categoryStyles';
import {
  X,
  Clock,
  Calendar,
  User,
  Check,
  AlertTriangle,
  RefreshCw,
  Sun,
  Sunset,
  Briefcase,
  Home,
  GraduationCap,
  Sparkles,
} from 'lucide-react';

interface AdminShiftEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  selectedMonth: string;
  allMonths: MonthItem[];
  initialEmployee?: string;
  initialDate?: string;
  initialShift?: string;
  initialHours?: string;
  onShiftUpdated?: (employeeName: string, dateKey: string, shift: string, hours: string) => void;
}

export const AdminShiftEditModal: React.FC<AdminShiftEditModalProps> = ({
  isOpen,
  onClose,
  employees,
  selectedMonth,
  allMonths,
  initialEmployee,
  initialDate,
  initialShift,
  initialHours,
  onShiftUpdated,
}) => {
  const [targetEmployee, setTargetEmployee] = useState<string>(initialEmployee || employees[0]?.name || '');
  const [targetDate, setTargetDate] = useState<string>(initialDate || `${selectedMonth}-01`);
  const [dayNoteInput, setDayNoteInput] = useState<string>('');
  const [options, setOptions] = useState<Tableau2ShiftOption[]>(getStoredTableau2Shifts);
  const [selectedOptionId, setSelectedOptionId] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Sync initial values when opened
  useEffect(() => {
    if (isOpen) {
      if (initialEmployee) setTargetEmployee(initialEmployee);
      const effectiveDate = initialDate || `${selectedMonth}-01`;
      setTargetDate(effectiveDate);
      const notes = getStoredDayNotes(selectedMonth);
      setDayNoteInput(notes[effectiveDate] || '');
      setStatusMessage(null);

      // Try to find matching option
      if (initialShift || initialHours) {
        const match = options.find((opt) => {
          const shiftMatch = opt.shift.toUpperCase() === (initialShift || '').toUpperCase();
          const hoursMatch =
            !opt.hours ||
            opt.hours.replace(/\s+/g, '') === (initialHours || '').replace(/\s+/g, '');
          return shiftMatch && hoursMatch;
        });
        if (match) setSelectedOptionId(match.id);
        else setSelectedOptionId('');
      } else {
        setSelectedOptionId('');
      }

      // Refresh available shifts
      fetchAvailableShifts().then((shifts) => {
        if (shifts) setOptions(shifts);
      });
    }
  }, [isOpen, initialEmployee, initialDate, initialShift, initialHours, selectedMonth]);

  // Dynamically group options by category (Hook must always run before any return)
  const dynamicCategories = useMemo(() => {
    const map = new Map<string, Tableau2ShiftOption[]>();
    options.forEach((opt) => {
      const cat = opt.category || opt.shift || 'GÉNÉRAL';
      if (!map.has(cat)) {
        map.set(cat, []);
      }
      map.get(cat)!.push(opt);
    });
    return Array.from(map.entries());
  }, [options]);

  // Month days list for the selected month
  const daysList = useMemo(() => {
    if (!selectedMonth) return [];
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const daysInMonth = new Date(year, month, 0).getDate();

    const list: Array<{ dateKey: string; label: string }> = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = d < 10 ? `0${d}` : `${d}`;
      const dateKey = `${year}-${String(month).padStart(2, '0')}-${dStr}`;
      const dateObj = new Date(year, month - 1, d);
      const dayName = dateObj.toLocaleDateString('fr-FR', { weekday: 'short' });
      list.push({
        dateKey,
        label: `${dayName} ${d} ${dateObj.toLocaleDateString('fr-FR', { month: 'short' })}`,
      });
    }
    return list;
  }, [selectedMonth]);

  // Selected Option
  const chosenOption = options.find((o) => o.id === selectedOptionId);

  // Handle Save
  const handleSave = async () => {
    if (!chosenOption) {
      setStatusMessage({ type: 'error', text: 'Veuillez sélectionner un créneau horaire.' });
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);

    try {
      const res = await updateShiftInSheet(
        selectedMonth,
        targetEmployee,
        targetDate,
        chosenOption.shift,
        chosenOption.hours,
        dayNoteInput
      );

      if (res.success) {
        setStatusMessage({
          type: 'success',
          text: `Horaire enregistré avec succès pour ${targetEmployee} le ${targetDate} !`,
        });
        if (onShiftUpdated) {
          onShiftUpdated(targetEmployee, targetDate, chosenOption.shift, chosenOption.hours);
        }
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setStatusMessage({ type: 'error', text: res.message });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Erreur lors de la mise à jour.' });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-3xl max-w-lg w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-linear-to-r from-emerald-800 to-emerald-950 text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-700/80 flex items-center justify-center text-emerald-200">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold leading-tight">
                Modifier un horaire
              </h3>
              <p className="text-[11px] text-emerald-200/90 mt-0.5">
                Mode Admin · Référentiel Créneaux
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-emerald-200 hover:text-white hover:bg-emerald-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* Target Employee & Date Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-emerald-600" />
                <span>Salarié :</span>
              </label>
              <select
                value={targetEmployee}
                onChange={(e) => setTargetEmployee(e.target.value)}
                className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white transition-all"
              >
                {employees.map((emp) => (
                  <option key={emp.name} value={emp.name}>
                    {emp.name} {emp.role ? `(${emp.role})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                <span>Date du shift :</span>
              </label>
              <select
                value={targetDate}
                onChange={(e) => {
                  const newDate = e.target.value;
                  setTargetDate(newDate);
                  const notes = getStoredDayNotes(selectedMonth);
                  setDayNoteInput(notes[newDate] || '');
                }}
                className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white transition-all"
              >
                {daysList.map((d) => (
                  <option key={d.dateKey} value={d.dateKey}>
                    {d.label} ({d.dateKey})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Day Note Input */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-600" />
                <span>Information / RDV / Réunion du jour :</span>
              </span>
              {dayNoteInput && (
                <button
                  type="button"
                  onClick={() => setDayNoteInput('')}
                  className="text-[10px] text-slate-400 hover:text-rose-600 font-normal"
                >
                  Effacer l'info
                </button>
              )}
            </label>
            <input
              type="text"
              placeholder="Ex : Réunion équipe 14h, RDV médecine du travail, Inventaire..."
              value={dayNoteInput}
              onChange={(e) => setDayNoteInput(e.target.value)}
              className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-white placeholder:text-slate-400 font-medium"
            />
          </div>

          {/* Current Values Info Box */}
          {(initialShift || initialHours) && (
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
              <span>Horaire actuel au planning :</span>
              <span className="font-bold text-slate-900">
                {initialShift || '—'} {initialHours ? `(${initialHours})` : ''}
              </span>
            </div>
          )}

          {/* Selectable Options strictly corresponding to Créneaux */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Choix des créneaux horaires :
              </span>
              <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                Conforme Feuille 1
              </span>
            </div>

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {dynamicCategories.map(([catName, shiftOpts]) => (
                <div key={catName}>
                  <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                    <Clock className="w-3 h-3 text-emerald-700" />
                    <span>{catName}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {shiftOpts.map((opt) => {
                      const isSelected = selectedOptionId === opt.id;
                      const col =
                        CATEGORY_COLORS.find((c) => c.id === opt.color) || CATEGORY_COLORS[0];
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setSelectedOptionId(opt.id)}
                          className={`p-2.5 rounded-xl border text-left text-xs transition-all flex items-center justify-between shadow-2xs ${
                            isSelected
                              ? 'border-emerald-600 ring-2 ring-emerald-500 bg-emerald-50 text-emerald-950 font-bold'
                              : `${col.badgeBg} ${col.badgeBorder} ${col.badgeText} hover:opacity-90`
                          }`}
                        >
                          <div className="min-w-0 flex-1 pr-2">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${col.dot} ring-1 ring-black/15`}
                              />
                              <p className="font-bold truncate">{opt.label}</p>
                            </div>
                            {opt.hours && (
                              <p className="text-[10px] font-mono mt-0.5 opacity-80">{opt.hours}</p>
                            )}
                            {opt.description && (
                              <p className="text-[10px] opacity-70 truncate mt-0.5">{opt.description}</p>
                            )}
                          </div>
                          <div
                            className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ml-2 ${
                              isSelected ? 'bg-emerald-700 text-white' : 'border border-slate-300'
                            }`}
                          >
                            {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {options.length === 0 && (
                <div className="p-5 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-2">
                  <p className="text-xs font-bold text-slate-700">
                    Aucun créneau configuré
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Les créneaux ont été remis à zéro. Rendez-vous dans l'onglet « Créneaux & Excel » pour en ajouter ou recharger les exemples.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Status Message */}
          {statusMessage && (
            <div
              className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}
        </div>

        {/* Footer Action */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors"
          >
            Annuler
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={!chosenOption || isSaving}
            className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 rounded-xl transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Enregistrement...</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Enregistrer l'horaire</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
