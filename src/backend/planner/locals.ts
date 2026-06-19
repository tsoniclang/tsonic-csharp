import {
  AsVariableDeclaration,
  Node_Text,
} from "@tsonic/tsts";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpLocalDeclaration } from "../ast/csharp-ast.js";
import { getCsharpTypeForNode } from "./csharp-types.js";
import { planExpressionWithExpectedType } from "./expressions.js";
import { sanitizeIdentifier } from "./identifiers.js";

export function planLocalDeclaration(
  declarationNode: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpLocalDeclaration {
  const variable = AsVariableDeclaration(declarationNode)!;
  const type = getCsharpTypeForNode(variable.Type ?? variable.name, sourceFile, input);
  return {
    name: sanitizeIdentifier(variable.name === undefined ? "local" : Node_Text(variable.name)),
    type,
    ...(variable.Initializer !== undefined
      ? { initializer: planExpressionWithExpectedType(variable.Initializer, sourceFile, input, diagnostics, type) }
      : {}),
  };
}
