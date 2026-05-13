import { Newspaper } from "lucide-react";

export function NewsSkeleton({ title }: { title: string }) {
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-line p-4">
        <h2 className="font-semibold">{title}</h2>
      </div>
      <div className="space-y-3 p-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            className="grid min-h-[92px] grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-md border border-line bg-ink p-3 sm:grid-cols-[96px_minmax(0,1fr)]"
            key={index}
          >
            <div className="flex h-16 w-[72px] items-center justify-center rounded-md border border-line bg-panel2 text-slate-500 sm:h-20 sm:w-24">
              <Newspaper size={24} />
            </div>
            <div className="min-w-0 self-center space-y-2">
              <div className="h-4 w-11/12 animate-pulse rounded bg-panel2" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-panel2" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-panel2" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
