
export interface StaffMember {
  fullName: string;
  displayName: string; // The "First 2 words" name
  originalName?: string;
}

export interface RosterEntry {
  id: string;
  date: string; // yyyy/mm/dd
  rawIn: string; // hh:mm
  rawOut: string; // hh:mm
  name: string; // Display Name (Matched)
  combine: string; // "hh:mm-hh:mm Name"
}

export interface GeminiRosterOutput {
  entries: {
    date: string;
    rawIn: string;
    rawOut: string;
    name: string;
    originalHandwriting?: string;
  }[];
}
