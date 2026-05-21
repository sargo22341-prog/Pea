import type { ObjectiveDto, ObjectiveInput, ObjectiveListDto } from "@pea/shared";
import { request } from "./api-core";

function objectiveBase(userId: number | string) {
  return `/api/users/${userId}/objectives`;
}

export const objectivesApi = {
  listObjectives: (userId: number | string, signal?: AbortSignal) =>
    request<ObjectiveListDto>(objectiveBase(userId), { signal }),
  getObjective: (userId: number | string, objectiveId: number | string, signal?: AbortSignal) =>
    request<ObjectiveDto>(`${objectiveBase(userId)}/${objectiveId}`, { signal }),
  createObjective: (userId: number | string, input: ObjectiveInput) =>
    request<ObjectiveDto>(objectiveBase(userId), { method: "POST", body: JSON.stringify(input) }),
  updateObjective: (userId: number | string, objectiveId: number | string, input: ObjectiveInput) =>
    request<ObjectiveDto>(`${objectiveBase(userId)}/${objectiveId}`, { method: "PUT", body: JSON.stringify(input) }),
  deleteObjective: (userId: number | string, objectiveId: number | string) =>
    request<void>(`${objectiveBase(userId)}/${objectiveId}`, { method: "DELETE" }),
  recalculateObjective: (userId: number | string, objectiveId: number | string) =>
    request<ObjectiveDto>(`${objectiveBase(userId)}/${objectiveId}/recalculate`, { method: "POST" })
};
