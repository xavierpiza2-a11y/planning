import React, { useState, useEffect } from 'react';
import { Employee, MonthItem, Tableau2ShiftOption, EmployeeMonthSchedule } from '../types/planning';
import {
  DEFAULT_ADMIN_PIN,
  DEFAULT_API_TOKEN,
  DEFAULT_TABLEAU2_SHIFTS,
  DEFAULT_STORE_NAME,
  DEFAULT_EMPLOYEES,
} from '../config/constants';
import {
  getApiToken,
  setApiToken,
  saveApiToken,
  getStoredAdminPin,
  setStoredAdminPin,
  saveAdminPin,
  verifyAdminPin,
  saveEmployees,
  saveVisibleMonths,
  saveAllMonths,
  deleteMonthData,
  getCalendarDaysForMonth,
  fetchAvailableShifts,
  updateShiftInSheet,
  getStoredTableau2Shifts,
  renameEmployeeData,
  ensureResponsableAdmin,
  saveStoreName,
  getStoreName,
  resetToCleanStore,
  getStoredDayNotes,
} from '../services/api';
import {
  checkPushPermission,
  requestPushPermission,
  testPushNotification,
} from '../services/onesignal';
import { exportTeamPlanningToPDF } from '../services/pdfExport';
import { AdminExcelSection } from './AdminExcelSection';
import { AdminTableau2Section } from './AdminTableau2Section';
import { AdminDatabaseSection } from './AdminDatabaseSection';
import {
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  Users,
  Calendar,
  Settings,
  Code2,
  Trash2,
  Plus,
  RefreshCw,
  Check,
  Copy,
  Activity,
  ArrowUp,
  ArrowDown,
  Lock,
  LockKeyhole,
  Clock,
  Download,
  Edit3,
  FileSpreadsheet,
  Sun,
  Sunset,
  Briefcase,
  Home,
  GraduationCap,
  Sparkles,
  AlertTriangle,
  X,
  Bell,
  CalendarDays,
  CheckCircle2,
  Info,
} from 'lucide-react';

export { getStoredAdminPin, setStoredAdminPin };

// Helpers for Month formatting & calendar metadata
export const getFrenchMonthLabel = (key: string): string => {
  const [yStr, mStr] = (key || '').split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(y) || isNaN(m) || m < 1 || m > 12) return key;
  const d = new Date(y, m - 1, 1);
  const monthName = d.toLocaleDateString('fr-FR', { month: 'long' });
  const capitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  return `${capitalized} ${y}`;
};

export const getExcelTabLabel = (key: string): string => {
  const [yStr, mStr] = (key || '').split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(y) || isNaN(m) || m < 1 || m > 12) return key;
  const d = new Date(y, m - 1, 1);
  const monthName = d.toLocaleDateString('fr-FR', { month: 'long' }).toUpperCase();
  const shortYear = String(y).slice(-2);
  return `${monthName} ${shortYear}`;
};

export const getMonthCalendarSummary = (key: string): string => {
  const [yStr, mStr] = (key || '').split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(y) || isNaN(m) || m < 1 || m > 12) return '';
  const daysInMonth = new Date(y, m, 0).getDate();
  const firstDay = new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { weekday: 'long' });
  const lastDay = new Date(y, m - 1, daysInMonth).toLocaleDateString('fr-FR', { weekday: 'long' });
  return `${daysInMonth} jours (du ${firstDay} 1er au ${lastDay} ${daysInMonth})`;
};

interface AdminViewProps {
  storeName?: string;
  onUpdateStoreName?: (name: string) => void;
  currentEmployee?: Employee | null;
  employees: Employee[];
  allMonths: MonthItem[];
  visibleMonths: string[];
  teamSchedules?: Record<string, any>;
  isAdminActive?: boolean;
  onSetAdminActive?: (active: boolean) => void;
  onUpdateEmployees: (employees: Employee[]) => void;
  onUpdateVisibleMonths: (months: string[]) => void;
  onUpdateAllMonths?: (months: MonthItem[]) => void;
  onSwitchToProfile?: (emp: Employee) => void;
  onShiftUpdated?: (employeeName: string, dateKey: string, shift: string, hours: string) => void;
  onPlanningImported?: (
    monthKey: string,
    teamSchedules: Record<string, any>,
    updatedEmployees?: Employee[]
  ) => void;
}

