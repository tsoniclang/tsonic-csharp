import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpExpression } from "../roslyn/syntax.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";
import { targetTypeRefsMatch } from "./target-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { invalidExpression } from "./invalid-expression.js";
import {
  getRuntimeCarrierForExpression,
} from "./runtime-carriers.js";
import {
  csharpTargetOperationFactKey,
  csharpRegularExpressionLiteralFactKey,
} from "../../source/csharp-facts.js";

export function planRegularExpressionLiteral(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const literal = input.facts.getFact(node, csharpRegularExpressionLiteralFactKey);
  if (literal === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "RegExp literal emission requires finalized provider pattern and flags facts."));
    return invalidExpression("invalid regexp literal text");
  }
  const carrier = getRuntimeCarrierForExpression(input, node, sourceFile);
  if (carrier === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "RegExp literal emission requires a finalized JS surface RegExp runtime carrier fact before C# emission."));
    return invalidExpression("regexp literal without runtime carrier");
  }
  const operation = input.facts.getFact(node, csharpTargetOperationFactKey);
  if (operation?.kind !== "member" || operation.operationKind !== "constructor") {
    diagnostics.push(unsupportedNodeDiagnostic(node, "RegExp literal emission requires a finalized provider constructor operation fact."));
    return invalidExpression("regexp literal without provider constructor");
  }
  const resultType = operation.resultType ?? operation.declaringType;
  if (resultType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "RegExp literal emission requires finalized provider constructor result type facts."));
    return invalidExpression("regexp literal without provider constructor result type");
  }
  if (!targetTypeRefsMatch(carrier, resultType)) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "RegExp literal emission requires the finalized runtime carrier fact to match the provider constructor result type."));
    return invalidExpression("regexp literal runtime carrier mismatch");
  }
  const renderedType = csharpTypeFromTargetTypeRef(resultType);
  if (renderedType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "RegExp literal emission requires a renderable provider constructor result type fact."));
    return invalidExpression("regexp literal without renderable constructor result type");
  }
  return {
    kind: "ObjectCreationExpression",
    type: renderedType,
    arguments: [
      { kind: "Argument", expression: { kind: "LiteralExpression", value: literal.pattern } },
      { kind: "Argument", expression: { kind: "LiteralExpression", value: literal.flags } },
    ],
  };
}
