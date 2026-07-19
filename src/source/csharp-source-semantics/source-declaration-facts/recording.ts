import type {
  ExtensionEvidence,
  Node,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  recordCsharpRuntimeCarrierFact,
  csharpObjectShapeFactKey,
} from "../../csharp-facts.js";
import type {
  CsharpObjectShapeFact,
} from "../../csharp-facts.js";
import {
  SourceDeclarationLifecycleContext,
} from "./context.js";

export function recordSourceDeclarationTarget(
  lifecycleContext: SourceDeclarationLifecycleContext,
  declaration: Node,
  targetType: TargetTypeRef,
  objectShape?: CsharpObjectShapeFact,
): void {
  const ast = lifecycleContext.compiler?.ast;
  if (ast === undefined) {
    return;
  }
  const fact = { carrier: targetType };
  const evidence: readonly ExtensionEvidence[] = [{ message: "C# source declaration runtime carrier recorded from TSTS source declaration identity." }];
  recordCsharpRuntimeCarrierFact(lifecycleContext.host.facts, declaration, fact, evidence);
  if (objectShape !== undefined) {
    lifecycleContext.host.facts.set(declaration, csharpObjectShapeFactKey, objectShape, evidence);
  }
  const name = ast.name(declaration);
  if (name !== undefined) {
    recordCsharpRuntimeCarrierFact(lifecycleContext.host.facts, name, fact, evidence);
    if (objectShape !== undefined) {
      lifecycleContext.host.facts.set(name, csharpObjectShapeFactKey, objectShape, evidence);
    }
  }
}
