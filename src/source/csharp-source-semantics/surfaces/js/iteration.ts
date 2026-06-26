import {
  ExtensionObservationPoint,
  acceptObservation,
  deferObservation,
  rejectObservation,
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  CheckedIterationMappingRequest,
  CheckedOperationMappingResult,
  ExtensionObservation,
  ExtensionObservationContext,
  Node,
  SourceFile,
} from "@tsonic/tsts";
import {
  csharpTargetIterationFactKey,
} from "../../../csharp-facts.js";
import type {
  CsharpTargetIterationFact,
} from "../../../csharp-facts.js";
import type {
  CsharpJsSurfaceHost,
} from "./source-library.js";
import {
  csharpJsCheckedTypeQuery,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetMemberOperation,
  csharpTargetNamedType,
  targetOperation,
  csharpTargetOperationFromMember,
} from "./source-library.js";
import {
  getCsharpRecordDictionaryKeysTargetMembers as recordDictionaryKeyCollectionCandidates,
  isCsharpRecordDictionaryTargetType,
} from "../../dictionaries.js";
import {
  getCsharpArrayLengthMember,
} from "./array-carriers.js";
import {
  asNodeSubject,
  getNodeField,
  visitAstReaderNodes,
} from "../../ast-utils.js";
import {
  createCsharpLifecycleObservationContext,
} from "../../runtime-carriers.js";

export function recordCsharpJsSurfaceIterationFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  host: CsharpJsSurfaceHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const context = createCsharpLifecycleObservationContext(lifecycleContext, ExtensionObservationPoint.mapCheckedIteration);
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      recordCsharpJsSurfaceIterationFact(node, sourceFile, context, host);
    });
  }
}

function recordCsharpJsSurfaceIterationFact(
  node: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext<"operation.mapCheckedIteration">,
  host: CsharpJsSurfaceHost,
): void {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return;
  }
  const kind = compiler.ast.is.IsForInStatement(node)
    ? "for-in"
    : compiler.ast.is.IsForOfStatement(node)
      ? "for-of"
      : undefined;
  if (kind === undefined) {
    return;
  }
  const expression = asNodeSubject(getNodeField(node, "Expression"));
  if (expression === undefined) {
    return;
  }
  const sourceExpressionType = compiler.checker.getTypeAtLocation(expression, { sourceFile });
  const mapped = mapCsharpJsSurfaceCheckedIteration({
    statement: node,
    expression,
    ...(sourceExpressionType !== undefined ? { sourceExpressionType } : {}),
    kind,
    target: host.targetId,
  }, context, host);
  if (mapped.kind === "reject") {
    context.diagnostics.append(mapped.diagnostic);
  }
}

