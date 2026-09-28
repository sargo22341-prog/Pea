import { InfoHint } from "../disclosure/InfoHint";
import { MOTION } from "../motion";
import { AssetInfoTile } from "./AssetInfoTile";
import { METRIC_GRID_MIN_VISIBLE, visibleMetrics, type MetricItem } from "./metric-items";

/**
 * Grille responsive d'indicateurs. Les tuiles sans valeur sont masquées et la grille entière
 * disparaît sous `minVisible` tuiles.
 */
export function MetricGrid({
  items,
  minVisible = METRIC_GRID_MIN_VISIBLE,
  columnsClassName = "grid-cols-2 lg:grid-cols-4"
}: {
  items: MetricItem[];
  minVisible?: number;
  columnsClassName?: string;
}) {
  const visible = visibleMetrics(items);
  if (visible.length < minVisible) return null;
  return (
    <div className={`grid gap-3 ${columnsClassName} ${MOTION.stagger}`}>
      {visible.map((item) => (
        <AssetInfoTile
          hint={item.hint ? <InfoHint label={item.label}>{item.hint}</InfoHint> : undefined}
          icon={item.icon}
          iconTone={item.iconTone ?? "slate"}
          key={item.key}
          label={item.label}
          sub={item.sub}
          tone={item.tone}
          value={item.value}
        />
      ))}
    </div>
  );
}
