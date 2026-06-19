import { AsParameterDeclaration } from "@tsonic/tsts";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpParameter } from "../ast/csharp-ast.js";
import { getCsharpTypeForNode } from "./csharp-types.js";
import { planIdentifierName } from "./names.js";

export function planParameters(
  parameterNodes: readonly (Node | undefined)[],
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): readonly CsharpParameter[] {
  return parameterNodes.map((parameterNode) => {
    const parameter = AsParameterDeclaration(parameterNode)!;
    return {
      name: planIdentifierName(parameter.name, "arg", diagnostics, "Parameter name"),
      type: getCsharpTypeForNode(parameter.Type ?? parameter.name, sourceFile, input),
    };
  });
}
