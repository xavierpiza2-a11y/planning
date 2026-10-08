import React, { useState, useMemo, useRef } from 'react';
import { Employee, EmployeeMonthSchedule, MonthItem } from '../types/planning';
import { MonthSelector } from './MonthSelector';
import { ShiftBadge } from './ShiftBadge';
import { categorizeShift } from '../config/constants';
import { exportTeamPlanningToPDF } from '../services/pdfExport';
import { AdminShiftEditModal } from './AdminShiftEditModal';
import { DayNoteModal } from './DayNoteModal';
import { getStoredAdminPin } from './AdminView';
import { getStoredTableau2Shifts, getStoredDayNotes } from '../services/api';
import {
  Users,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Search,
  CalendarCheck,
  CheckCircle2,
  Home,
  UserX,
  Download,
  Edit3,
  ShieldCheck,
  Lock,
  X,
  AlertTriangle,
} from 'lucide-react';

interface TeamViewProps {
  storeName?: string;
  employees: Employee[];
  currentEmployee?: Employee | null;
  teamSchedules: Record<string, EmployeeMonthSchedule>;
  isLoading: boolean;
  selectedMonth: string;
  allMonths: MonthItem[];
  visibleMonths: string[];
  isAdminActive?: boolean;
  onSetAdminActive?: (active: boolean) => void;
  onSelectMonth: (monthKey: string) => void;
  onRefresh: () => void;
  onShiftUpdated?: (employeeName: string, dateKey: string, shift: string, hours: string) => void;
}

