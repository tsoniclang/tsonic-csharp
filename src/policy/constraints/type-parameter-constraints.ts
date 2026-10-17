import type {
  AstReader,
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  CsharpTypePolicy,
  TargetTypeRef,
} from "../types/index.js";
import {
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
  isCsharpStringTargetType,
  isCsharpValueTypeTargetType,
  targetTypeRefKey,
} from "../types/index.js";
import type {
  CsharpTypeParameterConstraint,
  CsharpTypeParameterConstraintResolution,
} from "../../target-model/types/generic-constraints.js";
import type { CsharpPolicyContext } from "../model/context.js";
import type { CsharpConversionShapeQueries } from "../conversions/shape-queries.js";
import { namedTargetTypeImplicitlyAccepts } from "../conversions/carriers.js";
import { csharpTargetBindingFact, type CsharpTargetNamedTypeRef } from "../../target-model/types/model.js";
import { getCsharpNullableElementTargetType, isCsharpNullableReferenceTargetType } from "../../target-model/types/index.js";

export type {
  CsharpTypeParameterConstraint,
  CsharpTypeParameterConstraintResolution,
} from "../../target-model/types/generic-constraints.js";

export interface CsharpTypeParameterConstraintPolicyHost {
  readonly ast: AstReader;
  readonly types: Pick<CsharpTypePolicy, "resolveNode">;
}

const numericSourcePrimitives = new Set([
  "int8",
  "uint8",
  "int16",
  "uint16",
  "int32",
  "uint32",
  "int64",
  "uint64",
  "native-int",
  "native-uint",
  "float16",
  "float32",
  "float64",
  "decimal",
  "int128",
  "uint128",
]);

