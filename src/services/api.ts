import {
  ConfigData,
  Employee,
  EmployeeMonthSchedule,
  DayShift,
  ChangeEntry,
  HistoryEntry,
  MonthItem,
  Tableau2ShiftOption,
  ShiftCategoryItem,
} from '../types/planning';
import {
  DEFAULT_API_TOKEN,
  DEFAULT_STORE_NAME,
  DEFAULT_EMPLOYEES,
  DEFAULT_VISIBLE_MONTHS,
  DEFAULT_ALL_MONTHS,
  DEFAULT_TABLEAU2_SHIFTS,
  DEFAULT_CATEGORIES,
} from '../config/constants';
import { displayPushNotification } from './onesignal';
import { realtimeClient, RealtimeMessage } from './realtimeClient';

// Local storage display cache keys
const KEY_STORE_NAME = 'planning_store_name';
const KEY_API_TOKEN = 'planning_api_token';
const KEY_CACHED_CONFIG = 'planning_cached_config';
const KEY_CACHED_TABLEAU2 = 'planning_tableau2_shifts';
const KEY_CACHED_CATEGORIES = 'planning_shift_categories';
const KEY_CHANGES_PREFIX = 'planning_changes_';
const KEY_HISTORY_PREFIX = 'planning_history_';
const KEY_DAY_NOTES_PREFIX = 'planning_day_notes_';
const CACHE_PREFIX_SCHEDULE = 'planning_sched_';
const CACHE_PREFIX_TEAM = 'planning_team_';

// ---------------------------------------------------------------------------
// REAL-TIME CACHE SYNCHRONIZATION
// ---------------------------------------------------------------------------
type DataChangeListener = (eventType: string, data: any) => void;
const changeListeners = new Set<DataChangeListener>();

export function subscribeToDataChanges(listener: DataChangeListener): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

function notifyDataChange(eventType: string, data: any) {
  for (const listener of changeListeners) {
    try {
      listener(eventType, data);
    } catch (e) {
      console.error('Error in data change listener:', e);
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('planning_database_sync', { detail: { eventType, data } }));
  }
}

// Listen to WebSocket broadcasts from backend
if (typeof window !== 'undefined') {
  realtimeClient.onMessage((msg: RealtimeMessage) => {
    switch (msg.type) {
      case 'CONFIG_UPDATED': {
        if (msg.config) {
          localStorage.setItem(KEY_CACHED_CONFIG, JSON.stringify(msg.config));
          if (msg.config.storeName) {
            localStorage.setItem(KEY_STORE_NAME, msg.config.storeName);
          }
          if (msg.config.tableau2Shifts) {
            localStorage.setItem(KEY_CACHED_TABLEAU2, JSON.stringify(msg.config.tableau2Shifts));
          }
          if (msg.config.categories) {
            localStorage.setItem(KEY_CACHED_CATEGORIES, JSON.stringify(msg.config.categories));
          }
        }
        notifyDataChange('CONFIG_UPDATED', msg.config);
        break;
      }
      case 'SCHEDULES_UPDATED': {
        if (msg.monthKey && msg.teamSchedules) {
          localStorage.setItem(`${CACHE_PREFIX_TEAM}${msg.monthKey}`, JSON.stringify(msg.teamSchedules));
          for (const [empName, sched] of Object.entries(msg.teamSchedules)) {
            localStorage.setItem(`${CACHE_PREFIX_SCHEDULE}${empName}_${msg.monthKey}`, JSON.stringify(sched));
          }
        }
        notifyDataChange('SCHEDULES_UPDATED', msg);
        break;
      }
      case 'SHIFT_UPDATED': {
        const { monthKey, employeeName, schedule, dateKey, shift, hours } = msg;
        if (monthKey && employeeName && schedule) {
          // Update team cache
          const teamKey = `${CACHE_PREFIX_TEAM}${monthKey}`;
          const raw = localStorage.getItem(teamKey);
          let teamMap: Record<string, any> = {};
          if (raw) {
            try {
              teamMap = JSON.parse(raw);
            } catch {
              teamMap = {};
            }
          }
          teamMap[employeeName] = schedule;
          localStorage.setItem(teamKey, JSON.stringify(teamMap));

          // Update individual cache
          localStorage.setItem(`${CACHE_PREFIX_SCHEDULE}${employeeName}_${monthKey}`, JSON.stringify(schedule));
        }

        // Show push notification if someone else edited
        displayPushNotification(
          `${getStoreName()} · Planning mis à jour`,
          `${employeeName} : ${dateKey} -> ${shift}${hours ? ` (${hours})` : ''}`
        );

        notifyDataChange('SHIFT_UPDATED', msg);
        break;
      }
      case 'NOTES_UPDATED': {
        if (msg.monthKey && msg.notes) {
          localStorage.setItem(`${KEY_DAY_NOTES_PREFIX}${msg.monthKey}`, JSON.stringify(msg.notes));
        }
        notifyDataChange('NOTES_UPDATED', msg);
        break;
      }
      case 'MONTH_DELETED': {
        if (msg.monthKey) {
          localStorage.removeItem(`${CACHE_PREFIX_TEAM}${msg.monthKey}`);
          localStorage.removeItem(`${KEY_DAY_NOTES_PREFIX}${msg.monthKey}`);
        }
        notifyDataChange('MONTH_DELETED', msg);
        break;
      }
      case 'STORE_RESET': {
        localStorage.clear();
        notifyDataChange('STORE_RESET', msg);
        break;
      }
    }
  });
}

