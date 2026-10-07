import { bureauConfig } from '../common/config/cibilConfig';
import { PayoutStatus } from './enums';

export function convertBigIntToString(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'bigint') return obj.toString();

  if (Array.isArray(obj)) return obj.map(convertBigIntToString);

  if (typeof obj === 'object') {
    const res: any = {};
    for (const key in obj) {
      res[key] = convertBigIntToString(obj[key]);
    }
    return res;
  }

  return obj;
}

export function normalize(obj: any) {
  return JSON.parse(
    JSON.stringify(obj, (_, v) => (typeof v === 'bigint' ? Number(v) : v)),
  );
}

export function normalizeData(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'bigint') {
    return obj.toString();
  }

  if (obj instanceof Date) {
    return obj.toISOString();
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => normalizeData(item));
  }

  if (typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [key, normalizeData(value)]),
    );
  }

  return obj;
}

export function convertBigIntToStringNew(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'bigint') {
    return obj.toString();
  }

  // ✅ Handle Date properly
  if (obj instanceof Date) {
    return obj.toISOString(); // or obj.toString() if you prefer
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => convertBigIntToString(item));
  }

  if (typeof obj === 'object') {
    const newObj: any = {};
    for (const key in obj) {
      newObj[key] = convertBigIntToString(obj[key]);
    }
    return newObj;
  }

  return obj;
}

export function getAgeFromDOB(dobStr: any): number {
  if (!dobStr) return NaN;

  const dob = new Date(dobStr);

  if (isNaN(dob.getTime())) {
    console.error('Invalid DOB:', dobStr);
    return NaN;
  }

  const today = new Date();

  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();

  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--;
  }

  return age;
}

