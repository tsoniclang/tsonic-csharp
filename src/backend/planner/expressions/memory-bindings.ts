import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "../context.js";
import type { CsharpObjectInitializerAssignment } from "../../target-ast/roslyn/index.js";
import type { ExpressionPlanner } from "./expression-planner-types.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { objectShapeBoundStorageMemberName, objectShapeBoundStorageTargetType } from "../objects/object-shape-storage.js";
import { csharpConstructibleTypeFromObjectShapeFact } from "../objects/index.js";
import type { CsharpPlannedValue } from "./planned-values.js";
import { buildCsharpPlannedValue } from "./planned-value-composition.js";

export function tryPlanCsharpMemoryBinding(
  node: Node, file: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner,
): { readonly handled: boolean; readonly expression?: CsharpPlannedValue } {
  const binding = input.program.operations.memoryBinding(node);
  if (binding === undefined) return { handled: false };
  const reject = (reason: string) => {
    diagnostics.push(unsupportedNodeDiagnostic(node, reason));
    return { handled: true };
  };
  if (binding.kind === "rejected") return reject(binding.reason);
  if (binding.kind === "field") return { handled: true, expression: planExpression(binding.expression, file, input, diagnostics) };
  const type = csharpConstructibleTypeFromObjectShapeFact(input, binding.shape, diagnostics, node);
  if (type === undefined) return reject("The bound record has no renderable C# target type.");
  const values: CsharpPlannedValue[] = [];
  const storages: import("../../target-ast/roslyn/index.js").CsharpTypeNode[] = [];
  for (const field of binding.fields) {
    const pointer = planExpression(field.expression, file, input, diagnostics);
    const storage = csharpTypeFromTargetTypeRef(objectShapeBoundStorageTargetType(field.member), input.scope.typeParameterNames);
    if (pointer === undefined || storage === undefined) return reject("The bound field has no renderable C# location storage.");
    values.push(pointer);
    storages.push(storage);
  }
  return { handled: true, expression: buildCsharpPlannedValue(node, file, input, diagnostics, values, pointers => {
  const assignments: CsharpObjectInitializerAssignment[] = binding.fields.map((field, index) => ({ kind: "AssignmentExpression", name: objectShapeBoundStorageMemberName(binding.shape, field.member), expression: {
      kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: storages[index]!, name: "FromLocation" },
      arguments: [{ kind: "Argument", expression: pointers[index]! }],
    } }));
  return { kind: "ObjectCreationExpression", type, assignments };
  }, binding.shape.targetType) };
}