// ---------------------------------------------------------------------------
// CACHE ACCESSORS (USED ONLY FOR ZERO-LATENCY INSTANT DISPLAY)
// ---------------------------------------------------------------------------
export function getStoredDayNotes(monthKey: string): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const raw = localStorage.getItem(`${KEY_DAY_NOTES_PREFIX}${monthKey}`);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // ignore
    }
  }
  return {};
}

export function getCachedConfig(): ConfigData | null {
  if (typeof window === 'undefined') return null;
  const cached = localStorage.getItem(KEY_CACHED_CONFIG);
  if (!cached) return null;
  try {
    return JSON.parse(cached);
  } catch {
    return null;
  }
}

export function getCachedEmployeeSchedule(
  employeeName: string,
  monthKey: string
): EmployeeMonthSchedule | null {
  if (typeof window === 'undefined') return null;
  const cacheKey = `${CACHE_PREFIX_SCHEDULE}${employeeName}_${monthKey}`;
  const cached = localStorage.getItem(cacheKey);
  if (!cached) return null;
  try {
    return JSON.parse(cached);
  } catch {
    return null;
  }
}

export function getCachedTeamPlanning(
  monthKey: string
): Record<string, EmployeeMonthSchedule> | null {
  if (typeof window === 'undefined') return null;
  const cacheKey = `${CACHE_PREFIX_TEAM}${monthKey}`;
  const cached = localStorage.getItem(cacheKey);
  if (!cached) return null;
  try {
    return JSON.parse(cached);
  } catch {
    return null;
  }
}

export function getApiToken(): string {
  if (typeof window === 'undefined') return DEFAULT_API_TOKEN;
  return localStorage.getItem(KEY_API_TOKEN) || DEFAULT_API_TOKEN;
}

export function setApiToken(token: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(KEY_API_TOKEN, token.trim());
  }
}

export function getStoreName(): string {
  if (typeof window === 'undefined') return DEFAULT_STORE_NAME;
  return localStorage.getItem(KEY_STORE_NAME) || DEFAULT_STORE_NAME;
}

export function getStoredCategories(): ShiftCategoryItem[] {
  if (typeof window === 'undefined') return DEFAULT_CATEGORIES;
  const cached = localStorage.getItem(KEY_CACHED_CATEGORIES);
  if (cached === null) return DEFAULT_CATEGORIES;
  try {
    const parsed = JSON.parse(cached);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // ignore
  }
  return DEFAULT_CATEGORIES;
}

