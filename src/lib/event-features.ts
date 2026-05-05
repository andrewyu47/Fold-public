export type EventInput = {
  name: string;
  type: string | null;
  location: string | null;
  notes: string | null;
  startDate: Date;
};

export type EventFeatures = {
  hasFood: boolean;
  onCampus: boolean;
  dayOfWeek: number;
  dayName: string;
  monthOfYear: number;
  monthName: string;
};

const FOOD_RE = /\b(food|pizza|dinner|lunch|brunch|breakfast|bbq|grill|grilling|snack|snacks|meal|boba|cookies|donuts|burrito|tacos|wings|ramen|hotpot|hot pot|potluck)\b|\bfree[\s-]{0,5}(food|meal|pizza)\b/i;

const ON_CAMPUS_RE = /\b(campus|hall|lounge|library|hub|union|quad|dorm|commons|center|gym|chapel)\b/i;

const OFF_CAMPUS_HINT_RE = /\b(loft|apt|apartment|house|home|airbnb)\b/i;
const STREET_ADDRESS_RE = /\b\d{2,5}\b.{0,20}\b(st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|ln|lane|way|pl|place)\b/i;

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function extractFeatures(e: EventInput): EventFeatures {
  const haystack = [e.name, e.type ?? "", e.notes ?? ""].join(" ");
  const locationHaystack = [e.location ?? "", e.name].join(" ");

  const hasFood = FOOD_RE.test(haystack);

  const onCampusHit = ON_CAMPUS_RE.test(locationHaystack);
  const offCampusHit = OFF_CAMPUS_HINT_RE.test(locationHaystack) || STREET_ADDRESS_RE.test(locationHaystack);
  const onCampus = onCampusHit && !offCampusHit;

  const d = e.startDate;
  const dow = d.getDay();
  const m = d.getMonth();

  return {
    hasFood,
    onCampus,
    dayOfWeek: dow,
    dayName: DAY_NAMES[dow],
    monthOfYear: m + 1,
    monthName: MONTH_NAMES[m],
  };
}

export type FeaturedEvent = {
  id: number;
  name: string;
  startDate: Date;
  count: number;
  features: EventFeatures;
  /** Health-metric data — present only after enrichment. */
  newAttendees?: number;
  invitedNewAttendees?: number;
  /** newAttendees > 0 ? invitedNewAttendees / newAttendees : 0 */
  inviteRatio?: number;
};

type Bucket = { key: string; count: number; avg: number; n: number };
type InviteBucket = { key: string; events: number; avgInviteRatio: number };

export type EventAggregates = {
  totalEvents: number;
  totalAttendance: number;
  avgAttendance: number;
  food: { withFood: Bucket; withoutFood: Bucket } | null;
  campus: { onCampus: Bucket; offCampus: Bucket } | null;
  byDay: Bucket[];
  byMonth: Bucket[];
  topEvents: { name: string; date: string; count: number }[];
  bottomEvents: { name: string; date: string; count: number }[];
  /** Invite-driven attendance metrics — null when no events have invitedById data. */
  invite: {
    /** Across all events: avg inviteRatio. */
    avgInviteRatio: number;
    /** Total new attendees across all events. */
    totalNew: number;
    /** Total invited (i.e. tagged with invitedById) new attendees across all events. */
    totalInvitedNew: number;
    byFood: { withFood: InviteBucket; withoutFood: InviteBucket } | null;
    byCampus: { onCampus: InviteBucket; offCampus: InviteBucket } | null;
    byMonth: InviteBucket[];
    /** Events with the highest inviteRatio (top 3). */
    topInviteEvents: { name: string; date: string; ratio: number; n: number }[];
  } | null;
};

const MIN_BUCKET = 2;

function makeBucket(key: string, counts: number[]): Bucket {
  const n = counts.length;
  const sum = counts.reduce((a, b) => a + b, 0);
  return { key, count: sum, n, avg: n === 0 ? 0 : sum / n };
}

