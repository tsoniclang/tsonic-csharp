import {
  AsRegularExpressionLiteral,
  Node_Text,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpExpression } from "../roslyn/syntax.js";
import { getRuntimeCarrierForExpression } from "./runtime-carriers.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { invalidExpression } from "./invalid-expression.js";

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
  const literal = parseRegularExpressionLiteral(Node_Text(AsRegularExpressionLiteral(node)));
  if (literal === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "RegExp literal text could not be split into pattern and flags by the C# backend."));
    return invalidExpression("invalid regexp literal text");
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

function parseRegularExpressionLiteral(text: string): { readonly pattern: string; readonly flags: string } | undefined {
  if (!text.startsWith("/")) {
    return undefined;
  }
  let escaped = false;
  let inCharacterClass = false;
  for (let index = 1; index < text.length; index += 1) {
    const char = text[index]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "[" && !inCharacterClass) {
      inCharacterClass = true;
      continue;
    }
    if (char === "]" && inCharacterClass) {
      inCharacterClass = false;
      continue;
    }
    if (char === "/" && !inCharacterClass) {
      return {
        pattern: text.slice(1, index),
        flags: text.slice(index + 1),
      };
    }
  }
  return undefined;
}