export function mapCsharpJsSurfaceCheckedIteration(
  request: CheckedIterationMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedIteration">,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> {
  if (request.target !== undefined && request.target !== host.targetId) {
    return deferObservation;
  }
  const seededExpressionCarrier = context.factResolver.resolve(request.expression, runtimeCarrierFactKey)?.carrier;
  const expressionType = seededExpressionCarrier ??
    host.getTargetTypeRefForSubject(request.expression, context, csharpJsCheckedTypeQuery) ??
    host.getTargetTypeRefForSubject(request.sourceExpressionType, context, csharpJsCheckedTypeQuery);
  if (request.kind === "for-of") {
    if (host.isCsharpStringType(expressionType)) {
      const fact = {
        operationId: "tsonic.csharp.js.string.codePoints",
        iterationKind: "sync",
        lowering: {
          kind: "string-code-point",
          lengthMember: "Length",
          substringMember: "Substring",
          highSurrogateOperation: csharpTargetMemberOperation("System.Char.IsHighSurrogate", "method", "IsHighSurrogate", {
            static: true,
            declaringType: csharpTargetNamedType("System.Char", undefined, { kind: "predefined", name: "char" }),
            resultType: csharpSourcePrimitiveTargetType("bool"),
          }),
          lowSurrogateOperation: csharpTargetMemberOperation("System.Char.IsLowSurrogate", "method", "IsLowSurrogate", {
            static: true,
            declaringType: csharpTargetNamedType("System.Char", undefined, { kind: "predefined", name: "char" }),
            resultType: csharpSourcePrimitiveTargetType("bool"),
          }),
        },
        elementType: csharpStringTargetType(),
      } satisfies CsharpTargetIterationFact;
      context.facts.set(request.statement, csharpTargetIterationFactKey, fact, [{ message: "C# JS surface string for-of maps to string code-point iteration." }]);
      return acceptObservation<CheckedOperationMappingResult>({
        operation: targetOperation(fact.operationId, "iteration", fact.lowering.kind),
      }, [{ message: "C# JS surface string iteration fact recorded after TSTS accepted for-of." }]);
    }
    return deferObservation;
  }
  if (request.kind === "for-in") {
    const objectShape = host.getCsharpObjectShapeFactForSubject(request.expression, context);
    if (objectShape !== undefined) {
      const fact = {
        operationId: "tsonic.csharp.js.objectShape.keys",
        iterationKind: "property-key",
        lowering: { kind: "object-shape-keys" },
        elementType: csharpStringTargetType(),
      } satisfies CsharpTargetIterationFact;
      context.facts.set(request.statement, csharpTargetIterationFactKey, fact, [{ message: "C# JS surface object-shape for-in maps to finalized object-shape key storage." }]);
      return acceptObservation<CheckedOperationMappingResult>({
        operation: targetOperation(fact.operationId, "iteration", fact.lowering.kind),
      }, [{ message: "C# JS surface object-shape key iteration fact recorded after TSTS accepted for-in." }]);
    }
    const arrayLengthMember = getCsharpArrayLengthMember(expressionType);
    if ((arrayLengthMember !== undefined && (seededExpressionCarrier !== undefined || expressionType?.kind !== "array")) || host.isCsharpStringType(expressionType)) {
      const fact = {
        operationId: "tsonic.csharp.js.indexable.keys",
        iterationKind: "property-key",
        lowering: {
          kind: "index-key",
          lengthMember: arrayLengthMember ?? "Length",
          keyConversion: "invariant-string",
        },
        elementType: csharpStringTargetType(),
      } satisfies CsharpTargetIterationFact;
      context.facts.set(request.statement, csharpTargetIterationFactKey, fact, [{ message: "C# JS surface indexable for-in maps to string index keys." }]);
      return acceptObservation<CheckedOperationMappingResult>({
        operation: targetOperation(fact.operationId, "iteration", fact.lowering.kind),
      }, [{ message: "C# JS surface index-key iteration fact recorded after TSTS accepted for-in." }]);
    }
    if (isCsharpRecordDictionaryTargetType(expressionType)) {
      const keyType = expressionType.typeArguments?.[0];
      if (!host.isCsharpStringType(keyType)) {
        return rejectObservation(host.csharpProviderDiagnostic(host.extensionId, "CSHARP_RECORD_DICTIONARY_FOR_IN_KEY_TYPE_UNSUPPORTED", 9100125, "C# Record dictionary for-in requires a string-keyed Dictionary carrier; non-string key enumeration needs an explicit JS-compatible key conversion fact."));
      }
      if (host.getCsharpTargetBindingByTargetId === undefined || host.getCsharpTargetBindingByMetadataName === undefined) {
        return rejectObservation(host.csharpProviderDiagnostic(host.extensionId, "CSHARP_RECORD_DICTIONARY_FOR_IN_PROVIDER_FACT_MISSING", 9100126, "C# Record dictionary for-in requires provider-owned Dictionary target binding facts before key enumeration emission."));
      }
      const candidates = recordDictionaryKeyCollectionCandidates(expressionType, {
        getCsharpTargetBindingByTargetId: host.getCsharpTargetBindingByTargetId,
        getCsharpTargetBindingByMetadataName: host.getCsharpTargetBindingByMetadataName,
      });
      const keysMember = host.selectTargetMember(candidates, { arguments: [] }, context);
      if (keysMember === undefined) {
        return rejectObservation(host.csharpProviderDiagnostic(host.extensionId, "CSHARP_RECORD_DICTIONARY_KEYS_NOT_MAPPED", 9100127, "C# Record dictionary for-in could not map checked TypeScript Record carrier to provider-owned Dictionary.Keys facts."));
      }
      const keysOperation = csharpTargetOperationFromMember(keysMember);
      const fact = {
        operationId: "tsonic.csharp.js.recordDictionary.keys",
        iterationKind: "property-key",
        lowering: {
          kind: "key-collection",
          keysMember: keysOperation,
        },
        elementType: keyType,
      } satisfies CsharpTargetIterationFact;
      context.facts.set(request.statement, csharpTargetIterationFactKey, fact, [{ message: "C# JS surface Record for-in maps to provider-owned Dictionary.Keys enumeration." }]);
      return acceptObservation<CheckedOperationMappingResult>({
        operation: targetOperation(fact.operationId, "iteration", fact.lowering.kind),
      }, [{ message: "C# JS surface Record key iteration fact recorded after TSTS accepted for-in." }]);
    }
  }
  return deferObservation;
}
