import type { Node } from "@tsonic/tsts";
import type { CsharpPlanningContext } from "../context.js";
import type { CsharpConstructorDeclaration } from "../../target-ast/syntax/index.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { csharpSafetyModifiersForDeclaration } from "../safety/explicit-safety.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function planImplicitForwardingConstructors(declaration: Node, className: string,
  input: CsharpPlanningContext): readonly CsharpConstructorDeclaration[] {
  const selected = input.program.records.nativeClass.get(declaration);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted class requires its finalized native constructor inventory.", declaration);
  const safety = csharpSafetyModifiersForDeclaration(declaration, "constructor", input);
  return selected.forwardingConstructors.map(constructor => {
    const parameters = constructor.parameters.map(parameter => {
      const type = csharpTypeFromTargetTypeRef(parameter.carrier, input.scope.typeParameterNames);
      if (type === undefined) failCsharpPlannerInvariant("An admitted implicit constructor requires its rendered native parameter type.", constructor.subject);
      return { name: parameter.name, type, ...(parameter.passing === undefined ? {} : { passing: parameter.passing }),
        ...(parameter.paramsArray ? { isParams: true } : {}) };
    });
    return { kind: "ConstructorDeclaration", name: className, modifiers: ["public", ...safety], parameters,
      initializer: { kind: "base", arguments: constructor.parameters.map(parameter => ({ kind: "Argument",
        expression: { kind: "IdentifierName", name: parameter.name }, ...(parameter.passing === undefined ? {} : { passing: parameter.passing }) })) },
      body: { kind: "Block", statements: [] } };
  });
}
