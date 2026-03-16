export function getCurrentSchoolYearStart(date: Date = new Date()): number {
  const year = date.getFullYear();
  const month = date.getMonth();
  // Academic year rolls over at the start of August.
  return month >= 7 ? year : year - 1;
}

export function getAcademicYearStart(termName: string, calendarYear: number): number {
  return termName.toLowerCase() === 'fall' ? calendarYear : calendarYear - 1;
}

export function getCurrentAcademicYearStanding(
  currentAcademicYear?: number | null,
): number | null {
  if (!currentAcademicYear || currentAcademicYear <= 0) {
    return null;
  }

  return Math.max(1, currentAcademicYear);
}

export function getAdjustedAcademicYearStanding(
  currentAcademicYear?: number | null,
  targetTermName?: string | null,
  targetCalendarYear?: number | null,
  date: Date = new Date()
): number | null {
  const baselineStanding = getCurrentAcademicYearStanding(currentAcademicYear);
  if (baselineStanding === null) {
    return null;
  }

  if (!targetTermName || !targetCalendarYear) {
    return baselineStanding;
  }

  const baselineSchoolYearStart = getCurrentSchoolYearStart(date);
  const targetSchoolYearStart = getAcademicYearStart(targetTermName, targetCalendarYear);
  return Math.max(1, baselineStanding + (targetSchoolYearStart - baselineSchoolYearStart));
}

export function isFinalAcademicYear(
  gradYear?: number | null,
  targetTermName?: string | null,
  targetCalendarYear?: number | null,
  date: Date = new Date()
): boolean {
  if (!gradYear || gradYear <= 0) {
    return false;
  }

  const schoolYearStart = targetTermName && targetCalendarYear
    ? getAcademicYearStart(targetTermName, targetCalendarYear)
    : getCurrentSchoolYearStart(date);

  // gradYear is the spring year ending the student's final academic year.
  return schoolYearStart + 1 === gradYear;
}

export function getDefaultGraduationYearForStanding(
  currentAcademicYear: number,
  date: Date = new Date()
): number {
  const schoolYearStart = getCurrentSchoolYearStart(date);
  return schoolYearStart + Math.max(1, 5 - currentAcademicYear);
}

export function getDefaultStandingForGraduationYear(
  gradYear: number,
  date: Date = new Date()
): number {
  const schoolYearStart = getCurrentSchoolYearStart(date);
  return Math.max(1, 4 - (gradYear - (schoolYearStart + 1)));
}
