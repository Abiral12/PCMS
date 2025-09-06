// app/api/lunch/overview/route.ts
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import LunchLog from '@/models/LunchLog';
import LunchTime from '@/models/lunch';
import Employee from '@/models/Employee';

type LunchType = 'lunch-start' | 'lunch-end';
type LogDoc = {
  _id: string;
  employeeId: string;
  type: LunchType;
  timestamp: string;
  imageData?: string;
};

function parseDateParam(s: string | null, isEnd = false): Date | null {
  if (!s) return null;

  // If only a date (YYYY-MM-DD), expand to whole UTC day
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00.000Z`);
    if (isEnd) d.setUTCHours(23, 59, 59, 999);
    return d;
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function getRange(search: URLSearchParams) {
  const now = new Date();

  // Prefer explicit ISO bounds when provided
  const fromISO = parseDateParam(search.get('fromISO') || null, false);
  const toISO   = parseDateParam(search.get('toISO') || null, true);
  if (fromISO && toISO) return { from: fromISO, to: toISO };

  // Otherwise support from/to as date-only or datetimes
  const to = parseDateParam(search.get('to'), true) || now;
  const from = parseDateParam(search.get('from'), false)
            || new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000); // last 30 days
  return { from, to };
}


function weekdayName(d: Date) {
  return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()];
}

function msToHMS(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}

/** pair start/end in order and compute durations */
function pairLogs(logs: LogDoc[]) {
  const pairs: Array<{
    date: string; // yyyy-mm-dd
    start?: LogDoc;
    end?: LogDoc;
    durationMs: number;
  }> = [];

  let open: LogDoc | null = null;

  for (const log of logs.sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())) {
    const dayKey = new Date(log.timestamp).toISOString().split('T')[0];
    if (log.type === 'lunch-start') {
      // if there was an open start without end, push it as open pair and start new
      if (open) {
        pairs.push({ date: new Date(open.timestamp).toISOString().split('T')[0], start: open, end: undefined, durationMs: 0 });
      }
      open = log;
    } else {
      if (open) {
        const start = new Date(open.timestamp).getTime();
        const end = new Date(log.timestamp).getTime();
        const duration = Math.max(0, end - start);
        pairs.push({ date: dayKey, start: open, end: log, durationMs: duration });
        open = null;
      } else {
        // orphan end — add as pair with no start
        pairs.push({ date: dayKey, start: undefined, end: log, durationMs: 0 });
      }
    }
  }

  if (open) {
    pairs.push({ date: new Date(open.timestamp).toISOString().split('T')[0], start: open, end: undefined, durationMs: 0 });
  }

  return pairs;
}

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);

    // employeeId from query OR header (x-user-id)
    const employeeId = searchParams.get('employeeId') || req.headers.get('x-user-id') || '';
    if (!employeeId) {
      return NextResponse.json({ success: false, error: 'Missing employeeId' }, { status: 400 });
    }

    const { from, to } = getRange(searchParams);

    // basic employee name (optional)
    const emp = await Employee.findById(employeeId).select('name').lean();
    const employeeName = (emp as any)?.name || undefined;

    // schedule (there is typically one record per employee)
    const schedule = await LunchTime.findOne({ employeeId }).lean();

    // logs in range
    const logs = await LunchLog.find({
      employeeId,
      timestamp: { $gte: from, $lte: to },
    })
      .sort({ timestamp: 1 })
      .lean<LogDoc[]>();

    // pair + compute per-day totals
    const pairs = pairLogs(logs);
    const byDayMap = new Map<
      string,
      { date: string; totalMs: number; items: typeof pairs }
    >();

    for (const p of pairs) {
      const existing = byDayMap.get(p.date) || { date: p.date, totalMs: 0, items: [] as typeof pairs };
      existing.totalMs += p.durationMs;
      existing.items.push(p);
      byDayMap.set(p.date, existing);
    }

    const byDay = Array.from(byDayMap.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // today's status
    const todayKey = new Date().toISOString().split('T')[0];
    const todayPairs = pairs.filter(p => p.date === todayKey);
    const lastToday = todayPairs[todayPairs.length - 1];
    const inProgress =
      lastToday && lastToday.start && !lastToday.end ? true : false;
    const startedAt = lastToday?.start?.timestamp;
    const endedAt = lastToday?.end?.timestamp;
    const currentDurationMs =
      inProgress && startedAt ? (Date.now() - new Date(startedAt).getTime()) : (lastToday?.durationMs || 0);

    // schedule checks (is today within schedule window?)
    let withinSchedule = undefined as boolean | undefined;
    let scheduleWindow: { start?: string; end?: string } | undefined;

    if (schedule) {
      const wd = weekdayName(new Date());
      const activeToday = (schedule as any).days?.includes(wd);
      if (activeToday) {
        scheduleWindow = { start: (schedule as any).startTime, end: (schedule as any).endTime };
        if (startedAt) {
          const [sh, sm] = String(scheduleWindow.start).split(':').map(Number);
          const [eh, em] = String(scheduleWindow.end).split(':').map(Number);
          const now = new Date();
          const sWin = new Date(now); sWin.setHours(sh || 0, sm || 0, 0, 0);
          const eWin = new Date(now); eWin.setHours(eh || 0, em || 0, 0, 0);
          const st = new Date(startedAt);
          withinSchedule = st >= sWin && st <= eWin;
        }
      }
    }

    // overall totals in range
    const totalMs = pairs.reduce((acc, p) => acc + p.durationMs, 0);

    return NextResponse.json({
      success: true,
      employeeId,
      employeeName,
      range: { from: from.toISOString(), to: to.toISOString() },
      schedule,                  // { startTime, endTime, days, employeeName, ... }
      scheduleWindow,            // convenience for today
      logs,                      // raw logs with images
      pairs: pairs.map(p => ({
        date: p.date,
        start: p.start ? { timestamp: p.start.timestamp, imageData: p.start.imageData } : null,
        end: p.end ? { timestamp: p.end.timestamp, imageData: p.end.imageData } : null,
        durationMs: p.durationMs,
        durationHMS: msToHMS(p.durationMs),
      })),
      byDay: byDay.map(d => ({
        date: d.date,
        totalMs: d.totalMs,
        totalHMS: msToHMS(d.totalMs),
        items: d.items.map(i => ({
          start: i.start?.timestamp || null,
          end: i.end?.timestamp || null,
          durationMs: i.durationMs,
          durationHMS: msToHMS(i.durationMs),
        })),
      })),
      today: {
        inProgress,
        startedAt: startedAt || null,
        endedAt: endedAt || null,
        durationMs: currentDurationMs,
        durationHMS: msToHMS(currentDurationMs),
        withinSchedule,
      },
      totals: {
        totalMs,
        totalHMS: msToHMS(totalMs),
        days: byDay.length,
        avgPerDayMs: byDay.length ? Math.round(totalMs / byDay.length) : 0,
        avgPerDayHMS: byDay.length ? msToHMS(Math.round(totalMs / byDay.length)) : '00:00:00',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Server error' }, { status: 500 });
  }
}


// utils/images.ts
export function toDisplayableImage(img: any): string | undefined {
  if (!img) return undefined;

  // Already a URL or data URL?
  if (typeof img === 'string') {
    if (img.startsWith('http') || img.startsWith('/') || img.startsWith('data:')) return img;
    // looks like raw base64 -> assume jpeg by default
    if (/^[A-Za-z0-9+/=]+$/.test(img)) return `data:image/jpeg;base64,${img}`;
    return undefined;
  }

  // Mongo Buffer form: { type: 'Buffer', data: [...] }
  if (img?.type === 'Buffer' && Array.isArray(img.data)) {
    const b64 = Buffer.from(img.data).toString('base64');
    return `data:image/jpeg;base64,${b64}`;
  }

  // If you store an imageId to fetch later, expose a URL for it.
  if (img?.imageId) return `/api/lunch/image?logId=${img.imageId}`;

  return undefined;
}
