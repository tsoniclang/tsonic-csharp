import type { CsharpTranslationContext } from "../../translate/context/index.js";
import { AsTypeParameterDeclaration } from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";

import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type { CsharpGenericConstraint, CsharpTypeParameter } from "../roslyn/syntax.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { planIdentifierName } from "./names.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";
import {
  CsharpTypeParameterConstraint,
  resolveCsharpTypeParameterConstraints,
} from "../../policy/constraints/index.js";

export function planTypeParameters(
  nodes: readonly (Node | undefined)[],
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
): readonly CsharpTypeParameter[] {
  return nodes
    .filter((node): node is Node => node !== undefined)
    .map((node) => planTypeParameter(node, sourceFile, input, diagnostics));
}

function planTypeParameter(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
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
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
): readonly CsharpGenericConstraint[] {
  const declaration = AsTypeParameterDeclaration(node)!;
  const typeParameterName = input.ast.text(declaration.name);
  const resolution = resolveCsharpTypeParameterConstraints(
    node,
    typeParameterName,
    sourceFile,
    input,
  );
  if (resolution.kind === "unsupported") {
    diagnostics.push(unsupportedNodeDiagnostic(
      declaration.Constraint ?? node,
      resolution.reason,
    ));
    return [];
  }
  return resolution.constraints
    .map((constraint) =>
      csharpGenericConstraintFromTargetTypeParameterConstraint(
        constraint,
        node,
        diagnostics,
      ))
    .filter(
      (constraint): constraint is CsharpGenericConstraint =>
        constraint !== undefined,
    );
}

function csharpGenericConstraintFromTargetTypeParameterConstraint(
  constraint: CsharpTypeParameterConstraint,
  sourceNode: Node,
  diagnostics: TargetDiagnostic[],
): CsharpGenericConstraint | undefined {
  if (constraint.kind === "type") {
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
  if (constraint.kind === "keyword") {
    return { kind: "KeywordConstraint", keyword: constraint.keyword };
  }
  if (constraint.kind === "constructor") {
    return { kind: "ConstructorConstraint" };
  }
  diagnostics.push(unsupportedNodeDiagnostic(
    sourceNode,
    "C# emission does not support the selected target type-parameter constraint.",
  ));
  return undefined;
}
