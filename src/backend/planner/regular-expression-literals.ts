import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpExpression } from "../roslyn/syntax.js";
import { getRuntimeCarrierForExpression } from "./runtime-carriers.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { invalidExpression } from "./invalid-expression.js";
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
  const carrier = getRuntimeCarrierForExpression(input, node, sourceFile);
  if (carrier?.kind !== "target-named" || carrier.id !== "Tsonic.CSharp.Js.RegExp") {
    diagnostics.push(unsupportedNodeDiagnostic(node, "RegExp literal emission requires a finalized provider runtime carrier for Tsonic.CSharp.Js.RegExp."));
    return invalidExpression("regexp literal without provider carrier");
  }
  const literal = input.facts.getFact(node, csharpRegularExpressionLiteralFactKey);
  if (literal === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "RegExp literal emission requires finalized provider pattern and flags facts."));
    return invalidExpression("invalid regexp literal text");
  }
  const operation = input.facts.getFact(node, csharpTargetOperationFactKey);
  if (operation?.kind !== "member" || operation.operationKind !== "constructor" || operation.declaringType?.kind !== "target-named" || operation.declaringType.id !== carrier.id) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "RegExp literal emission requires a finalized provider constructor operation fact."));
    return invalidExpression("regexp literal without provider constructor");
  }
  return {
    kind: "ObjectCreationExpression",
    type: csharpTypeFromTargetTypeRef(carrier) ?? { kind: "InvalidType", reason: "regexp carrier" },
    arguments: [
      { kind: "Argument", expression: { kind: "LiteralExpression", value: literal.pattern } },
      { kind: "Argument", expression: { kind: "LiteralExpression", value: literal.flags } },
    ],
  };
}
