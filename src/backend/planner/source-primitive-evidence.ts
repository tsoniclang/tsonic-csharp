import type {
  Node,
  SourceFile,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
} from "@tsonic/target-api";

export function targetTypePreservesSourcePrimitiveEvidence(
  input: TargetCompileInput,
  node: Node,
  sourceFile: SourceFile,
  targetType: TargetTypeRef,
): boolean {
  const requiredPrimitives = collectSourcePrimitiveEvidence(input, node, sourceFile);
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
  input: TargetCompileInput,
  node: Node,
  sourceFile: SourceFile,
): readonly string[] {
  return [...collectSourcePrimitiveEvidence(input, node, sourceFile)]
    .sort()
    .map((primitive) => `sourcePrimitive=${primitive}`);
}

function collectSourcePrimitiveEvidence(
  input: TargetCompileInput,
  node: Node,
  sourceFile: SourceFile,
): ReadonlySet<string> {
  const found = new Set<string>();
  const visit = (current: Node | undefined): void => {
    if (current === undefined) {
      return;
    }
    addSourcePrimitiveFact(found, input, current);
    addSourcePrimitiveFact(found, input, input.analysis.getSymbolAtLocation(current, { sourceFile }));
    addSourcePrimitiveFact(found, input, input.analysis.getResolvedSymbol(current, { sourceFile }));
    input.ast.forEachChild(current, (child): void => {
      visit(child);
    });
  };
  visit(node);
  return found;
}

function addSourcePrimitiveFact(
  found: Set<string>,
  input: TargetCompileInput,
  subject: Parameters<TargetCompileInput["facts"]["getSourcePrimitiveFact"]>[0],
): void {
  const primitive = input.facts.getSourcePrimitiveFact(subject);
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
