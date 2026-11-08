import type { CsharpPlanningContext } from "../planning-data.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTypeNode } from "../../target-ast/syntax/index.js";
import type { Node } from "@tsonic/tsts";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import type { CsharpObjectShapeFact } from "../../../target-model/types/index.js";

export function csharpTypeFromObjectShapeFact(
  input: CsharpPlanningContext,
  fact: CsharpObjectShapeFact,
  _diagnostics?: TargetDiagnostic[],
  diagnosticSubject?: Node,
): CsharpTypeNode | undefined {
  const targetType = csharpTypeFromTargetTypeRef(fact.targetType, input.scope.typeParameterNames);
  if (targetType === undefined) return failCsharpPlannerInvariant(
    "An admitted object-shape artifact must carry its renderable target type.", diagnosticSubject);
  const selected = input.program.records.objectShapeEmission.get(fact);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted object shape requires its sealed native materialization selection.", diagnosticSubject);
  return targetType;
}

export function csharpConstructibleTypeFromObjectShapeFact(
  input: CsharpPlanningContext,
  fact: CsharpObjectShapeFact,
  diagnostics?: TargetDiagnostic[],
  diagnosticSubject?: Node,
): CsharpTypeNode | undefined {
  if (fact.constructible === false) {
    failCsharpPlannerInvariant("An admitted object construction requires its exact native parameterless construction contract.", diagnosticSubject);
  }
  return csharpTypeFromObjectShapeFact(
    input,
    fact,
    diagnostics,
    diagnosticSubject,
  );
}
