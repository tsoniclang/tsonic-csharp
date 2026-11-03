import type { AstReader, Node, SourceFile } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../../policy/types/index.js";
import type { CsharpTypePolicy } from "./model.js";

import type { CsharpTypeParameterConstraint, CsharpTypeParameterConstraintResolution } from "../../../../target-model/types/generic-constraints.js";

import { csharpTypeParameterConstraintKey, csharpTypeParameterConstraintOrder, selectCsharpNativeTypeParameterConstraint } from "../../../../policy/constraints/type-parameter-constraints.js";
import type { CsharpConstraintTypeDependency, CsharpNumericConstraintSource, CsharpConstraintSource,
  CsharpTypeParameterConstraintSource } from "../../../../target-model/records/types/callable-source.js";
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

export function formCsharpTypeParameterConstraints(
  typeParameter: Node,
  parameter: Extract<TargetTypeRef, { readonly kind: "type-parameter" }>,
  sourceFile: SourceFile,
  ast: AstReader,
): CsharpTypeParameterConstraintSource {
  const dependencies = new Map<Node, CsharpConstraintTypeDependency>();
  const dependency = (node: Node): CsharpConstraintTypeDependency => {
    const previous = dependencies.get(node);
    if (previous !== undefined) return previous;
    const selected = Object.freeze({ node, sourceFile });
    dependencies.set(node, selected);
    return selected;
  };
  const numeric = (node: Node): CsharpNumericConstraintSource => {
    if (!ast.is.IsUnionTypeNode(node)) return Object.freeze({ kind: "type", dependency: dependency(node) });
    const members = ast.as.AsUnionTypeNode(node)?.Types?.Nodes;
    return members === undefined || members.length === 0 ? Object.freeze({ kind: "unavailable" })
      : Object.freeze({ kind: "members", members: Object.freeze(members.map(member => member === undefined
        ? Object.freeze({ kind: "unavailable" as const }) : numeric(member))) });
  };
  const collect = (node: Node): CsharpConstraintSource => {
    if (ast.is.IsParenthesizedTypeNode(node)) {
      const inner = ast.as.AsParenthesizedTypeNode(node)?.Type;
      return inner === undefined ? Object.freeze({ kind: "unsupported", reason: "Parenthesized generic constraint has no inner type." })
        : collect(inner);
    }
    if (ast.is.IsIntersectionTypeNode(node)) {
      const parts = ast.as.AsIntersectionTypeNode(node)?.Types?.Nodes;
      return parts === undefined ? Object.freeze({ kind: "unsupported", reason: "Intersection generic constraint has no type elements." })
        : Object.freeze({ kind: "intersection", parts: Object.freeze(parts.flatMap(part => part === undefined ? [] : [collect(part)])) });
    }
    const objectKeyword = ast.kindName(node) === "KindObjectKeyword";
    return Object.freeze({ kind: "type", objectKeyword,
      numeric: objectKeyword ? Object.freeze({ kind: "unavailable" }) : numeric(node), dependency: dependency(node) });
  };
  const declaration = ast.as.AsTypeParameterDeclaration(typeParameter);
  const constraint: CsharpConstraintSource = declaration === undefined ? Object.freeze({ kind: "unsupported",
    reason: "The selected generic declaration has no readable source constraint evidence." })
    : declaration.Constraint === undefined ? Object.freeze({ kind: "intersection", parts: Object.freeze([]) })
      : collect(declaration.Constraint);
  return Object.freeze({ declaration: typeParameter, parameter, sourceFile, constraint,
    dependencies: Object.freeze([...dependencies.values()]) });
}

export function* completeCsharpTypeParameterConstraints(
  source: CsharpTypeParameterConstraintSource,
): Generator<CsharpConstraintTypeDependency, CsharpTypeParameterConstraintResolution, TargetTypeRef | undefined> {
  const resolved = yield* completeConstraint(source.constraint, source.parameter);
  if (resolved.kind === "unsupported") return resolved;
  const constraints = new Map<string, CsharpTypeParameterConstraint>();
  for (const item of resolved.constraints) constraints.set(csharpTypeParameterConstraintKey(item), item);
  return { kind: "resolved", constraints: [...constraints.values()].sort(
    (left, right) => csharpTypeParameterConstraintOrder(left) - csharpTypeParameterConstraintOrder(right)),
  };
}

export function resolveCsharpTypeParameterConstraints(
  typeParameter: Node,
  parameter: Extract<TargetTypeRef, { readonly kind: "type-parameter" }>,
  sourceFile: SourceFile,
  host: CsharpTypeParameterConstraintPolicyHost,
): CsharpTypeParameterConstraintResolution {
  return resolveFormedCsharpTypeParameterConstraints(formCsharpTypeParameterConstraints(
    typeParameter, parameter, sourceFile, host.ast), dependency =>
    host.types.resolveNode(dependency.node, dependency.sourceFile)?.sourceResult?.selectedType);
}

export function resolveFormedCsharpTypeParameterConstraints(
  source: CsharpTypeParameterConstraintSource,
  resolveDependency: (dependency: CsharpConstraintTypeDependency) => TargetTypeRef | undefined,
): CsharpTypeParameterConstraintResolution {
  const completion = completeCsharpTypeParameterConstraints(source);
  let selected = completion.next();
  while (!selected.done) selected = completion.next(resolveDependency(selected.value));
  return selected.value;
}

function* completeNumericConstraint(
  source: CsharpNumericConstraintSource,
): Generator<CsharpConstraintTypeDependency, boolean, TargetTypeRef | undefined> {
  if (source.kind === "unavailable") return false;
  if (source.kind === "members") {
    for (const member of source.members) if (!(yield* completeNumericConstraint(member))) return false;
    return true;
  }
  const selected = yield source.dependency;
  return selected?.kind === "source-primitive" && numericSourcePrimitives.has(selected.name) ||
    selected?.kind === "target-named" && selected.id === "System.Numerics.BigInteger";
}

function* completeConstraint(
  source: CsharpConstraintSource,
  parameter: Extract<TargetTypeRef, { readonly kind: "type-parameter" }>,
): Generator<CsharpConstraintTypeDependency, CsharpTypeParameterConstraintResolution, TargetTypeRef | undefined> {
  if (source.kind === "unsupported") return source;
  if (source.kind === "intersection") {
    const resolved: CsharpTypeParameterConstraint[] = [];
    for (const part of source.parts) {
      const item = yield* completeConstraint(part, parameter);
      if (item.kind === "unsupported") return item;
      resolved.push(...item.constraints);
    }
    return { kind: "resolved", constraints: resolved };
  }
  const numeric = !source.objectKeyword && (yield* completeNumericConstraint(source.numeric));
  const target = source.objectKeyword || numeric ? undefined : yield source.dependency;
  return selectCsharpNativeTypeParameterConstraint(target, parameter, source.objectKeyword, numeric);
}