export function getStoredTableau2Shifts(): Tableau2ShiftOption[] {
  if (typeof window === 'undefined') return DEFAULT_TABLEAU2_SHIFTS;
  const cached = localStorage.getItem(KEY_CACHED_TABLEAU2);
  if (cached === null) return DEFAULT_TABLEAU2_SHIFTS;
  try {
    const parsed = JSON.parse(cached);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // ignore
  }
  return DEFAULT_TABLEAU2_SHIFTS;
}

// ---------------------------------------------------------------------------
// SERVER-AUTHORITATIVE MUTATIONS (DIRECT TO DATABASE)
// ---------------------------------------------------------------------------

/**
 * Fetch authoritative application configuration from Database API
 */
export async function fetchConfig(): Promise<ConfigData> {
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.config) {
        const config: ConfigData = {
          employees: ensureResponsableAdmin(data.config.employees || DEFAULT_EMPLOYEES),
          visibleMonths: data.config.visibleMonths || DEFAULT_VISIBLE_MONTHS,
          allMonths: data.config.allMonths || DEFAULT_ALL_MONTHS,
        };
        // Update display cache
        if (typeof window !== 'undefined') {
          localStorage.setItem(KEY_CACHED_CONFIG, JSON.stringify(config));
          if (data.config.storeName) {
            localStorage.setItem(KEY_STORE_NAME, data.config.storeName);
          }
          if (data.config.tableau2Shifts) {
            localStorage.setItem(KEY_CACHED_TABLEAU2, JSON.stringify(data.config.tableau2Shifts));
          }
          if (data.config.categories) {
            localStorage.setItem(KEY_CACHED_CATEGORIES, JSON.stringify(data.config.categories));
          }
        }
        return config;
      }
    }
  } catch (err) {
    console.warn('Network error fetching config from database, using local display cache:', err);
  }

  // Fallback to local display cache if offline
  const cached = getCachedConfig();
  if (cached && cached.employees && cached.employees.length > 0) {
    return {
      ...cached,
      employees: ensureResponsableAdmin(cached.employees),
    };
  }

  return {
    employees: ensureResponsableAdmin(DEFAULT_EMPLOYEES),
    visibleMonths: DEFAULT_VISIBLE_MONTHS,
    allMonths: DEFAULT_ALL_MONTHS,
  };
}

/**
 * Save store name directly to database
 */
export async function saveStoreName(name: string): Promise<void> {
  const trimmed = (name || '').trim() || DEFAULT_STORE_NAME;
  if (typeof window !== 'undefined') {
    localStorage.setItem(KEY_STORE_NAME, trimmed);
  }
  try {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeName: trimmed }),
    });
  } catch (err) {
    console.error('Error saving store name to database:', err);
  }
}

/**
 * Save visible months directly to database
 */
export async function saveVisibleMonths(months: string[]): Promise<boolean> {
  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibleMonths: months }),
    });
    const data = await res.json();
    if (data.success) {
      const current = getCachedConfig() || {
        employees: DEFAULT_EMPLOYEES,
        visibleMonths: DEFAULT_VISIBLE_MONTHS,
        allMonths: DEFAULT_ALL_MONTHS,
      };
      current.visibleMonths = months;
      localStorage.setItem(KEY_CACHED_CONFIG, JSON.stringify(current));
      return true;
    }
  } catch (err) {
    console.error('Failed to save visible months to database:', err);
  }
  return false;
}

/**
 * Save all planning months directly to database
 */
export async function saveAllMonths(months: MonthItem[]): Promise<boolean> {
  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allMonths: months }),
    });
    const data = await res.json();
    if (data.success) {
      const current = getCachedConfig() || {
        employees: DEFAULT_EMPLOYEES,
        visibleMonths: DEFAULT_VISIBLE_MONTHS,
        allMonths: DEFAULT_ALL_MONTHS,
      };
      current.allMonths = months;
      localStorage.setItem(KEY_CACHED_CONFIG, JSON.stringify(current));
      return true;
    }
  } catch (err) {
    console.error('Failed to save all months to database:', err);
  }
  return false;
}

/**
 * Save team employees directly to database
 */