export function csharpTypeParameterConstraintsImply(
  policy: Pick<CsharpPolicyContext, "projectTypes" | "providers" | "typeDefinitions"> & CsharpConversionShapeQueries,
  source: readonly CsharpTypeParameterConstraint[],
  required: readonly CsharpTypeParameterConstraint[],
  parameters: ReadonlyMap<string, readonly CsharpTypeParameterConstraint[]>,
): boolean {
  const inherited = [...source];
  const visited = new Set<string>();
  for (let index = 0; index < inherited.length; index += 1) {
    const constraint = inherited[index]!;
    if (constraint.kind !== "type" || constraint.type.kind !== "type-parameter" || visited.has(constraint.type.identity)) continue;
    visited.add(constraint.type.identity);
    const stored = parameters.get(constraint.type.identity);
    const resolution = constraint.type.csharpConstraints;
    const constraints = stored ?? (resolution?.kind === "resolved" ? resolution.constraints : undefined);
    if (constraints !== undefined) inherited.push(...constraints);
  }
  const keyword = (name: Extract<CsharpTypeParameterConstraint, { readonly kind: "keyword" }>["keyword"]): boolean =>
    inherited.some(constraint => constraint.kind === "keyword" && constraint.keyword === name);
  const nativeClass = (type: TargetTypeRef): boolean => {
    if (type.kind !== "target-named" || getCsharpNullableElementTargetType(type) !== undefined || isCsharpNullableReferenceTargetType(type)) return false;
    const definition = policy.projectTypes.catalog.definitionForTarget(type);
    const binding = csharpTargetBindingFact(policy.providers.findTargetBindingByTargetId(type.id));
    return definition?.kind === "class" || (type as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind === "class" || binding?.kind === "class";
  };
  return required.every(constraint => {
    if (constraint.kind === "type") return inherited.some(candidate => candidate.kind === "type" &&
      namedTargetTypeImplicitlyAccepts(policy, candidate.type, constraint.type, new Set()));
    if (constraint.kind === "constructor") return source.some(candidate => candidate.kind === "constructor" ||
      candidate.kind === "keyword" && (candidate.keyword === "struct" || candidate.keyword === "unmanaged"));
    switch (constraint.keyword) {
      case "class": return keyword("class") || inherited.some(candidate => candidate.kind === "type" && nativeClass(candidate.type));
      case "struct": return keyword("struct") || keyword("unmanaged");
      case "unmanaged": return keyword("unmanaged");
      case "notnull": return keyword("notnull") || keyword("class") || keyword("struct") || keyword("unmanaged") ||
        inherited.some(candidate => candidate.kind === "type" && candidate.type.kind === "target-named" &&
          getCsharpNullableElementTargetType(candidate.type) === undefined && !isCsharpNullableReferenceTargetType(candidate.type));
    }
  });
}

export function csharpTypeParameterConstraintsEqual(
  left: readonly CsharpTypeParameterConstraint[], right: readonly CsharpTypeParameterConstraint[],
): boolean {
  const expected = new Set(left.map(constraintKey));
  const actual = new Set(right.map(constraintKey));
  return expected.size === actual.size && [...expected].every(key => actual.has(key));
}

function numericConstraint(constraint: Node, sourceFile: SourceFile, host: CsharpTypeParameterConstraintPolicyHost): boolean {
  if (host.ast.is.IsUnionTypeNode(constraint)) {
    const members = host.ast.as.AsUnionTypeNode(constraint)?.Types?.Nodes;
    return members !== undefined && members.length > 0 &&
      members.every(member => member !== undefined && numericConstraint(member, sourceFile, host));
  }
  const selected = host.types.resolveNode(constraint, sourceFile);
  return selected?.kind === "source-primitive" && numericSourcePrimitives.has(selected.name) ||
    selected?.kind === "target-named" && selected.id === "System.Numerics.BigInteger";
}

export function resolveCsharpTypeParameterConstraints(
  typeParameter: Node,
  parameter: Extract<TargetTypeRef, { readonly kind: "type-parameter" }>,
  sourceFile: SourceFile,
  host: CsharpTypeParameterConstraintPolicyHost,
): CsharpTypeParameterConstraintResolution {
  const declaration = host.ast.as.AsTypeParameterDeclaration(typeParameter);
  const constraint = declaration?.Constraint;
  if (constraint === undefined) {
    return { kind: "resolved", constraints: [] };
  }
  const resolved = resolveConstraint(
    constraint,
    parameter,
    sourceFile,
    host,
  );
  if (resolved.kind === "unsupported") {
    return resolved;
  }
  const constraints = new Map<string, CsharpTypeParameterConstraint>();
  for (const item of resolved.constraints) {
    constraints.set(constraintKey(item), item);
  }
  return {
    kind: "resolved",
    constraints: [...constraints.values()].sort(
      (left, right) => constraintOrder(left) - constraintOrder(right),
    ),
  };
}

function resolveConstraint(
  constraint: Node,
  parameter: Extract<TargetTypeRef, { readonly kind: "type-parameter" }>,
  sourceFile: SourceFile,
  host: CsharpTypeParameterConstraintPolicyHost,
): CsharpTypeParameterConstraintResolution {
  if (host.ast.is.IsParenthesizedTypeNode(constraint)) {
    const inner = host.ast.as.AsParenthesizedTypeNode(constraint)?.Type;
    return inner === undefined
      ? {
          kind: "unsupported",
          reason: "Parenthesized generic constraint has no inner type.",
        }
      : resolveConstraint(inner, parameter, sourceFile, host);
  }
  if (host.ast.is.IsIntersectionTypeNode(constraint)) {
    const parts = host.ast.as.AsIntersectionTypeNode(constraint)?.Types?.Nodes;
    if (parts === undefined) {
      return {
        kind: "unsupported",
        reason: "Intersection generic constraint has no type elements.",
      };
    }
    const resolved: CsharpTypeParameterConstraint[] = [];
    for (const part of parts) {
      if (part === undefined) {
        continue;
      }
      const item = resolveConstraint(
        part,
        parameter,
        sourceFile,
        host,
      );
      if (item.kind === "unsupported") {
        return item;
      }
      resolved.push(...item.constraints);
    }
    return { kind: "resolved", constraints: resolved };
  }
  if (host.ast.kindName(constraint) === "KindObjectKeyword") {
    return {
      kind: "resolved",
      constraints: [{ kind: "keyword", keyword: "class" }],
    };
  }
  if (numericConstraint(constraint, sourceFile, host)) {
    return {
      kind: "resolved",
      constraints: [{
        kind: "type",
        type: csharpTargetNamedType("System.Numerics.INumber`1", [parameter], csharpQualifiedTypeRenderShape(
            "System.Numerics",
            "INumber",
          ), { allowsRefLikeTypeArguments: [false],}),
      }],
    };
  }
  const targetType = host.types.resolveNode(constraint, sourceFile);
  if (targetType === undefined) {
    return { kind: "unsupported", reason: "The source constraint has no exact C# target representation." };
  }
  if (
    targetType.kind === "type-parameter" ||
    (
      targetType.kind === "target-named" &&
      !isCsharpStringTargetType(targetType) &&
      !isCsharpValueTypeTargetType(targetType)
    )
  ) {
    return {
      kind: "resolved",
      constraints: [{ kind: "type", type: targetType }],
    };
  }
  return {
    kind: "unsupported",
    reason:
      "The selected source constraint cannot be represented as an exact C# generic constraint.",
  };
}

function constraintKey(constraint: CsharpTypeParameterConstraint): string {
  switch (constraint.kind) {
    case "type":
      return `type:${targetTypeRefKey(constraint.type)}`;
    case "keyword":
      return `keyword:${constraint.keyword}`;
    case "constructor":
      return "constructor";
  }
}

function constraintOrder(constraint: CsharpTypeParameterConstraint): number {
  switch (constraint.kind) {
    case "keyword":
      return 0;
    case "type":
      return 1;
    case "constructor":
      return 2;
  }
}
