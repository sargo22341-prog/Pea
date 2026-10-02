import type { NewsArticle } from "@pea/shared";
import { CalendarCheck, Newspaper } from "lucide-react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { AssetIcon } from "../AssetIcon";
import { MOTION } from "../motion";
import { formatArticleDate } from "../../../lib/format";
import { isEarningsArticle } from "./earnings-article";

const clampTwoLines: CSSProperties = {
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
  overflow: "hidden"
};

export function NewsArticleCard({
  article,
  showRelatedAssets,
  earningsSymbol
}: {
  article: NewsArticle;
  showRelatedAssets: boolean;
  earningsSymbol?: string | undefined;
}) {
  const { t } = useTranslation(["common"]);
  const detail = article.description || article.publisher || formatArticleDate(article.publishedAt);
  const publishedDate = formatArticleDate(article.publishedAt);
  const relatedAssets = showRelatedAssets ? article.relatedAssets ?? [] : [];
  const earnings = isEarningsArticle(article, earningsSymbol);

  return (
    <a
      className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-md border border-line bg-ink p-3 transition hover:border-sky sm:grid-cols-[96px_minmax(0,1fr)]"
      href={article.url}
      rel="noreferrer"
      target="_blank"
    >
      {article.imageUrl ? (
        <img
          alt=""
          className="h-16 w-[72px] rounded-md object-cover sm:h-20 sm:w-24"
          decoding="async"
          loading="lazy"
          src={article.imageUrl}
        />
      ) : (
        <div className="flex h-16 w-[72px] items-center justify-center rounded-md border border-line bg-panel2 text-slate-500 sm:h-20 sm:w-24">
          <Newspaper size={24} />
        </div>
      )}
      <div className="min-w-0 self-center">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <p className="font-semibold text-slate-100" style={clampTwoLines}>
            {article.title}
          </p>
          {publishedDate && <span className="shrink-0 text-xs text-slate-500">{publishedDate}</span>}
        </div>
        <p className="mt-1 text-sm text-slate-400" style={clampTwoLines}>
          {detail || "Yahoo Finance"}
        </p>
        {(earnings || relatedAssets.length > 0) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {earnings && (
              <span
                className={`inline-flex items-center gap-1 rounded-md border border-cyan-300/40 bg-cyan-300/10 px-2 py-1 text-xs font-semibold text-cyan-200 ${MOTION.pop}`}
                title={t("news.earningsHint", { ns: "common" })}
              >
                <CalendarCheck aria-hidden size={14} />
                {t("news.earningsBadge", { ns: "common" })}
              </span>
            )}
            {relatedAssets.map((asset) => (
              <span className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-md border border-line bg-panel2 px-2 py-1 text-xs text-slate-300" key={asset.symbol}>
                <AssetIcon className="h-5 w-5" symbol={asset.symbol} />
                <span className="truncate font-semibold">{asset.name}</span>
                <span className="shrink-0 text-slate-500">{asset.symbol}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </a>
  );
}
