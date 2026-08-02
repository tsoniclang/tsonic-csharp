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

export type CsharpTypeParameterConstraint =
  | { readonly kind: "type"; readonly type: TargetTypeRef }
  | {
      readonly kind: "keyword";
      readonly keyword: "class" | "struct" | "notnull" | "unmanaged";
    }
  | { readonly kind: "constructor" };

export type CsharpTypeParameterConstraintResolution =
  | {
      readonly kind: "resolved";
      readonly constraints: readonly CsharpTypeParameterConstraint[];
    }
  | {
      readonly kind: "unsupported";
      readonly reason: string;
    };

export interface CsharpTypeParameterConstraintPolicyHost {
  readonly ast: AstReader;
  readonly types: CsharpTypePolicy;
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

export function resolveCsharpTypeParameterConstraints(
  typeParameter: Node,
  typeParameterName: string,
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
    typeParameterName,
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
  typeParameterName: string,
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
      : resolveConstraint(inner, typeParameterName, sourceFile, host);
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
        typeParameterName,
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
  const targetType = host.types.resolveNode(constraint, sourceFile);
  if (targetType === undefined) {
    return {
      kind: "unsupported",
      reason:
        "The source constraint has no exact C# target representation.",
    };
  }
  if (
    targetType.kind === "source-primitive" &&
    numericSourcePrimitives.has(targetType.name)
  ) {
    return {
      kind: "resolved",
      constraints: [{
        kind: "type",
        type: csharpTargetNamedType(
          "System.Numerics.INumber`1",
          [{ kind: "type-parameter", name: typeParameterName }],
          csharpQualifiedTypeRenderShape(
            "System.Numerics",
            "INumber",
          ),
        ),
      }],
    };
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