export async function saveEmployees(employees: Employee[]): Promise<boolean> {
  const sanitized = ensureResponsableAdmin(employees);
  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employees: sanitized }),
    });
    const data = await res.json();
    if (data.success) {
      const current = getCachedConfig() || {
        employees: DEFAULT_EMPLOYEES,
        visibleMonths: DEFAULT_VISIBLE_MONTHS,
        allMonths: DEFAULT_ALL_MONTHS,
      };
      current.employees = sanitized;
      localStorage.setItem(KEY_CACHED_CONFIG, JSON.stringify(current));
      return true;
    }
  } catch (err) {
    console.error('Failed to save employees to database:', err);
  }
  return false;
}

/**
 * Save stored employees locally in cached config and optionally persist
 */
export function saveStoredEmployees(employees: Employee[]): void {
  const sanitized = ensureResponsableAdmin(employees);
  if (typeof window !== 'undefined') {
    const current = getCachedConfig() || {
      employees: DEFAULT_EMPLOYEES,
      visibleMonths: DEFAULT_VISIBLE_MONTHS,
      allMonths: DEFAULT_ALL_MONTHS,
    };
    current.employees = sanitized;
    localStorage.setItem(KEY_CACHED_CONFIG, JSON.stringify(current));
  }
  fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employees: sanitized }),
  }).catch(() => {
    // Silent catch when offline or in background sync
  });
}

/**
 * Get stored employees from cached config
 */
export function getStoredEmployees(): Employee[] {
  const cached = getCachedConfig();
  if (cached && Array.isArray(cached.employees) && cached.employees.length > 0) {
    return ensureResponsableAdmin(cached.employees);
  }
  return ensureResponsableAdmin(DEFAULT_EMPLOYEES);
}

/**
 * Save shift categories directly to database
 */
export async function saveStoredCategories(categories: ShiftCategoryItem[]): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.setItem(KEY_CACHED_CATEGORIES, JSON.stringify(categories));
  }
  try {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories }),
    });
  } catch (err) {
    console.error('Failed to save categories to database:', err);
  }
}

/**
 * Reset shift categories to defaults directly in database
 */
export async function resetStoredCategories(): Promise<ShiftCategoryItem[]> {
  await saveStoredCategories(DEFAULT_CATEGORIES);
  return DEFAULT_CATEGORIES;
}

/**
 * Save customized Tableau 2 shifts directly to database
 */
export async function saveStoredTableau2Shifts(shifts: Tableau2ShiftOption[]): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.setItem(KEY_CACHED_TABLEAU2, JSON.stringify(shifts));
  }
  try {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableau2Shifts: shifts }),
    });
  } catch (err) {
    console.error('Failed to save Tableau 2 shifts to database:', err);
  }
}

/**
 * Reset Tableau 2 shifts to defaults directly in database
 */
export async function resetStoredTableau2Shifts(): Promise<Tableau2ShiftOption[]> {
  await saveStoredTableau2Shifts(DEFAULT_TABLEAU2_SHIFTS);
  return DEFAULT_TABLEAU2_SHIFTS;
}

/**
 * Wipe / reset completely all Tableau 2 shifts AND categories
 */
export async function clearAllTableau2AndCategories(): Promise<{
  shifts: Tableau2ShiftOption[];
  categories: ShiftCategoryItem[];
}> {
  await saveStoredTableau2Shifts([]);
  await saveStoredCategories([]);
  return { shifts: [], categories: [] };
}

/**
 * Restore complete default examples for Tableau 2 shifts AND categories
 */
export async function restoreExampleTableau2AndCategories(): Promise<{
  shifts: Tableau2ShiftOption[];
  categories: ShiftCategoryItem[];
}> {
  await saveStoredTableau2Shifts(DEFAULT_TABLEAU2_SHIFTS);
  await saveStoredCategories(DEFAULT_CATEGORIES);
  return { shifts: DEFAULT_TABLEAU2_SHIFTS, categories: DEFAULT_CATEGORIES };
}

/**
 * Reset application to clean state directly on database
 */
