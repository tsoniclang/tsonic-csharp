import type { CsharpTranslationContext } from "../../translate/context/index.js";
import type {
  Node,
} from "@tsonic/tsts";
import {
  sourcePrimitiveFactKey,
} from "@tsonic/tsts";
import type { TargetTypeRef } from "../../policy/types/index.js";


export function targetTypePreservesSourcePrimitiveEvidence(
  input: CsharpTranslationContext,
  node: Node,
  targetType: TargetTypeRef,
): boolean {
  const requiredPrimitives = collectSourcePrimitiveEvidence(input, node);
  if (requiredPrimitives.size === 0) {
    return true;
  }
  const targetPrimitives = collectTargetTypeSourcePrimitives(targetType);
  for (const primitive of requiredPrimitives) {
    if (!targetPrimitives.has(primitive)) {
      return false;
    }
  }
  return true;
}

export function describeSourcePrimitiveEvidence(
  input: CsharpTranslationContext,
  node: Node,
): readonly string[] {
  return [...collectSourcePrimitiveEvidence(input, node)]
    .sort()
    .map((primitive) => `sourcePrimitive=${primitive}`);
}

function collectSourcePrimitiveEvidence(
  input: CsharpTranslationContext,
  node: Node,
): ReadonlySet<string> {
  const found = new Set<string>();
  const visit = (current: Node | undefined): void => {
    if (current === undefined) {
      return;
    }
    addSourcePrimitiveFact(found, input, current);
    input.ast.forEachChild(current, (child): void => {
      visit(child);
    });
  };
  visit(node);
  return found;
}

function addSourcePrimitiveFact(
  found: Set<string>,
  input: CsharpTranslationContext,
  subject: Node,
): void {
  const primitive = input.sourceFacts?.getFact(subject, sourcePrimitiveFactKey);
  if (primitive !== undefined) {
    found.add(primitive.kind);
  }
}

function collectTargetTypeSourcePrimitives(type: TargetTypeRef): ReadonlySet<string> {
  const found = new Set<string>();
  const visit = (current: TargetTypeRef): void => {
    switch (current.kind) {
      case "source-primitive":
        found.add(current.name);
        return;
      case "array":
        visit(current.element);
        return;
      case "tuple":
        current.elements.forEach(visit);
        return;
      case "source-global":
      case "target-named":
        current.typeArguments?.forEach(visit);
        return;
      case "pointer":
        visit(current.pointee);
        return;
      case "function-pointer":
        current.args.forEach(visit);
        visit(current.result);
        return;
      case "associated-type":
        visit(current.owner);
        return;
      case "opaque":
      case "lifetime":
      case "target-specific":
      case "type-parameter":
        return;
    }
  };
  visit(type);
  return found;
}
