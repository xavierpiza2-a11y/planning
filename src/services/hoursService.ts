import { Employee, EmployeeMonthSchedule, Tableau2ShiftOption } from '../types/planning';
import { categorizeShift } from '../config/constants';

export interface AnnualExerciseInfo {
  yearStart: number;
  yearEnd: number;
  label: string;
  key: string;
  months: string[]; // 12 month keys from "YYYY-06" to "YYYY+1-05"
  selectedMonthIndex: number; // 0 to 11
  elapsedMonths: number; // 1 to 12
}

/**
 * Returns annual exercise info based on the 1er Juin (N) ➔ 31 Mai (N+1) cycle.
 */
export function getAnnualExercise(targetDateOrMonth?: string | Date): AnnualExerciseInfo {
  let year: number;
  let month: number; // 1 to 12

  if (!targetDateOrMonth) {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth() + 1;
  } else if (typeof targetDateOrMonth === 'string') {
    const parts = targetDateOrMonth.split('-');
    year = parseInt(parts[0], 10) || 2026;
    month = parseInt(parts[1], 10) || 6;
  } else {
    year = targetDateOrMonth.getFullYear();
    month = targetDateOrMonth.getMonth() + 1;
  }

  // If month is June..December (6..12), exercise started June of this year
  // If month is January..May (1..5), exercise started June of previous year
  const yearStart = month >= 6 ? year : year - 1;
  const yearEnd = yearStart + 1;

  const months: string[] = [];
  // June to December of yearStart
  for (let m = 6; m <= 12; m++) {
    months.push(`${yearStart}-${String(m).padStart(2, '0')}`);
  }
  // January to May of yearEnd
  for (let m = 1; m <= 5; m++) {
    months.push(`${yearEnd}-${String(m).padStart(2, '0')}`);
  }

  const currentMonthKey = `${year}-${String(month).padStart(2, '0')}`;
  const selectedMonthIndex = months.indexOf(currentMonthKey);
  const elapsedMonths = selectedMonthIndex >= 0 ? selectedMonthIndex + 1 : 1;

  return {
    yearStart,
    yearEnd,
    label: `1er Juin ${yearStart} – 31 Mai ${yearEnd}`,
    key: `${yearStart}-${yearEnd}`,
    months,
    selectedMonthIndex,
    elapsedMonths,
  };
}

/**
 * Parses worked hours from shift text and hours string.
 */
