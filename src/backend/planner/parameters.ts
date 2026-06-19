import {
  AsParameterDeclaration,
  Node_Text,
} from "@tsonic/tsts";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput } from "@tsonic/target-api";
import type { CsharpParameter } from "../ast/csharp-ast.js";
import { getCsharpTypeForNode } from "./csharp-types.js";
import { sanitizeIdentifier } from "./identifiers.js";

export function planParameters(
  parameterNodes: readonly (Node | undefined)[],
  sourceFile: SourceFile,
  input: TargetCompileInput,
): readonly CsharpParameter[] {
  return parameterNodes.map((parameterNode) => {
    const parameter = AsParameterDeclaration(parameterNode)!;
    return {
      name: sanitizeIdentifier(parameter.name === undefined ? "arg" : Node_Text(parameter.name)),
      type: getCsharpTypeForNode(parameter.Type ?? parameter.name, sourceFile, input),
    };
  });
}
