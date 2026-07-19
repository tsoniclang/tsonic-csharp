import type {
  ExtensionEvidence,
  Node,
  SourceFile,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  recordCsharpPropagatedRuntimeCarrierFact,
  csharpObjectShapeFactKey,
} from "../../csharp-facts.js";
import type {
  CsharpObjectShapeFact,
} from "../../csharp-facts.js";
import {
  asNodeSubject,
  getNodeField,
} from "../ast-utils.js";
import type {
  SourceDeclarationLifecycleContext,
} from "./context.js";
import {
  isSourceDeclaredStructTargetType,
} from "./target-type.js";

export function recordSourceDeclarationTarget(
  lifecycleContext: SourceDeclarationLifecycleContext,
  sourceFile: SourceFile,
  declaration: Node,
  targetType: TargetTypeRef,
  objectShape?: CsharpObjectShapeFact,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const fact = { carrier: targetType };
  const evidence: readonly ExtensionEvidence[] = [{ message: "C# source declaration runtime carrier recorded from TSTS source declaration identity." }];
  recordCsharpPropagatedRuntimeCarrierFact(lifecycleContext.host.facts, declaration, fact, evidence);
  if (objectShape !== undefined) {
    lifecycleContext.host.facts.set(declaration, csharpObjectShapeFactKey, objectShape, evidence);
  }
  const name = asNodeSubject(getNodeField(declaration, "name"));
  if (name !== undefined) {
    recordCsharpPropagatedRuntimeCarrierFact(lifecycleContext.host.facts, name, fact, evidence);
    if (objectShape !== undefined) {
      lifecycleContext.host.facts.set(name, csharpObjectShapeFactKey, objectShape, evidence);
    }
    const symbol = compiler.checker.getSymbolAtLocation(name, { sourceFile }) ??
      compiler.checker.getResolvedSymbol(name, { sourceFile });
    if (symbol !== undefined) {
      recordCsharpPropagatedRuntimeCarrierFact(lifecycleContext.host.facts, symbol, fact, evidence);
      if (objectShape !== undefined) {
        lifecycleContext.host.facts.set(symbol, csharpObjectShapeFactKey, objectShape, evidence);
      }
    }
    const type = isSourceDeclaredStructTargetType(targetType) ? undefined : compiler.checker.getTypeAtLocation(name, { sourceFile });
    if (type !== undefined) {
      recordCsharpPropagatedRuntimeCarrierFact(lifecycleContext.host.facts, type, fact, evidence);
      if (objectShape !== undefined) {
        lifecycleContext.host.facts.set(type, csharpObjectShapeFactKey, objectShape, evidence);
      }
      const typeSymbol = compiler.checker.getTypeSymbol(type);
      if (typeSymbol !== undefined) {
        recordCsharpPropagatedRuntimeCarrierFact(lifecycleContext.host.facts, typeSymbol, fact, evidence);
        if (objectShape !== undefined) {
          lifecycleContext.host.facts.set(typeSymbol, csharpObjectShapeFactKey, objectShape, evidence);
        }
      }
    }
  }
}
