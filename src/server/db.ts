import fs from 'fs';
import path from 'path';
import {
  DEFAULT_STORE_NAME,
  DEFAULT_EMPLOYEES,
  DEFAULT_VISIBLE_MONTHS,
  DEFAULT_ALL_MONTHS,
  DEFAULT_TABLEAU2_SHIFTS,
  DEFAULT_CATEGORIES,
  DEFAULT_API_TOKEN,
  DEFAULT_ADMIN_PIN,
} from '../config/constants.ts';

export interface ServerConfig {
  storeName: string;
  apiToken: string;
  adminPin: string;
  employees: any[];
  visibleMonths: string[];
  allMonths: any[];
  tableau2Shifts: any[];
  categories: any[];
}

export interface DayShiftData {
  shift: string;
  hours: string;
  info?: string;
}

export interface EmployeeScheduleData {
  employee: string;
  month: string;
  days: Record<string, DayShiftData>;
  totalHours: number;
}

export interface ChangeRecord {
  id: string;
  employeeName: string;
  date: string;
  previousShift?: string;
  newShift: string;
  previousHours?: string;
  newHours?: string;
  timestamp: string;
}

export interface HistoryRecord {
  id: string;
  employee: string;
  date: string;
  change: string;
  timestamp: string;
}

export interface DatabaseState {
  config: ServerConfig;
  schedules: Record<string, Record<string, EmployeeScheduleData>>; // monthKey -> employeeName -> Schedule
  dayNotes: Record<string, Record<string, string>>; // monthKey -> { dateKey: note }
  changes: Record<string, ChangeRecord[]>; // employeeName.toLowerCase() -> ChangeRecord[]
  history: Record<string, HistoryRecord[]>; // employeeName.toLowerCase() -> HistoryRecord[]
}

// File-based persistent storage
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_JSON_PATH = path.join(DATA_DIR, 'planning_db.json');

let memoryDb: DatabaseState = {
  config: {
    storeName: DEFAULT_STORE_NAME,
    apiToken: DEFAULT_API_TOKEN,
    adminPin: DEFAULT_ADMIN_PIN,
    employees: DEFAULT_EMPLOYEES,
    visibleMonths: DEFAULT_VISIBLE_MONTHS,
    allMonths: DEFAULT_ALL_MONTHS,
    tableau2Shifts: DEFAULT_TABLEAU2_SHIFTS,
    categories: DEFAULT_CATEGORIES,
  },
  schedules: {},
  dayNotes: {},
  changes: {},
  history: {},
};

let lastSavedAt: string | null = null;

async function loadLocalDbFile(): Promise<void> {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_JSON_PATH)) {
      const content = fs.readFileSync(DB_JSON_PATH, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed) {
        memoryDb = {
          config: {
            ...memoryDb.config,
            ...(parsed.config || {}),
            apiToken: (parsed.config && parsed.config.apiToken) || memoryDb.config.apiToken || DEFAULT_API_TOKEN,
            adminPin: (parsed.config && parsed.config.adminPin) || memoryDb.config.adminPin || DEFAULT_ADMIN_PIN,
          },
          schedules: parsed.schedules || {},
          dayNotes: parsed.dayNotes || {},
          changes: parsed.changes || {},
          history: parsed.history || {},
        };
        lastSavedAt = new Date().toISOString();
      }
    } else {
      await saveLocalDbFile();
    }
  } catch (err) {
    console.error('Error loading persistent database file:', err);
  }
}

async function saveLocalDbFile(): Promise<void> {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpPath = `${DB_JSON_PATH}.tmp`;
    const serialized = JSON.stringify(memoryDb, null, 2);
    fs.writeFileSync(tmpPath, serialized, 'utf-8');
    fs.renameSync(tmpPath, DB_JSON_PATH);
    lastSavedAt = new Date().toISOString();
  } catch (err) {
    console.error('Error writing persistent database file:', err);
  }
}

export async function initDatabase(): Promise<{ type: 'local'; connected: boolean; storageLocation: string }> {
  await loadLocalDbFile();
  console.log(`Autonomous persistent storage initialized at ${DB_JSON_PATH}`);
  return {
    type: 'local',
    connected: true,
    storageLocation: DB_JSON_PATH,
  };
}

export function getDatabaseStatus() {
  const totalMonths = Object.keys(memoryDb.schedules || {}).length;
  let totalChanges = 0;
  for (const c of Object.values(memoryDb.changes || {})) {
    totalChanges += (c || []).length;
  }
  let totalHistory = 0;
  for (const h of Object.values(memoryDb.history || {})) {
    totalHistory += (h || []).length;
  }

  return {
    type: 'local',
    connected: true,
    storageLocation: DB_JSON_PATH,
    totalMonths,
    totalChanges,
    totalHistory,
    lastSavedAt,
  };
}

export async function dbGetConfig(): Promise<ServerConfig> {
  return memoryDb.config;
}