export function toDMYFromISO(dateStr: any): string {
  const date = new Date(dateStr);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

export function toYMDFromISO(dateStr: any): string {
  const date = new Date(dateStr);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${year}-${month}-${day}`;
}

export function cibilResToJson(cibildata: any) {
  if (!cibildata) {
    return { error: 'No data found', status: 404 };
  }

  let raw =
    typeof cibildata === 'string' ? cibildata : JSON.stringify(cibildata);

  raw = raw.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t');

  const htmlStartIndex = raw.indexOf('<!DOCTYPE html');
  if (htmlStartIndex === -1) {
    return { error: 'JSON not found in payload', status: 404 };
  }

  const jsonPartRaw = raw.substring(0, htmlStartIndex).trim();

  let jsonPart;
  try {
    jsonPart = JSON.parse(jsonPartRaw);
  } catch (err) {
    return { error: 'Invalid JSON format', status: 500 };
  }

  // Optional: Save locally
  //   fs.writeFileSync("cibit.json", JSON.stringify(jsonPart, null, 2), "utf8");

  return { analyserData: jsonPart, status: 200 };
}

export function parseAadhaarAddress(address: string) {
  // Indian state names and their codes
  const states: any = {
    'ANDHRA PRADESH': 'AP',
    'ARUNACHAL PRADESH': 'AR',
    ASSAM: 'AS',
    BIHAR: 'BR',
    CHHATTISGARH: 'CG',
    GOA: 'GA',
    GUJARAT: 'GJ',
    HARYANA: 'HR',
    'HIMACHAL PRADESH': 'HP',
    JHARKHAND: 'JH',
    KARNATAKA: 'KA',
    KERALA: 'KL',
    'MADHYA PRADESH': 'MP',
    MAHARASHTRA: 'MH',
    MANIPUR: 'MN',
    MEGHALAYA: 'ML',
    MIZORAM: 'MZ',
    NAGALAND: 'NL',
    ODISHA: 'OR',
    ORISSA: 'OR',
    PUNJAB: 'PB',
    RAJASTHAN: 'RJ',
    SIKKIM: 'SK',
    'TAMIL NADU': 'TN',
    TELANGANA: 'TS',
    TRIPURA: 'TR',
    'UTTAR PRADESH': 'UP',
    UTTARAKHAND: 'UK',
    'WEST BENGAL': 'WB',
    DELHI: 'DL',
    'JAMMU AND KASHMIR': 'JK',
    LADAKH: 'LA',
    CHANDIGARH: 'CH',
    'ANDAMAN AND NICOBAR ISLANDS': 'AN',
    'DAMAN AND DIU': 'DD',
    'DADRA AND NAGAR HAVELI': 'DN',
    PUDUCHERRY: 'PY',
    Pondicherry: 'PY',
    LAKSHADWEEP: 'LD',
  };

  const normalized = address
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/,\s*,/g, ',')
    .trim();

  let pin = '';
  let state = '';
  let city = '';

  // ✅ Extract PIN
  const pinMatch = normalized.match(/\b\d{6}\b/);
  if (pinMatch) pin = pinMatch[0];

  // ✅ Extract State (fuzzy)
  for (const key in states) {
    if (normalized.includes(key)) {
      state = states[key];
      break;
    }
  }

  // ✅ Split parts
  let parts = normalized
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  // ❌ Remove noise words
  const noise = ['NEAR', 'HOUSE NO', 'C/O', 'ROAD', 'STREET'];

  parts = parts.filter(
    (p) =>
      !noise.some((n) => p.includes(n)) &&
      p !== pin &&
      !Object.keys(states).includes(p),
  );

  // ✅ Count frequency to find most probable city
  const freq: Record<string, number> = {};
  parts.forEach((p) => {
    freq[p] = (freq[p] || 0) + 1;
  });

  // Pick most repeated OR last meaningful
  city =
    Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ||
    parts[parts.length - 1] ||
    '';

  return { city, state, pin };
}

export function getDateRange(
  period?: string,
  startDate?: string,
  endDate?: string,
) {
  const now = new Date();

  let fromDate: Date | null = null;
  let toDate: Date | null = null;

  switch (period) {
    case 'today':
      fromDate = new Date(now.setHours(0, 0, 0, 0));
      toDate = new Date(new Date().setHours(23, 59, 59, 999));
      break;

    case 'yesterday':
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      fromDate = new Date(yesterday.setHours(0, 0, 0, 0));
      toDate = new Date(yesterday.setHours(23, 59, 59, 999));
      break;

    case 'thismonth':
      fromDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      toDate = new Date();
      break;

    case 'last7days':
      fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 6);
      fromDate.setHours(0, 0, 0, 0);
      toDate = new Date();
      break;

    case 'last30days':
      fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 29);
      fromDate.setHours(0, 0, 0, 0);
      toDate = new Date();
      break;

    case 'lastYear':
      fromDate = new Date(new Date().getFullYear() - 1, 0, 1);
      toDate = new Date(new Date().getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      break;

    case 'tillnow':
    case 'alltime':
      fromDate = null;
      toDate = null;
      break;

    case 'customrange':
      if (!startDate || !endDate) {
        throw new Error('startDate and endDate are required for customrange');
      }
      fromDate = new Date(startDate);
      fromDate.setHours(0, 0, 0, 0);
      toDate = new Date(endDate);
      toDate.setHours(23, 59, 59, 999);
      break;

    default:
      getDateRange('today');
  }

  return { fromDate, toDate };
}

export function getComparisonDateRange(
  period: string,
  fromDate: Date | null,
  toDate: Date | null,
) {
  if (!fromDate || !toDate) {
    return { prevFromDate: null, prevToDate: null };
  }

  switch (period) {
    case 'today': {
      const prevFromDate = new Date(fromDate);
      prevFromDate.setDate(prevFromDate.getDate() - 1);

      const prevToDate = new Date(toDate);
      prevToDate.setDate(prevToDate.getDate() - 1);

      return { prevFromDate, prevToDate };
    }

    case 'yesterday': {
      const prevFromDate = new Date(fromDate);
      prevFromDate.setDate(prevFromDate.getDate() - 1);

      const prevToDate = new Date(toDate);
      prevToDate.setDate(prevToDate.getDate() - 1);

      return { prevFromDate, prevToDate };
    }

    case 'thismonth': {
      const year = fromDate.getFullYear();
      const month = fromDate.getMonth();

      const prevFromDate = new Date(year, month - 1, 1);
      const prevToDate = new Date(year, month, 0, 23, 59, 59, 999);

      return { prevFromDate, prevToDate };
    }

    case 'last7days':
    case 'last30days':
    case 'customrange': {
      const diff = toDate.getTime() - fromDate.getTime();

      const prevFromDate = new Date(fromDate.getTime() - diff - 1);
      const prevToDate = new Date(toDate.getTime() - diff - 1);

      return { prevFromDate, prevToDate };
    }

    case 'lastYear': {
      const prevFromDate = new Date(fromDate.getFullYear() - 1, 0, 1);
      const prevToDate = new Date(
        fromDate.getFullYear() - 1,
        11,
        31,
        23,
        59,
        59,
        999,
      );

      return { prevFromDate, prevToDate };
    }

    default:
      return { prevFromDate: null, prevToDate: null };
  }
}

export function buildTrendSummary(currentTotal: number, previousTotal: number) {
  let percentageChange = 0;

  if (previousTotal === 0 && currentTotal > 0) {
    percentageChange = 100;
  } else if (previousTotal > 0) {
    percentageChange = ((currentTotal - previousTotal) / previousTotal) * 100;
  }

  return {
    currentTotal,
    previousTotal,
    percentageChange: Number(percentageChange.toFixed(2)),
    trend:
      percentageChange > 0 ? 'UP' : percentageChange < 0 ? 'DOWN' : 'NO_CHANGE',
  };
}

export function toLocalDateString(date: Date | null): string | null {
  if (!date) return null;

  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);

  return local.toISOString().slice(0, 10); // YYYY-MM-DD
}

export function dateOnlyToDateTimeRange(dateStr: string) {
  return {
    gte: new Date(`${dateStr}T00:00:00.000Z`),
    lte: new Date(`${dateStr}T23:59:59.999Z`),
  };
}

export const STATE_NORMALIZATION_MAP: Record<string, string> = {
  'uttar pradesh': 'Uttar Pradesh',
  'u.p.': 'Uttar Pradesh',
  up: 'Uttar Pradesh',

  maharashtra: 'Maharashtra',
  mh: 'Maharashtra',

  delhi: 'Delhi',
  'nct of delhi': 'Delhi',

  'tamil nadu': 'Tamil Nadu',
  tn: 'Tamil Nadu',

  // add more if needed
};

export function normalizeState(state?: string): string {
  if (!state) return 'Unknown';

  const key = state.trim().toLowerCase();

  return (
    STATE_NORMALIZATION_MAP[key] ??
    key
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  );
}

export function mapStatus(status: string): PayoutStatus {
  switch (status) {
    case 'queued':
      return PayoutStatus.QUEUED;
    case 'pending':
      return PayoutStatus.PENDING;
    case 'processing':
      return PayoutStatus.PROCESSING;
    case 'processed':
      return PayoutStatus.PROCESSED;
    case 'failed':
      return PayoutStatus.FAILED;
    case 'rejected':
      return PayoutStatus.REJECTED;
    case 'reversed':
      return PayoutStatus.REVERSED;
    default:
      throw new Error(`Unknown payout status ${status}`);
  }
}

export function isTerminalStatus(status: PayoutStatus) {
  return [
    PayoutStatus.PROCESSED,
    PayoutStatus.FAILED,
    PayoutStatus.REJECTED,
    PayoutStatus.REVERSED,
  ].includes(status);
}

export const formatDateYYYYMMDD = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

export function getBureauConfig(host: string) {
  return (
    bureauConfig[host] ?? {
      enabled: false,
      environment: 'prod',
      bureau: 'none',
      softPull: false,
      hardPull: false,
      isAnalysis: false,
    }
  );
}