export async function resetToCleanStore(newStoreName?: string): Promise<void> {
  const store = (newStoreName || '').trim() || DEFAULT_STORE_NAME;
  try {
    await fetch('/api/reset', { method: 'POST' });
    await saveStoreName(store);
  } catch (err) {
    console.error('Failed to reset store on database:', err);
  }
  if (typeof window !== 'undefined') {
    localStorage.clear();
    localStorage.setItem(KEY_STORE_NAME, store);
  }
}

// ---------------------------------------------------------------------------
// DAY NOTES API (DIRECT TO DATABASE)
// ---------------------------------------------------------------------------
export async function saveStoredDayNotes(
  monthKey: string,
  notes: Record<string, string>
): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.setItem(`${KEY_DAY_NOTES_PREFIX}${monthKey}`, JSON.stringify(notes));
  }
  try {
    await fetch(`/api/notes/${monthKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    });
  } catch (err) {
    console.error('Failed to save day notes to database:', err);
  }
}

export function updateDayNoteInStore(monthKey: string, dateKey: string, noteText: string): void {
  const current = getStoredDayNotes(monthKey);
  const trimmed = (noteText || '').trim();
  if (trimmed) {
    current[dateKey] = trimmed;
  } else {
    delete current[dateKey];
  }
  saveStoredDayNotes(monthKey, current);
}

// ---------------------------------------------------------------------------
// TEAM & EMPLOYEE SCHEDULES (DIRECT TO DATABASE)
// ---------------------------------------------------------------------------
export function getCalendarDaysForMonth(monthKey: string): string[] {
  const [yearStr, monthStr] = (monthKey || '').split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) return [];

  const daysInMonth = new Date(year, month, 0).getDate();
  const days: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = String(d).padStart(2, '0');
    const mStr = String(month).padStart(2, '0');
    days.push(`${year}-${mStr}-${dStr}`);
  }
  return days;
}

export function ensureMonthCalendarDays(
  schedule: EmployeeMonthSchedule,
  monthKey: string
): EmployeeMonthSchedule {
  const calendarDays = getCalendarDaysForMonth(monthKey);
  const currentDays = schedule.days || {};
  const filledDays: Record<string, DayShift> = {};
  const dayNotes = getStoredDayNotes(monthKey);

  for (const dateKey of calendarDays) {
    const existing = currentDays[dateKey] || { shift: '', hours: '' };
    const note = dayNotes[dateKey];
    filledDays[dateKey] = {
      ...existing,
      ...(note ? { info: note } : {}),
    };
    if (!note) {
      delete filledDays[dateKey].info;
    }
  }

  return {
    ...schedule,
    month: monthKey,
    days: filledDays,
  };
}

export async function fetchEmployeeSchedule(
  employeeName: string,
  monthKey: string
): Promise<{ schedule: EmployeeMonthSchedule; isOffline: boolean }> {
  // First check database
  try {
    const res = await fetch(`/api/schedules/${monthKey}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.schedules && data.schedules[employeeName]) {
        const fullSched = ensureMonthCalendarDays(data.schedules[employeeName], monthKey);
        if (typeof window !== 'undefined') {
          localStorage.setItem(
            `${CACHE_PREFIX_SCHEDULE}${employeeName}_${monthKey}`,
            JSON.stringify(fullSched)
          );
        }
        return { schedule: fullSched, isOffline: false };
      }
    }
  } catch {
    // Network failure
  }

  // Display cache fallback
  const cached = getCachedEmployeeSchedule(employeeName, monthKey);
  if (cached) {
    return { schedule: ensureMonthCalendarDays(cached, monthKey), isOffline: false };
  }

  const calendarDays = getCalendarDaysForMonth(monthKey);
  const initialDays: Record<string, DayShift> = {};
  for (const d of calendarDays) {
    initialDays[d] = { shift: '', hours: '' };
  }

  const newSchedule: EmployeeMonthSchedule = {
    employee: employeeName,
    month: monthKey,
    days: initialDays,
    totalHours: 0,
  };

  return { schedule: newSchedule, isOffline: false };
}