export function aggregate(events: FeaturedEvent[]): EventAggregates {
  const total = events.length;
  const totalAtt = events.reduce((a, e) => a + e.count, 0);

  const withFood = events.filter((e) => e.features.hasFood).map((e) => e.count);
  const withoutFood = events.filter((e) => !e.features.hasFood).map((e) => e.count);
  const food =
    withFood.length >= MIN_BUCKET && withoutFood.length >= MIN_BUCKET
      ? { withFood: makeBucket("with food", withFood), withoutFood: makeBucket("without food", withoutFood) }
      : null;

  const onC = events.filter((e) => e.features.onCampus).map((e) => e.count);
  const offC = events.filter((e) => !e.features.onCampus).map((e) => e.count);
  const campus =
    onC.length >= MIN_BUCKET && offC.length >= MIN_BUCKET
      ? { onCampus: makeBucket("on campus", onC), offCampus: makeBucket("off campus", offC) }
      : null;

  const dayMap = new Map<number, number[]>();
  for (const e of events) {
    const arr = dayMap.get(e.features.dayOfWeek) ?? [];
    arr.push(e.count);
    dayMap.set(e.features.dayOfWeek, arr);
  }
  const byDay: Bucket[] = [];
  for (let d = 0; d < 7; d++) {
    const arr = dayMap.get(d) ?? [];
    if (arr.length >= 1) byDay.push(makeBucket(DAY_NAMES[d], arr));
  }

  const monthMap = new Map<number, number[]>();
  for (const e of events) {
    const arr = monthMap.get(e.features.monthOfYear) ?? [];
    arr.push(e.count);
    monthMap.set(e.features.monthOfYear, arr);
  }
  const byMonth: Bucket[] = [];
  for (let m = 1; m <= 12; m++) {
    const arr = monthMap.get(m) ?? [];
    if (arr.length >= 1) byMonth.push(makeBucket(MONTH_NAMES[m - 1], arr));
  }

  const sorted = [...events].sort((a, b) => b.count - a.count);
  const fmt = (e: FeaturedEvent) => ({
    name: e.name,
    date: e.startDate.toLocaleDateString(),
    count: e.count,
  });

  // ---- invite-driven attendance ----
  const eventsWithInviteData = events.filter((e) => typeof e.inviteRatio === "number");
  let invite: EventAggregates["invite"] = null;
  if (eventsWithInviteData.length >= 1) {
    const totalNew = eventsWithInviteData.reduce((a, e) => a + (e.newAttendees ?? 0), 0);
    const totalInvitedNew = eventsWithInviteData.reduce(
      (a, e) => a + (e.invitedNewAttendees ?? 0),
      0
    );

    const inviteBucket = (key: string, list: FeaturedEvent[]): InviteBucket => {
      const ratios = list.map((e) => e.inviteRatio ?? 0);
      const avg = ratios.length === 0 ? 0 : ratios.reduce((a, b) => a + b, 0) / ratios.length;
      return { key, events: list.length, avgInviteRatio: avg };
    };

    const byFoodList = {
      withFood: eventsWithInviteData.filter((e) => e.features.hasFood),
      withoutFood: eventsWithInviteData.filter((e) => !e.features.hasFood),
    };
    const byCampusList = {
      onCampus: eventsWithInviteData.filter((e) => e.features.onCampus),
      offCampus: eventsWithInviteData.filter((e) => !e.features.onCampus),
    };

    const byFood =
      byFoodList.withFood.length >= MIN_BUCKET && byFoodList.withoutFood.length >= MIN_BUCKET
        ? {
            withFood: inviteBucket("with food", byFoodList.withFood),
            withoutFood: inviteBucket("without food", byFoodList.withoutFood),
          }
        : null;
    const byCampusInv =
      byCampusList.onCampus.length >= MIN_BUCKET && byCampusList.offCampus.length >= MIN_BUCKET
        ? {
            onCampus: inviteBucket("on campus", byCampusList.onCampus),
            offCampus: inviteBucket("off campus", byCampusList.offCampus),
          }
        : null;

    const byMonthInv: InviteBucket[] = [];
    for (let m = 1; m <= 12; m++) {
      const inMonth = eventsWithInviteData.filter((e) => e.features.monthOfYear === m);
      if (inMonth.length >= 1) byMonthInv.push(inviteBucket(MONTH_NAMES[m - 1], inMonth));
    }

    const topInviteEvents = [...eventsWithInviteData]
      .filter((e) => (e.newAttendees ?? 0) >= 1)
      .sort((a, b) => (b.inviteRatio ?? 0) - (a.inviteRatio ?? 0))
      .slice(0, 3)
      .map((e) => ({
        name: e.name,
        date: e.startDate.toLocaleDateString(),
        ratio: e.inviteRatio ?? 0,
        n: e.newAttendees ?? 0,
      }));

    const allRatios = eventsWithInviteData.map((e) => e.inviteRatio ?? 0);
    const avgInviteRatio =
      allRatios.length === 0 ? 0 : allRatios.reduce((a, b) => a + b, 0) / allRatios.length;

    invite = {
      avgInviteRatio,
      totalNew,
      totalInvitedNew,
      byFood,
      byCampus: byCampusInv,
      byMonth: byMonthInv,
      topInviteEvents,
    };
  }

  return {
    totalEvents: total,
    totalAttendance: totalAtt,
    avgAttendance: total === 0 ? 0 : totalAtt / total,
    food,
    campus,
    byDay,
    byMonth,
    topEvents: sorted.slice(0, 3).map(fmt),
    bottomEvents: sorted.slice(-3).reverse().map(fmt),
    invite,
  };
}
