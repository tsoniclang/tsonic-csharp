import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "../context.js";
import type { CsharpObjectInitializerAssignment } from "../../target-ast/syntax/index.js";
import type { ExpressionPlanner } from "./expression-planner-types.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { failCsharpPlannerInvariant, unsupportedNodeDiagnostic } from "../diagnostics.js";
import { objectShapeBoundStorageMemberName, objectShapeBoundStorageTargetType } from "../objects/object-shape-storage.js";
import { csharpConstructibleTypeFromObjectShapeFact } from "../objects/index.js";
import type { CsharpPlannedValue } from "./planned-values.js";
import { buildCsharpPlannedValue } from "./planned-value-composition.js";
import type { CsharpMemoryBindingSelection } from "../../../target-model/records/memory-bindings.js";

export function planCsharpMemoryBinding(
  node: Node, binding: CsharpMemoryBindingSelection, file: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner,
): CsharpPlannedValue | undefined {
  const reject = (reason: string) => {
    diagnostics.push(unsupportedNodeDiagnostic(node, reason));
    return undefined;
  };
  if (binding.kind === "rejected") return failCsharpPlannerInvariant("A memory-binding refusal must be rejected before native publication.", node);
  if (binding.kind === "field") return planExpression(binding.expression, file, input, diagnostics);
  const type = csharpConstructibleTypeFromObjectShapeFact(input, binding.shape, diagnostics, node);
  if (type === undefined) return reject("The bound record has no renderable C# target type.");
  const values: CsharpPlannedValue[] = [];
  const storages: import("../../target-ast/syntax/index.js").CsharpTypeNode[] = [];
  for (const field of binding.fields) {
    const pointer = planExpression(field.expression, file, input, diagnostics);
    const storage = csharpTypeFromTargetTypeRef(objectShapeBoundStorageTargetType(field.member), input.scope.typeParameterNames);
    if (pointer === undefined || storage === undefined) return reject("The bound field has no renderable C# location storage.");
    values.push(pointer);
    storages.push(storage);
  }
  return buildCsharpPlannedValue(node, file, input, diagnostics, values, pointers => {
  const assignments: CsharpObjectInitializerAssignment[] = binding.fields.map((field, index) => ({ kind: "AssignmentExpression", name: objectShapeBoundStorageMemberName(binding.shape, field.member), expression: {
      kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: storages[index]!, name: "FromLocation" },
      arguments: [{ kind: "Argument", expression: pointers[index]! }],
    } }));
  return { kind: "ObjectCreationExpression", type, assignments };
  }, binding.shape.targetType);
}
