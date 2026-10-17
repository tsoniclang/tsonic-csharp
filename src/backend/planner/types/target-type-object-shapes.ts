import type { CsharpPlanningContext } from "../context.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  Node,
} from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../target-model/types/index.js";
import type {
  CsharpTypeNode,
} from "../../target-ast/syntax/index.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";

export function csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(
  input: CsharpPlanningContext,
  type: TargetTypeRef,
  _diagnostics?: TargetDiagnostic[],
  _diagnosticSubject?: Node,
): CsharpTypeNode | undefined {
  return csharpTypeFromTargetTypeRef(type, input.scope.typeParameterNames);
}
