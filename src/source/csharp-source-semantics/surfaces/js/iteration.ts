import {
  ExtensionObservationPoint,
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
} from "@tsonic/tsts";
import type {
  CsharpJsSurfaceHost,
} from "./source-library.js";
import {
  csharpJsCheckedTypeQuery,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetMemberOperation,
  csharpTargetNamedType,
  csharpTargetOperationFromMember,
} from "./source-library.js";
import {
  csharpRecordDictionaryKeysMemberCandidates as recordDictionaryKeyCollectionCandidates,
  isCsharpRecordDictionaryTargetType,
} from "../../dictionaries.js";
import {
  getCsharpArrayLengthMember,
} from "./array-carriers.js";
import {
  asNodeSubject,
  getNodeField,
  isCsharpUserSourceFile,
  visitAstReaderNodes,
} from "../../ast-utils.js";
import {
  createCsharpLifecycleObservationContext,
} from "../../runtime-carriers.js";
import {
  getReferencedDeclarationTargetTypeRef,
} from "../../referenced-declaration-target.js";
import {
  mapCsharpIterationOperationRows,
} from "../../operation-selection/iteration.js";
import type {
  CsharpIterationOperationRow,
} from "../../operation-selection/iteration.js";

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
    if (!isCsharpUserSourceFile(sourceFile, compiler.ast)) {
      continue;
    }
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      recordCsharpJsSurfaceIterationFact(node, context, host);
    });
  }
}

function recordCsharpJsSurfaceIterationFact(
  node: Node,
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
  const mapped = mapCsharpJsSurfaceCheckedIteration({
    statement: node,
    expression,
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
  const expressionNode = asNodeSubject(request.expression);
  const sourceFile = expressionNode === undefined ? undefined : context.compiler?.ast.getSourceFile(expressionNode);
  const sourceExpressionType = expressionNode === undefined || context.compiler === undefined
    ? undefined
    : context.compiler.checker.getTypeAtLocation(expressionNode, { sourceFile });
  const expressionType = seededExpressionCarrier ??
    host.getTargetTypeRefForSubject(request.expression, context, {
      ...csharpJsCheckedTypeQuery,
      allowSemanticTypeQuery: false,
      sourceFile,
    }) ??
    getReferencedDeclarationTargetTypeRef(request.expression, context, host.getTargetTypeRefForSubject, {
      ...csharpJsCheckedTypeQuery,
      sourceFile,
    }) ??
    host.getTargetTypeRefForSubject(sourceExpressionType, context, csharpJsCheckedTypeQuery);
  const rows: CsharpIterationOperationRow[] = [];
  if (host.isCsharpStringType(expressionType)) {
    rows.push(createStringCodePointIterationRow());
  }
  if (request.kind === "for-in") {
    const objectShape = host.getCsharpObjectShapeFactForSubject(request.expression, context);
    if (objectShape !== undefined) {
      rows.push(createObjectShapeKeyIterationRow());
    }
    const arrayLengthMember = getCsharpArrayLengthMember(expressionType);
    if ((arrayLengthMember !== undefined && (seededExpressionCarrier !== undefined || expressionType?.kind !== "array")) || host.isCsharpStringType(expressionType)) {
      rows.push(createIndexKeyIterationRow(arrayLengthMember ?? "Length"));
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
      rows.push(createKeyCollectionIterationRow(csharpTargetOperationFromMember(keysMember), keyType));
    }
  }
  return mapCsharpIterationOperationRows(request, context, host.extensionId, rows);
}

function createStringCodePointIterationRow(): CsharpIterationOperationRow {
  return {
    sourceIterationKind: "for-of",
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
    evidence: [{ message: "C# JS surface metadata selected string code-point iteration after TSTS accepted for-of." }],
  };
}

function createObjectShapeKeyIterationRow(): CsharpIterationOperationRow {
  return {
    sourceIterationKind: "for-in",
    operationId: "tsonic.csharp.js.objectShape.keys",
    iterationKind: "property-key",
    lowering: { kind: "object-shape-keys" },
    elementType: csharpStringTargetType(),
    evidence: [{ message: "C# JS surface metadata selected object-shape key iteration after TSTS accepted for-in." }],
  };
}

function createIndexKeyIterationRow(lengthMember: string): CsharpIterationOperationRow {
  return {
    sourceIterationKind: "for-in",
    operationId: "tsonic.csharp.js.indexable.keys",
    iterationKind: "property-key",
    lowering: {
      kind: "index-key",
      lengthMember,
      keyConversion: "invariant-string",
    },
    elementType: csharpStringTargetType(),
    evidence: [{ message: "C# JS surface metadata selected index-key iteration after TSTS accepted for-in." }],
  };
}

function createKeyCollectionIterationRow(
  keysMember: ReturnType<typeof csharpTargetOperationFromMember>,
  keyType: CsharpIterationOperationRow["elementType"],
): CsharpIterationOperationRow {
  return {
    sourceIterationKind: "for-in",
    operationId: "tsonic.csharp.js.recordDictionary.keys",
    iterationKind: "property-key",
    lowering: {
      kind: "key-collection",
      keysMember,
    },
    ...(keyType !== undefined ? { elementType: keyType } : {}),
    evidence: [{ message: "C# JS surface metadata selected provider key-collection iteration after TSTS accepted for-in." }],
  };
}
