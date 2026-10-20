import type { SourceFile, Type } from "@tsonic/tsts";
import type { CsharpPlanningContext } from "../context.js";
import type { CsharpTypeNode } from "../../target-ast/syntax/index.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";

export function getCsharpTypeFromSemanticType(
  type: Type | undefined, sourceFile: SourceFile, input: CsharpPlanningContext,
): CsharpTypeNode | undefined {
  const selected = type === undefined ? undefined : input.program.records.semanticType.get(type, sourceFile);
  return selected?.carrier === undefined ? undefined : csharpTypeFromTargetTypeRef(selected.carrier, input.scope.typeParameterNames);
}
