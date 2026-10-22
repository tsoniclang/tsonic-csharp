import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "../context.js";
import type { CsharpObjectInitializerAssignment } from "../../target-ast/syntax/index.js";
import type { ExpressionPlanner } from "./expression-planner-types.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { objectShapeBoundStorageMemberName } from "../../../target-model/names/object-members.js";
import { objectShapeBoundStorageTargetType } from "../objects/object-shape-storage.js";
import { csharpConstructibleTypeFromObjectShapeFact } from "../objects/index.js";
import type { CsharpPlannedValue } from "./planned-values.js";
import { buildCsharpPlannedValue } from "./planned-value-composition.js";
import type { CsharpMemoryBindingSelection } from "../../../target-model/records/memory-bindings.js";

export function planCsharpMemoryBinding(
  node: Node, binding: CsharpMemoryBindingSelection, file: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner,
): CsharpPlannedValue | undefined {
  if (binding.kind === "rejected") failCsharpPlannerInvariant("A rejected memory binding cannot reach native planning.", node);
  if (binding.kind === "field") return planExpression(binding.expression, file, input, diagnostics);
  const type = csharpConstructibleTypeFromObjectShapeFact(input, binding.shape, diagnostics, node);
  if (type === undefined) failCsharpPlannerInvariant("The admitted bound record has no renderable C# target type.", node);
  const values: CsharpPlannedValue[] = [];
  const storages: import("../../target-ast/syntax/index.js").CsharpTypeNode[] = [];
  for (const field of binding.fields) {
    const pointer = planExpression(field.expression, file, input, diagnostics);
    const storage = csharpTypeFromTargetTypeRef(objectShapeBoundStorageTargetType(binding.shape, field.member, input.program.records), input.scope.typeParameterNames);
    if (pointer === undefined || storage === undefined) failCsharpPlannerInvariant("The admitted bound field has no renderable C# location storage.", field.expression);
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
