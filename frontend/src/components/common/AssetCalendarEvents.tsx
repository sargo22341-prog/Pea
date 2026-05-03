import { useEffect, useRef } from "react";
import { Clock3 } from "lucide-react";

type CalendarEvent = {
  id: string;
  date: Date;
  title: string;
  subtitle: string;
  badge?: string;
  session?: string;
  time?: string;
  tone: "green" | "blue" | "purple";
  symbol: string;
};

const fakeEvents: CalendarEvent[] = [
  // passés
  {
    id: "tte-dividend",
    date: new Date("2026-02-12T00:00:00.000Z"),
    title: "Paiement du dividende",
    subtitle: "TOTALENERGIES",
    session: "Journée",
    tone: "purple",
    symbol: "TTE.PA"
  },
  {
    id: "bn-earnings",
    date: new Date("2026-04-24T20:00:00.000Z"),
    title: "Résultats trimestriels",
    subtitle: "DANONE",
    badge: "Publié",
    session: "Après-marché",
    time: "22:00",
    tone: "green",
    symbol: "BN.PA"
  },
  {
    id: "ai-ex-dividend",
    date: new Date("2026-05-11T00:00:00.000Z"),
    title: "Détachement du dividende",
    subtitle: "AIR LIQUIDE",
    session: "Journée",
    tone: "blue",
    symbol: "AI.PA"
  },

  // futurs
  {
    id: "asml-earnings",
    date: new Date("2026-07-30T20:00:00.000Z"),
    title: "Résultats Q2 2026",
    subtitle: "ASML HOLDING",
    badge: "Estimation",
    session: "Après-marché",
    time: "22:00",
    tone: "green",
    symbol: "ASML.AS"
  },
  {
    id: "lr-earnings",
    date: new Date("2026-09-18T20:00:00.000Z"),
    title: "Résultats semestriels",
    subtitle: "LEGRAND",
    badge: "Prévu",
    session: "Après-marché",
    time: "22:00",
    tone: "green",
    symbol: "LR.PA"
  },
  {
    id: "engi-dividend",
    date: new Date("2026-10-08T00:00:00.000Z"),
    title: "Paiement du dividende",
    subtitle: "ENGIE",
    session: "Journée",
    tone: "purple",
    symbol: "ENGI.PA"
  },
  {
    id: "vie-ex-dividend",
    date: new Date("2026-11-15T00:00:00.000Z"),
    title: "Détachement du dividende",
    subtitle: "VEOLIA ENVIRON.",
    session: "Journée",
    tone: "blue",
    symbol: "VIE.PA"
  }
];

export function AssetCalendarEvents() {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const nextEventRef = useRef<HTMLDivElement | null>(null);

const now = new Date();
const events = [...fakeEvents].sort((a, b) => a.date.getTime() - b.date.getTime());

const pastEventsCount = events.filter((event) => event.date.getTime() < now.getTime()).length;
const nextEventIndex = events.findIndex((event) => event.date.getTime() >= now.getTime());
const activeIndex = nextEventIndex === -1 ? events.length - 1 : nextEventIndex;
const shouldCenterNextEvent = pastEventsCount > 0 && nextEventIndex !== -1;

useEffect(() => {
  if (!shouldCenterNextEvent) {
    scrollRef.current?.scrollTo({
      left: 0,
      behavior: "auto"
    });
    return;
  }

  nextEventRef.current?.scrollIntoView({
    behavior: "smooth",
    inline: "center",
    block: "nearest"
  });
}, [shouldCenterNextEvent]);

  return (
    <section className="w-full">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-300">
        Événements calendrier
      </h2>

      <div
        ref={scrollRef}
        className="flex gap-0 overflow-x-auto py-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {events.map((event, index) => {
          const isPast = event.date.getTime() < now.getTime();
          const isNext = index === activeIndex;

          return (
            <div
              ref={isNext ? nextEventRef : undefined}
              className="flex shrink-0 items-center"
              key={event.id}
            >
              <CalendarEventCard event={event} isPast={isPast} isNext={isNext} />

              {index < events.length - 1 && (
                <div
                  className="mx-3 h-px w-10 shrink-0"
                  style={{
                    backgroundColor: getColor(index, events.length)
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}


function CalendarEventCard({
  event,
  isPast,
  isNext
}: {
  event: CalendarEvent;
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
          {event.time ? (
            <>
              <Clock3 size={13} />
              {event.time}
            </>
          ) : (
            "-"
          )}
        </p>
      </div>
    </article>
  );
}

const textToneClasses = {
    green: "text-mint",
    blue: "text-sky",
    purple: "text-purple-300"
};

function getColor(index: number, total: number) {
    const start = [74, 222, 128];   // vert (mint)
    const end = [148, 163, 184];    // gris

    const t = index / Math.max(1, total - 1); // progression 0 → 1

    const r = Math.round(start[0] + (end[0] - start[0]) * t);
    const g = Math.round(start[1] + (end[1] - start[1]) * t);
    const b = Math.round(start[2] + (end[2] - start[2]) * t);

    return `rgb(${r}, ${g}, ${b})`;
}