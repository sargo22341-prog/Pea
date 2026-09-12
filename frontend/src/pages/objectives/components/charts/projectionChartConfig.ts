export const projectionSeries = {
  real: {
    labelKey: "chart.series.real",
    color: "#34d399",
    descriptionKey: "chart.series.realDescription"
  },
  projected: {
    labelKey: "chart.series.projected",
    color: "#38bdf8",
    descriptionKey: "chart.series.projectedDescription"
  },
  range: {
    labelKey: "chart.series.range",
    color: "#38bdf8",
    descriptionKey: "chart.series.rangeDescription"
  },
  required: {
    labelKey: "chart.series.required",
    color: "#f59e0b",
    descriptionKey: "chart.series.requiredDescription"
  }
} as const;

/** Opacite de la bande Monte-Carlo: visible sans masquer les courbes. */
export const projectionRangeOpacity = 0.18;
