import { AsTypeParameterDeclaration } from "@tsonic/tsts";
import type { Node, SourceFile, TargetConstraint } from "@tsonic/tsts";
import type { TargetCompileInput } from "@tsonic/target-api";
import type { TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpTypeNode, CsharpTypeParameter } from "../ast/csharp-ast.js";
import { getCsharpTypeForNode } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { planIdentifierName } from "./names.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";

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
  const name = planIdentifierName(declaration.name, "T", diagnostics, "Type parameter name");
  const constraints = planTypeParameterConstraints(node, name, sourceFile, input, diagnostics);
  if (declaration.DefaultType !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Defaulted generic type parameters have no direct C# source equivalent."));
  }
  if (declaration.Expression !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Expression-based generic type parameters are outside the current C# planning surface."));
  }
  return {
    name,
    ...(constraints.length === 0 ? {} : { constraints }),
  };
}

function planTypeParameterConstraints(
  node: Node,
  typeParameterName: string,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): readonly CsharpTypeNode[] {
  const fact = input.facts.getTargetTypeParameterConstraintFact(node);
  if (fact !== undefined) {
    const constraints = fact.constraints
      .map((constraint) => csharpTypeFromTargetTypeParameterConstraint(typeParameterName, constraint, node, diagnostics))
      .filter((constraint): constraint is CsharpTypeNode => constraint !== undefined);
    return constraints;
  }
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

function csharpTypeFromTargetTypeParameterConstraint(
  typeParameterName: string,
  constraint: TargetConstraint,
  sourceNode: Node,
  diagnostics: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  if (
    constraint.kind === "target-specific" &&
    constraint.target === "csharp" &&
    constraint.name === "generic-math-number"
  ) {
    const csharpType = csharpTypeFromTargetTypeRef({
      kind: "target-named",
      id: "System.Numerics.INumber`1",
      typeArguments: [{ kind: "type-parameter", name: typeParameterName }],
    });
    if (csharpType !== undefined) {
      return csharpType;
    }
    diagnostics.push(unsupportedNodeDiagnostic(
      sourceNode,
      "C# emission could not render provider type-parameter constraint 'System.Numerics.INumber<T>'.",
    ));
    return undefined;
  }
  diagnostics.push(unsupportedNodeDiagnostic(
    sourceNode,
    `C# emission does not support target type-parameter constraint '${targetConstraintLabel(constraint)}'.`,
  ));
  return undefined;
}

function targetConstraintLabel(constraint: TargetConstraint): string {
  if (constraint.kind === "target-specific") {
    return `${constraint.target}:${constraint.name}`;
  }
  if (constraint.kind === "implements") {
    return `implements:${constraint.contract}`;
  }
  if (constraint.kind === "lifetime") {
    return `lifetime:${constraint.name}`;
  }
  return constraint.kind;
}
