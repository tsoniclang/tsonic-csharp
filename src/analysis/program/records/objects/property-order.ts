import type { CsharpObjectShapePropertyOrders } from "../../../../target-model/records/objects/object-shapes.js";
import type { Node } from "@tsonic/tsts";

import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeFact, CsharpObjectShapeProjectionKind, TargetTypeRef } from "../../../../target-model/types/model.js";

import type { CsharpObjectShapePropertyOrderSelection } from "../../../../target-model/records/objects/object-shapes.js";

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

export function createCsharpObjectShapePropertyOrderProducer() {
  const emptyLiterals = new WeakSet<Node>();
  const byType = new WeakMap<TargetTypeRef, WeakMap<CsharpObjectShapeFact["members"], CsharpObjectShapePropertyOrders>>();
  const occurrences = new WeakMap<Node, {
    readonly type: TargetTypeRef;
    readonly members: CsharpObjectShapeFact["members"];
    readonly orders: CsharpObjectShapePropertyOrders;
  }>();
  let sealed = false;
  const selection = (shape: CsharpObjectShapeFact): CsharpObjectShapePropertyOrders | undefined => {
    if (!sealed) failTargetAnalysisInvariant("tsonic-csharp", "C# own-property order queries require completed analysis.");
    return byType.get(shape.targetType)?.get(shape.members);
  };
  return Object.freeze({
    contains(shape: CsharpObjectShapeFact): boolean {
      assertOpen();
      return byType.get(shape.targetType)?.has(shape.members) === true;
    },
    record(shape: CsharpObjectShapeFact, orders: CsharpObjectShapePropertyOrders): void {
      assertOpen();
      const byMembers = byType.get(shape.targetType) ?? new WeakMap<CsharpObjectShapeFact["members"], CsharpObjectShapePropertyOrders>();
      if (byMembers.has(shape.members)) failTargetAnalysisInvariant("tsonic-csharp", "Own-property orders publish once.");
      byMembers.set(shape.members, orders);
      byType.set(shape.targetType, byMembers);
    },
    recordOccurrence(node: Node, authored: CsharpObjectShapeFact, completed: CsharpObjectShapeFact): void {
      assertOpen(node);
      const orders = byType.get(authored.targetType)?.get(authored.members);
      if (orders === undefined || byType.get(completed.targetType)?.has(completed.members) !== true) {
        return failTargetAnalysisInvariant("tsonic-csharp", "C# own-property occurrence requires its completed authored order.", node);
      }
      if (occurrences.has(node)) failTargetAnalysisInvariant("tsonic-csharp", "An own-property occurrence publishes once.", node);
      occurrences.set(node, Object.freeze({ type: completed.targetType, members: completed.members, orders }));
    },
    hasEmptyLiteral(node: Node): boolean {
      assertOpen(node);
      return emptyLiterals.has(node);
    },
    recordEmptyLiteral(node: Node): void {
      assertOpen(node);
      if (emptyLiterals.has(node)) failTargetAnalysisInvariant("tsonic-csharp", "An empty own-property occurrence publishes once.", node);
      emptyLiterals.add(node);
    },
    seal(): void {
      assertOpen();
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
        : sourceValue !== undefined && emptyLiterals.has(sourceValue) ? emptyOrder : missingEmptyOccurrence[projection];
    },
    assignmentSourceOrder(shape: CsharpObjectShapeFact): CsharpObjectShapePropertyOrderSelection {
      return selection(shape)?.assignmentSource ?? missingAssignmentSourceOrder;
    },
  });
  function assertOpen(node?: Node): void {
    if (sealed) failTargetAnalysisInvariant("tsonic-csharp", "C# own-property order analysis is sealed.", node);
  }
}
