import type {
  ExtensionEvidence,
  Node,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpObjectShapeFactKey,
  csharpSourceDeclarationTargetFactKey,
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
  const fact = { targetType };
  const evidence: readonly ExtensionEvidence[] = [{ message: "C# source declaration target template recorded from TSTS source declaration identity." }];
  lifecycleContext.host.facts.set(declaration, csharpSourceDeclarationTargetFactKey, fact, evidence);
  if (objectShape !== undefined) {
    lifecycleContext.host.facts.set(declaration, csharpObjectShapeFactKey, objectShape, evidence);
  }
  const name = ast.name(declaration);
  if (name !== undefined) {
    lifecycleContext.host.facts.set(name, csharpSourceDeclarationTargetFactKey, fact, evidence);
    if (objectShape !== undefined) {
      lifecycleContext.host.facts.set(name, csharpObjectShapeFactKey, objectShape, evidence);
    }
  }
}
