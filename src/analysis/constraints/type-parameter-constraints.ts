import type { AstReader, Node, SourceFile } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../policy/types/index.js";
import type { CsharpTypePolicy } from "../types/resolution/model.js";

import type { CsharpTypeParameterConstraint, CsharpTypeParameterConstraintResolution } from "../../target-model/types/generic-constraints.js";

import { csharpTypeParameterConstraintKey, csharpTypeParameterConstraintOrder, selectCsharpNativeTypeParameterConstraint } from "../../policy/constraints/type-parameter-constraints.js";
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
  if (declaration === undefined) return { kind: "unsupported", reason: "The selected generic declaration has no readable source constraint evidence." };
  const constraint = declaration.Constraint;
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
    constraints.set(csharpTypeParameterConstraintKey(item), item);
  }
  return {
    kind: "resolved",
    constraints: [...constraints.values()].sort(
      (left, right) => csharpTypeParameterConstraintOrder(left) - csharpTypeParameterConstraintOrder(right),
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
  const objectKeyword = host.ast.kindName(constraint) === "KindObjectKeyword";
  const numeric = !objectKeyword && numericConstraint(constraint, sourceFile, host);
  const target = objectKeyword || numeric ? undefined : host.types.resolveNode(constraint, sourceFile);
  return selectCsharpNativeTypeParameterConstraint(target, parameter, objectKeyword, numeric);

}
