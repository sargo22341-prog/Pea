/** Point d'une mini-courbe : horodatage (ms) et valeur. */
export interface SparklinePoint {
  t: number;
  v: number;
}

/**
 * Tracé SVG d'une mini-courbe dans une boîte `width × height` avec une marge intérieure. Le domaine
 * horizontal peut être imposé (séance entière) ; sinon il couvre le premier et le dernier point.
 */
export function sparklinePath(
  points: readonly SparklinePoint[],
  box: { width: number; height: number; padding: number },
  domain?: { min: number; max: number }
): string {
  const first = points[0];
  const last = points.at(-1);
  if (points.length < 2 || !first || !last) return "";
  const minT = domain?.min ?? first.t;
  const maxT = domain?.max ?? last.t;
  const values = points.map((point) => point.v);
  const minV = Math.min(...values);
  const spanT = maxT - minT || 1;
  const spanV = Math.max(...values) - minV || 1;
  return points
    .map((point, index) => {
      const x = box.padding + ((point.t - minT) / spanT) * (box.width - box.padding * 2);
      const y = box.height - box.padding - ((point.v - minV) / spanV) * (box.height - box.padding * 2);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}
