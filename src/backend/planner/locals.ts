import { AsVariableDeclaration } from "@tsonic/tsts";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpLocalDeclaration } from "../ast/csharp-ast.js";
import { getCsharpTypeForNode } from "./csharp-types.js";
import { planExpressionWithExpectedType } from "./expressions.js";
import { planIdentifierName } from "./names.js";

export function planLocalDeclaration(
  declarationNode: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpLocalDeclaration {
  const variable = AsVariableDeclaration(declarationNode)!;
  const type = getCsharpTypeForNode(variable.Type ?? variable.name, sourceFile, input);
  return {
    name: planIdentifierName(variable.name, "local", diagnostics, "Local binding name"),
    type,
    ...(variable.Initializer !== undefined
      ? { initializer: planExpressionWithExpectedType(variable.Initializer, sourceFile, input, diagnostics, type) }
      : {}),
  };
}
