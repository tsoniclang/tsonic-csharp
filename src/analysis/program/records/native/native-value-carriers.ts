import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpNativeValueCarriers, CsharpNativeValueDeclaration, CsharpObjectMethodSource, CsharpObjectMethodSourceCapture,
  CsharpObjectMethodSources, CsharpDeclaredObjectReceiverSource } from "../../../../target-model/records/native/native-value-carriers.js";
import type { CsharpProjectTypeIssue } from "../../../../target-model/records/types/project-types.js";

export function createCsharpNativeValueProducer() {
  const declarations = new WeakMap<Node, CsharpNativeValueDeclaration>();
  let sealed = false;
  return Object.freeze({
    publish(node: Node, value: CsharpNativeValueDeclaration): void {
      if (sealed || declarations.has(node)) failTargetAnalysisInvariant("tsonic-csharp", "A native value declaration publishes once before sealing.", node);
      declarations.set(node, Object.freeze(value));
    },
    seal(issues: readonly CsharpProjectTypeIssue[]): CsharpNativeValueCarriers {
      if (sealed) failTargetAnalysisInvariant("tsonic-csharp", "Native value declarations seal once.");
      sealed = true;
      return Object.freeze({ issues: Object.freeze([...issues]),
        nativeValueDeclaration: Object.freeze({ get: (node: Node) => declarations.get(node) }),
      });
    },
  });
}

export function createCsharpObjectMethodSourceProducer() {
  const literals = new WeakMap<Node, CsharpObjectMethodSource>();
  let sealed = false;
  return Object.freeze({
    publish(input: {
      readonly literal: Node;
      readonly identity: string;
      readonly selected: ReadonlyMap<Node, readonly CsharpObjectMethodSourceCapture[]>;
      readonly declaredReceiver: CsharpDeclaredObjectReceiverSource | undefined;
    }): void {
      if (input.literal === undefined || input.identity === undefined || input.selected === undefined ||
        !("declaredReceiver" in input)) return failTargetAnalysisInvariant("tsonic-csharp",
        "Object method publication requires its original occurrence, captures and declared receiver input.");
      const { literal, identity, selected, declaredReceiver } = input;
      if (sealed || literals.has(literal)) failTargetAnalysisInvariant("tsonic-csharp", "Object method sources publish once before sealing.", literal);
      const methods = [...selected.keys()];
      if (declaredReceiver !== undefined && (declaredReceiver.self.declaration !== literal ||
        declaredReceiver.self.identity !== identity || declaredReceiver.methods.length !== selected.size ||
        declaredReceiver.methods.some((method, index) => methods[index] !== method))) {
        return failTargetAnalysisInvariant("tsonic-csharp",
          "A declared receiver requires its identical object occurrence and ordered authored methods.", literal);
      }
      const captures = new WeakMap(selected);
      literals.set(literal, Object.freeze({ identity, declaredReceiver, captures: (method: Node) => captures.get(method) }));
    },
    seal(): CsharpObjectMethodSources {
      if (sealed) failTargetAnalysisInvariant("tsonic-csharp", "Object method sources seal once.");
      sealed = true;
      return Object.freeze({ get: (literal: Node) => literals.get(literal) });
    },
  });
}