export async function dbSaveConfig(partialConfig: Partial<ServerConfig>): Promise<ServerConfig> {
  memoryDb.config = {
    ...memoryDb.config,
    ...partialConfig,
  };
  await saveLocalDbFile();
  return memoryDb.config;
}

export async function dbGetMonthSchedules(monthKey: string): Promise<Record<string, EmployeeScheduleData>> {
  return memoryDb.schedules[monthKey] || {};
}

/**
 * Calculates accurate decimal hours from a shift type and hours string,
 * cross-referencing defined Tableau 2 shifts, time ranges, and hour formats.
 */
export function calculateShiftDurationHours(
  shiftText: string,
  hoursText?: string,
  tableau2Options: any[] = []
): number {
  if (!shiftText && !hoursText) return 0;

  const s = (shiftText || '').trim().toUpperCase();
  const h = (hoursText || '').trim();

  // Absences and rests = 0h
  if (
    s.includes('REPOS') ||
    s.includes('CONGES') ||
    s.includes('CONGÉS') ||
    s.includes('RTT') ||
    s.includes('MALADIE') ||
    s === 'AT' ||
    s === 'ABSENT'
  ) {
    return 0;
  }

  // 1. Cross-reference against Tableau 2 options
  if (Array.isArray(tableau2Options) && tableau2Options.length > 0) {
    for (const opt of tableau2Options) {
      if (
        opt.shift &&
        opt.shift.toUpperCase() === s &&
        opt.hours &&
        h &&
        opt.hours.replace(/\s+/g, '') === h.replace(/\s+/g, '')
      ) {
        if (opt.hoursDecimal !== undefined && opt.hoursDecimal >= 0) {
          return opt.hoursDecimal;
        }
      }
    }
  }

  // 2. Direct single numeric value like "7", "7h", "7.5", "8h"
  const singleNumMatch = h.match(/^(\d+(?:[.,]\d+)?)\s*h?$/i);
  if (singleNumMatch) {
    const val = parseFloat(singleNumMatch[1].replace(',', '.'));
    if (!isNaN(val) && val > 0 && val <= 16) return val;
  }

  // 3. Direct format like "7h30" or "8h15"
  const singleHoursMinsMatch = h.match(/^(\d{1,2})\s*h\s*(\d{2})$/i);
  if (singleHoursMinsMatch) {
    const hours = parseInt(singleHoursMinsMatch[1], 10);
    const mins = parseInt(singleHoursMinsMatch[2], 10);
    return Math.round((hours + mins / 60) * 100) / 100;
  }

  // 4. Time ranges like "08:30-12:30 , 14:00-18:00" or "9h-12h30 14h-19h"
  const rangeRegex = /(\d{1,2})(?:[h:](\d{2}))?\s*(?:[-/–—]|à)\s*(\d{1,2})(?:[h:](\d{2}))?/gi;
  let totalRangeHours = 0;
  let matchesFound = 0;
  let match: RegExpExecArray | null;

  while ((match = rangeRegex.exec(h)) !== null) {
    matchesFound++;
    const startH = parseInt(match[1], 10);
    const startM = match[2] ? parseInt(match[2], 10) : 0;
    const endH = parseInt(match[3], 10);
    const endM = match[4] ? parseInt(match[4], 10) : 0;

    const startDec = startH + startM / 60;
    let endDec = endH + endM / 60;
    if (endDec < startDec) endDec += 24;
    const diff = endDec - startDec;
    if (diff > 0 && diff <= 16) {
      totalRangeHours += diff;
    }
  }

  if (matchesFound > 0 && totalRangeHours > 0) {
    return Math.round(totalRangeHours * 100) / 100;
  }

  // 5. Fallback defaults by shift code
  if (s.includes('MATIN') || s.includes('SOIR')) return 7;
  if (s.includes('JOURNEE') || s.includes('JOURNÉE')) return 7.5;
  if (s.includes('FORMATION')) return 7;

  return 0;
}

export async function dbSaveMonthSchedules(
  monthKey: string,
  teamSchedules: Record<string, EmployeeScheduleData>
): Promise<void> {
  for (const sched of Object.values(teamSchedules)) {
    if (!sched.totalHours || sched.totalHours === 0) {
      let tot = 0;
      if (sched.days) {
        for (const day of Object.values(sched.days)) {
          tot += calculateShiftDurationHours(day.shift, day.hours, memoryDb.config.tableau2Shifts);
        }
      }
      sched.totalHours = Math.round(tot * 100) / 100;
    }
  }
  memoryDb.schedules[monthKey] = teamSchedules;
  await saveLocalDbFile();
}