export const TeamView: React.FC<TeamViewProps> = ({
  storeName,
  employees,
  currentEmployee,
  teamSchedules,
  isLoading,
  selectedMonth,
  allMonths,
  visibleMonths,
  isAdminActive,
  onSetAdminActive,
  onSelectMonth,
  onRefresh,
  onShiftUpdated,
}) => {
  // Default to day view as requested
  const [viewMode, setViewMode] = useState<'day' | 'matrix'>('day');
  const [searchFilter, setSearchFilter] = useState('');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfSuccess, setPdfSuccess] = useState(false);

  // Admin Shift Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editTargetEmployee, setEditTargetEmployee] = useState<string>('');
  const [editTargetDate, setEditTargetDate] = useState<string>('');
  const [editInitialShift, setEditInitialShift] = useState<string>('');
  const [editInitialHours, setEditInitialHours] = useState<string>('');

  // Day Note Modal State & reactive version
  const [isDayNoteModalOpen, setIsDayNoteModalOpen] = useState(false);
  const [targetNoteDate, setTargetNoteDate] = useState<string>('');
  const [targetInitialNote, setTargetInitialNote] = useState<string>('');
  const [notesVersion, setNotesVersion] = useState(0);

  // Day notes for the current month
  const monthDayNotes = useMemo(() => {
    return getStoredDayNotes(selectedMonth);
  }, [selectedMonth, teamSchedules, notesVersion]);

  const handleOpenDayNoteModal = (dateKey: string) => {
    setTargetNoteDate(dateKey);
    const notes = getStoredDayNotes(selectedMonth);
    setTargetInitialNote(notes[dateKey] || '');
    setIsDayNoteModalOpen(true);
  };

  // Local Admin active state if not controlled by parent App
  const [localAdminActive, setLocalAdminActive] = useState<boolean>(false);
  const isCurrentlyAdminActive = isAdminActive !== undefined ? isAdminActive : localAdminActive;
  const setAdminActiveState = onSetAdminActive || setLocalAdminActive;

  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [pendingTarget, setPendingTarget] = useState<{
    empName: string;
    dateKey: string;
    shift?: string;
    hours?: string;
  } | null>(null);

  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const todayHeaderRef = useRef<HTMLTableHeaderCellElement | null>(null);

  // Check if current logged-in employee has Admin rights (Responsable is permanently admin)
  const isResponsableAdmin = Boolean(
    currentEmployee?.isAdmin ||
      currentEmployee?.name?.trim().toLowerCase() === 'responsable' ||
      (currentEmployee?.role && currentEmployee.role.trim().toLowerCase().includes('responsable'))
  );

  // Month label
  const currentMonthItem = useMemo(() => {
    return allMonths.find((m) => m.key === selectedMonth);
  }, [allMonths, selectedMonth]);
  const monthLabel = currentMonthItem?.label || selectedMonth;

  // Today string YYYY-MM-DD
  const todayStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  // Selected date for day view
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (todayStr.startsWith(selectedMonth)) {
      return todayStr;
    }
    return `${selectedMonth}-01`;
  });

  // Keep selectedDate in sync with selectedMonth
  React.useEffect(() => {
    setSelectedDate((current) => {
      if (!current.startsWith(selectedMonth)) {
        return todayStr.startsWith(selectedMonth) ? todayStr : `${selectedMonth}-01`;
      }
      return current;
    });
  }, [selectedMonth, todayStr]);

  // Days list for the current month
  const monthDays = useMemo(() => {
    if (!selectedMonth) return [];
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const totalDays = new Date(year, month, 0).getDate();

    const days: Array<{
      dateKey: string;
      dayNumber: number;
      dayNameShort: string;
      dayNameFull: string;
      isWeekend: boolean;
    }> = [];

    for (let d = 1; d <= totalDays; d++) {
      const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dateObj = new Date(year, month - 1, d);
      const dayNameShort = dateObj.toLocaleDateString('fr-FR', { weekday: 'short' });
      const dayNameFull = dateObj.toLocaleDateString('fr-FR', { weekday: 'long' });
      const dayOfWeek = dateObj.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      days.push({
        dateKey,
        dayNumber: d,
        dayNameShort: dayNameShort.replace('.', ''),
        dayNameFull,
        isWeekend,
      });
    }
    return days;
  }, [selectedMonth]);

  // Navigate day by day
  const handlePrevDay = () => {
    const idx = monthDays.findIndex((m) => m.dateKey === selectedDate);
    if (idx > 0) {
      setSelectedDate(monthDays[idx - 1].dateKey);
    }
  };

  const handleNextDay = () => {
    const idx = monthDays.findIndex((m) => m.dateKey === selectedDate);
    if (idx < monthDays.length - 1) {
      setSelectedDate(monthDays[idx + 1].dateKey);
    }
  };

  // Scroll to today's column in the matrix view
  const scrollToTodayColumn = () => {
    if (todayHeaderRef.current) {
      todayHeaderRef.current.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  };

  // Filtered employees list
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) =>
      emp.name.toLowerCase().includes(searchFilter.toLowerCase().trim())
    );
  }, [employees, searchFilter]);

  // Helper to determine day status (Présent, Repos, Absent) from créneau setting or category fallback
  const getShiftDayStatus = (shiftText: string, hoursText?: string): 'PRESENT' | 'REPOS' | 'ABSENT' => {
    const s = (shiftText || '').trim();
    const h = (hoursText || '').trim();

    if (!s && !h) return 'REPOS';

    const storedCreneaux = typeof window !== 'undefined' ? getStoredTableau2Shifts() : [];

    // Priority 1: Exact match on shift code AND hours
    let match = storedCreneaux.find(
      (o) =>
        o.shift.toUpperCase() === s.toUpperCase() &&
        (o.hours || '').replace(/\s+/g, '') === h.replace(/\s+/g, '')
    );

    // Priority 2: Exact label match
    if (!match) {
      match = storedCreneaux.find((o) => o.label.toLowerCase() === s.toLowerCase());
    }

    // Priority 3: Match on shift code alone
    if (!match) {
      match = storedCreneaux.find((o) => o.shift.toUpperCase() === s.toUpperCase());
    }

    if (match?.dayStatus) {
      return match.dayStatus;
    }

    const cat = categorizeShift(s, h);
    if (cat === 'REPOS') return 'REPOS';
    if (cat === 'CONGES' || cat === 'RTT') return 'ABSENT';
    return 'PRESENT';
  };

  // Breakdown for Day View: "Présents", "Repos", "Absents"
  const dayBreakdown = useMemo(() => {
    const presents: Array<{ emp: Employee; shift: string; hours?: string; info?: string; status: 'PRESENT' | 'REPOS' | 'ABSENT' }> = [];
    const repos: Array<{ emp: Employee; shift: string; hours?: string; info?: string; status: 'PRESENT' | 'REPOS' | 'ABSENT' }> = [];
    const absents: Array<{ emp: Employee; shift: string; hours?: string; info?: string; status: 'PRESENT' | 'REPOS' | 'ABSENT' }> = [];

    filteredEmployees.forEach((emp) => {
      const schedule = teamSchedules[emp.name];
      const dayData = schedule?.days ? schedule.days[selectedDate] : undefined;
      const shift = dayData?.shift || '';
      const hours = dayData?.hours;
      const info = dayData?.info;

      const status = getShiftDayStatus(shift, hours);
      const item = { emp, shift, hours, info, status };

      if (status === 'PRESENT') {
        presents.push(item);
      } else if (status === 'REPOS') {
        repos.push(item);
      } else {
        absents.push(item);
      }
    });

    return { presents, repos, absents };
  }, [filteredEmployees, teamSchedules, selectedDate]);

  const currentDayIndex = monthDays.findIndex((m) => m.dateKey === selectedDate);
  const isMonthContainingToday = monthDays.some((m) => m.dateKey === todayStr);

  // Auto-scroll to today's column in the matrix view
  React.useEffect(() => {
    if (!isLoading && viewMode === 'matrix' && isMonthContainingToday) {
      const doScroll = () => {
        if (todayHeaderRef.current) {
          todayHeaderRef.current.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
      };
      const t1 = setTimeout(doScroll, 100);
      const t2 = setTimeout(doScroll, 350);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [isLoading, viewMode, selectedMonth, isMonthContainingToday]);

  // PDF Export Handler (Single page Landscape A4 with export timestamp at footer)
  const handleExportPDF = () => {
    setIsExportingPdf(true);
    try {
      exportTeamPlanningToPDF({
        monthKey: selectedMonth,
        monthLabel,
        employees,
        teamSchedules,
        storeName,
      });
      setPdfSuccess(true);
      setTimeout(() => setPdfSuccess(false), 3000);
    } catch (err) {
      console.error('Erreur lors de la création du PDF:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Open Admin Edit Modal
  const handleOpenEditModal = (
    empName?: string,
    dateKey?: string,
    currentShift?: string,
    currentHours?: string
  ) => {
    setEditTargetEmployee(empName || employees[0]?.name || '');
    setEditTargetDate(dateKey || (todayStr.startsWith(selectedMonth) ? todayStr : `${selectedMonth}-01`));
    setEditInitialShift(currentShift || '');
    setEditInitialHours(currentHours || '');
    setIsEditModalOpen(true);
  };

  // Request shift modification protected by Admin PIN
  const handleRequestShiftEdit = (
    empName: string,
    dateKey: string,
    currentShift?: string,
    currentHours?: string
  ) => {
    // Mode admin MUST be activated! No automatic bypass for any profile!
    if (isCurrentlyAdminActive) {
      handleOpenEditModal(empName, dateKey, currentShift, currentHours);
    } else {
      setPendingTarget({ empName, dateKey, shift: currentShift, hours: currentHours });
      setPinInput('');
      setPinError('');
      setIsPinModalOpen(true);
    }
  };

  // Verify PIN entered by user to activate Mode Admin
  const handleVerifyPin = (e: React.FormEvent) => {
    e.preventDefault();
    const storedPin = getStoredAdminPin();
    if (pinInput.trim() === storedPin.trim()) {
      setAdminActiveState(true);
      setIsPinModalOpen(false);
      if (pendingTarget) {
        handleOpenEditModal(
          pendingTarget.empName,
          pendingTarget.dateKey,
          pendingTarget.shift,
          pendingTarget.hours
        );
        setPendingTarget(null);
      }
    } else {
      setPinError("Code PIN incorrect. Le mode administrateur n'a pas pu être activé.");
    }
  };

  // Automatically scroll to today when switching to matrix view
  React.useEffect(() => {
    if (viewMode === 'matrix' && isMonthContainingToday) {
      const timer = setTimeout(() => {
        scrollToTodayColumn();
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [viewMode, isMonthContainingToday, selectedMonth]);

  return (
    <div className="space-y-4 pb-20">
      {/* Month Navigation */}
      <MonthSelector
        allMonths={allMonths}
        visibleMonths={visibleMonths}
        selectedMonth={selectedMonth}
        onSelectMonth={onSelectMonth}
      />

      {/* Top Action Bar: View Switcher, PDF Export & Mode Admin Status */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          {/* View Switcher */}
          <div className="inline-flex p-1 bg-slate-200/70 rounded-lg text-xs font-medium shrink-0">
            <button
              onClick={() => setViewMode('day')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                viewMode === 'day'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Vue par Jour</span>
            </button>
            <button
              onClick={() => setViewMode('matrix')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                viewMode === 'matrix'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Vue Mensuelle</span>
            </button>
          </div>

          {/* PDF Export Button (Landscape single-sheet) */}
          <button
            type="button"
            onClick={handleExportPDF}
            disabled={isExportingPdf}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white text-xs font-bold rounded-lg shadow-2xs transition-all active:scale-98 disabled:opacity-50"
            title="Exporter tout le planning de l'équipe au format PDF (1 page paysage A4 avec date d'export)"
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span>{pdfSuccess ? 'PDF Téléchargé !' : 'Exporter PDF'}</span>
          </button>

          {/* Mode Admin Status Badge / Activation Button */}
          {isCurrentlyAdminActive ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100/90 border border-emerald-300 text-emerald-950 text-xs font-bold rounded-lg shadow-2xs">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <span>Mode Admin Actif</span>
              <button
                type="button"
                onClick={() => setAdminActiveState(false)}
                className="ml-1 text-[10px] text-emerald-800 hover:text-emerald-950 underline font-semibold cursor-pointer"
                title="Désactiver le mode administrateur"
              >
                (Verrouiller)
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setPendingTarget(null);
                setPinInput('');
                setPinError('');
                setIsPinModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors shadow-2xs"
              title="Activer le mode administrateur avec votre code PIN"
            >
              <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>Activer Mode Admin</span>
            </button>
          )}
        </div>

        {/* Action Controls: Today Jump & Search */}
        <div className="flex items-center gap-2">
          {viewMode === 'matrix' && isMonthContainingToday && (
            <button
              onClick={scrollToTodayColumn}
              className="text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 shrink-0"
            >
              <CalendarCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Aujourd'hui</span>
            </button>
          )}

          <div className="relative flex-1 sm:w-48">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Filtrer un salarié..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3 py-6">
          <div className="h-16 bg-slate-200/60 rounded-xl animate-pulse" />
          <div className="h-16 bg-slate-200/60 rounded-xl animate-pulse" />
          <div className="h-16 bg-slate-200/60 rounded-xl animate-pulse" />
        </div>
      ) : viewMode === 'matrix' ? (
        /* VUE MENSUELLE ÉQUIPE : NOMS DE SALARIÉS EN COLONNE (À GAUCHE) ET DATES EN LIGNE AU-DESSUS (EN-TÊTE) */
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div ref={tableContainerRef} className="overflow-x-auto max-h-[75vh] overflow-y-auto">
            <table className="w-full border-collapse text-left text-xs">
              {/* Ligne au-dessus : Les dates du mois avec nom du jour + numéro */}
              <thead className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-xs shadow-xs">
                <tr className="border-b border-slate-200">
                  {/* Colonne fixe des salariés à gauche */}
                  <th className="sticky left-0 z-40 bg-slate-100/95 backdrop-blur-xs p-3 font-bold text-slate-800 min-w-[110px] border-r border-slate-200 shadow-xs">
                    Salarié
                  </th>

                  {/* Dates en ligne au-dessus */}
                  {monthDays.map((d) => {
                    const isToday = d.dateKey === todayStr;

                    return (
                      <th
                        key={d.dateKey}
                        ref={isToday ? todayHeaderRef : null}
                        className={`p-2 text-center min-w-[70px] border-r border-slate-200 select-none ${
                          isToday
                            ? 'bg-emerald-100/90 text-emerald-950 font-bold'
                            : d.isWeekend
                            ? 'bg-slate-100/70 text-slate-500'
                            : 'text-slate-700'
                        }`}
                      >
                        <div className="flex flex-col items-center justify-center leading-tight">
                          <span
                            className={`text-[10px] uppercase font-bold ${
                              isToday
                                ? 'text-emerald-800'
                                : d.isWeekend
                                ? 'text-slate-400'
                                : 'text-slate-500'
                            }`}
                          >
                            {d.dayNameShort}
                          </span>
                          <span
                            className={`text-sm font-extrabold mt-0.5 tabular-nums ${
                              isToday
                                ? 'w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center'
                                : ''
                            }`}
                          >
                            {d.dayNumber}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              {/* Lignes du tableau : 1 ligne par salarié */}
              <tbody className="divide-y divide-slate-100">
                {/* Ligne "Infos / Événements du jour" (en dessous de l'en-tête de date, bien lisible) */}
                <tr className="bg-amber-50/70 border-b-2 border-amber-300">
                  <td className="sticky left-0 z-20 bg-amber-100/95 p-2 font-bold text-amber-950 border-r border-amber-300 shadow-xs whitespace-nowrap">
                    <div className="flex items-center gap-1.5 text-xs text-amber-900 font-bold">
                      <Calendar className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                      <span>Infos du jour</span>
                    </div>
                  </td>

                  {monthDays.map((d) => {
                    const note = monthDayNotes[d.dateKey];
                    const isToday = d.dateKey === todayStr;

                    return (
                      <td
                        key={`day-note-${d.dateKey}`}
                        onClick={() => handleOpenDayNoteModal(d.dateKey)}
                        className={`p-1 text-center border-r border-amber-200/80 align-middle cursor-pointer hover:bg-amber-100 transition-colors ${
                          isToday ? 'bg-amber-100/70' : ''
                        }`}
                        title={
                          note
                            ? `Information du ${d.dateKey} : ${note} (Cliquer pour modifier)`
                            : `Cliquer pour ajouter une information le ${d.dateKey}`
                        }
                      >
                        {note ? (
                          <div className="px-1.5 py-1 rounded bg-amber-100 border border-amber-300 text-amber-950 font-bold text-[10px] leading-snug line-clamp-2 max-w-[85px] mx-auto shadow-2xs">
                            {note}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-300 hover:text-amber-700 font-bold transition-colors">
                            +
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>

                {filteredEmployees.map((emp) => {
                  const schedule = teamSchedules[emp.name];

                  return (
                    <tr key={emp.name} className="hover:bg-slate-50/60 transition-colors">
                      {/* Colonne fixe salarié à gauche avec stylo de modification */}
                      <td className="sticky left-0 z-20 bg-white p-2.5 font-semibold text-slate-900 border-r border-slate-200 whitespace-nowrap shadow-xs">
                        <div className="flex items-center justify-between gap-1.5 w-full">
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 shadow-2xs"
                              style={{ backgroundColor: emp.color }}
                            >
                              {emp.name.charAt(0)}
                            </div>
                            <span className="truncate max-w-[85px]">{emp.name}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRequestShiftEdit(emp.name, selectedDate)}
                            className="p-1 rounded-md text-slate-400 hover:text-amber-700 hover:bg-amber-50 transition-colors"
                            title={`Modifier l'horaire de ${emp.name} (Accès Administrateur · PIN)`}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* Colonnes dates */}
                      {monthDays.map((d) => {
                        const dayData = schedule?.days ? schedule.days[d.dateKey] : undefined;
                        const shift = dayData?.shift || '';
                        const hours = dayData?.hours;
                        const isToday = d.dateKey === todayStr;

                        return (
                          <td
                            key={d.dateKey}
                            onClick={() => handleRequestShiftEdit(emp.name, d.dateKey, shift, hours)}
                            className={`p-1.5 text-center border-r border-slate-100 align-middle transition-colors cursor-pointer hover:bg-emerald-100/70 hover:ring-1 hover:ring-emerald-500 ${
                              isToday
                                ? 'bg-emerald-50/50'
                                : d.isWeekend
                                ? 'bg-slate-50/40'
                                : ''
                            }`}
                            title={`Cliquer pour modifier l'horaire de ${emp.name} le ${d.dateKey} (Accès Administrateur · PIN)`}
                          >
                            {shift || hours ? (
                              <div className="flex flex-col items-center justify-center">
                                <ShiftBadge
                                  shift={shift}
                                  hours={hours}
                                  compact={true}
                                />
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-300">·</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* VUE PAR JOUR DE L'ÉQUIPE (Suppression horaire sous nom, bulle 'présent' au lieu de 'matin'/'soir'/'journée') */
        <div className="space-y-4">
          {/* Day Navigation Bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-xs flex items-center justify-between gap-3">
            <button
              onClick={handlePrevDay}
              disabled={currentDayIndex <= 0}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="text-center min-w-0">
              <p className="text-xs uppercase tracking-wider font-bold text-emerald-800 capitalize">
                {monthDays[currentDayIndex]?.dayNameFull} {monthDays[currentDayIndex]?.dayNumber} {selectedMonth}
              </p>
              {selectedDate === todayStr && (
                <span className="inline-block mt-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                  Aujourd'hui
                </span>
              )}
            </div>

            <button
              onClick={handleNextDay}
              disabled={currentDayIndex >= monthDays.length - 1}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Quick summary counters: "Présents", "Repos", "Absents" */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-xl p-3 text-center shadow-xs">
              <div className="flex items-center justify-center gap-1.5 text-emerald-800 text-[11px] font-bold uppercase">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Présents</span>
              </div>
              <p className="text-2xl font-black text-emerald-950 mt-1 tabular-nums">
                {dayBreakdown.presents.length}
              </p>
            </div>

            <div className="bg-slate-100/80 border border-slate-200/80 rounded-xl p-3 text-center shadow-xs">
              <div className="flex items-center justify-center gap-1.5 text-slate-600 text-[11px] font-bold uppercase">
                <Home className="w-3.5 h-3.5 text-slate-500" />
                <span>Repos</span>
              </div>
              <p className="text-2xl font-black text-slate-800 mt-1 tabular-nums">
                {dayBreakdown.repos.length}
              </p>
            </div>

            <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-3 text-center shadow-xs">
              <div className="flex items-center justify-center gap-1.5 text-amber-800 text-[11px] font-bold uppercase">
                <UserX className="w-3.5 h-3.5 text-amber-600" />
                <span>Absents</span>
              </div>
              <p className="text-2xl font-black text-amber-950 mt-1 tabular-nums">
                {dayBreakdown.absents.length}
              </p>
            </div>
          </div>

          {/* Information sur le jour (juste au dessus du premier salarié) */}
          {monthDayNotes[selectedDate] ? (
            <div className="bg-amber-50/90 border border-amber-300/90 rounded-xl p-3 shadow-2xs flex items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-amber-200/80 text-amber-900 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                  <Calendar className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider block">
                    Information du jour
                  </span>
                  <p className="text-xs font-bold text-amber-950 mt-0.5 leading-snug">
                    {monthDayNotes[selectedDate]}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleOpenDayNoteModal(selectedDate)}
                className="p-1.5 rounded-lg text-amber-800 hover:text-amber-950 hover:bg-amber-200/60 transition-colors shrink-0"
                title="Modifier l'information de ce jour"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => handleOpenDayNoteModal(selectedDate)}
              className="w-full py-2 px-3 rounded-xl border border-dashed border-slate-300 hover:border-amber-400 bg-slate-50/70 hover:bg-amber-50/50 text-slate-600 hover:text-amber-900 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors group shadow-2xs"
              title="Ajouter un RDV, une réunion ou une information sur cette journée"
            >
              <Calendar className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-600" />
              <span>+ Ajouter une information sur ce jour (réunion, rdv, note...)</span>
            </button>
          )}

          {/* Employee list for the day */}
          <div className="space-y-2">
            {filteredEmployees.map((emp) => {
              const schedule = teamSchedules[emp.name];
              const dayData = schedule?.days ? schedule.days[selectedDate] : undefined;
              const rawShift = (dayData?.shift || '').trim();
              const hours = dayData?.hours;
              const info = dayData?.info;
              const status = getShiftDayStatus(rawShift, hours);

              return (
                <div
                  key={emp.name}
                  className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs hover:border-slate-300 transition-colors flex items-center justify-between gap-3"
                >
                  {/* Left: Avatar & Name */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 shadow-xs"
                      style={{ backgroundColor: emp.color }}
                    >
                      {emp.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-slate-900 truncate">
                          {emp.name}
                        </span>
                        {emp.role && (
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1 rounded font-medium">
                            {emp.role}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Badge according to créneau dayStatus setting */}
                  <div className="shrink-0 flex items-center gap-2">
                    {status === 'PRESENT' ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg border bg-emerald-50 text-emerald-950 border-emerald-200 shadow-2xs">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>Présent</span>
                        </span>
                        {hours && (
                          <span className="text-xs font-semibold text-slate-700">
                            {hours}
                          </span>
                        )}
                      </div>
                    ) : status === 'ABSENT' ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg border bg-amber-50 text-amber-950 border-amber-200 shadow-2xs">
                          <UserX className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>Absent {rawShift && rawShift !== 'ABSENT' ? `(${rawShift})` : ''}</span>
                        </span>
                        {hours && (
                          <span className="text-[11px] font-medium text-slate-600">
                            {hours}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg border bg-slate-100 text-slate-800 border-slate-200 shadow-2xs">
                          <Home className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span>Repos {rawShift && rawShift.toUpperCase() !== 'REPOS' ? `(${rawShift})` : ''}</span>
                        </span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => handleRequestShiftEdit(emp.name, selectedDate, rawShift, hours)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-amber-700 hover:bg-amber-50 transition-colors"
                      title={`Modifier l'horaire de ${emp.name} (Accès Administrateur · PIN)`}
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Admin PIN Prompt Modal */}
      {isPinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xl max-w-sm w-full space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Accès Administrateur
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Modification protégée par code PIN
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsPinModalOpen(false);
                  setPendingTarget(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              La modification des plannings est réservée à l'administrateur. Saisissez votre code PIN pour continuer :
            </p>

            <form onSubmit={handleVerifyPin} className="space-y-3">
              <div>
                <input
                  type="password"
                  inputMode="numeric"
                  autoFocus
                  maxLength={6}
                  placeholder="Code PIN (6 chiffres)"
                  value={pinInput}
                  onChange={(e) => {
                    setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6));
                    if (pinError) setPinError('');
                  }}
                  className="w-full text-center text-lg font-mono font-bold tracking-widest px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-slate-50"
                />
              </div>

              {pinError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{pinError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsPinModalOpen(false);
                    setPendingTarget(null);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={!pinInput.trim()}
                  className="px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-xs disabled:opacity-50"
                >
                  Déverrouiller
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Shift Edit Modal */}
      <AdminShiftEditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        employees={employees}
        selectedMonth={selectedMonth}
        allMonths={allMonths}
        initialEmployee={editTargetEmployee}
        initialDate={editTargetDate}
        initialShift={editInitialShift}
        initialHours={editInitialHours}
        onShiftUpdated={(empName, dateKey, shift, hours) => {
          if (onShiftUpdated) {
            onShiftUpdated(empName, dateKey, shift, hours);
          }
          if (onRefresh) {
            onRefresh();
          }
        }}
      />

      {/* Day Note Modal for adding/editing day information */}
      <DayNoteModal
        isOpen={isDayNoteModalOpen}
        onClose={() => setIsDayNoteModalOpen(false)}
        dateKey={targetNoteDate}
        monthKey={selectedMonth}
        initialNote={targetInitialNote}
        onSaved={(_dKey, _note) => {
          setNotesVersion((v) => v + 1);
          if (onRefresh) {
            onRefresh();
          }
        }}
      />
    </div>
  );
};
