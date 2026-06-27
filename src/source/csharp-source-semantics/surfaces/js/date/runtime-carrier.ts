import type {
  ExtensionFactSubject,
  ExtensionObservation,
  ExtensionObservationContext,
  RuntimeCarrierFactRequest,
  RuntimeCarrierFactResult,
  Node,
  SourceFile,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  acceptObservation,
  deferObservation,
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
  visitAstReaderNodes,
} from "../../../ast-utils.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "../../../runtime-carriers.js";
import {
  getSymbolDeclarations,
} from "../../../symbol-utils.js";
import {
  asType,
} from "../source-library.js";
import {
  getSourceLibraryDeclarationName,
} from "../../../source-library.js";
import {
  isSourceStandardLibraryDateType,
} from "../../../source-type-classification.js";
import {
  csharpJsDateTargetType,
} from "./target-type.js";

export function mapCsharpJsDateRuntimeCarrier(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
): ExtensionObservation<RuntimeCarrierFactResult> {
  const carrier = getCsharpJsDateRuntimeCarrierForType(asType(request.type), context);
  return carrier === undefined
    ? deferObservation
    : acceptObservation<RuntimeCarrierFactResult>({
        carrier,
      }, [{ message: "C# JS surface Date runtime carrier mapped from checked JavaScript library type." }]);
}

export function getCsharpJsDateRuntimeCarrierForType(
  type: Type | undefined,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  return type !== undefined && isSourceStandardLibraryDateType(type, context)
    ? csharpJsDateTargetType()
    : undefined;
}

export function recordCsharpJsDateRuntimeCarrierFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
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
      if (compiler.ast.is.IsTypeReferenceNode(node) && isCheckedSourceLibraryDateTypeReference(node, sourceFile, context)) {
        const typeName = asNodeSubject(getNodeField(node, "TypeName"));
        const type = compiler.checker.getTypeFromTypeNode(node, { sourceFile });
        recordDateRuntimeCarrierFacts(lifecycleContext, [
          node,
          typeName,
          typeName === undefined ? undefined : compiler.checker.getSymbolAtLocation(typeName, { sourceFile }),
          typeName === undefined ? undefined : compiler.checker.getResolvedSymbol(typeName, { sourceFile }),
          type,
          type?.symbol,
        ], "C# JS surface Date runtime carrier recorded from checked TypeScript Date type reference.");
        return;
      }
      if (compiler.ast.is.IsNewExpression(node) !== true || lifecycleContext.host.facts.get(node, runtimeCarrierFactKey) !== undefined) {
        return;
      }
      if (!isCheckedSourceLibraryDateConstruction(node, sourceFile, context)) {
        return;
      }
      lifecycleContext.host.facts.set(node, runtimeCarrierFactKey, {
        carrier: csharpJsDateTargetType(),
      }, [{ message: "C# JS surface Date constructor runtime carrier recorded from checked TypeScript Date construction." }]);
    });
  }
}

function isCheckedSourceLibraryDateTypeReference(
  node: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
): boolean {
  const type = context.compiler?.checker.getTypeFromTypeNode(node, { sourceFile });
  return type !== undefined && isSourceStandardLibraryDateType(type, context);
}

function recordDateRuntimeCarrierFacts(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"] },
  subjects: readonly (ExtensionFactSubject | undefined)[],
  message: string,
): void {
  const fact = {
    carrier: csharpJsDateTargetType(),
  };
  const evidence = [{ message }];
  for (const subject of subjects) {
    if (subject !== undefined && lifecycleContext.host.facts.get(subject, runtimeCarrierFactKey) === undefined) {
      lifecycleContext.host.facts.set(subject, runtimeCarrierFactKey, fact, evidence);
    }
  }
}

function isCheckedSourceLibraryDateConstruction(
  node: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
): boolean {
  const compiler = context.compiler;
  const expression = asNodeSubject(getNodeField(node, "Expression"));
  if (compiler === undefined || expression === undefined) {
    return false;
  }
  const symbol = compiler.checker.getSymbolAtLocation(expression, { sourceFile }) ??
    compiler.checker.getResolvedSymbol(expression, { sourceFile });
  return getSymbolDeclarations(symbol).some((declaration) =>
    getSourceLibraryDeclarationName(declaration, context) === "Date");
}
