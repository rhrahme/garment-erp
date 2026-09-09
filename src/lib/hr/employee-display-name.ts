/** Owner spelling: badge 0027 is Farid, never Forid. */
export function correctEmployeeDisplaySpelling(name: string): string {
  return name.replace(/\bForid\b/g, "Farid");
}
