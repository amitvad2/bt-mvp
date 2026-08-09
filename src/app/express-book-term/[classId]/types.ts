/**
 * Types specific to the guest term/programme booking flow.
 */

/**
 * GuestTermClassInfo — Serializable class data passed from the server
 * component (page.tsx) to the client booking wizard.
 */
export interface GuestTermClassInfo {
  id: string;
  name: string;
  type: string;
  startTime: string;
  endTime: string;
  venueName: string;
  venuePostcode?: string;
  ageMin: number;
  ageMax: number;
  termStartDate: string;
  termEndDate: string;
  termPrice: number;
  recurrenceDays: string[];
  spotsAvailable: number;
  maxSize: number;
}
