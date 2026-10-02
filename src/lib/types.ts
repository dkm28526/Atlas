// Domain model for a multi-city trip.
//
// The thesis of this planner is density: a traveller with 16 days and 5 cities
// wants the *most* out of each stop, not a leisurely sampler. So the model
// tracks must-see coverage and neighbourhood clustering as first-class data,
// not as presentation details.

export type Category =
  | "landmark"
  | "museum"
  | "food"
  | "nightlife"
  | "nature"
  | "neighborhood"
  | "market"
  | "viewpoint"
  | "daytrip";

export const CATEGORIES: Category[] = [
  "landmark",
  "museum",
  "food",
  "nightlife",
  "nature",
  "neighborhood",
  "market",
  "viewpoint",
  "daytrip",
];

export const CATEGORY_LABELS: Record<Category, string> = {
  landmark: "Landmarks",
  museum: "Museums & art",
  food: "Food",
  nightlife: "Nightlife",
  nature: "Nature & parks",
  neighborhood: "Neighbourhoods",
  market: "Markets",
  viewpoint: "Viewpoints",
  daytrip: "Day trips",
};

/** The three parts of a day the packer fills. */
export type Slot = "morning" | "afternoon" | "evening";
export const SLOTS: Slot[] = ["morning", "afternoon", "evening"];

export type Pace = "relaxed" | "balanced" | "packed";
export type TravelerStyle = "budget" | "mid" | "comfort";

export interface City {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  blurb: string;
  /** Rough on-the-ground spend per day (food + transit + entries), mid-range. */
  dailyBudgetUsd: number;
  /** Below this, the city's must-sees simply cannot fit. Drives warnings. */
  minNights: number;
}

export interface Activity {
  id: string;
  cityId: string;
  name: string;
  category: Category;
  /** Door-to-door hours including queueing. */
  hours: number;
  /** Clustering key — the packer keeps a single day geographically tight. */
  neighborhood: string;
  /** Slots this works in; nightlife is evening-only, markets are morning-ish. */
  bestSlots: Slot[];
  /**
   * Weekdays this is actually open (0 = Sunday). Absent means any day.
   * Closing days are the quiet killer of a dense plan — a Monday in Florence
   * with the Uffizi and the Accademia both shut is a wasted day.
   */
  weekdays?: number[];
  mustSee: boolean;
  blurb: string;
}

export interface Lodging {
  id: string;
  cityId: string;
  name: string;
  kind: "hostel" | "hotel" | "boutique" | "apartment";
  nightlyUsd: number;
  neighborhood: string;
  /** Out of 5. */
  rating: number;
  perks: string[];
  why: string;
}

export interface TripInput {
  /** ISO yyyy-mm-dd. */
  startDate: string;
  endDate: string;
  /** Order matters only for the first entry, which anchors the route. */
  cityIds: string[];
  interests: Category[];
  pace: Pace;
  travelerStyle: TravelerStyle;
}

export type HopMode = "flight" | "train" | "bus";

export interface Hop {
  fromCityId: string;
  toCityId: string;
  km: number;
  mode: HopMode;
  /** Door-to-door hours, including airport overhead for flights. */
  hours: number;
}

export interface Leg {
  cityId: string;
  nights: number;
  /** ISO dates. */
  arriveDate: string;
  departDate: string;
  /** The hop that delivered the traveller here; absent on the first leg. */
  inbound?: Hop;
}

export interface DayBlock {
  slot: Slot;
  activityId?: string;
  /** Set when this slot is spent in transit rather than on an activity. */
  transit?: Hop;
  /** Slots this entry occupies; a day trip swallows two or three. */
  spans?: number;
  note?: string;
}

export interface ItineraryDay {
  date: string;
  /** 1-based day number within the trip. */
  dayIndex: number;
  cityId: string;
  blocks: DayBlock[];
}

export interface Warning {
  level: "info" | "warn";
  cityId?: string;
  message: string;
}

export interface CityCoverage {
  cityId: string;
  nights: number;
  mustSeeTotal: number;
  mustSeeScheduled: number;
  activitiesScheduled: number;
  /** Hours of planned activity per full day in the city. */
  intensity: number;
}

export interface Itinerary {
  input: TripInput;
  legs: Leg[];
  hops: Hop[];
  days: ItineraryDay[];
  /** cityId -> ranked lodging picks, best first. */
  lodging: Record<string, Lodging[]>;
  coverage: CityCoverage[];
  warnings: Warning[];
  stats: {
    totalDays: number;
    totalNights: number;
    totalKm: number;
    cityCount: number;
    activityCount: number;
    /** 0..1 — share of must-sees across all chosen cities that made the plan. */
    mustSeeCoverage: number;
    transitHours: number;
    estLodgingUsd: number;
    estOnGroundUsd: number;
  };
}
