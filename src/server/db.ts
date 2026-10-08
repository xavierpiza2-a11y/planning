import fs from 'fs';
import path from 'path';
import {
  DEFAULT_STORE_NAME,
  DEFAULT_EMPLOYEES,
  DEFAULT_VISIBLE_MONTHS,
  DEFAULT_ALL_MONTHS,
  DEFAULT_TABLEAU2_SHIFTS,
  DEFAULT_CATEGORIES,
} from '../config/constants.ts';

export interface ServerConfig {
  storeName: string;
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
          config: parsed.config || memoryDb.config,
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

export async function dbSaveMonthSchedules(
  monthKey: string,
  teamSchedules: Record<string, EmployeeScheduleData>
): Promise<void> {
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
    const parsed = parseFloat((dayData.hours || '').replace('h', '.').replace(':', '.'));
    if (!isNaN(parsed)) total += parsed;
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
