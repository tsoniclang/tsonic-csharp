import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionLifecycleContext,
  ExtensionObservationContext,
  Node,
  SourceFile,
} from "@tsonic/tsts";
import {
  csharpObjectShapeFactKey,
} from "../../csharp-facts.js";
import type {
  CsharpObjectShapeFact,
} from "../../csharp-facts.js";
import {
  asNodeSubject,
  getNodeField,
  visitAstReaderNodes,
} from "../ast-utils.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
  getRuntimeCarrierSubjectType,
} from "../runtime-carriers.js";
import {
  getSymbolForDeclarationLookup,
} from "../symbol-utils.js";
import type {
  CsharpObjectShapeLifecycleHost,
} from "./types.js";

export function recordCsharpObjectRestBindingFactsBeforeFinalization(
  lifecycleContext: Pick<ExtensionLifecycleContext, "host" | "compiler">,
  host: CsharpObjectShapeLifecycleHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      if (!isObjectRestBindingElement(node, compiler.ast)) {
        return;
      }
      const restName = asNodeSubject(getNodeField(node, "name"));
      if (restName === undefined) {
        return;
      }
      const restShape = getObjectRestBindingShapeFromCheckedType(node, sourceFile, compiler, host, context);
      if (restShape === undefined || restShape.members.length === 0) {
        return;
      }
      recordCsharpObjectRestBindingFact(lifecycleContext, sourceFile, [node, restName], restShape);
    });
  }
}

function isObjectRestBindingElement(
  node: Node,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
): boolean {
  const parent = asNodeSubject(getNodeField(node, "Parent"));
  return ast.kindName(node) === "KindBindingElement" &&
    getNodeField(node, "DotDotDotToken") !== undefined &&
    ast.kindName(parent) === "KindObjectBindingPattern";
}

function getObjectRestBindingShapeFromCheckedType(
  restBindingElement: Node,
  sourceFile: SourceFile,
  compiler: NonNullable<ExtensionObservationContext["compiler"]>,
  host: CsharpObjectShapeLifecycleHost,
  context: ExtensionObservationContext,
): CsharpObjectShapeFact | undefined {
  const restType = compiler.checker.getTypeAtLocation(restBindingElement, { sourceFile });
  return host.getCsharpObjectShapeFactForSubject(restType, context);
}

function recordCsharpObjectRestBindingFact(
  lifecycleContext: Pick<ExtensionLifecycleContext, "host" | "compiler">,
  sourceFile: SourceFile,
  subjects: readonly Node[],
  restShape: CsharpObjectShapeFact,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const runtimeCarrier = { carrier: restShape.targetType };
  const evidence = [{ message: "C# object rest binding shape recorded from the TSTS-checked rest binding type." }];
  for (const subject of subjects) {
    lifecycleContext.host.facts.set(subject, csharpObjectShapeFactKey, restShape, evidence);
    lifecycleContext.host.facts.set(subject, runtimeCarrierFactKey, runtimeCarrier, evidence);
    const symbol = getSymbolForDeclarationLookup(compiler.ast, compiler.checker, subject, sourceFile);
    if (symbol !== undefined) {
      lifecycleContext.host.facts.set(symbol, csharpObjectShapeFactKey, restShape, evidence);
      lifecycleContext.host.facts.set(symbol, runtimeCarrierFactKey, runtimeCarrier, evidence);
    }
    const type = getRuntimeCarrierSubjectType(compiler, sourceFile, subject);
    if (type !== undefined) {
      lifecycleContext.host.facts.set(type, csharpObjectShapeFactKey, restShape, evidence);
      lifecycleContext.host.facts.set(type, runtimeCarrierFactKey, runtimeCarrier, evidence);
      const typeSymbol = compiler.checker.getTypeSymbol(type);
      if (typeSymbol !== undefined) {
        lifecycleContext.host.facts.set(typeSymbol, csharpObjectShapeFactKey, restShape, evidence);
        lifecycleContext.host.facts.set(typeSymbol, runtimeCarrierFactKey, runtimeCarrier, evidence);
      }
    }
  }
}
