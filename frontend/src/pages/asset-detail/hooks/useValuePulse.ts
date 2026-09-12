import { useEffect, useRef, useState } from "react";
import type { ValueTrend } from "../../../components/common/motion";

/**
 * Pulsations declenchees par une valeur qui change pendant que la page reste ouverte
 * (cotation rafraichie par SSE, ajout ou retrait de la liste de suivi).
 *
 * Chaque hook renvoie une cle qui augmente a chaque changement : elle sert de `key`
 * React pour remonter l'element et rejouer l'animation CSS. La cle vaut `0` au premier
 * rendu, ce qui permet a l'appelant de ne rien animer a l'ouverture de la page.
 */

/** Suit une valeur numerique et indique dans quel sens elle vient de bouger. */
export function useNumberPulse(value: number | undefined): { pulseKey: number; trend: ValueTrend } {
  const previousRef = useRef(value);
  const [pulse, setPulse] = useState<{ pulseKey: number; trend: ValueTrend }>({ pulseKey: 0, trend: "none" });

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = value;
    if (previous === undefined || value === undefined) return;
    if (!Number.isFinite(previous) || !Number.isFinite(value) || previous === value) return;
    setPulse((current) => ({ pulseKey: current.pulseKey + 1, trend: value > previous ? "up" : "down" }));
  }, [value]);

  return pulse;
}

/** Suit un etat binaire et signale chaque bascule. */
export function useTogglePulse(value: boolean): number {
  const previousRef = useRef(value);
  const [pulseKey, setPulseKey] = useState(0);

  useEffect(() => {
    if (previousRef.current === value) return;
    previousRef.current = value;
    setPulseKey((current) => current + 1);
  }, [value]);

  return pulseKey;
}
