import type { CsharpPlanningContext } from "../context.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../target-model/types/index.js";
import type { CsharpTypeNode } from "../../target-ast/syntax/index.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";
import { failCsharpPlannerInvariant } from "../../invariants.js";

export function csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(
  input: CsharpPlanningContext, type: TargetTypeRef, _diagnostics?: TargetDiagnostic[], diagnosticSubject?: Node,
): CsharpTypeNode | undefined {
  const selected = input.program.records.typeEmission.get(type);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted native type requires its sealed artifact dependency set.", diagnosticSubject);
  for (const fact of selected.objectShapes) input.artifacts.objectShape(fact);
  return csharpTypeFromTargetTypeRef(type, input.scope.typeParameterNames);
}
