import type { CsharpFinalStructuralInterfaceImplementation } from "../../target-model/records/heritage.js";
import type { CsharpProjectTypeIssue } from "../../target-model/records/project-types.js";
import type { CsharpStructuralInterfaceImplementation } from "../../target-model/types/model.js";
import { admitCsharpCallableValueAdapter, type CsharpCallableConversionPolicy } from "../callables/adapters.js";

export function finalizeCsharpStructuralInterfaceForwarding(
  policy: CsharpCallableConversionPolicy,
  selected: CsharpStructuralInterfaceImplementation,
  methods: CsharpFinalStructuralInterfaceImplementation["methods"],
): {
  readonly implementation: CsharpFinalStructuralInterfaceImplementation;
  readonly issues: readonly CsharpProjectTypeIssue[];
} {
  const properties: CsharpFinalStructuralInterfaceImplementation["properties"][number][] = [];
  const issues: CsharpProjectTypeIssue[] = [];
  for (const property of selected.properties) {
    const read = admitCsharpCallableValueAdapter(policy, property.sourceType, property.member.type);
    if (read === undefined) {
      issues.push(Object.freeze({ node: selected.sourceNode, code: "CSHARP_UNSUPPORTED_AST",
        message: "An analyzed interface property has no exact native forwarding conversion." }));
      continue;
    }
    properties.push(Object.freeze({ ...property, read }));
  }
  return Object.freeze({ implementation: Object.freeze({ ...selected, properties: Object.freeze(properties), methods }),
    issues: Object.freeze(issues) });
}
