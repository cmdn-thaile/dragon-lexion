import meta from "@/data/stages.meta.json";

export type StageMeta = { vi: string; hp: number };
export const STAGES: Record<string, StageMeta> = meta as Record<string, StageMeta>;
export const isRankedStage = (id: unknown): id is string => typeof id === "string" && id in STAGES;
