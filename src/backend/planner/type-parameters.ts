import { AsTypeParameterDeclaration } from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput } from "@tsonic/target-api";
import type { TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpGenericConstraint, CsharpTypeParameter } from "../roslyn/syntax.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { planIdentifierName } from "./names.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";
import {
  csharpTargetTypeParameterConstraintFactKey,
} from "../../source/csharp-facts.js";
import type {
  CsharpTypeParameterConstraint,
} from "../../source/csharp-facts.js";

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
  const name = planIdentifierName(declaration.name, "T", input, diagnostics, "Type parameter name");
  const constraints = planTypeParameterConstraints(node, sourceFile, input, diagnostics);
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
  _sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): readonly CsharpGenericConstraint[] {
  const fact = input.facts.getFact(node, csharpTargetTypeParameterConstraintFactKey);
  if (fact !== undefined) {
    const constraints = fact.constraints
      .map((constraint) => csharpGenericConstraintFromTargetTypeParameterConstraint(constraint, node, diagnostics))
      .filter((constraint): constraint is CsharpGenericConstraint => constraint !== undefined);
    return constraints;
  }
  const declaration = AsTypeParameterDeclaration(node)!;
  if (declaration.Constraint === undefined) {
    return [];
  }
  diagnostics.push(unsupportedNodeDiagnostic(
    declaration.Constraint,
    "Generic constraints require finalized target constraint facts before C# emission.",
  ));
  return [];
}

function csharpGenericConstraintFromTargetTypeParameterConstraint(
  constraint: CsharpTypeParameterConstraint,
  sourceNode: Node,
  diagnostics: TargetDiagnostic[],
): CsharpGenericConstraint | undefined {
  if (constraint.kind === "csharp-type") {
    const csharpType = csharpTypeFromTargetTypeRef(constraint.type);
    if (csharpType !== undefined) {
      return { kind: "TypeConstraint", type: csharpType };
    }
    diagnostics.push(unsupportedNodeDiagnostic(
      sourceNode,
      "C# emission could not render finalized provider type-parameter constraint facts.",
    ));
    return undefined;
  }
  if (constraint.kind === "csharp-keyword") {
    return { kind: "KeywordConstraint", keyword: constraint.keyword };
  }
  if (constraint.kind === "csharp-constructor") {
    return { kind: "ConstructorConstraint" };
  }
  diagnostics.push(unsupportedNodeDiagnostic(
    sourceNode,
    `C# emission does not support target type-parameter constraint '${targetConstraintLabel(constraint)}'.`,
  ));
  return undefined;
}

function targetConstraintLabel(constraint: CsharpTypeParameterConstraint): string {
  if (constraint.kind === "csharp-type") {
    return "csharp-type";
  }
  if (constraint.kind === "csharp-keyword") {
    return `csharp-keyword:${constraint.keyword}`;
  }
  if (constraint.kind === "csharp-constructor") {
    return "csharp-constructor";
  }
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
