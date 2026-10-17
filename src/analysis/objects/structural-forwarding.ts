import type { CsharpFinalStructuralInterfaceImplementation } from "../../target-model/records/heritage.js";
import type { CsharpProjectTypeIssue } from "../../target-model/records/project-types.js";
import type { CsharpStructuralInterfaceImplementation } from "../../target-model/types/model.js";
import { admitCsharpCallableValueAdapter, type CsharpCallableConversionPolicy } from "../callables/adapters.js";
import { csharpTargetTypeRenderingRejection } from "../../policy/types/model/renderability.js";

export function finalizeCsharpStructuralInterfaceForwarding(
  policy: CsharpCallableConversionPolicy,
  selected: CsharpStructuralInterfaceImplementation,
  methods: CsharpFinalStructuralInterfaceImplementation["methods"],
): {
  readonly implementation: CsharpFinalStructuralInterfaceImplementation;
  readonly issues: readonly CsharpProjectTypeIssue[];
} {
  const properties: CsharpFinalStructuralInterfaceImplementation["properties"][number][] = [];
  const admittedMethods: CsharpFinalStructuralInterfaceImplementation["methods"][number][] = [];
  const issues: CsharpProjectTypeIssue[] = [];
  for (const property of selected.properties) {
    if (csharpTargetTypeRenderingRejection(selected.interfaceType) !== undefined ||
      csharpTargetTypeRenderingRejection(property.sourceType) !== undefined ||
      csharpTargetTypeRenderingRejection(property.member.type) !== undefined) {
      issues.push(Object.freeze({ node: selected.sourceNode, code: "CSHARP_UNSUPPORTED_AST",
        message: "An analyzed interface property has no exact native forwarding type." }));
      continue;
    }
    const read = admitCsharpCallableValueAdapter(policy, property.sourceType, property.member.type);
    if (read === undefined) {
      issues.push(Object.freeze({ node: selected.sourceNode, code: "CSHARP_UNSUPPORTED_AST",
        message: "An analyzed interface property has no exact native forwarding conversion." }));
      continue;
    }
    properties.push(Object.freeze({ ...property, read }));
  }
  for (const method of methods) {
    const forwarding = method.forwarding;
    const types = [selected.interfaceType, forwarding.contract.returnType, forwarding.implementation.returnType,
      forwarding.result.source, forwarding.result.target,
      ...forwarding.contract.parameters.map(parameter => parameter.targetParameter.type),
      ...forwarding.implementation.parameters.map(parameter => parameter.targetParameter.type),
      ...forwarding.typeArguments, ...forwarding.typeParameters,
      ...forwarding.parameters.flatMap(adapter => adapter.kind === "omitted" ? []
        : adapter.kind === "rest" ? [adapter.target, ...adapter.segments.flatMap(segment =>
          [segment.adapter.source, segment.adapter.target])]
          : [adapter.adapter.source, adapter.adapter.target])];
    if (types.some(type => csharpTargetTypeRenderingRejection(type) !== undefined)) {
      issues.push(Object.freeze({ node: method.declaration, code: "CSHARP_UNSUPPORTED_AST",
        message: "An analyzed interface method has no exact native forwarding signature." }));
      continue;
    }
    admittedMethods.push(method);
  }
  return Object.freeze({ implementation: Object.freeze({ ...selected, properties: Object.freeze(properties), methods: Object.freeze(admittedMethods) }),
    issues: Object.freeze(issues) });
}
