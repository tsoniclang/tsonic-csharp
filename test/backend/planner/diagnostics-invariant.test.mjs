import { registerTargetPlannerInvariantContractTests } from "../../../../tsonic/test/scripts/target-planner-invariant-contract.mjs";
import { failCsharpPlannerInvariant } from "../../../dist/backend/planner/diagnostics.js";

registerTargetPlannerInvariantContractTests("tsonic-csharp", failCsharpPlannerInvariant,
  new URL("../../../src/backend/", import.meta.url));
