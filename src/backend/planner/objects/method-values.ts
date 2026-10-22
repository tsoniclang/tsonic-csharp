import type { CsharpPlanningContext } from "../context.js";
import type { CsharpObjectShapeFact } from "../../../target-model/types/model.js";
import type { CsharpTypeMember } from "../../target-ast/syntax/index.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function renderCsharpMethodValueContracts(
  shape: CsharpObjectShapeFact,
  input: CsharpPlanningContext,
): readonly CsharpTypeMember[] {
  const selected = input.program.records.structuralObject.get(shape);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted object requires its sealed method-value contract inventory.", shape.methodImplementation?.declaration);
  return selected.contracts.map(contract => {
    const explicitInterface = csharpTypeFromTargetTypeRef(contract.interface, input.scope.typeParameterNames);
    const type = csharpTypeFromTargetTypeRef(contract.type, input.scope.typeParameterNames);
    if (explicitInterface === undefined || type === undefined) failCsharpPlannerInvariant(
      "An admitted method-value contract requires its renderable interface and value carriers.", shape.methodImplementation?.declaration);
    return { kind: "PropertyDeclaration", name: contract.name, explicitInterface, modifiers: [], type,
      getter: { kind: "Block", statements: [{ kind: "ReturnStatement", expression: { kind: "IdentifierName", name: contract.source } }] } };
  });
}
