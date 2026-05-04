import { useEffect, useRef } from "react";
import { Clock3 } from "lucide-react";
import type { CalendarEvent } from "@pea/shared";
import { useAsync } from "../../hooks/useAsync";
import { api } from "../../lib/api";

type VisualTone = "green" | "blue" | "purple";

interface VisualEvent {
  id: string;
  date: Date;
  title: string;
  subtitle: string;
  badge?: string;
  session?: string;
  time?: string;
  tone: VisualTone;
  symbol: string;
}

const EVENT_META: Record<string, { title: string; tone: VisualTone; session?: string }> = {
  earnings:      { title: "Résultats trimestriels", tone: "green", session: "Après-marché" },
  earnings_call: { title: "Conférence résultats",   tone: "green", session: "Après-marché" },
  ex_dividend:   { title: "Détachement du dividende", tone: "blue", session: "Journée" },
  dividend:      { title: "Paiement du dividende",   tone: "purple", session: "Journée" }
};

function toVisual(ev: CalendarEvent, now: Date): VisualEvent {
  const meta = EVENT_META[ev.eventType] ?? { title: ev.eventType, tone: "blue" as VisualTone };
  const date = new Date(ev.eventDate);
  const isPast = date < now;

  let badge: string | undefined;
  if (ev.eventType === "earnings" || ev.eventType === "earnings_call") {
    badge = isPast ? "Publié" : ev.isEstimate ? "Estimation" : "Prévu";
  }

  const hasTime = date.getUTCHours() !== 0 || date.getUTCMinutes() !== 0;
  const time = hasTime
    ? date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })
    : undefined;

  return {
    id: `${ev.symbol}-${ev.eventType}-${ev.eventDate}`,
    date,
    title: meta.title,
    subtitle: ev.assetName,
    badge,
    session: meta.session,
    time,
    tone: meta.tone,
    symbol: ev.symbol
  };
}

function CalendarEventsList({ events }: { events: VisualEvent[] }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const nextEventRef = useRef<HTMLDivElement | null>(null);

  const now = new Date();
  const sorted = [...events].sort((a, b) => a.date.getTime() - b.date.getTime());
  const pastCount = sorted.filter((e) => e.date < now).length;
  const nextIndex = sorted.findIndex((e) => e.date >= now);
  const activeIndex = nextIndex === -1 ? sorted.length - 1 : nextIndex;
  const shouldCenter = pastCount > 0 && nextIndex !== -1;

  useEffect(() => {
    if (!shouldCenter) {
      scrollRef.current?.scrollTo({ left: 0, behavior: "auto" });
      return;
    }
    nextEventRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [shouldCenter]);

  return (
    <div
      ref={scrollRef}
      className="flex gap-0 overflow-x-auto py-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {sorted.map((event, index) => {
        const isPast = event.date < now;
        const isNext = index === activeIndex;
        return (
          <div ref={isNext ? nextEventRef : undefined} className="flex shrink-0 items-center" key={event.id}>
            <CalendarEventCard event={event} isNext={isNext} isPast={isPast} />
            {index < sorted.length - 1 && (
              <div className="mx-3 h-px w-10 shrink-0" style={{ backgroundColor: getColor(index, sorted.length) }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Version home : charge les events de tous les actifs du portfolio */
export function PortfolioCalendarEvents() {
  const result = useAsync(() => api.calendarEvents(), []);

  if (result.loading && !result.data) return null;
  if (!result.data || result.data.length === 0) return null;

  const now = new Date();
  const events = result.data.map((ev) => toVisual(ev, now));

  return (
    <section className="w-full">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-300">
        Événements calendrier
      </h2>
      <CalendarEventsList events={events} />
    </section>
  );
}

/** Version page actif : charge uniquement les events de ce symbol */
export function AssetCalendarEvents({ symbol }: { symbol: string }) {
  const result = useAsync(() => api.calendarEventsForSymbol(symbol), [symbol]);

  if (result.loading && !result.data) return null;
  if (!result.data || result.data.length === 0) return null;

  const now = new Date();
  const events = result.data.map((ev) => toVisual(ev, now));

  return (
    <section className="w-full">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-300">
        Événements calendrier
      </h2>
      <CalendarEventsList events={events} />
    </section>
  );
}


function CalendarEventCard({
  event,
  isPast,
  isNext
}: {
  event: VisualEvent;
  isPast: boolean;
  isNext: boolean;
}) {
  const day = event.date.toLocaleDateString("fr-FR", { day: "2-digit" });
  const month = event.date.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "");
  const year = event.date.getFullYear();

  return (
    <article
      className={`relative flex w-[320px] shrink-0 items-center gap-4 overflow-hidden rounded-[14px] border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] transition sm:w-[380px] ${
        isPast
          ? "border-white/[0.03] bg-slate-950/10 opacity-55 grayscale"
          : isNext
            ? "border-mint/20 bg-slate-950/30 shadow-[0_0_22px_rgba(74,222,128,0.08),inset_0_1px_0_rgba(255,255,255,0.035)]"
            : "border-white/[0.05] bg-slate-950/20"
      }`}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/[0.08] bg-slate-900">
        <img
          src={`/api/assets/${event.symbol}/icon?v=0`}
          alt={event.symbol}
          className="h-full w-full object-cover"
        />
      </div>

      <div className="shrink-0 text-center leading-tight">
        <p className={`text-xl font-bold ${textToneClasses[event.tone]}`}>{day}</p>
        <p className={`text-xs font-semibold uppercase ${textToneClasses[event.tone]}`}>{month}</p>
        <p className="text-xs text-slate-400">{year}</p>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-semibold text-white">{event.title}</p>
          {event.badge && (
            <span className="shrink-0 rounded-md bg-mint/10 px-2 py-0.5 text-[10px] font-semibold text-mint">
              {event.badge}
            </span>
          )}
        </div>
        <p className="mt-1 truncate text-xs text-slate-400">{event.subtitle}</p>
      </div>

      <div className="shrink-0 text-right">
        {event.session && (
          <p className={`text-[10px] font-semibold uppercase ${textToneClasses[event.tone]}`}>
            {event.session}
          </p>
        )}
        <p className="mt-2 flex items-center justify-end gap-1 text-xs text-slate-300">
          {event.time ? (<><Clock3 size={13} />{event.time}</>) : "-"}
        </p>
      </div>
    </article>
  );
}

const textToneClasses: Record<VisualTone, string> = {
  green: "text-mint",
  blue: "text-sky",
  purple: "text-purple-300"
};

function getColor(index: number, total: number) {
  const start = [74, 222, 128];
  const end = [148, 163, 184];
  const t = index / Math.max(1, total - 1);
  const r = Math.round(start[0] + (end[0] - start[0]) * t);
  const g = Math.round(start[1] + (end[1] - start[1]) * t);
  const b = Math.round(start[2] + (end[2] - start[2]) * t);
  return `rgb(${r}, ${g}, ${b})`;
}
