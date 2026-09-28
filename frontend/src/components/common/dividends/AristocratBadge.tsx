import { ARISTOCRAT_MIN_YEARS } from "@pea/shared";
import { Crown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { InfoHint } from "../disclosure/InfoHint";
import { MOTION } from "../motion";

/** Badge « Aristocrate maison » : dividende relevé plusieurs années de suite, règle expliquée en ⓘ. */
export function AristocratBadge({ streak }: { streak: number }) {
  const { t } = useTranslation("common");
  return (
    <span className={`inline-flex items-center gap-1 rounded bg-amber/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber ${MOTION.pop}`}>
      <Crown aria-hidden size={12} />
      {t("dividends.aristocrat")}
      <InfoHint label={t("dividends.aristocrat")}>{t("dividends.aristocratHint", { count: ARISTOCRAT_MIN_YEARS, streak })}</InfoHint>
    </span>
  );
}
