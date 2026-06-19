import { AsTypeParameterDeclaration } from "@tsonic/tsts";
import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpTypeParameter } from "../ast/csharp-ast.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { planIdentifierName } from "./names.js";

export function planTypeParameters(
  nodes: readonly (Node | undefined)[],
  diagnostics: TargetDiagnostic[],
): readonly CsharpTypeParameter[] {
  return nodes
    .filter((node): node is Node => node !== undefined)
    .map((node) => planTypeParameter(node, diagnostics));
}

function planTypeParameter(
  node: Node,
  diagnostics: TargetDiagnostic[],
): CsharpTypeParameter {
  const declaration = AsTypeParameterDeclaration(node)!;
  if (declaration.Constraint !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Generic constraints require finalized target constraint facts before C# emission."));
  }
  if (declaration.DefaultType !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Defaulted generic type parameters have no direct C# source equivalent."));
  }
  if (declaration.Expression !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Expression-based generic type parameters are outside the current C# planning surface."));
  }
  return {
    name: planIdentifierName(declaration.name, "T", diagnostics, "Type parameter name"),
  };
}
