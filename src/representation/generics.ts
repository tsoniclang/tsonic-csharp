// Generic binders: the per-program type-parameter environment and C# constraints represented from the Host
// descriptors of authored constraints. Syntax is read only to split authored `&`, `|` and parentheses and to see the
// `object` keyword; every constraint type is the Host descriptor of its authored type node.
import type { AstReader, Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { SourceTypeDescriptor } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../target-model/types/model.js";
import type { CsharpTypeParameterConstraint, CsharpTypeParameterConstraintResolution } from "../target-model/types/generic-constraints.js";
import type { CsharpTypeParameterEnvironment, CsharpTypeParameterSnapshot } from "../target-model/records/types/type-parameter-constraints.js";
import { csharpTypeProjection } from "../target-model/types/projections.js";
import { snapshotCsharpTargetTypes } from "../target-model/types/snapshot.js";
import { csharpMetadataDescriptors } from "../target-model/metadata/immutable.js";
import { csharpSourceTypeParameter } from "../source/extension/type-parameters.js";
import { csharpTypeParameterConstraintKey, csharpTypeParameterConstraintOrder,
  selectCsharpNativeTypeParameterConstraint } from "../policy/constraints/type-parameter-constraints.js";
import { csharpRepresentationContext, isCsharpRefusal, type CsharpRepresentationServices } from "./context.js";
import { representSourceType } from "./descriptors.js";

type TypeParameter = Extract<TargetTypeRef, { readonly kind: "type-parameter" }>;

/** A sealed, cached environment: each binder is resolved once per identity; reentry is refused. */
export function createCsharpTypeParameterEnvironment(
  resolve: (parameter: TypeParameter) => CsharpTypeParameterConstraintResolution | undefined,
): CsharpTypeParameterEnvironment {
  const cache = new Map<string, { readonly input: Readonly<Record<string, PropertyDescriptor>>;
    readonly snapshot: CsharpTypeParameterSnapshot }>();
  const active = new Set<string>();
  return Object.freeze({ resolve(parameter, _source, budget) {
    const descriptors = csharpMetadataDescriptors(parameter);
    if (descriptors.kind?.value !== "type-parameter") throw new TypeError("A native generic owner requires exact parameter carriers.");
    const previous = cache.get(parameter.identity);
    const keys = Object.keys(descriptors);
    if (previous !== undefined && (parameter === previous.snapshot ||
      keys.length === Object.keys(previous.input).length &&
      keys.every(key => descriptors[key]!.value === previous.input[key]?.value))) return previous.snapshot;
    const formed = snapshotCsharpTargetTypes([parameter], budget)[0]!;
    if (formed.kind !== "type-parameter") throw new TypeError("A native generic owner requires exact parameter carriers.");
    let resolution: CsharpTypeParameterConstraintResolution | undefined;
    if (active.has(parameter.identity)) resolution = { kind: "unsupported",
      reason: `Generic binder '${parameter.name}' constraint resolution reentered an unfinished native contract.` };
    else {
      active.add(parameter.identity);
      try {
        resolution = resolve(formed);
      } finally {
        active.delete(parameter.identity);
      }
    }
    resolution ??= { kind: "unsupported", reason: `Generic binder '${parameter.name}' has no sealed native constraint evidence.` };
    const finalized = formed.csharpConstraints === resolution ? formed
      : snapshotCsharpTargetTypes([{ ...formed, csharpConstraints: resolution }], budget)[0]!;
    if (finalized.kind !== "type-parameter" || finalized.csharpConstraints === undefined) {
      failTargetAnalysisInvariant("tsonic-csharp", "A native generic parameter requires finalized constraint evidence.");
    }
    const immutable = finalized as CsharpTypeParameterSnapshot;
    if (resolution.kind === "resolved") cache.set(parameter.identity, { input: descriptors, snapshot: immutable });
    return immutable;
  } } satisfies CsharpTypeParameterEnvironment);
}

/** The environment of one program view: binders are identified by their declaration; constraints come from the Host. */
export function createCsharpSourceTypeParameterEnvironment(services: () => CsharpRepresentationServices): CsharpTypeParameterEnvironment {
  return createCsharpTypeParameterEnvironment(parameter => {
    const declaration = parameter.csharpDeclaration;
    const selected = declaration === undefined ? undefined : csharpSourceTypeParameter(declaration, services().syntax);
    if (declaration !== undefined && selected?.identity !== parameter.identity) return Object.freeze({ kind: "unsupported",
      reason: `Generic binder '${parameter.name}' has inconsistent source declaration identity.` });
    if (parameter.csharpConstraints !== undefined) return parameter.csharpConstraints;
    const projection = csharpTypeProjection(parameter);
    if (projection !== undefined) return Object.freeze({ kind: "resolved", constraints: projection.csharpProjectionConstraints });
    if (selected === undefined) return Object.freeze({ kind: "unsupported",
      reason: `Generic binder '${parameter.name}' has no exact source declaration or retained native constraints.` });
    return representTypeParameterConstraints(declaration!, parameter, services());
  });
}

const numericPrimitives = new Set(["int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64", "native-int",
  "native-uint", "float16", "float32", "float64", "decimal", "int128", "uint128"]);

function isNumericDescriptor(descriptor: SourceTypeDescriptor): boolean {
  if (descriptor.kind === "primitive") return numericPrimitives.has(descriptor.primitive);
  if (descriptor.kind === "intrinsic") return descriptor.intrinsic === "bigint";
  if (descriptor.kind === "union") return descriptor.types.length > 0 && descriptor.types.every(isNumericDescriptor);
  return false;
}

/**
 * C# constraints of one generic binder, from the Host descriptor of each authored constraint part.
 * Every form .NET cannot state is one precise `unsupported` result, never a throw and never a guess:
 * a declaration that is not a type-parameter declaration (no proof of an empty constraint set), a malformed
 * parenthesized or intersection part, a part whose representation is a CSHARP_ refusal, and a carrier with no C#
 * constraint clause.
 * A constraint part the Host refused is NOT R5 forwarding: R5 forwards Host refusals unchanged, before C# analysis
 * (analysis/program/analyze.ts). The Host answers authored type nodes lazily (solver `typeSyntax`), and those refusals
 * are not yet in facts.refusals(), so this branch can be reached by a valid program and stays until the Host collects
 * them (request R-C7-6, AGENT-C7-NOTES.md). After that it becomes the shared invariant reader (K-2670).
 * Only a binder declaration without a `Constraint` is unconstrained (`resolved []`).
 */
export function representTypeParameterConstraints(
  declaration: Node,
  parameter: TypeParameter,
  services: CsharpRepresentationServices,
): CsharpTypeParameterConstraintResolution {
  const syntax: AstReader = services.syntax;
  const binder = syntax.as.AsTypeParameterDeclaration(declaration);
  if (binder === undefined) return { kind: "unsupported",
    reason: `Generic binder '${parameter.name}' has no readable type-parameter declaration; an empty constraint set is not proven.` };
  const constraint = binder.Constraint;
  if (constraint === undefined) return { kind: "resolved", constraints: [] };
  const parts: Node[] = [];
  const pending: Node[] = [constraint];
  while (pending.length > 0) {
    const part = pending.shift()!;
    if (syntax.is.IsParenthesizedTypeNode(part)) {
      const inner = syntax.as.AsParenthesizedTypeNode(part)?.Type;
      if (inner === undefined) return { kind: "unsupported", reason: "Parenthesized generic constraint has no inner type." };
      pending.unshift(inner);
    } else if (syntax.is.IsIntersectionTypeNode(part)) {
      const members = syntax.as.AsIntersectionTypeNode(part)?.Types?.Nodes;
      if (members === undefined) return { kind: "unsupported", reason: "Intersection generic constraint has no type elements." };
      pending.unshift(...members.filter((member): member is Node => member !== undefined));
    } else parts.push(part);
  }
  const constraints = new Map<string, CsharpTypeParameterConstraint>();
  for (const part of parts) {
    const objectKeyword = syntax.kindName(part) === "KindObjectKeyword";
    let descriptor: SourceTypeDescriptor | undefined;
    if (!objectKeyword) {
      const outcome = services.facts.values.type(part);
      // Pending R-C7-6: a lazy type-syntax refusal, not yet in facts.refusals() (see the comment above).
      if (outcome.kind === "refused") return { kind: "unsupported",
        reason: `Generic binder '${parameter.name}' constraint was refused by the Host (${outcome.code}): ${outcome.reason}` };
      descriptor = outcome.type;
    }
    const numeric = descriptor !== undefined && isNumericDescriptor(descriptor);
    let target: TargetTypeRef | undefined;
    if (descriptor !== undefined && !numeric) {
      const represented = representSourceType(descriptor, csharpRepresentationContext(services, part, "type-argument"));
      if (isCsharpRefusal(represented)) return { kind: "unsupported", reason: represented.message };
      target = represented;
    }
    const resolved = selectCsharpNativeTypeParameterConstraint(target, parameter, objectKeyword, numeric);
    if (resolved.kind === "unsupported") return resolved;
    for (const item of resolved.constraints) constraints.set(csharpTypeParameterConstraintKey(item), item);
  }
  return { kind: "resolved", constraints: [...constraints.values()].sort(
    (left, right) => csharpTypeParameterConstraintOrder(left) - csharpTypeParameterConstraintOrder(right)) };
}
