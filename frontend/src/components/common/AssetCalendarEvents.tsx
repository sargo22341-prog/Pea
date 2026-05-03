// src/components/assets/AssetCalendarEvents.tsx

import { CalendarDays, Clock3, DollarSign, Phone, TrendingUp } from "lucide-react";

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
    {
        id: "earnings-q2",
        date: new Date("2026-07-30T20:00:00.000Z"),
        title: "Résultats Q2 2026",
        subtitle: "Publication des résultats trimestriels",
        badge: "Estimation",
        session: "Après-marché",
        time: "22:00",
        tone: "green",
        symbol: "AI.PA"
    },
    {
        id: "earnings-call",
        date: new Date("2026-04-30T21:00:00.000Z"),
        title: "Conférence téléphonique",
        subtitle: "Conférence avec les analystes",
        badge: "Important",
        session: "Après-marché",
        time: "23:00",
        tone: "green",
        symbol: "AI.PA"
    },
    {
        id: "ex-dividend",
        date: new Date("2026-05-11T00:00:00.000Z"),
        title: "Détachement du dividende",
        subtitle: "Date ex-dividende",
        session: "Journée",
        tone: "blue",
        symbol: "AI.PA"
    },
    {
        id: "dividend",
        date: new Date("2026-02-12T00:00:00.000Z"),
        title: "Paiement du dividende",
        subtitle: "Versement estimé du dividende",
        session: "Journée",
        tone: "purple",
        symbol: "AI.PA"
    }
];

export function AssetCalendarEvents() {
    const events = [...fakeEvents].sort((a, b) => a.date.getTime() - b.date.getTime());

    return (
        <section className="w-full">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-300">
                Événements calendrier
            </h2>

            <div className="relative">
                <div className="flex gap-0 overflow-x-auto py-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {events.map((event, index) => (
                        <div className="flex shrink-0 items-center" key={event.id}>
                            <CalendarEventCard event={event} />

                            {index < events.length - 1 && (
                                <div
                                    className="mx-3 h-px w-10 shrink-0"
                                    style={{
                                        backgroundColor: getColor(index, events.length)
                                    }}
                                />
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

function CalendarEventCard({ event }: { event: CalendarEvent }) {
    const day = event.date.toLocaleDateString("fr-FR", { day: "2-digit" });
    const month = event.date.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "");
    const year = event.date.getFullYear();

    return (
        <article className="relative overflow-hidden flex w-[320px] shrink-0 items-center gap-4 rounded-[14px] border border-white/[0.05] bg-slate-950/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] sm:w-[380px]">

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

const toneClasses = {
    green: "border-mint/25 bg-mint/10 text-mint shadow-[0_0_18px_rgba(74,222,128,0.18)]",
    blue: "border-sky/25 bg-sky/10 text-sky shadow-[0_0_18px_rgba(56,189,248,0.16)]",
    purple: "border-purple-400/25 bg-purple-400/10 text-purple-300 shadow-[0_0_18px_rgba(192,132,252,0.16)]"
};

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