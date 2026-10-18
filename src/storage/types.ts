// Shapes shared by the browser and the server for saved charts.
import type { Chart } from "../engine/index";

export interface SavedChartSummary {
  id: string;
  name: string;
  schoolId: string;
  // ISO date string, e.g. "2026-10-16T18:00:00.000Z".
  updatedAt: string;
}

export interface SavedChart extends SavedChartSummary {
  chart: Chart;
}

export interface SaveChartInput {
  // Missing means "save as a new chart".
  id?: string;
  schoolId: string;
  chart: Chart;
}

// Saving and loading charts from the browser (see stores.ts).
export interface ChartStore {
  list(schoolId: string): Promise<SavedChartSummary[]>;
  load(id: string): Promise<SavedChart | null>;
  save(input: SaveChartInput): Promise<SavedChartSummary>;
  remove(id: string): Promise<void>;
}