export async function fetchTeamPlanning(
  monthKey: string,
  employees: Employee[]
): Promise<{
  teamSchedules: Record<string, EmployeeMonthSchedule>;
  updatedEmployees?: Employee[];
  isOffline: boolean;
}> {
  let dbSchedules: Record<string, EmployeeMonthSchedule> | null = null;

  try {
    const res = await fetch(`/api/schedules/${monthKey}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.schedules) {
        dbSchedules = data.schedules;
      }
    }
  } catch (err) {
    console.warn('Network error fetching team planning from database:', err);
  }

  // Also fetch latest day notes
  try {
    const notesRes = await fetch(`/api/notes/${monthKey}`);
    if (notesRes.ok) {
      const notesData = await notesRes.json();
      if (notesData.success && notesData.notes) {
        localStorage.setItem(`${KEY_DAY_NOTES_PREFIX}${monthKey}`, JSON.stringify(notesData.notes));
      }
    }
  } catch {
    // ignore
  }

  const rawSchedules = dbSchedules || getCachedTeamPlanning(monthKey) || {};
  const calendarDays = getCalendarDaysForMonth(monthKey);
  const initialDays: Record<string, DayShift> = {};
  for (const d of calendarDays) {
    initialDays[d] = { shift: '', hours: '' };
  }

  const result: Record<string, EmployeeMonthSchedule> = {};
  for (const emp of employees) {
    const empSched = rawSchedules[emp.name] || {
      employee: emp.name,
      month: monthKey,
      days: { ...initialDays },
      totalHours: 0,
    };
    result[emp.name] = ensureMonthCalendarDays(empSched, monthKey);
  }

  // Update display cache
  if (typeof window !== 'undefined') {
    localStorage.setItem(`${CACHE_PREFIX_TEAM}${monthKey}`, JSON.stringify(result));
    for (const [empName, sched] of Object.entries(result)) {
      localStorage.setItem(`${CACHE_PREFIX_SCHEDULE}${empName}_${monthKey}`, JSON.stringify(sched));
    }
  }

  return { teamSchedules: result, isOffline: false };
}

/**
 * Modify shift and hours DIRECTLY in database
 */
export async function updateShiftInSheet(
  monthKey: string,
  employeeName: string,
  dateKey: string,
  shift: string,
  hours: string,
  info?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch(`/api/schedules/${monthKey}/shift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeName,
        dateKey,
        shift,
        hours,
        info,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Erreur lors de la sauvegarde sur la base de données');
    }

    // Update display cache with authoritative schedule from server
    if (data.schedule && typeof window !== 'undefined') {
      const teamCacheKey = `${CACHE_PREFIX_TEAM}${monthKey}`;
      const rawTeam = localStorage.getItem(teamCacheKey);
      let teamObj = rawTeam ? JSON.parse(rawTeam) : {};
      teamObj[employeeName] = data.schedule;
      localStorage.setItem(teamCacheKey, JSON.stringify(teamObj));
      localStorage.setItem(
        `${CACHE_PREFIX_SCHEDULE}${employeeName}_${monthKey}`,
        JSON.stringify(data.schedule)
      );
    }

    return {
      success: true,
      message: `Horaire enregistré sur la base de données pour ${employeeName} le ${dateKey} !`,
    };
  } catch (err: any) {
    console.error('Error saving shift to database:', err);
    return {
      success: false,
      message: `Erreur base de données : ${err.message || 'Impossible de joindre le serveur'}`,
    };
  }
}

