import type { Dispatch } from "react";
import type { PlannerAction, PlannerState, PlannerView } from "../../planner/state";

// What every panel receives from the Planner.
export interface PanelProps {
  state: PlannerState;
  view: PlannerView;
  dispatch: Dispatch<PlannerAction>;
}
