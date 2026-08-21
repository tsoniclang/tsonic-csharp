import type {
  CsharpPlanningContext } from "../../context.js";
import {
  HasSourceKind,
  KindIdentifier,
} from "@tsonic/target-api/source";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../../target-model/types/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpTypeNode,
} from "../../../target-ast/roslyn/index.js";
import {
  csharpTupleElementMemberName,
  targetTypeRefEquals,
} from "../../../../target-model/types/index.js";
import {
  unsupportedNodeDiagnostic,
} from "../../diagnostics.js";
import type {
  ExpressionPlanner,
} from "../expression-planner-types.js";
import {
  sameCsharpType,
} from "../../types/index.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../../types/target-types.js";

export function planTupleSpreadArrayExpression(
  spreadNode: Node,
  expression: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  spreadCarrier: TargetTypeRef,
  elementType: CsharpTypeNode,
  elementTargetType: TargetTypeRef | undefined,
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  if (spreadCarrier.kind !== "tuple") {
    return undefined;
  }
  if (!HasSourceKind(input.program.source.ast, expression, KindIdentifier)) {
    diagnostics.push(unsupportedNodeDiagnostic(spreadNode, "Tuple spread over non-identifier expressions requires single-evaluation provider lowering before C# emission."));
    return undefined;
  }
  const receiver = planExpression(expression, sourceFile, input, diagnostics);
  if (receiver === undefined) {
    return undefined;
  }
  const elements: CsharpExpression[] = [];
  for (let index = 0; index < spreadCarrier.elements.length; index += 1) {
    const tupleElement = spreadCarrier.elements[index];
    if (tupleElement === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(spreadNode, `Tuple spread element ${index} requires a finalized tuple element carrier before C# emission.`));
      return undefined;
    }
    if (!tupleElementMatchesTarget(tupleElement, elementTargetType, elementType)) {
      diagnostics.push(unsupportedNodeDiagnostic(spreadNode, `Tuple spread element ${index} requires matching finalized tuple and target array element carriers before C# emission.`));
      return undefined;
    }
    elements.push({
      kind: "SimpleMemberAccessExpression",
      receiver,
      name: csharpTupleElementMemberName(index),
    });
  }
  return {
    kind: "ArrayCreationExpression",
    elementType,
    elements,
  };
}

function tupleElementMatchesTarget(
  tupleElement: TargetTypeRef,
  elementTargetType: TargetTypeRef | undefined,
  elementType: CsharpTypeNode,
): boolean {
  if (elementTargetType !== undefined) {
    return targetTypeRefEquals(tupleElement, elementTargetType);
  }
  const tupleElementType = csharpTypeFromTargetTypeRef(tupleElement);
  return tupleElementType !== undefined && sameCsharpType(tupleElementType, elementType);
}