export function parseWorkedHours(shiftText: string, hoursText?: string): number {
  if (!shiftText && !hoursText) return 0;
  const cat = categorizeShift(shiftText, hoursText);
  if (cat === 'REPOS' || cat === 'CONGES' || cat === 'RTT') {
    return 0;
  }

  const hStr = (hoursText || '').trim();

  // 1. Direct single numeric value like "7", "7h", "7.5", "7,5", "8h"
  const singleNumMatch = hStr.match(/^(\d+(?:[.,]\d+)?)\s*h?$/i);
  if (singleNumMatch) {
    const val = parseFloat(singleNumMatch[1].replace(',', '.'));
    if (!isNaN(val) && val > 0 && val <= 16) return val;
  }

  // 2. Direct format like "7h30" or "8h15"
  const singleHoursMinsMatch = hStr.match(/^(\d{1,2})\s*h\s*(\d{2})$/i);
  if (singleHoursMinsMatch) {
    const h = parseInt(singleHoursMinsMatch[1], 10);
    const m = parseInt(singleHoursMinsMatch[2], 10);
    return Math.round((h + m / 60) * 100) / 100;
  }

  // 3. Time ranges like "9h-12h30 14h-19h" or "8h30/12h30 - 14h/18h"
  const rangeRegex = /(\d{1,2})(?:[h:](\d{2}))?\s*(?:[-/–—]|à)\s*(\d{1,2})(?:[h:](\d{2}))?/gi;
  let totalRangeHours = 0;
  let matchesFound = 0;
  let match: RegExpExecArray | null;

  while ((match = rangeRegex.exec(hStr)) !== null) {
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

  // Fallback based on category
  switch (cat) {
    case 'MATIN':
      return 7;
    case 'SOIR':
      return 7;
    case 'JOURNEE':
      return 7.5;
    case 'FORMATION':
      return 7;
    default:
      return 0;
  }
}

/**
 * Returns ISO week number for a given date string or Date object.
 */
export function getISOWeekNumber(dateInput: string | Date): number {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : new Date(dateInput.getTime());
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Returns all 7 dates (Monday to Sunday) of the week containing dateStr.
 */
export function getWeekDates(dateStr: string): {
  weekNumber: number;
  monday: string;
  sunday: string;
  dateKeys: string[];
  label: string;
} {
  const [yStr, mStr, dStr] = dateStr.split('-');
  const date = new Date(parseInt(yStr, 10), parseInt(mStr, 10) - 1, parseInt(dStr, 10));

  // In JS getDay() returns 0 for Sunday, 1 for Monday...
  const dayOfWeek = date.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const mondayDate = new Date(date);
  mondayDate.setDate(date.getDate() + diffToMonday);

  const dateKeys: string[] = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(mondayDate);
    cur.setDate(mondayDate.getDate() + i);
    const curKey = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
    dateKeys.push(curKey);
  }

  const weekNumber = getISOWeekNumber(date);
  const monday = dateKeys[0];
  const sunday = dateKeys[6];

  return {
    weekNumber,
    monday,
    sunday,
    dateKeys,
    label: `Semaine ${weekNumber} (${monday.slice(8)}/${monday.slice(5, 7)} - ${sunday.slice(8)}/${sunday.slice(5, 7)})`,
  };
}

/**
 * Comprehensive balances & gap data for an employee
 */
export interface EmployeeBalances {
  employeeName: string;
  contractType: 'HEBDO_35H' | 'ANNUALISE' | 'FORFAIT_JOUR';
  contractLabel: string;
  weeklyQuota: number;
  yearlyQuota: number;
  forfaitDaysQuota: number;
  initialHoursBalance: number;

  // Selected Month
  selectedMonth: string;
  monthHours: number;
  expectedMonthHours: number;
  monthBalance: number; // >0: credit (due by employer), <0: debit (due by employee)

  // Target Week (if date provided)
  targetDate?: string;
  weekNumber?: number;
  weekLabel?: string;
  weekHours?: number;
  weekQuota?: number;
  weekBalance?: number;

  // Annual Exercise (1er Juin - 31 Mai)
  exercise: AnnualExerciseInfo;
  exerciseHours: number; // Realized hours so far in exercise + initialHoursBalance
  expectedExerciseHoursAtDate: number; // Theoretical trajectory at this month
  exerciseBalance: number; // Realized - Expected at date (>0: credit, <0: debit)
  exerciseCompletionPercent: number;

  // Leave & RTT Counters (Exercise 1er Juin - 31 Mai)
  paidLeaveTotal: number;
  paidLeaveTaken: number;
  paidLeaveRemaining: number;
  rttTotal: number;
  rttTaken: number;
  rttRemaining: number;

  // Helper status flags
  isCreditMonth: boolean;
  isDebitMonth: boolean;
  isCreditExercise: boolean;
  isDebitExercise: boolean;
}

/**
 * Retrieves a schedule for an employee from memory, localStorage cache or fallback.
 */
function getScheduleFromCache(employeeName: string, monthKey: string): EmployeeMonthSchedule | null {
  if (typeof window === 'undefined') return null;
  const lower = employeeName.toLowerCase();

  // Try direct individual cache
  try {
    const rawIndiv = localStorage.getItem(`planning_cached_sched_${employeeName}_${monthKey}`);
    if (rawIndiv) return JSON.parse(rawIndiv);
  } catch {
    // ignore
  }

  // Try team cache
  try {
    const rawTeam = localStorage.getItem(`planning_cached_team_${monthKey}`);
    if (rawTeam) {
      const parsedTeam = JSON.parse(rawTeam);
      if (parsedTeam[employeeName]) return parsedTeam[employeeName];
      const found = Object.entries(parsedTeam).find(([k]) => k.toLowerCase() === lower);
      if (found) return found[1] as EmployeeMonthSchedule;
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Calculates all live balances and indicators for a given employee.
 */
export function calculateEmployeeBalances(params: {
  employee: Employee;
  selectedMonth: string;
  targetDate?: string;
  currentSchedule?: EmployeeMonthSchedule | null;
  teamSchedules?: Record<string, EmployeeMonthSchedule>;
}): EmployeeBalances {
  const { employee, selectedMonth, targetDate, currentSchedule, teamSchedules } = params;
  const contractType = employee.contractType || 'HEBDO_35H';
  const weeklyQuota = employee.weeklyHoursQuota ?? 35;
  const yearlyQuota = employee.yearlyHoursQuota ?? 1607;
  const forfaitDaysQuota = employee.forfaitDaysQuota ?? 218;
  const initialHoursBalance = employee.initialHoursBalance ?? 0;

  const exercise = getAnnualExercise(selectedMonth);

  // 1. Resolve selected month schedule
  let effectiveMonthSched: EmployeeMonthSchedule | null = currentSchedule || null;
  if (!effectiveMonthSched && teamSchedules) {
    effectiveMonthSched =
      teamSchedules[employee.name] ||
      teamSchedules[employee.name.toLowerCase()] ||
      null;
  }
  if (!effectiveMonthSched) {
    effectiveMonthSched = getScheduleFromCache(employee.name, selectedMonth);
  }

  // Month hours calculation
  let monthHours = 0;
  if (effectiveMonthSched?.days) {
    Object.values(effectiveMonthSched.days).forEach((d) => {
      monthHours += parseWorkedHours(d.shift, d.hours);
    });
  } else if (effectiveMonthSched?.totalHours && effectiveMonthSched.totalHours > 0) {
    monthHours = effectiveMonthSched.totalHours;
  }
  monthHours = Math.round(monthHours * 10) / 10;

  // Expected month hours
  let expectedMonthHours = 0;
  if (contractType === 'HEBDO_35H') {
    // Standard legal French base (35 * 52 / 12 = 151.67h)
    expectedMonthHours = Math.round(((weeklyQuota * 52) / 12) * 10) / 10;
  } else if (contractType === 'ANNUALISE') {
    expectedMonthHours = Math.round((yearlyQuota / 12) * 10) / 10;
  } else {
    expectedMonthHours = 0;
  }

  const monthBalance =
    contractType === 'FORFAIT_JOUR'
      ? 0
      : Math.round((monthHours - expectedMonthHours) * 10) / 10;

  // 2. Week calculation (if targetDate provided)
  let weekNumber: number | undefined;
  let weekLabel: string | undefined;
  let weekHours: number | undefined;
  let weekQuota: number | undefined;
  let weekBalance: number | undefined;

  if (targetDate) {
    const weekInfo = getWeekDates(targetDate);
    weekNumber = weekInfo.weekNumber;
    weekLabel = weekInfo.label;
    weekQuota = weeklyQuota;

    let wHours = 0;
    weekInfo.dateKeys.forEach((dKey) => {
      const dMonth = dKey.slice(0, 7);
      let schedForDay = dMonth === selectedMonth ? effectiveMonthSched : getScheduleFromCache(employee.name, dMonth);
      const dayData = schedForDay?.days ? schedForDay.days[dKey] : undefined;
      if (dayData) {
        wHours += parseWorkedHours(dayData.shift, dayData.hours);
      }
    });
    weekHours = Math.round(wHours * 10) / 10;
    weekBalance = contractType === 'FORFAIT_JOUR' ? 0 : Math.round((weekHours - weeklyQuota) * 10) / 10;
  }

  // 3. Annual Exercise calculation (1er Juin ➔ 31 Mai)
  let totalExerciseHours = initialHoursBalance;
  let leaveShiftsCount = 0;
  let rttShiftsCount = 0;

  exercise.months.forEach((mKey) => {
    const sched = mKey === selectedMonth ? effectiveMonthSched : getScheduleFromCache(employee.name, mKey);
    if (sched?.days) {
      Object.values(sched.days).forEach((day) => {
        const cat = categorizeShift(day.shift, day.hours);
        if (cat === 'CONGES' || (day.shift && /^(conge|cp|ca)/i.test(day.shift.trim()))) {
          leaveShiftsCount++;
        } else if (cat === 'RTT' || (day.shift && /^rtt/i.test(day.shift.trim()))) {
          rttShiftsCount++;
        } else {
          totalExerciseHours += parseWorkedHours(day.shift, day.hours);
        }
      });
    } else if (sched?.totalHours && sched.totalHours > 0) {
      totalExerciseHours += sched.totalHours;
    }
  });

  const exerciseHours = Math.round(totalExerciseHours * 10) / 10;

  // Expected trajectory at current month of exercise
  let expectedExerciseHoursAtDate = 0;
  if (contractType === 'ANNUALISE') {
    expectedExerciseHoursAtDate = Math.round(((yearlyQuota / 12) * exercise.elapsedMonths) * 10) / 10;
  } else if (contractType === 'HEBDO_35H') {
    expectedExerciseHoursAtDate = Math.round((expectedMonthHours * exercise.elapsedMonths) * 10) / 10;
  }

  const exerciseBalance =
    contractType === 'FORFAIT_JOUR'
      ? 0
      : Math.round((exerciseHours - expectedExerciseHoursAtDate) * 10) / 10;

  const exerciseCompletionPercent =
    yearlyQuota > 0 ? Math.min(100, Math.round((exerciseHours / yearlyQuota) * 100)) : 0;

  // 4. Leave & RTT Counters
  const paidLeaveTotal = employee.paidLeaveTotal ?? 25;
  const initialLeaveTaken = employee.paidLeaveTaken ?? 0;
  const paidLeaveTaken = initialLeaveTaken + leaveShiftsCount;
  const paidLeaveRemaining = Math.max(0, paidLeaveTotal - paidLeaveTaken);

  const rttTotal =
    employee.rttTotal ?? (contractType === 'FORFAIT_JOUR' ? 10 : 0);
  const initialRttTaken = employee.rttTaken ?? 0;
  const rttTaken = initialRttTaken + rttShiftsCount;
  const rttRemaining = Math.max(0, rttTotal - rttTaken);

  // Contract label
  let contractLabel = '35h / semaine';
  if (contractType === 'ANNUALISE') contractLabel = `Annualisé (${yearlyQuota}h)`;
  else if (contractType === 'FORFAIT_JOUR') contractLabel = `Forfait Jour (${forfaitDaysQuota}j)`;

  return {
    employeeName: employee.name,
    contractType,
    contractLabel,
    weeklyQuota,
    yearlyQuota,
    forfaitDaysQuota,
    initialHoursBalance,

    selectedMonth,
    monthHours,
    expectedMonthHours,
    monthBalance,

    targetDate,
    weekNumber,
    weekLabel,
    weekHours,
    weekQuota,
    weekBalance,

    exercise,
    exerciseHours,
    expectedExerciseHoursAtDate,
    exerciseBalance,
    exerciseCompletionPercent,

    paidLeaveTotal,
    paidLeaveTaken,
    paidLeaveRemaining,
    rttTotal,
    rttTaken,
    rttRemaining,

    isCreditMonth: monthBalance > 0,
    isDebitMonth: monthBalance < 0,
    isCreditExercise: exerciseBalance > 0,
    isDebitExercise: exerciseBalance < 0,
  };
}

/**
 * Simulates the live impact of changing a single shift on a given date.
 */
export function simulateShiftImpact(params: {
  currentBalances: EmployeeBalances;
  targetDate: string;
  currentShift: string;
  currentHours?: string;
  newOption: Tableau2ShiftOption;
}): {
  deltaHours: number;
  newMonthHours: number;
  newMonthBalance: number;
  newWeekBalance?: number;
  newExerciseHours: number;
  newExerciseBalance: number;
  newPaidLeaveRemaining: number;
  newRttRemaining: number;
  summaryText: string;
  statusType: 'credit' | 'debit' | 'neutral';
} {
  const { currentBalances, currentShift, currentHours, newOption } = params;

  const oldHours = parseWorkedHours(currentShift, currentHours);
  const newHours =
    newOption.hoursDecimal !== undefined && newOption.hoursDecimal >= 0
      ? newOption.hoursDecimal
      : parseWorkedHours(newOption.shift, newOption.hours);

  const deltaHours = Math.round((newHours - oldHours) * 10) / 10;

  const newMonthHours = Math.round((currentBalances.monthHours + deltaHours) * 10) / 10;
  const newMonthBalance = Math.round((currentBalances.monthBalance + deltaHours) * 10) / 10;

  let newWeekBalance: number | undefined;
  if (currentBalances.weekBalance !== undefined) {
    newWeekBalance = Math.round((currentBalances.weekBalance + deltaHours) * 10) / 10;
  }

  const newExerciseHours = Math.round((currentBalances.exerciseHours + deltaHours) * 10) / 10;
  const newExerciseBalance = Math.round((currentBalances.exerciseBalance + deltaHours) * 10) / 10;

  // Impact on leave
  const wasOldLeave = categorizeShift(currentShift, currentHours) === 'CONGES';
  const isNewLeave = newOption.category === 'CONGES' || newOption.shift.toUpperCase() === 'CONGES';
  let newPaidLeaveRemaining = currentBalances.paidLeaveRemaining;
  if (!wasOldLeave && isNewLeave) newPaidLeaveRemaining = Math.max(0, newPaidLeaveRemaining - 1);
  else if (wasOldLeave && !isNewLeave) newPaidLeaveRemaining += 1;

  // Impact on RTT
  const wasOldRtt = categorizeShift(currentShift, currentHours) === 'RTT';
  const isNewRtt = newOption.category === 'RTT' || newOption.shift.toUpperCase() === 'RTT';
  let newRttRemaining = currentBalances.rttRemaining;
  if (!wasOldRtt && isNewRtt) newRttRemaining = Math.max(0, newRttRemaining - 1);
  else if (wasOldRtt && !isNewRtt) newRttRemaining += 1;

  let summaryText = '';
  let statusType: 'credit' | 'debit' | 'neutral' = 'neutral';

  if (deltaHours > 0) {
    statusType = 'credit';
    summaryText = `+${deltaHours}h sur le planning (vous lui devrez ${Math.abs(newExerciseBalance)}h sur l'année)`;
  } else if (deltaHours < 0) {
    statusType = 'debit';
    summaryText = `${deltaHours}h sur le planning (${newExerciseBalance < 0 ? `il vous devra ${Math.abs(newExerciseBalance)}h sur l'année` : `solde restant dû : +${newExerciseBalance}h`})`;
  } else {
    statusType = 'neutral';
    summaryText = `Aucun changement d'heures (solde année : ${newExerciseBalance > 0 ? `+${newExerciseBalance}h` : `${newExerciseBalance}h`})`;
  }

  return {
    deltaHours,
    newMonthHours,
    newMonthBalance,
    newWeekBalance,
    newExerciseHours,
    newExerciseBalance,
    newPaidLeaveRemaining,
    newRttRemaining,
    summaryText,
    statusType,
  };
}