export async function saveLocalTeamPlanning(
  monthKey: string,
  teamSchedules: Record<string, EmployeeMonthSchedule>,
  updatedEmployees?: Employee[]
): Promise<void> {
  // Save directly to database
  try {
    await fetch(`/api/schedules/${monthKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamSchedules }),
    });

    if (updatedEmployees && updatedEmployees.length > 0) {
      await saveEmployees(updatedEmployees);
    }
  } catch (err) {
    console.error('Failed to save team planning to database:', err);
  }

  // Update display cache
  if (typeof window !== 'undefined') {
    localStorage.setItem(`${CACHE_PREFIX_TEAM}${monthKey}`, JSON.stringify(teamSchedules));
    for (const [empName, sched] of Object.entries(teamSchedules)) {
      localStorage.setItem(`${CACHE_PREFIX_SCHEDULE}${empName}_${monthKey}`, JSON.stringify(sched));
    }
  }
}

export async function deleteMonthData(monthKey: string): Promise<void> {
  try {
    await fetch(`/api/months/${monthKey}`, { method: 'DELETE' });
  } catch (err) {
    console.error('Error deleting month from database:', err);
  }
  if (typeof window !== 'undefined') {
    localStorage.removeItem(`${CACHE_PREFIX_TEAM}${monthKey}`);
    localStorage.removeItem(`${KEY_DAY_NOTES_PREFIX}${monthKey}`);
  }
}

// ---------------------------------------------------------------------------
// CHANGES & HISTORY (DIRECT TO DATABASE)
// ---------------------------------------------------------------------------
export async function fetchChanges(employeeName: string): Promise<ChangeEntry[]> {
  try {
    const res = await fetch(`/api/changes/${encodeURIComponent(employeeName)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.changes) {
        return data.changes;
      }
    }
  } catch {
    // fallback
  }
  return [];
}

export async function clearChanges(employeeName: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/changes/${encodeURIComponent(employeeName)}/clear`, {
      method: 'POST',
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchHistory(employeeName: string): Promise<HistoryEntry[]> {
  try {
    const res = await fetch(`/api/history/${encodeURIComponent(employeeName)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.history) {
        return data.history;
      }
    }
  } catch {
    // fallback
  }
  return [];
}

export function recordChange(
  employeeName: string,
  date: string,
  previousShift: string | undefined,
  newShift: string,
  previousHours: string | undefined,
  newHours: string
) {
  // Changes are recorded directly on the server when calling updateShiftInSheet.
}

export function recordHistory(
  employeeName: string,
  date: string,
  changeText: string,
  timestamp: string
) {
  // History is recorded directly on the server when calling updateShiftInSheet.
}

export async function fetchAvailableShifts(): Promise<Tableau2ShiftOption[]> {
  return getStoredTableau2Shifts();
}

export function renameEmployeeData(oldName: string, newName: string): void {
  // Display cache update helper
  if (typeof window === 'undefined' || !oldName || !newName || oldName === newName) return;
  try {
    const keysToMigrate: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`${CACHE_PREFIX_SCHEDULE}${oldName}_`)) {
        keysToMigrate.push(key);
      }
    }
    for (const oldKey of keysToMigrate) {
      const raw = localStorage.getItem(oldKey);
      if (raw) {
        const monthKey = oldKey.replace(`${CACHE_PREFIX_SCHEDULE}${oldName}_`, '');
        const newKey = `${CACHE_PREFIX_SCHEDULE}${newName}_${monthKey}`;
        try {
          const sched = JSON.parse(raw);
          sched.employee = newName;
          localStorage.setItem(newKey, JSON.stringify(sched));
        } catch {
          localStorage.setItem(newKey, raw);
        }
        localStorage.removeItem(oldKey);
      }
    }
  } catch (err) {
    console.error('Failed to migrate employee schedule data:', err);
  }
}

export function ensureResponsableAdmin(employeesList: Employee[]): Employee[] {
  if (!employeesList || employeesList.length === 0) {
    return DEFAULT_EMPLOYEES;
  }

  let hasResponsable = false;

  const sanitized = employeesList.map((emp) => {
    const trimmedName = emp.name.trim().toLowerCase();
    const isNamedResp = trimmedName === 'responsable';
    const isRespRole = Boolean(emp.role && emp.role.trim().toLowerCase().includes('responsable'));

    if (isNamedResp || isRespRole) {
      hasResponsable = true;
      return {
        ...emp,
        role: 'Responsable',
        isAdmin: true,
      };
    }

    return emp;
  });

  if (!hasResponsable) {
    sanitized.unshift({
      name: 'Responsable',
      color: '#1a6b2a',
      role: 'Responsable',
      isAdmin: true,
    });
  }

  return sanitized;
}
