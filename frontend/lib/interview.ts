/** Minimum answered questions required to unlock the post-interview report. */
export const MIN_ANSWERS_FOR_REPORT = 1;

export function isReportUnlocked(answeredCount: number): boolean {
  return answeredCount >= MIN_ANSWERS_FOR_REPORT;
}
