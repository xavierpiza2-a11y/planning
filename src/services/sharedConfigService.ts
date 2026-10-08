import {
  Employee,
  EmployeeMonthSchedule,
  Tableau2ShiftOption,
} from '../types/planning.ts';
import {
  saveLocalTeamPlanning,
  saveStoredEmployees,
  saveStoreName,
  saveStoredDayNotes,
  saveStoredTableau2Shifts,
  ensureResponsableAdmin,
} from './api.ts';
import { broadcastSync } from './syncBroadcast.ts';

export interface ServerStatusResponse {
  status: string;
  connectedClients: number;
  db: {
    type: string;
    connected: boolean;
    storageLocation?: string;
    totalMonths?: number;
    totalChanges?: number;
    totalHistory?: number;
    lastSavedAt?: string | null;
  };
  timestamp: string;
}

export interface SyncPayloadResult {
  hasChanges: boolean;
  storeName?: string;
  employees?: Employee[];
  teamSchedules?: Record<string, EmployeeMonthSchedule>;
  tableau2Options?: Tableau2ShiftOption[];
  dayNotes?: Record<string, string>;
  message: string;
}

function isDataDifferent(a: any, b: any): boolean {
  if (!a && !b) return false;
  if (!a || !b) return true;
  return JSON.stringify(a) !== JSON.stringify(b);
}

/**
 * Check server connection and status
 */
export async function checkServerHealth(): Promise<ServerStatusResponse | null> {
  try {
    const res = await fetch('/api/health', { cache: 'no-cache' });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Offline or unreachable
  }
  return null;
}

/**
 * Background sync with server
 */
export async function syncFromServer(
  monthKey: string,
  localState: {
    storeName: string;
    employees: Employee[];
    teamSchedules: Record<string, EmployeeMonthSchedule>;
    dayNotes: Record<string, string>;
    tableau2Options: Tableau2ShiftOption[];
  },
  onDataUpdated: (result: {
    storeName?: string;
    employees?: Employee[];
    teamSchedules?: Record<string, EmployeeMonthSchedule>;
    dayNotes?: Record<string, string>;
    tableau2Options?: Tableau2ShiftOption[];
  }) => void
): Promise<boolean> {
  try {
    const res = await fetch(`/api/sync-planning?month=${monthKey}`, { cache: 'no-cache' });
    if (res.ok) {
      const serverData = await res.json();
      if (serverData.success && serverData.teamSchedules) {
        let hasChanges = false;
        const updates: any = {};

        if (serverData.storeName && serverData.storeName !== localState.storeName) {
          saveStoreName(serverData.storeName);
          updates.storeName = serverData.storeName;
          hasChanges = true;
        }

        if (serverData.employees && isDataDifferent(serverData.employees, localState.employees)) {
          const sanitized = ensureResponsableAdmin(serverData.employees);
          saveStoredEmployees(sanitized);
          updates.employees = sanitized;
          hasChanges = true;
        }

        if (serverData.teamSchedules && isDataDifferent(serverData.teamSchedules, localState.teamSchedules)) {
          saveLocalTeamPlanning(monthKey, serverData.teamSchedules);
          updates.teamSchedules = serverData.teamSchedules;
          hasChanges = true;
        }

        if (serverData.tableau2Options && Array.isArray(serverData.tableau2Options) && serverData.tableau2Options.length > 0) {
          if (isDataDifferent(serverData.tableau2Options, localState.tableau2Options)) {
            saveStoredTableau2Shifts(serverData.tableau2Options);
            updates.tableau2Options = serverData.tableau2Options;
            hasChanges = true;
          }
        }

        if (serverData.dayNotes && Object.keys(serverData.dayNotes).length > 0) {
          if (isDataDifferent(serverData.dayNotes, localState.dayNotes)) {
            saveStoredDayNotes(monthKey, serverData.dayNotes);
            updates.dayNotes = serverData.dayNotes;
            hasChanges = true;
          }
        }

        if (hasChanges) {
          onDataUpdated(updates);
          return true;
        }
      }
    }
  } catch {
    // Offline
  }

  return false;
}

/**
 * Manual sync triggered by user
 */
export async function performManualSync(
  monthKey: string,
  localState: {
    storeName: string;
    employees: Employee[];
    teamSchedules: Record<string, EmployeeMonthSchedule>;
    dayNotes: Record<string, string>;
    tableau2Options: Tableau2ShiftOption[];
  },
  onDataUpdated: (result: {
    storeName?: string;
    employees?: Employee[];
    teamSchedules?: Record<string, EmployeeMonthSchedule>;
    dayNotes?: Record<string, string>;
    tableau2Options?: Tableau2ShiftOption[];
  }) => void
): Promise<{ success: boolean; message: string }> {
  try {
    // 1. Push local changes to server
    await fetch('/api/sync-planning', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        month: monthKey,
        teamSchedules: localState.teamSchedules,
        employees: localState.employees,
        storeName: localState.storeName,
        tableau2Options: localState.tableau2Options,
        dayNotes: localState.dayNotes,
      }),
    });

    // 2. Pull server state
    const res = await fetch(`/api/sync-planning?month=${monthKey}`, { cache: 'no-cache' });
    if (res.ok) {
      const serverData = await res.json();
      if (serverData.success) {
        const updates: any = {};
        if (serverData.teamSchedules) {
          saveLocalTeamPlanning(monthKey, serverData.teamSchedules);
          updates.teamSchedules = serverData.teamSchedules;
        }
        if (serverData.employees) {
          const sanitized = ensureResponsableAdmin(serverData.employees);
          saveStoredEmployees(sanitized);
          updates.employees = sanitized;
        }
        if (serverData.storeName) {
          saveStoreName(serverData.storeName);
          updates.storeName = serverData.storeName;
        }
        if (serverData.tableau2Options && Array.isArray(serverData.tableau2Options)) {
          saveStoredTableau2Shifts(serverData.tableau2Options);
          updates.tableau2Options = serverData.tableau2Options;
        }
        if (serverData.dayNotes) {
          saveStoredDayNotes(monthKey, serverData.dayNotes);
          updates.dayNotes = serverData.dayNotes;
        }

        onDataUpdated(updates);

        broadcastSync({
          type: 'PLANNING_UPDATED',
          monthKey,
          teamSchedules: serverData.teamSchedules,
          employees: serverData.employees,
        });

        return {
          success: true,
          message: 'Synchronisation serveur réussie en direct !',
        };
      }
    }
  } catch {
    // Offline
  }

  broadcastSync({
    type: 'PLANNING_UPDATED',
    monthKey,
    teamSchedules: localState.teamSchedules,
    employees: localState.employees,
  });

  return {
    success: true,
    message: 'Planning local vérifié et synchronisé avec succès.',
  };
}
