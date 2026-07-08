import type {
  CheckedElementAccessMappingRequest,
  CheckedOperationMappingResult,
  ExtensionObservation,
  ExtensionObservationContext,
  Node,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  acceptObservation,
  runtimeCarrierFactKey,
  targetOperationFactKey,
} from "@tsonic/tsts";
import {
  mapCsharpJsArrayElementAccess,
} from "./arrays.js";
import type {
  CsharpJsSurfaceHost,
} from "./source-library.js";
import {
  mapCsharpJsStringElementAccess,
} from "./strings.js";
import {
  mapCsharpJsRecordDictionaryElementAccess,
} from "./dictionaries.js";
import {
  getCsharpArrayBoundaryCoreCarrierForReference,
} from "./array-boundary-facts.js";
import {
  targetOperation,
} from "./source-library.js";
import {
  asNodeSubject,
  getNodeField,
  isCsharpUserSourceFile,
  visitAstReaderNodes,
} from "../../ast-utils.js";
import {
  csharpTargetOperationFactKey,
} from "../../../csharp-facts.js";
import {
  csharpTargetId,
} from "../../identity.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "../../runtime-carriers.js";
import {
  getSelectedSourceLibraryDeclarationName,
} from "../../source-library.js";

export function mapCsharpSourceLibraryCheckedElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const sourceContainer = getSelectedSourceLibraryDeclarationName(request.sourceSelectedDeclaration, request.sourceSelectedSymbol, context);
  if (sourceContainer === "Array" || sourceContainer === "ReadonlyArray") {
    const receiverCarrier = getFinalizedReceiverCarrier(request, context, host);
    if (receiverCarrier !== undefined) {
      return mapCsharpJsArrayElementAccess(request, context, receiverCarrier, undefined, host);
    }
    return acceptObservation<CheckedOperationMappingResult>({
      operation: targetOperation("tsonic.csharp.js.array.indexer", "indexer", "System.Array.Item"),
    }, [{ message: "C# JS surface array indexer accepted from TSTS-selected source-profile element access; concrete C# operation finalization requires later receiver carrier facts." }]);
  }
  if (sourceContainer === "String") {
    const receiverCarrier = getFinalizedReceiverCarrier(request, context, host);
    if (receiverCarrier !== undefined) {
      return mapCsharpJsStringElementAccess(request, context, receiverCarrier, host);
    }
    return acceptObservation<CheckedOperationMappingResult>({
      operation: targetOperation("tsonic.csharp.js.string.codeUnit", "indexer", "String.Substring"),
    }, [{ message: "C# JS surface string indexer accepted from TSTS-selected source-profile element access; concrete C# operation finalization requires later receiver carrier facts." }]);
  }
  if (sourceContainer === "Record") {
    const receiverCarrier = getFinalizedReceiverCarrier(request, context, host);
    if (receiverCarrier !== undefined) {
      return mapCsharpJsRecordDictionaryElementAccess(request, context, receiverCarrier, host);
    }
    return acceptObservation<CheckedOperationMappingResult>({
      operation: targetOperation("tsonic.csharp.js.Record.indexer", "indexer", "Record.Dictionary.Item"),
    }, [{ message: "C# JS surface Record indexer accepted from TSTS-selected source-profile element access; concrete C# operation finalization requires later Record dictionary carrier facts." }]);
  }
  return undefined;
}

export function recordCsharpSourceLibraryElementAccessFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  host: CsharpJsSurfaceHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  for (const sourceFile of compiler.getSourceFiles()) {
    if (!isCsharpUserSourceFile(sourceFile, compiler.ast)) {
      continue;
    }
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      if (!compiler.ast.is.IsElementAccessExpression(node)) {
        return;
      }
      recordCsharpSourceLibraryElementAccessFact(node, context, host);
    });
  }
}

function recordCsharpSourceLibraryElementAccessFact(
  node: Node,
  context: ExtensionObservationContext,
  host: CsharpJsSurfaceHost,
): void {
  if (
    context.facts.get(node, csharpTargetOperationFactKey) !== undefined ||
    context.factResolver.resolve(node, csharpTargetOperationFactKey) !== undefined
  ) {
    return;
  }
  const selectedOperation = context.facts.get(node, targetOperationFactKey) ??
    context.factResolver.resolve(node, targetOperationFactKey);
  const selectedDeclaration = selectedOperation?.provenance?.sourceSelectedDeclaration;
  const selectedSymbol = selectedOperation?.provenance?.sourceSelectedSymbol;
  if (selectedDeclaration === undefined && selectedSymbol === undefined) {
    return;
  }
  const receiver = asNodeSubject(getNodeField(node, "Expression"));
  const argument = asNodeSubject(getNodeField(node, "ArgumentExpression"));
  if (receiver === undefined || argument === undefined) {
    return;
  }
  const mapped = mapCsharpSourceLibraryCheckedElementAccess({
    expression: node,
    receiver,
    argument,
    target: csharpTargetId,
    ...(selectedDeclaration !== undefined ? { sourceSelectedDeclaration: selectedDeclaration } : {}),
    ...(selectedSymbol !== undefined ? { sourceSelectedSymbol: selectedSymbol } : {}),
  }, context as ExtensionObservationContext<"operation.mapCheckedElementAccess">, host);
  if (mapped?.kind === "reject") {
    context.diagnostics.append(mapped.diagnostic);
  }
}

function getFinalizedReceiverCarrier(
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
  host: CsharpJsSurfaceHost,
): TargetTypeRef | undefined {
  return host.unwrapNullableTargetType(
    getCsharpArrayBoundaryCoreCarrierForReference(request.receiver, context) ??
      context.factResolver.resolve(request.receiver, runtimeCarrierFactKey)?.carrier ??
      host.getTargetTypeRefForSubject(request.receiver, context, {
        allowRuntimeCarrier: true,
        allowSemanticTypeQuery: false,
      }),
  );
}