export async function dbUpdateShift(
  monthKey: string,
  employeeName: string,
  dateKey: string,
  newShift: string,
  newHours: string,
  info?: string,
  previousShift?: string,
  previousHours?: string
): Promise<{ success: boolean; schedule: EmployeeScheduleData }> {
  if (!memoryDb.schedules[monthKey]) {
    memoryDb.schedules[monthKey] = {};
  }
  if (!memoryDb.schedules[monthKey][employeeName]) {
    memoryDb.schedules[monthKey][employeeName] = {
      employee: employeeName,
      month: monthKey,
      days: {},
      totalHours: 0,
    };
  }

  const empSched = memoryDb.schedules[monthKey][employeeName];
  if (newShift === 'EMPTY') {
    delete empSched.days[dateKey];
  } else {
    empSched.days[dateKey] = {
      shift: newShift,
      hours: newHours || '',
      info: info || '',
    };
  }

  let total = 0;
  for (const dayData of Object.values(empSched.days)) {
    total += calculateShiftDurationHours(dayData.shift, dayData.hours, memoryDb.config.tableau2Shifts);
  }
  empSched.totalHours = Math.round(total * 100) / 100;

  await dbRecordChange(employeeName, dateKey, newShift, newHours, previousShift, previousHours);
  await dbRecordHistory(
    employeeName,
    dateKey,
    `Modification horaire: ${previousShift || 'Vide'} -> ${newShift} (${newHours || ''})`
  );

  await saveLocalDbFile();

  return { success: true, schedule: empSched };
}

export async function dbGetDayNotes(monthKey: string): Promise<Record<string, string>> {
  return memoryDb.dayNotes[monthKey] || {};
}

export async function dbSaveDayNotes(monthKey: string, notes: Record<string, string>): Promise<void> {
  memoryDb.dayNotes[monthKey] = notes;
  await saveLocalDbFile();
}

export async function dbDeleteMonth(monthKey: string): Promise<void> {
  delete memoryDb.schedules[monthKey];
  delete memoryDb.dayNotes[monthKey];
  await saveLocalDbFile();
}

export async function dbGetChanges(employeeName: string): Promise<ChangeRecord[]> {
  const key = (employeeName || '').toLowerCase();
  return memoryDb.changes[key] || [];
}

export async function dbClearChanges(employeeName: string): Promise<void> {
  const key = (employeeName || '').toLowerCase();
  delete memoryDb.changes[key];
  await saveLocalDbFile();
}

export async function dbRecordChange(
  employeeName: string,
  dateKey: string,
  newShift: string,
  newHours?: string,
  previousShift?: string,
  previousHours?: string
): Promise<void> {
  const key = (employeeName || '').toLowerCase();
  if (!memoryDb.changes[key]) {
    memoryDb.changes[key] = [];
  }

  const record: ChangeRecord = {
    id: `${dateKey}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    employeeName,
    date: dateKey,
    previousShift,
    newShift,
    previousHours,
    newHours,
    timestamp: new Date().toISOString(),
  };

  memoryDb.changes[key].unshift(record);
  if (memoryDb.changes[key].length > 50) {
    memoryDb.changes[key] = memoryDb.changes[key].slice(0, 50);
  }
}

export async function dbGetHistory(employeeName: string): Promise<HistoryRecord[]> {
  const key = (employeeName || '').toLowerCase();
  return memoryDb.history[key] || [];
}

export async function dbRecordHistory(
  employee: string,
  date: string,
  change: string
): Promise<void> {
  const key = (employee || '').toLowerCase();
  if (!memoryDb.history[key]) {
    memoryDb.history[key] = [];
  }

  const record: HistoryRecord = {
    id: `hist_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    employee,
    date,
    change,
    timestamp: new Date().toISOString(),
  };

  memoryDb.history[key].unshift(record);
  if (memoryDb.history[key].length > 100) {
    memoryDb.history[key] = memoryDb.history[key].slice(0, 100);
  }
}

export async function dbResetToCleanStore(): Promise<ServerConfig> {
  memoryDb = {
    config: {
      storeName: DEFAULT_STORE_NAME,
      apiToken: DEFAULT_API_TOKEN,
      adminPin: DEFAULT_ADMIN_PIN,
      employees: DEFAULT_EMPLOYEES,
      visibleMonths: DEFAULT_VISIBLE_MONTHS,
      allMonths: DEFAULT_ALL_MONTHS,
      tableau2Shifts: DEFAULT_TABLEAU2_SHIFTS,
      categories: DEFAULT_CATEGORIES,
    },
    schedules: {},
    dayNotes: {},
    changes: {},
    history: {},
  };
  await saveLocalDbFile();
  return memoryDb.config;
}

export async function dbGetFullBackup(): Promise<DatabaseState> {
  return JSON.parse(JSON.stringify(memoryDb));
}

export async function dbRestoreBackup(backup: Partial<DatabaseState>): Promise<ServerConfig> {
  if (backup && typeof backup === 'object') {
    memoryDb = {
      config: backup.config || memoryDb.config,
      schedules: backup.schedules || {},
      dayNotes: backup.dayNotes || {},
      changes: backup.changes || {},
      history: backup.history || {},
    };
    await saveLocalDbFile();
  }
  return memoryDb.config;
}
