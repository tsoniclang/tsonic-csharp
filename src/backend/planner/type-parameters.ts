import { AsTypeParameterDeclaration } from "@tsonic/tsts";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput } from "@tsonic/target-api";
import type { TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpTypeNode, CsharpTypeParameter } from "../ast/csharp-ast.js";
import { getCsharpTypeForNode } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { planIdentifierName } from "./names.js";

export function planTypeParameters(
  nodes: readonly (Node | undefined)[],
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): readonly CsharpTypeParameter[] {
  return nodes
    .filter((node): node is Node => node !== undefined)
    .map((node) => planTypeParameter(node, sourceFile, input, diagnostics));
}

function planTypeParameter(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpTypeParameter {
  const declaration = AsTypeParameterDeclaration(node)!;
  const constraints = planTypeParameterConstraints(node, sourceFile, input, diagnostics);
  if (declaration.DefaultType !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Defaulted generic type parameters have no direct C# source equivalent."));
  }
  if (declaration.Expression !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Expression-based generic type parameters are outside the current C# planning surface."));
  }
  return {
    name: planIdentifierName(declaration.name, "T", diagnostics, "Type parameter name"),
    ...(constraints.length === 0 ? {} : { constraints }),
  };
}

function planTypeParameterConstraints(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): readonly CsharpTypeNode[] {
  const declaration = AsTypeParameterDeclaration(node)!;
  if (declaration.Constraint === undefined) {
    return [];
  }
  const constraint = getCsharpTypeForNode(declaration.Constraint, sourceFile, input, undefined, diagnostics);
  if (constraint.kind === "named" || constraint.kind === "qualified") {
    return [constraint];
  }
  if (constraint.kind !== "invalid") {
    diagnostics.push(unsupportedNodeDiagnostic(
      declaration.Constraint,
      "Generic constraints require a named target type; primitive and structural constraints require provider constraint facts before C# emission.",
    ));
  }
  return [];
}
