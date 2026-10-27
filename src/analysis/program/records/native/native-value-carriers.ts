import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpNativeValueCarriers, CsharpNativeValueDeclaration, CsharpObjectMethodSource, CsharpObjectMethodSourceCapture, CsharpObjectMethodSources } from "../../../../target-model/records/native/native-value-carriers.js";
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
    publish(literal: Node, identity: string, selected: ReadonlyMap<Node, readonly CsharpObjectMethodSourceCapture[]>): void {
      if (sealed || literals.has(literal)) failTargetAnalysisInvariant("tsonic-csharp", "Object method sources publish once before sealing.", literal);
      const captures = new WeakMap(selected);
      literals.set(literal, Object.freeze({ identity, captures: (method: Node) => captures.get(method) }));
    },
    seal(): CsharpObjectMethodSources {
      if (sealed) failTargetAnalysisInvariant("tsonic-csharp", "Object method sources seal once.");
      sealed = true;
      return Object.freeze({ get: (literal: Node) => literals.get(literal) });
    },
  });
}
