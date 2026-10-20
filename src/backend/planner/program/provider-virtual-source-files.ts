import type { CsharpPlanningContext } from "../context.js";
import type {
  SourceFile,
} from "@tsonic/tsts";
import { failCsharpPlannerInvariant } from "../../invariants.js";

export function isProviderVirtualSourceFile(input: CsharpPlanningContext, sourceFile: SourceFile | undefined): boolean {
  if (sourceFile === undefined) return false;
  const selected = input.program.records.providerSourceFile.get(sourceFile);
  if (selected === undefined) failCsharpPlannerInvariant("A checked source file requires its sealed provider origin.", sourceFile);
  return selected;
}