export const AdminView: React.FC<AdminViewProps> = ({
  storeName,
  onUpdateStoreName,
  currentEmployee,
  employees,
  allMonths,
  visibleMonths,
  teamSchedules,
  isAdminActive,
  onSetAdminActive,
  onUpdateEmployees,
  onUpdateVisibleMonths,
  onUpdateAllMonths,
  onSwitchToProfile,
  onShiftUpdated,
  onPlanningImported,
}) => {
  // Authentication state
  const [localAuth, setLocalAuth] = useState(false);
  const isAuthenticated = isAdminActive !== undefined ? isAdminActive : localAuth;
  const setAuth = (val: boolean) => {
    setLocalAuth(val);
    onSetAdminActive?.(val);
  };
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  // Active Admin Sub-tab: Default to Excel tab as requested
  const [adminTab, setAdminTab] = useState<
    'excel' | 'shifts_reference' | 'shifts' | 'team' | 'months' | 'connection'
  >('excel');

  // Shifts Direct Modification State (Strictly Tableau 2 choices)
  const [shiftEditMonth, setShiftEditMonth] = useState<string>(
    visibleMonths[0] || allMonths[0]?.key || '2026-09'
  );
  const [shiftEditEmployee, setShiftEditEmployee] = useState<string>(
    employees[0]?.name || ''
  );
  const [shiftEditDate, setShiftEditDate] = useState<string>(
    () => `${visibleMonths[0] || '2026-09'}-01`
  );
  const [shiftEditOptionId, setShiftEditOptionId] = useState<string>('repos');
  const [tableau2Options, setTableau2Options] = useState<Tableau2ShiftOption[]>(
    getStoredTableau2Shifts
  );
  const [isUpdatingShift, setIsUpdatingShift] = useState(false);
  const [shiftUpdateStatus, setShiftUpdateStatus] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [isExportingTeamPdf, setIsExportingTeamPdf] = useState(false);

  // Global Admin Toast notification
  const [adminToast, setAdminToast] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setAdminToast({ type, text });
    setTimeout(() => setAdminToast(null), 3500);
  };

  // Store Name & Reset state
  const [inputStoreName, setInputStoreName] = useState(() => storeName || getStoreName());
  const [isResetStoreModalOpen, setIsResetStoreModalOpen] = useState(false);
  const [resetStoreInput, setResetStoreInput] = useState('');

  useEffect(() => {
    if (storeName) {
      setInputStoreName(storeName);
    }
  }, [storeName]);

  const handleSaveStoreName = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = inputStoreName.trim() || DEFAULT_STORE_NAME;
    saveStoreName(clean);
    onUpdateStoreName?.(clean);
    showToast('success', `Nom enregistré : « ${clean} »`);
  };

  const handleConfirmResetStore = () => {
    const finalName = resetStoreInput.trim() || inputStoreName.trim() || DEFAULT_STORE_NAME;
    resetToCleanStore(finalName);
    setInputStoreName(finalName);
    onUpdateStoreName?.(finalName);
    setTeamList(DEFAULT_EMPLOYEES);
    onUpdateEmployees(DEFAULT_EMPLOYEES);
    setIsResetStoreModalOpen(false);
    setResetStoreInput('');
    showToast('success', `Application réinitialisée pour « ${finalName} ». Données vierges prêtes !`);
  };

  // Admin PIN Modification State
  const [newAdminPin, setNewAdminPin] = useState('');
  const [confirmAdminPin, setConfirmAdminPin] = useState('');
  const [adminPinSuccess, setAdminPinSuccess] = useState(false);
  const [adminPinError, setAdminPinError] = useState('');

  // Security Token state
  const [tokenInput, setTokenInput] = useState(getApiToken());
  const [connectionSuccess, setConnectionSuccess] = useState(false);

  // Push Notification state
  const [pushStatus, setPushStatus] = useState<string>('default');
  const [isTestingPush, setIsTestingPush] = useState(false);
  const [pushTestFeedback, setPushTestFeedback] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Team management state
  const [teamList, setTeamList] = useState<Employee[]>(employees);
  const [isSavingTeam, setIsSavingTeam] = useState(false);
  const [teamSavedSuccess, setTeamSavedSuccess] = useState(false);
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpRole, setNewEmpRole] = useState('');
  const [newEmpIsAdmin, setNewEmpIsAdmin] = useState(false);
  const [newEmpColor, setNewEmpColor] = useState('#166534');
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);

  // Employee modification state
  const [employeeToEdit, setEmployeeToEdit] = useState<Employee | null>(null);
  const [editEmpName, setEditEmpName] = useState('');
  const [editEmpRole, setEditEmpRole] = useState('');
  const [editEmpIsAdmin, setEditEmpIsAdmin] = useState(false);
  const [editEmpColor, setEditEmpColor] = useState('#166534');

  // Months management state
  const [monthsList, setMonthsList] = useState<MonthItem[]>(allMonths);
  const [selectedVisibleMonths, setSelectedVisibleMonths] = useState<string[]>(visibleMonths);
  const [isSavingMonths, setIsSavingMonths] = useState(false);
  const [monthsSavedSuccess, setMonthsSavedSuccess] = useState(false);

  // New month creation form
  const [newMonthPickerVal, setNewMonthPickerVal] = useState<string>('2026-11');
  const [newMonthLabel, setNewMonthLabel] = useState<string>('Novembre 2026');
  const [newMonthTab, setNewMonthTab] = useState<string>('NOVEMBRE 26');

  // Month modification state
  const [monthToEdit, setMonthToEdit] = useState<MonthItem | null>(null);
  const [editMonthKey, setEditMonthKey] = useState<string>('');
  const [editMonthLabel, setEditMonthLabel] = useState<string>('');
  const [editMonthTab, setEditMonthTab] = useState<string>('');

  // Month deletion confirmation modal
  const [monthToDelete, setMonthToDelete] = useState<MonthItem | null>(null);

  // Sync props to state
  useEffect(() => {
    setTeamList(employees);
  }, [employees]);

  useEffect(() => {
    setMonthsList(allMonths);
  }, [allMonths]);

  useEffect(() => {
    setSelectedVisibleMonths(visibleMonths);
  }, [visibleMonths]);

  // Load available shifts & check push permission on auth
  useEffect(() => {
    if (isAuthenticated) {
      fetchAvailableShifts().then((shifts) => {
        if (shifts && shifts.length > 0) {
          setTableau2Options(shifts);
        }
      });
      checkPushPermission().then(setPushStatus);
    }
  }, [isAuthenticated]);

  // Keep shiftEditDate in sync with month
  useEffect(() => {
    if (!shiftEditDate.startsWith(shiftEditMonth)) {
      setShiftEditDate(`${shiftEditMonth}-01`);
    }
  }, [shiftEditMonth]);

  // Update default label & tab when month picker value changes
  const handleMonthPickerChange = (val: string) => {
    setNewMonthPickerVal(val);
    if (val && val.includes('-')) {
      setNewMonthLabel(getFrenchMonthLabel(val));
      setNewMonthTab(getExcelTabLabel(val));
    }
  };

  // Numpad key press handler (6-digit PIN)
  const handleKeypadPress = (val: string) => {
    setPinError('');
    if (val === 'clear') {
      setPinInput('');
      return;
    }
    if (val === 'backspace') {
      setPinInput((prev) => prev.slice(0, -1));
      return;
    }

    if (pinInput.length >= 6) return;

    const nextPin = pinInput + val;
    setPinInput(nextPin);

    // Auto-verify when 6 digits are typed against active stored admin pin
    if (nextPin.length === 6) {
      verifyAdminPin(nextPin).then((isValid) => {
        if (isValid) {
          setTimeout(() => {
            setAuth(true);
            setPinInput('');
            setPinError('');
          }, 150);
        } else {
          setTimeout(() => {
            setPinError('Code PIN incorrect (6 chiffres)');
            setPinInput('');
          }, 250);
        }
      });
    }
  };

  // Submit PIN explicitly: ONLY active stored admin pin
  const handleValidatePin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const pin = pinInput.trim();
    const isValid = await verifyAdminPin(pin);

    if (isValid) {
      setAuth(true);
      setPinInput('');
      setPinError('');
    } else {
      setPinError('Code PIN incorrect (6 chiffres)');
      setPinInput('');
    }
  };

  // Change Admin PIN: strictly 6 digits
  const handleChangeAdminPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminPinError('');
    setAdminPinSuccess(false);

    const pin = newAdminPin.trim();
    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      setAdminPinError('Le code PIN doit comporter exactement 6 chiffres.');
      return;
    }

    if (pin !== confirmAdminPin.trim()) {
      setAdminPinError('Les deux codes PIN ne correspondent pas.');
      return;
    }

    await saveAdminPin(pin);
    setAdminPinSuccess(true);
    setNewAdminPin('');
    setConfirmAdminPin('');
    showToast('success', 'Nouveau code PIN enregistré sur la base de données !');
    setTimeout(() => setAdminPinSuccess(false), 3000);
  };

  // Save Security Token
  const handleSaveConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanToken = tokenInput.trim();
    await saveApiToken(cleanToken);
    setConnectionSuccess(true);
    showToast('success', 'Jeton d’accès enregistré sur la base de données !');
    setTimeout(() => setConnectionSuccess(false), 3000);
  };

  // Push notification testing handler
  const handleTestPush = async () => {
    setIsTestingPush(true);
    setPushTestFeedback(null);
    try {
      const res = await testPushNotification();
      setPushTestFeedback(res);
      const perm = await checkPushPermission();
      setPushStatus(perm);
    } catch (err: any) {
      setPushTestFeedback({
        success: false,
        message: err?.message || 'Erreur lors du test de notification.',
      });
    } finally {
      setIsTestingPush(false);
    }
  };

  const handleRequestPushFromAdmin = async () => {
    const granted = await requestPushPermission();
    setPushStatus(granted ? 'granted' : 'denied');
    if (granted) {
      handleTestPush();
    }
  };

  // --- TEAM MANAGEMENT HANDLERS ---
  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newEmpName.trim();
    if (!trimmed) return;

    if (teamList.some((emp) => emp.name.toLowerCase() === trimmed.toLowerCase())) {
      showToast('error', `Un salarié nommé « ${trimmed} » existe déjà.`);
      return;
    }

    const isResp = Boolean(
      (newEmpRole && newEmpRole.trim().toLowerCase().includes('responsable')) ||
      trimmed.toLowerCase() === 'responsable'
    );
    const newEmp: Employee = {
      name: trimmed,
      color: newEmpColor,
      role: newEmpRole.trim() || (isResp ? 'Responsable' : 'Collaborateur'),
      isAdmin: isResp ? true : newEmpIsAdmin,
    };

    const updated = ensureResponsableAdmin([...teamList, newEmp]);
    setTeamList(updated);
    setNewEmpName('');
    setNewEmpRole('');
    setNewEmpIsAdmin(false);

    // Auto-save and sync immediately with application state
    await saveEmployees(updated);
    onUpdateEmployees(updated);
    showToast('success', `Salarié « ${trimmed} » ajouté avec succès.`);
  };

  const handleStartEditEmployee = (emp: Employee) => {
    setEmployeeToEdit(emp);
    setEditEmpName(emp.name);
    setEditEmpRole(emp.role || '');
    const isResp = Boolean(
      (emp.role && emp.role.trim().toLowerCase().includes('responsable')) ||
      emp.name.trim().toLowerCase() === 'responsable'
    );
    setEditEmpIsAdmin(isResp ? true : Boolean(emp.isAdmin));
    setEditEmpColor(emp.color || '#166534');
  };

  const handleSaveEditEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeToEdit) return;
    const oldName = employeeToEdit.name;
    const newName = editEmpName.trim();
    if (!newName) {
      showToast('error', 'Le nom du salarié ne peut pas être vide.');
      return;
    }

    if (
      teamList.some(
        (emp) =>
          emp.name.toLowerCase() === newName.toLowerCase() &&
          emp.name.toLowerCase() !== oldName.toLowerCase()
      )
    ) {
      showToast('error', `Un salarié nommé « ${newName} » existe déjà.`);
      return;
    }

    // Safely migrate all schedules if renamed
    if (oldName !== newName) {
      renameEmployeeData(oldName, newName);
    }

    const isResp = Boolean(
      (employeeToEdit.role && employeeToEdit.role.trim().toLowerCase().includes('responsable')) ||
      oldName.toLowerCase() === 'responsable' ||
      newName.toLowerCase() === 'responsable'
    );
    const finalRole = isResp ? 'Responsable' : editEmpRole.trim();
    const finalIsAdmin = isResp ? true : editEmpIsAdmin;

    const mapped = teamList.map((emp) => {
      if (emp.name === oldName) {
        return {
          ...emp,
          name: newName,
          role: finalRole,
          isAdmin: finalIsAdmin,
          color: editEmpColor,
        };
      }
      return emp;
    });

    const updated = ensureResponsableAdmin(mapped);

    setTeamList(updated);
    setEmployeeToEdit(null);
    await saveEmployees(updated);
    onUpdateEmployees(updated);
    showToast('success', `Salarié « ${newName} » mis à jour avec succès.`);
  };

  const handleRequestDeleteEmployee = (emp: Employee) => {
    const isResp = Boolean(
      (emp.role && emp.role.trim().toLowerCase().includes('responsable')) ||
      emp.name.trim().toLowerCase() === 'responsable'
    );
    if (isResp) {
      showToast('error', "Le Responsable est l'administrateur de l'équipe et ne peut pas être supprimé.");
      return;
    }

    if (teamList.length <= 1) {
      showToast('error', 'Vous devez conserver au moins un salarié dans l’équipe.');
      return;
    }
    setEmployeeToDelete(emp);
  };

  const handleConfirmDeleteEmployee = async () => {
    if (!employeeToDelete) return;
    const name = employeeToDelete.name;

    const updated = ensureResponsableAdmin(teamList.filter((e) => e.name !== name));
    setTeamList(updated);
    setEmployeeToDelete(null);

    // Auto-save and sync immediately with application state
    await saveEmployees(updated);
    onUpdateEmployees(updated);
    showToast('success', `Salarié « ${name} » supprimé de l'équipe.`);
  };

  const handleMoveEmployee = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= teamList.length) return;

    const list = [...teamList];
    const [moved] = list.splice(index, 1);
    list.splice(targetIndex, 0, moved);
    setTeamList(list);

    // Auto-save
    await saveEmployees(list);
    onUpdateEmployees(list);
  };

  const handleUpdateEmployeeColor = async (index: number, newColor: string) => {
    const list = [...teamList];
    list[index] = { ...list[index], color: newColor };
    setTeamList(list);

    // Auto-save
    await saveEmployees(list);
    onUpdateEmployees(list);
  };

  const handleSaveTeamToBackend = async () => {
    setIsSavingTeam(true);
    await saveEmployees(teamList);
    setIsSavingTeam(false);
    onUpdateEmployees(teamList);
    setTeamSavedSuccess(true);
    setTimeout(() => setTeamSavedSuccess(false), 3000);
    showToast('success', "Équipe enregistrée avec succès.");
  };

  // --- MONTH MANAGEMENT HANDLERS ---
  const handleToggleMonthVisibility = async (key: string) => {
    let nextVisible: string[];
    if (selectedVisibleMonths.includes(key)) {
      if (selectedVisibleMonths.length <= 1) {
        showToast('error', 'Au moins un mois doit rester visible dans le planning.');
        return;
      }
      nextVisible = selectedVisibleMonths.filter((m) => m !== key);
    } else {
      nextVisible = [...selectedVisibleMonths, key];
    }

    setSelectedVisibleMonths(nextVisible);
    await saveVisibleMonths(nextVisible);
    onUpdateVisibleMonths(nextVisible);
  };

  // Add a new Month with calendar days verified
  const handleAddMonth = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = newMonthPickerVal.trim();
    const label = newMonthLabel.trim() || getFrenchMonthLabel(key);
    const tab = newMonthTab.trim().toUpperCase() || getExcelTabLabel(key);

    if (!key || !key.match(/^\d{4}-\d{2}$/)) {
      showToast('error', 'Le format du mois doit être AAAA-MM (ex: 2026-11).');
      return;
    }

    if (monthsList.some((m) => m.key === key)) {
      showToast('error', `Le mois « ${key} » existe déjà dans la liste.`);
      return;
    }

    const newMonthItem: MonthItem = { key, label, tab };
    const updatedMonths = [...monthsList, newMonthItem];
    const updatedVisible = selectedVisibleMonths.includes(key)
      ? selectedVisibleMonths
      : [...selectedVisibleMonths, key];

    setMonthsList(updatedMonths);
    setSelectedVisibleMonths(updatedVisible);

    // Persist to storage & sync with root App state
    await saveAllMonths(updatedMonths);
    await saveVisibleMonths(updatedVisible);
    onUpdateAllMonths?.(updatedMonths);
    onUpdateVisibleMonths(updatedVisible);

    const daysCount = getCalendarDaysForMonth(key).length;
    showToast('success', `Mois « ${label} » créé avec succès (${daysCount} dates du calendrier).`);
  };

  // Start Edit Month
  const handleStartEditMonth = (m: MonthItem) => {
    setMonthToEdit(m);
    setEditMonthKey(m.key);
    setEditMonthLabel(m.label);
    setEditMonthTab(m.tab);
  };

  // Save Edit Month
  const handleSaveEditMonth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!monthToEdit) return;

    const oldKey = monthToEdit.key;
    const newKey = editMonthKey.trim();
    const newLabel = editMonthLabel.trim() || getFrenchMonthLabel(newKey);
    const newTab = editMonthTab.trim().toUpperCase() || getExcelTabLabel(newKey);

    if (!newKey || !newKey.match(/^\d{4}-\d{2}$/)) {
      showToast('error', 'Le format du mois doit être AAAA-MM (ex: 2026-11).');
      return;
    }

    if (newKey !== oldKey && monthsList.some((m) => m.key === newKey)) {
      showToast('error', `Le mois « ${newKey} » existe déjà.`);
      return;
    }

    const updatedMonths = monthsList.map((m) =>
      m.key === oldKey ? { key: newKey, label: newLabel, tab: newTab } : m
    );

    let updatedVisible = selectedVisibleMonths;
    if (newKey !== oldKey) {
      updatedVisible = selectedVisibleMonths.map((k) => (k === oldKey ? newKey : k));
    }

    setMonthsList(updatedMonths);
    setSelectedVisibleMonths(updatedVisible);
    setMonthToEdit(null);

    await saveAllMonths(updatedMonths);
    await saveVisibleMonths(updatedVisible);
    onUpdateAllMonths?.(updatedMonths);
    onUpdateVisibleMonths(updatedVisible);

    showToast('success', `Mois « ${newLabel} » mis à jour.`);
  };

  // Delete Month
  const handleConfirmDeleteMonth = async () => {
    if (!monthToDelete) return;
    const key = monthToDelete.key;
    const label = monthToDelete.label;

    if (monthsList.length <= 1) {
      showToast('error', "Impossible de supprimer l'unique mois de planning.");
      setMonthToDelete(null);
      return;
    }

    const updatedMonths = monthsList.filter((m) => m.key !== key);
    const updatedVisible = selectedVisibleMonths.filter((m) => m !== key);

    setMonthsList(updatedMonths);
    setSelectedVisibleMonths(updatedVisible);
    deleteMonthData(key);
    setMonthToDelete(null);

    await saveAllMonths(updatedMonths);
    await saveVisibleMonths(updatedVisible);
    onUpdateAllMonths?.(updatedMonths);
    onUpdateVisibleMonths(updatedVisible);

    showToast('success', `Mois « ${label} » supprimé.`);
  };

  const handleSaveMonthsToBackend = async () => {
    setIsSavingMonths(true);
    await saveAllMonths(monthsList);
    await saveVisibleMonths(selectedVisibleMonths);
    setIsSavingMonths(false);
    onUpdateAllMonths?.(monthsList);
    onUpdateVisibleMonths(selectedVisibleMonths);
    setMonthsSavedSuccess(true);
    setTimeout(() => setMonthsSavedSuccess(false), 3000);
    showToast('success', "Configuration des mois sauvegardée.");
  };

  // Direct Shift Modification Handler (Tableau 2)
  const handleDirectShiftUpdate = async () => {
    const selectedOpt = tableau2Options.find((o) => o.id === shiftEditOptionId);
    if (!selectedOpt) {
      setShiftUpdateStatus({ type: 'error', text: 'Veuillez sélectionner un horaire Tableau 2.' });
      return;
    }

    setIsUpdatingShift(true);
    setShiftUpdateStatus(null);

    try {
      const res = await updateShiftInSheet(
        shiftEditMonth,
        shiftEditEmployee,
        shiftEditDate,
        selectedOpt.shift,
        selectedOpt.hours
      );

      if (res.success) {
        setShiftUpdateStatus({
          type: 'success',
          text: `Horaire enregistré avec succès pour ${shiftEditEmployee} le ${shiftEditDate} !`,
        });
        if (onShiftUpdated) {
          onShiftUpdated(shiftEditEmployee, shiftEditDate, selectedOpt.shift, selectedOpt.hours);
        }
      } else {
        setShiftUpdateStatus({ type: 'error', text: res.message });
      }
    } catch (err: any) {
      setShiftUpdateStatus({ type: 'error', text: err.message || 'Erreur lors de la mise à jour.' });
    } finally {
      setIsUpdatingShift(false);
    }
  };

  // PDF Export from Admin
  const handleExportPDF = () => {
    setIsExportingTeamPdf(true);
    try {
      const monthObj = monthsList.find((m) => m.key === shiftEditMonth);
      exportTeamPlanningToPDF({
        monthKey: shiftEditMonth,
        monthLabel: monthObj?.label || shiftEditMonth,
        employees,
        teamSchedules: teamSchedules || {},
      });
      setTimeout(() => setIsExportingTeamPdf(false), 1000);
    } catch (err) {
      console.error(err);
      setIsExportingTeamPdf(false);
    }
  };

  // Check if current user has admin rights
  const isCurrentAdmin = Boolean(
    currentEmployee &&
      (currentEmployee.isAdmin ||
        (currentEmployee.role &&
          currentEmployee.role.trim().toLowerCase().includes('responsable')))
  );

  // If active user is not designated as admin, block access
  if (!isCurrentAdmin) {
    return (
      <div className="max-w-md mx-auto py-12 px-4 animate-in fade-in duration-300">
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-sm text-center space-y-4">
          <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-800 mx-auto shadow-inner">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Accès Administrateur restreint</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Seules les personnes désignées comme administrateur par le responsable ont accès à l'espace d'administration.
          </p>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
            Profil actif actuel : <strong className="text-slate-800">{currentEmployee ? currentEmployee.name : 'Aucun'}</strong>
          </div>
        </div>
      </div>
    );
  }

  // 1. PIN Lock Screen if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto py-8 px-4 animate-in fade-in duration-300">
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-sm text-center">
          <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-800 mx-auto mb-4 shadow-inner">
            <Lock className="w-7 h-7" />
          </div>

          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Accès Administrateur</h2>
          <p className="text-xs text-slate-500 mt-1 mb-6">
            Saisissez votre code PIN à 6 chiffres pour déverrouiller la gestion.
          </p>

          <div className="mb-6 flex justify-center gap-3">
            {[0, 1, 2, 3, 4, 5].map((idx) => {
              const isFilled = pinInput.length > idx;
              return (
                <div
                  key={idx}
                  className={`w-4 h-4 rounded-full border-2 transition-all ${
                    isFilled ? 'bg-emerald-600 border-emerald-600 scale-110' : 'border-slate-300 bg-slate-50'
                  }`}
                />
              );
            })}
          </div>

          {pinError && (
            <div className="mb-4 p-2.5 rounded-xl bg-rose-50 text-rose-600 text-xs font-semibold flex items-center justify-center gap-1.5 animate-shake">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{pinError}</span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2.5 max-w-[280px] mx-auto mb-4">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'backspace'].map((key) => {
              if (key === 'clear') {
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleKeypadPress('clear')}
                    className="h-12 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 active:bg-slate-200 transition-colors uppercase tracking-wider"
                  >
                    Effacer
                  </button>
                );
              }
              if (key === 'backspace') {
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleKeypadPress('backspace')}
                    className="h-12 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 active:bg-slate-200 transition-colors"
                  >
                    ⌫
                  </button>
                );
              }
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleKeypadPress(key)}
                  className="h-12 rounded-xl bg-slate-50 border border-slate-200/80 text-lg font-bold text-slate-800 hover:bg-emerald-50 hover:border-emerald-300 active:bg-emerald-100 transition-colors shadow-2xs"
                >
                  {key}
                </button>
              );
            })}
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-end text-[11px] text-slate-400">
            <button
              onClick={() => handleValidatePin()}
              className="font-semibold text-emerald-700 hover:underline"
            >
              Valider
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Authenticated Admin Interface
  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-12 animate-in fade-in duration-200">
      {/* Global Toast Alert */}
      {adminToast && (
        <div
          className={`fixed top-4 right-4 z-50 p-3 rounded-xl shadow-lg border text-xs font-bold flex items-center gap-2 max-w-sm animate-in slide-in-from-top-3 ${
            adminToast.type === 'success'
              ? 'bg-emerald-50 text-emerald-950 border-emerald-300'
              : 'bg-rose-50 text-rose-950 border-rose-300'
          }`}
        >
          {adminToast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{adminToast.text}</span>
          <button
            onClick={() => setAdminToast(null)}
            className="ml-auto text-slate-400 hover:text-slate-700"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Banner with Logout */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Espace Administration</h2>
            <p className="text-xs text-slate-500">
              Gestion de l'équipe, plannings, fichiers Excel et créneaux horaires
            </p>
          </div>
        </div>

        <button
          onClick={() => setAuth(false)}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Verrouiller
        </button>
      </div>

      {/* Admin Navigation Sub-Tabs */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 bg-slate-200/70 p-1 rounded-xl text-xs font-semibold">
        <button
          onClick={() => setAdminTab('excel')}
          className={`py-2 px-1 rounded-lg transition-colors flex flex-col sm:flex-row items-center justify-center gap-1.5 text-center ${
            adminTab === 'excel'
              ? 'bg-white text-emerald-950 font-bold shadow-xs border-b-2 border-emerald-600'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
          <span className="text-[11px] sm:text-xs">Fichier Excel</span>
        </button>

        <button
          onClick={() => setAdminTab('shifts_reference')}
          className={`py-2 px-1 rounded-lg transition-colors flex flex-col sm:flex-row items-center justify-center gap-1.5 text-center ${
            adminTab === 'shifts_reference'
              ? 'bg-white text-emerald-950 font-bold shadow-xs border-b-2 border-emerald-600'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-600" />
          <span className="text-[11px] sm:text-xs">Créneaux</span>
        </button>

        <button
          onClick={() => setAdminTab('shifts')}
          className={`py-2 px-1 rounded-lg transition-colors flex flex-col sm:flex-row items-center justify-center gap-1.5 text-center ${
            adminTab === 'shifts'
              ? 'bg-white text-emerald-900 font-bold shadow-xs border-b-2 border-emerald-600'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-emerald-600" />
          <span className="text-[11px] sm:text-xs">Modifier shift</span>
        </button>

        <button
          onClick={() => setAdminTab('team')}
          className={`py-2 px-1 rounded-lg transition-colors flex flex-col sm:flex-row items-center justify-center gap-1.5 text-center ${
            adminTab === 'team'
              ? 'bg-white text-slate-900 font-bold shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Users className="w-3.5 h-3.5 text-emerald-700" />
          <span className="text-[11px] sm:text-xs">Équipe</span>
        </button>

        <button
          onClick={() => setAdminTab('months')}
          className={`py-2 px-1 rounded-lg transition-colors flex flex-col sm:flex-row items-center justify-center gap-1.5 text-center ${
            adminTab === 'months'
              ? 'bg-white text-slate-900 font-bold shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Calendar className="w-3.5 h-3.5 text-blue-600" />
          <span className="text-[11px] sm:text-xs">Mois</span>
        </button>

        <button
          onClick={() => setAdminTab('connection')}
          className={`py-2 px-1 rounded-lg transition-colors flex flex-col sm:flex-row items-center justify-center gap-1.5 text-center ${
            adminTab === 'connection'
              ? 'bg-white text-slate-900 font-bold shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Settings className="w-3.5 h-3.5 text-slate-700" />
          <span className="text-[11px] sm:text-xs">Magasin & Sécurité</span>
        </button>
      </div>

      {/* SUB-TAB EXCEL (.xlsx) DIRECT IMPORT / EXPORT */}
      {adminTab === 'excel' && (
        <AdminExcelSection
          employees={employees}
          allMonths={monthsList}
          selectedMonth={shiftEditMonth || visibleMonths[0] || '2026-09'}
          teamSchedules={teamSchedules || {}}
          tableau2Options={tableau2Options}
          onPlanningImported={(mKey, scheds, newEmps) => {
            if (newEmps && newEmps.length > 0) {
              onUpdateEmployees(newEmps);
            }
            if (onPlanningImported) {
              onPlanningImported(mKey, scheds, newEmps);
            }
          }}
        />
      )}

      {/* SUB-TAB HORAIRES POSSIBLES (TABLEAU 2) */}
      {adminTab === 'shifts_reference' && (
        <AdminTableau2Section
          tableau2Options={tableau2Options}
          onUpdateOptions={(newOpts) => setTableau2Options(newOpts)}
        />
      )}

      {/* SUB-TAB 0: MODIFIER HORAIRES PONCTUELS (TABLEAU 2) */}
      {adminTab === 'shifts' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">
                    Modifier un créneau horaire
                  </h3>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                    Admin
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Appliquez directement un créneau pré-configuré du Tableau 2 sur une date précise.
                </p>
              </div>

              <button
                type="button"
                onClick={handleExportPDF}
                disabled={isExportingTeamPdf}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors disabled:opacity-50 self-start sm:self-auto"
              >
                <Download className="w-3.5 h-3.5 text-slate-600" />
                <span>{isExportingTeamPdf ? 'Génération...' : 'Imprimer Planning PDF'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mois concerné :
                </label>
                <select
                  value={shiftEditMonth}
                  onChange={(e) => setShiftEditMonth(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white transition-all"
                >
                  {monthsList.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label} ({m.tab})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Salarié de l'équipe :
                </label>
                <select
                  value={shiftEditEmployee}
                  onChange={(e) => setShiftEditEmployee(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white transition-all"
                >
                  {employees.map((emp) => (
                    <option key={emp.name} value={emp.name}>
                      {emp.name} {emp.role ? `(${emp.role})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Date du shift :
                </label>
                <input
                  type="date"
                  value={shiftEditDate}
                  onChange={(e) => setShiftEditDate(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white transition-all"
                />
              </div>
            </div>

            {/* Choices corresponding strictly to Créneaux */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Sélectionnez le créneau souhaité :
                </span>
                <span className="text-[11px] text-slate-400">
                  {tableau2Options.length} choix configurés
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
                {tableau2Options.map((opt) => {
                  const isSelected = shiftEditOptionId === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setShiftEditOptionId(opt.id)}
                      className={`p-3 rounded-xl border text-left text-xs transition-all flex items-center justify-between ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-bold shadow-xs ring-1 ring-emerald-500'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="min-w-0 pr-1">
                        <p className="truncate">{opt.label}</p>
                        {opt.hours && (
                          <p className="text-[10px] text-emerald-700 font-mono mt-0.5 truncate">
                            {opt.hours}
                          </p>
                        )}
                      </div>
                      <div
                        className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-emerald-600 text-white' : 'border border-slate-300'
                        }`}
                      >
                        {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Status Feedback */}
            {shiftUpdateStatus && (
              <div
                className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                  shiftUpdateStatus.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                {shiftUpdateStatus.type === 'success' ? (
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{shiftUpdateStatus.text}</span>
              </div>
            )}

            {/* Action Submit */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={handleDirectShiftUpdate}
                disabled={isUpdatingShift}
                className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 rounded-xl transition-all shadow-xs disabled:opacity-50"
              >
                {isUpdatingShift ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Mise à jour du planning en cours...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Enregistrer la modification</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 1: TEAM */}
      {adminTab === 'team' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Salariés de l'équipe</h3>
                <p className="text-xs text-slate-500">
                  Gérez les noms, rôles/postes (100% personnalisables), droits administrateurs et couleurs de l'équipe.
                </p>
              </div>
              <button
                onClick={handleSaveTeamToBackend}
                disabled={isSavingTeam}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl transition-colors disabled:opacity-50 self-start sm:self-auto"
              >
                {teamSavedSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Enregistré !</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className={`w-3.5 h-3.5 ${isSavingTeam ? 'animate-spin' : ''}`} />
                    <span>Enregistrer</span>
                  </>
                )}
              </button>
            </div>

            {/* List with customizable roles & admin status */}
            <div className="space-y-2">
              {teamList.map((emp, idx) => (
                <div
                  key={emp.name}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-2xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition-colors gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-2xs"
                        style={{ backgroundColor: emp.color }}
                      >
                        {emp.name.charAt(0)}
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-900 truncate">{emp.name}</span>
                        {emp.role && (
                          <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-semibold border border-slate-300/60">
                            {emp.role}
                          </span>
                        )}
                        {emp.isAdmin && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold border border-emerald-200 flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-emerald-600" />
                            <span>Admin</span>
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Position #{idx + 1} dans l'équipe
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 self-end sm:self-center shrink-0">
                    {/* Move Up */}
                    <button
                      type="button"
                      onClick={() => handleMoveEmployee(idx, 'up')}
                      disabled={idx === 0}
                      className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-20 rounded-lg hover:bg-slate-200 transition-colors"
                      title="Monter"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>

                    {/* Move Down */}
                    <button
                      type="button"
                      onClick={() => handleMoveEmployee(idx, 'down')}
                      disabled={idx === teamList.length - 1}
                      className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-20 rounded-lg hover:bg-slate-200 transition-colors"
                      title="Descendre"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>

                    <div className="w-px h-4 bg-slate-200 mx-1" />

                    {/* Edit Employee Button */}
                    <button
                      type="button"
                      onClick={() => handleStartEditEmployee(emp)}
                      className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                      title={`Modifier ${emp.name} (nom, rôle, admin, couleur)`}
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>

                    {/* Delete Employee Button */}
                    <button
                      type="button"
                      onClick={() => handleRequestDeleteEmployee(emp)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      title={`Supprimer ${emp.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Add Employee Form */}
          <form
            onSubmit={handleAddEmployee}
            className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4"
          >
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-emerald-700" />
              <span>Ajouter un salarié</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nom du salarié *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Nom du salarié"
                  value={newEmpName}
                  onChange={(e) => setNewEmpName(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Rôle / Fonction (100% libre)
                </label>
                <input
                  type="text"
                  placeholder="ex: Responsable, Conseiller-e, Apprenti-e..."
                  value={newEmpRole}
                  onChange={(e) => setNewEmpRole(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Couleur avatar
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={newEmpColor}
                      onChange={(e) => setNewEmpColor(e.target.value)}
                      className="w-9 h-9 rounded-xl cursor-pointer border-0 p-0 overflow-hidden shrink-0 shadow-2xs"
                      title="Couleur de l'avatar"
                    />
                    <span className="text-xs font-mono text-slate-500 uppercase">
                      {newEmpColor}
                    </span>
                  </div>
                </div>

                {(() => {
                  const isResp = Boolean(newEmpRole && newEmpRole.trim().toLowerCase().includes('responsable'));
                  return (
                    <div className="flex flex-col justify-end pb-1.5">
                      <label
                        className={`flex items-center gap-1.5 text-xs font-bold select-none ${
                          isResp ? 'cursor-not-allowed opacity-90' : 'cursor-pointer'
                        } text-slate-700`}
                      >
                        <input
                          type="checkbox"
                          checked={isResp ? true : newEmpIsAdmin}
                          disabled={isResp}
                          onChange={(e) => setNewEmpIsAdmin(e.target.checked)}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 disabled:opacity-80"
                        />
                        <span>Statut Admin</span>
                      </label>
                      {isResp && (
                        <span className="text-[10px] text-emerald-700 font-semibold mt-0.5">
                          Automatiquement admin
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="submit"
                disabled={!newEmpName.trim()}
                className="flex items-center gap-1.5 py-2 px-5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-xl transition-colors shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Ajouter ce salarié</span>
              </button>
            </div>
          </form>

          {/* MODAL: MODIFIER UN SALARIÉ */}
          {employeeToEdit && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
              <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-5 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-white shadow-2xs"
                      style={{ backgroundColor: editEmpColor }}
                    >
                      {editEmpName.charAt(0) || '?'}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        Modifier le salarié
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Informations entièrement personnalisables
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEmployeeToEdit(null)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSaveEditEmployee} className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nom du salarié *
                    </label>
                    <input
                      type="text"
                      required
                      value={editEmpName}
                      onChange={(e) => setEditEmpName(e.target.value)}
                      className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Si vous modifiez le nom, tous les plannings du salarié seront automatiquement conservés et transférés sous le nouveau nom.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Rôle / Fonction (libre)
                    </label>
                    <input
                      type="text"
                      placeholder="ex: Responsable, Conseiller-e, Adjoint-e, Apprenti-e..."
                      value={editEmpRole}
                      onChange={(e) => setEditEmpRole(e.target.value)}
                      className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Couleur d'avatar
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={editEmpColor}
                          onChange={(e) => setEditEmpColor(e.target.value)}
                          className="w-9 h-9 rounded-xl cursor-pointer border-0 p-0 overflow-hidden shrink-0 shadow-2xs"
                        />
                        <span className="text-xs font-mono text-slate-500 uppercase">
                          {editEmpColor}
                        </span>
                      </div>
                    </div>

                    {(() => {
                      const isResp = Boolean(editEmpRole && editEmpRole.trim().toLowerCase().includes('responsable'));
                      return (
                        <div className="flex flex-col justify-end pb-1.5">
                          <label
                            className={`flex items-center gap-2 text-xs font-bold select-none ${
                              isResp ? 'cursor-not-allowed opacity-90' : 'cursor-pointer'
                            } text-slate-700`}
                          >
                            <input
                              type="checkbox"
                              checked={isResp ? true : editEmpIsAdmin}
                              disabled={isResp}
                              onChange={(e) => setEditEmpIsAdmin(e.target.checked)}
                              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 disabled:opacity-80"
                            />
                            <span>Droits Admin</span>
                          </label>
                          {isResp && (
                            <p className="text-[10px] text-emerald-700 font-semibold mt-1">
                              Le responsable est obligatoirement administrateur (non modifiable).
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setEmployeeToEdit(null)}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-xs transition-colors"
                    >
                      Enregistrer
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: MONTHS */}
      {adminTab === 'months' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Mois de planning</h3>
                <p className="text-xs text-slate-500">
                  Créez, modifiez ou supprimez des mois. Cochez les mois visibles dans les plannings des salariés.
                </p>
              </div>
              <button
                onClick={handleSaveMonthsToBackend}
                disabled={isSavingMonths}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors disabled:opacity-50"
              >
                {monthsSavedSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Sauvegardé !</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className={`w-3.5 h-3.5 ${isSavingMonths ? 'animate-spin' : ''}`} />
                    <span>Enregistrer</span>
                  </>
                )}
              </button>
            </div>

            {/* List of existing months with Edit and Delete options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {monthsList.map((m) => {
                const isChecked = selectedVisibleMonths.includes(m.key);
                const calDays = getCalendarDaysForMonth(m.key);

                return (
                  <div
                    key={m.key}
                    className={`p-3 rounded-xl border transition-all flex flex-col justify-between gap-2.5 ${
                      isChecked
                        ? 'border-emerald-600 bg-emerald-50/40 text-emerald-950 shadow-2xs'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">{m.label}</p>
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                          Onglet : <span className="font-semibold">{m.tab}</span>
                        </p>
                        <p className="text-[10px] text-emerald-700 mt-0.5 flex items-center gap-1">
                          <CalendarDays className="w-3 h-3 shrink-0" />
                          <span>{calDays.length} jours de calendrier</span>
                        </p>
                      </div>

                      {/* Visible checkbox toggle */}
                      <button
                        type="button"
                        onClick={() => handleToggleMonthVisibility(m.key)}
                        className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                          isChecked
                            ? 'bg-emerald-700 text-white shadow-xs'
                            : 'border border-slate-300 hover:bg-slate-100 text-transparent'
                        }`}
                        title={isChecked ? 'Mois visible (cliquez pour masquer)' : 'Mois masqué (cliquez pour afficher)'}
                      >
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </button>
                    </div>

                    {/* Bottom actions: Edit and Delete */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 text-[11px]">
                      <span className="font-mono text-[10px] text-slate-400">{m.key}</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleStartEditMonth(m)}
                          className="p-1 rounded-md text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                          title={`Modifier le mois ${m.label}`}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setMonthToDelete(m)}
                          className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title={`Supprimer le mois ${m.label}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Form to create a new month with automatic calendar dates matching */}
          <form
            onSubmit={handleAddMonth}
            className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3"
          >
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Créer un nouveau mois de planning
              </h4>
              <p className="text-[11px] text-slate-500">
                Les dates de planning générées correspondent strictement au calendrier réel du mois sélectionné.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Mois & Année :
                </label>
                <input
                  type="month"
                  value={newMonthPickerVal}
                  onChange={(e) => handleMonthPickerChange(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Libellé affiché :
                </label>
                <input
                  type="text"
                  placeholder="ex: Novembre 2026"
                  value={newMonthLabel}
                  onChange={(e) => setNewMonthLabel(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Onglet Excel :
                </label>
                <input
                  type="text"
                  placeholder="ex: NOVEMBRE 26"
                  value={newMonthTab}
                  onChange={(e) => setNewMonthTab(e.target.value.toUpperCase())}
                  className="w-full text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-600 uppercase"
                />
              </div>

              <div className="flex flex-col justify-end">
                <button
                  type="submit"
                  disabled={!newMonthPickerVal.trim()}
                  className="flex items-center justify-center gap-1.5 py-2 px-4 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg transition-colors shadow-2xs h-[38px]"
                >
                  <Plus className="w-4 h-4" />
                  <span>Créer le mois</span>
                </button>
              </div>
            </div>

            {newMonthPickerVal && (
              <div className="text-[11px] text-emerald-800 bg-emerald-50/70 p-2.5 rounded-lg border border-emerald-200 flex items-center gap-2">
                <Info className="w-3.5 h-3.5 shrink-0 text-emerald-700" />
                <span>
                  Calendrier officiel détecté : <strong>{getMonthCalendarSummary(newMonthPickerVal)}</strong>
                </span>
              </div>
            )}
          </form>
        </div>
      )}

      {/* SUB-TAB 3: CONNECTION, SECURITY & PUSH NOTIFICATIONS */}
      {adminTab === 'connection' && (
        <div className="space-y-4">
          {/* Section 0: Nom de l'établissement / Magasin & Remise à zéro */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Nom de l'établissement / Magasin
                </h3>
                <p className="text-xs text-slate-500">
                  Personnalisez le nom affiché dans l'application, les exports PDF, les fichiers Excel (.xlsx) et les agendas (.ics).
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveStoreName} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nom de votre établissement :
                </label>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="text"
                    value={inputStoreName}
                    onChange={(e) => setInputStoreName(e.target.value)}
                    placeholder="Ex: Mon Établissement, Mon Entreprise..."
                    className="flex-1 text-xs font-semibold px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600 shadow-2xs"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 rounded-xl transition-colors shadow-2xs shrink-0 flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>Enregistrer le nom</span>
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs text-slate-600 flex items-center justify-between gap-3 flex-wrap">
                <div className="text-[11px] text-slate-500">
                  Besoin d'utiliser cette application pour un autre magasin avec une base vierge ?
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setResetStoreInput(inputStoreName);
                    setIsResetStoreModalOpen(true);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                >
                  Remise à zéro (Nouveau magasin)
                </button>
              </div>
            </form>
          </div>

          {/* Section 1: Centre de Contrôle des Notifications Push */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Contrôle des Notifications Push
                  </h3>
                  <p className="text-xs text-slate-500">
                    Alertes en direct lors des modifications de planning pour les salariés et responsables.
                  </p>
                </div>
              </div>

              {/* Status Pill */}
              <span
                className={`text-xs font-bold px-3 py-1 rounded-full border flex items-center gap-1.5 ${
                  pushStatus === 'granted'
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                    : pushStatus === 'denied'
                    ? 'bg-rose-50 text-rose-900 border-rose-300'
                    : 'bg-amber-50 text-amber-900 border-amber-300'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    pushStatus === 'granted'
                      ? 'bg-emerald-600'
                      : pushStatus === 'denied'
                      ? 'bg-rose-600'
                      : 'bg-amber-600'
                  }`}
                />
                <span>
                  {pushStatus === 'granted'
                    ? 'Activées'
                    : pushStatus === 'denied'
                    ? 'Bloquées par le navigateur'
                    : 'En attente d’autorisation'}
                </span>
              </span>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs text-slate-600 space-y-1">
              <p>
                <strong>Fonctionnement :</strong> Les notifications sont distribuées via le Service Worker sécurisé (compatibilité iPhone/iOS en PWA, Android, tablettes et PC).
              </p>
              {pushStatus === 'denied' && (
                <p className="text-rose-700 font-semibold pt-1">
                  ⚠️ Le navigateur a bloqué les notifications. Pour les réactiver, cliquez sur le cadenas ou l'icône de réglages à gauche de la barre d'adresse de votre navigateur et autorisez les notifications.
                </p>
              )}
            </div>

            {pushTestFeedback && (
              <div
                className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                  pushTestFeedback.success
                    ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                    : 'bg-rose-50 text-rose-900 border border-rose-200'
                }`}
              >
                {pushTestFeedback.success ? (
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{pushTestFeedback.message}</span>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <button
                type="button"
                onClick={handleTestPush}
                disabled={isTestingPush}
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-xl transition-colors shadow-2xs"
              >
                <Bell className={`w-3.5 h-3.5 ${isTestingPush ? 'animate-bounce' : ''}`} />
                <span>{isTestingPush ? 'Envoi du test...' : 'Envoyer une notification de test'}</span>
              </button>

              {pushStatus !== 'granted' && (
                <button
                  type="button"
                  onClick={handleRequestPushFromAdmin}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-emerald-900 bg-emerald-100 hover:bg-emerald-200 rounded-xl transition-colors"
                >
                  <span>Demander l'autorisation push</span>
                </button>
              )}
            </div>
          </div>

          {/* Section 1: Modifier le Code PIN Administrateur */}
          <form
            onSubmit={handleChangeAdminPin}
            className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4"
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
                <LockKeyhole className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Code PIN d'accès Administrateur (6 chiffres)
                </h3>
                <p className="text-xs text-slate-500">
                  Modifiez le code confidentiel à 6 chiffres qui protège cet espace d'administration.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nouveau code PIN (6 chiffres) :
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="••••••"
                  value={newAdminPin}
                  onChange={(e) => setNewAdminPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full text-xs font-mono px-3 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-600 tracking-widest text-center"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Confirmer le code PIN (6 chiffres) :
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="••••••"
                  value={confirmAdminPin}
                  onChange={(e) => setConfirmAdminPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full text-xs font-mono px-3 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-600 tracking-widest text-center"
                />
              </div>
            </div>

            {adminPinError && (
              <p className="text-xs text-rose-600 font-medium">{adminPinError}</p>
            )}

            {adminPinSuccess && (
              <p className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                <Check className="w-4 h-4" />
                <span>Code PIN administrateur modifié avec succès !</span>
              </p>
            )}

            <button
              type="submit"
              disabled={!newAdminPin.trim() || !confirmAdminPin.trim()}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg transition-colors"
            >
              Mettre à jour le code PIN Admin
            </button>
          </form>

          {/* Section 2: Jeton d'accès Entreprise */}
          <form
            onSubmit={handleSaveConnection}
            className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4"
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
                <KeyRound className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Jeton d'accès de sécurité Entreprise
                </h3>
                <p className="text-xs text-slate-500">
                  Le jeton d'accès saisi par vos salariés pour déverrouiller l'application.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Jeton d'accès de sécurité RGPD :
              </label>
              <input
                type="text"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="ex: PLANNING"
                className="w-full text-xs font-mono px-3 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-600 uppercase"
              />
            </div>

            {connectionSuccess && (
              <p className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                <Check className="w-4 h-4" />
                <span>Jeton d'accès sauvegardé !</span>
              </p>
            )}

            <div className="pt-1">
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors"
              >
                Sauvegarder le jeton de sécurité
              </button>
            </div>
          </form>

          {/* Section 3: Serveur Autonome & Sauvegardes */}
          <AdminDatabaseSection
            storeName={storeName || getStoreName()}
            selectedMonth={shiftEditMonth}
            employees={teamList}
            teamSchedules={(teamSchedules as Record<string, EmployeeMonthSchedule>) || {}}
            tableau2Options={tableau2Options}
            dayNotes={getStoredDayNotes(shiftEditMonth)}
            onPlanningImported={onPlanningImported}
            onUpdateEmployees={(newEmps) => {
              setTeamList(newEmps);
              onUpdateEmployees(newEmps);
            }}
            showToast={showToast}
          />
        </div>
      )}

      {/* MODAL: CONFIRMATION SUPPRESSION SALARIÉ (100% fiable, pas de window.confirm) */}
      {employeeToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xl max-w-sm w-full space-y-4">
            <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
              <Trash2 className="w-5 h-5" />
            </div>

            <div className="text-center space-y-1">
              <h4 className="text-sm font-bold text-slate-900">
                Supprimer le salarié « {employeeToDelete.name} » ?
              </h4>
              <p className="text-xs text-slate-500">
                Ce salarié sera retiré de la liste de l'équipe et des vues de consultation.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEmployeeToDelete(null)}
                className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteEmployee}
                className="py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs transition-colors"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: MODIFIER UN MOIS */}
      {monthToEdit && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xl max-w-md w-full space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <Edit3 className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Modifier le mois « {monthToEdit.label} »
                </h4>
              </div>
              <button
                onClick={() => setMonthToEdit(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditMonth} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Clé du mois (AAAA-MM) :
                </label>
                <input
                  type="month"
                  value={editMonthKey}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEditMonthKey(val);
                    if (val && val.includes('-')) {
                      setEditMonthLabel(getFrenchMonthLabel(val));
                      setEditMonthTab(getExcelTabLabel(val));
                    }
                  }}
                  className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Libellé complet :
                </label>
                <input
                  type="text"
                  required
                  value={editMonthLabel}
                  onChange={(e) => setEditMonthLabel(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nom d'onglet Excel :
                </label>
                <input
                  type="text"
                  required
                  value={editMonthTab}
                  onChange={(e) => setEditMonthTab(e.target.value.toUpperCase())}
                  className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600 uppercase"
                />
              </div>

              <div className="text-[11px] text-emerald-800 bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
                Calendrier correspondant : <strong>{getMonthCalendarSummary(editMonthKey)}</strong>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setMonthToEdit(null)}
                  className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="py-2 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-xs"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: REMISE À ZÉRO POUR UN NOUVEAU MAGASIN */}
      {isResetStoreModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xl max-w-md w-full space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h4 className="text-base font-bold text-slate-900">
                Remettre l'application à zéro ?
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Cette opération prépare l'application pour un <strong>nouveau magasin</strong> en effaçant tous les salariés personnalisés, les notes et les plannings du magasin précédent.
              </p>
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs text-left space-y-1">
                <p className="font-semibold">Ce qui sera conservé intact :</p>
                <ul className="list-disc list-inside text-[11px] text-emerald-800 space-y-0.5">
                  <li>Le compte Administrateur nommé « Responsable » (accès complet préservé)</li>
                  <li>Les créneaux et horaires types d'exemple</li>
                  <li>Le code PIN d'accès Administrateur</li>
                </ul>
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700">
                Nom du nouveau magasin / entreprise :
              </label>
              <input
                type="text"
                value={resetStoreInput}
                onChange={(e) => setResetStoreInput(e.target.value)}
                placeholder="Ex: Mon Nouveau Magasin"
                className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsResetStoreModalOpen(false)}
                className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmResetStore}
                className="py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs transition-colors"
              >
                Confirmer la remise à zéro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMATION SUPPRESSION MOIS */}
      {monthToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xl max-w-sm w-full space-y-4">
            <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
              <Trash2 className="w-5 h-5" />
            </div>

            <div className="text-center space-y-1">
              <h4 className="text-sm font-bold text-slate-900">
                Supprimer le mois « {monthToDelete.label} » ?
              </h4>
              <p className="text-xs text-slate-500">
                Ce mois sera définitivement retiré des plannings et de l'application.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMonthToDelete(null)}
                className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteMonth}
                className="py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs transition-colors"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
