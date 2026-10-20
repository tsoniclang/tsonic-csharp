import type { CsharpObjectShapePropertyOrders } from "../../../target-model/records/object-shapes.js";
import { analyzeCsharpObjectShapePropertyOrders, csharpNativeInstantiationCanMatch } from "../../objects/property-order.js";
import type { AstReader, Node } from "@tsonic/tsts";

import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeFact, CsharpObjectShapeProjectionKind, TargetTypeRef } from "../../../target-model/types/model.js";

import type { CsharpObjectShapePropertyOrderSelection } from "../../../target-model/records/object-shapes.js";

interface NativeImplementation {
  readonly shape: CsharpObjectShapeFact;
  readonly contract: TargetTypeRef;
}

const emptyOrder: CsharpObjectShapePropertyOrderSelection = Object.freeze({
  kind: "resolved", propertyOrder: Object.freeze([]),
});
const rejected = (reason: string): CsharpObjectShapePropertyOrderSelection => Object.freeze({ kind: "rejected", reason });
const missingProjectionOrder = rejected("Object-shape projection has no exact completed own-property order proof.");
const missingAssignmentSourceOrder = rejected("Object-shape assignment source has no exact completed own-property order proof.");
const missingEmptyOccurrence: Readonly<Record<CsharpObjectShapeProjectionKind, CsharpObjectShapePropertyOrderSelection>> =
  Object.freeze({
    keys: rejected("Selected 'keys' operation has no exact authored empty-object occurrence."),
    values: rejected("Selected 'values' operation has no exact authored empty-object occurrence."),
    entries: rejected("Selected 'entries' operation has no exact authored empty-object occurrence."),
    "has-own": rejected("Selected 'has-own' operation has no exact authored empty-object occurrence."),
    assign: rejected("Selected 'assign' operation has no exact authored empty-object occurrence."),
  });

export function createCsharpObjectShapePropertyOrderIndex(
  ast: AstReader,
  reserveClassification: () => void,
  completedNativeShapes: () => Iterable<CsharpObjectShapeFact>,
  nativeImplementationAccepts: (source: TargetTypeRef, target: TargetTypeRef) => boolean,
) {
  if (typeof completedNativeShapes !== "function") {
    throw new TypeError("C# own-property analysis requires its completed native shape input.");
  }
  if (typeof nativeImplementationAccepts !== "function") {
    throw new TypeError("C# own-property analysis requires its canonical native implementation relation.");
  }
  const emptyLiterals = new WeakSet<Node>();
  const byType = new WeakMap<TargetTypeRef, WeakMap<CsharpObjectShapeFact["members"], CsharpObjectShapePropertyOrders>>();
  const occurrences = new WeakMap<Node, {
    readonly type: TargetTypeRef;
    readonly members: CsharpObjectShapeFact["members"];
    readonly orders: CsharpObjectShapePropertyOrders;
  }>();
  let implementations: ReadonlyMap<string, readonly NativeImplementation[]> | undefined;
  let sealed = false;
  const record = (shape: CsharpObjectShapeFact): void => {
    if (sealed) throw new Error("C# own-property order analysis is sealed.");
    const byMembers = byType.get(shape.targetType) ?? new WeakMap<CsharpObjectShapeFact["members"], CsharpObjectShapePropertyOrders>();
    if (byMembers.has(shape.members)) return;
    reserveClassification();
    if (implementations === undefined) {
      const selected = new Map<string, NativeImplementation[]>();
      const seen = new Set<CsharpObjectShapeFact>();
      const pending = [...completedNativeShapes()];
      for (const candidate of pending) {
        if (seen.has(candidate)) continue;
        reserveClassification();
        seen.add(candidate);
        if (candidate.declarationTemplate !== undefined) pending.push(candidate.declarationTemplate);
        if (isInterfaceShape(candidate)) continue;
        for (const implemented of candidate.implements ?? []) {
          reserveClassification();
          if (implemented.kind !== "target-named") continue;
          const values = selected.get(implemented.id) ?? [];
          values.push({ shape: candidate, contract: implemented });
          selected.set(implemented.id, values);
        }
      }
      implementations = selected;
    }
    const native: CsharpObjectShapeFact[] = [];
    let complete = true;
    for (const implementation of shape.targetType.kind === "target-named" ? implementations.get(shape.targetType.id) ?? [] : []) {
      reserveClassification();
      const match = csharpNativeInstantiationCanMatch(shape.targetType, implementation.contract, nativeImplementationAccepts);
      if (match === undefined) complete = false;
      else if (match) native.push(implementation.shape);
    }
    byMembers.set(shape.members, analyzeCsharpObjectShapePropertyOrders(shape, ast, complete ? native : undefined));
    byType.set(shape.targetType, byMembers);
  };
  const selection = (shape: CsharpObjectShapeFact): CsharpObjectShapePropertyOrders | undefined => {
    if (!sealed) throw new Error("C# own-property order queries require completed analysis.");
    return byType.get(shape.targetType)?.get(shape.members);
  };
  return Object.freeze({
    record,
    recordOccurrence(node: Node, authored: CsharpObjectShapeFact, completed: CsharpObjectShapeFact): void {
      if (sealed) return failTargetAnalysisInvariant("tsonic-csharp", "C# own-property order analysis is sealed.", node);
      const orders = byType.get(authored.targetType)?.get(authored.members);
      if (orders === undefined || byType.get(completed.targetType)?.has(completed.members) !== true) {
        return failTargetAnalysisInvariant("tsonic-csharp", "C# own-property occurrence requires its completed authored order.", node);
      }
      if (occurrences.has(node)) failTargetAnalysisInvariant("tsonic-csharp", "An own-property occurrence publishes once.", node);
      occurrences.set(node, Object.freeze({ type: completed.targetType, members: completed.members, orders }));
    },
    recordEmptyLiteral(node: Node): void {
      if (sealed) throw new Error("C# own-property order analysis is sealed.");
      if (emptyLiterals.has(node) || !ast.is.IsObjectLiteralExpression(node) || ast.properties(node).length !== 0) return;
      reserveClassification();
      emptyLiterals.add(node);
    },
    seal(): void {
      if (sealed) failTargetAnalysisInvariant("tsonic-csharp", "Own-property records seal once.");
      sealed = true;
    },
    propertyOrder(shape: CsharpObjectShapeFact, sourceValue: Node | undefined,
      projection: CsharpObjectShapeProjectionKind): CsharpObjectShapePropertyOrderSelection {
      const completed = selection(shape);
      const occurrence = sourceValue === undefined ? undefined : occurrences.get(sourceValue);
      const selected = (occurrence !== undefined && occurrence.type === shape.targetType && occurrence.members === shape.members
        ? occurrence.orders : completed)?.projections[projection];
      if (selected === undefined) return missingProjectionOrder;
      return selected.kind !== "empty" ? selected
        : sourceValue !== undefined && emptyLiterals.has(sourceValue) ? emptyOrder
          : missingEmptyOccurrence[projection];
    },
    assignmentSourceOrder(shape: CsharpObjectShapeFact): CsharpObjectShapePropertyOrderSelection {
      return selection(shape)?.assignmentSource ?? missingAssignmentSourceOrder;
    },
  });
}
