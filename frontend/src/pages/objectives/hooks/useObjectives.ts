import { useMemo } from "react";
import { useAsync } from "../../../hooks/useAsync";
import { api } from "../../../lib/api";

export function useObjectives(userId: number | string) {
  const objectives = useAsync((signal) => api.listObjectives(userId, signal), userId);
  const activeObjective = useMemo(
    () => objectives.data?.objectives.find((objective) => objective.active) ?? objectives.data?.objectives[0],
    [objectives.data]
  );

  return {
    ...objectives,
    activeObjective
  };
}
