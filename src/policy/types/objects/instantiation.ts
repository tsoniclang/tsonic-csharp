import type { CsharpObjectShapeFact, TargetTypeRef } from "../../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { inferCsharpTargetTypeParameterBindings, substituteObjectShapeFactTargetTypeParameters } from "../resolution/substitution.js";
import { formCsharpObjectShapeHeader, requireCsharpObjectShapeHeader,
  type CsharpObjectShapeHeader } from "../../../target-model/types/object-shape-header.js";

export interface CsharpObjectShapeInstantiationHeader {
  readonly template: CsharpObjectShapeHeader;
  readonly target: TargetTypeRef;
  readonly bindings: ReadonlyMap<string, TargetTypeRef>;
  readonly header: CsharpObjectShapeHeader;
}

export function formCsharpObjectShapeInstantiationHeader(
  template: CsharpObjectShapeHeader,
  target: TargetTypeRef,
): CsharpObjectShapeInstantiationHeader | undefined {
  const contract = template.contract;
  if (contract.targetType.kind !== "target-named" || target.kind !== "target-named") return undefined;
  const parameters = new Set((contract.targetType.typeArguments ?? []).flatMap(argument =>
    argument.kind === "type-parameter" ? [argument.identity] : []));
  const bindings = inferCsharpTargetTypeParameterBindings(contract.targetType, target, parameters);
  const selected = bindings === undefined ? undefined : substituteObjectShapeFactTargetTypeParameters(contract, bindings);
  return selected === undefined || bindings === undefined || !targetTypeRefEquals(selected.targetType, target)
    ? undefined : Object.freeze({ template, target, bindings, header: formCsharpObjectShapeHeader(selected) });
}

export function completeCsharpObjectShapeInstantiation(
  input: CsharpObjectShapeInstantiationHeader,
  template: CsharpObjectShapeFact,
): CsharpObjectShapeFact {
  requireCsharpObjectShapeHeader(input.template, template);
  return Object.freeze({ ...template, ...input.header.contract,
    declarationTemplate: template.declarationTemplate ?? template,
    members: Object.freeze(input.header.contract.members.map((contract, index) =>
      Object.freeze({ ...template.members[index]!, ...contract }))),
  });
}

export function instantiateCsharpObjectShape(
  template: CsharpObjectShapeFact,
  target: TargetTypeRef,
): CsharpObjectShapeFact | undefined {
  const input = formCsharpObjectShapeInstantiationHeader(formCsharpObjectShapeHeader(template), target);
  return input === undefined ? undefined : completeCsharpObjectShapeInstantiation(input, template);
}
