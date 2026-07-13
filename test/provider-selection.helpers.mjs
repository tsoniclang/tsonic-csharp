import { test } from "node:test";
import assert from "node:assert/strict";
import {
  argumentPassingFactKey,
  attributeFactKey,
  defaultValueFactKey,
  deferObservation,
  fieldFactKey,
  flowStateFactKey,
  functionPointerFactKey,
  pointerFactKey,
  providerVirtualDeclarationFactKey,
  selectedTargetSignatureFactKey,
  sourcePrimitiveFactKey,
  structFactKey,
  targetBindingFactKey,
} from "@tsonic/tsts";
import { csharpTargetOperationFactKey } from "../dist/source/csharp-facts.js";
import { createCsharpNativeOperationsProvider } from "../dist/source/csharp-source-semantics/operations-provider.js";
import { selectTargetMember } from "../dist/source/csharp-source-semantics/target-member-selection.js";
import { validateCsharpTargetConstraintFactsBeforeFinalization } from "../dist/source/csharp-source-semantics/target-constraint-validation.js";
import {
  csharpNullableValueTargetType,
  csharpSourcePrimitiveDotnetMetadataName,
} from "../dist/source/csharp-source-semantics/target-types.js";
import { resolveTargetTypeRefFromSubjectFacts } from "../dist/source/csharp-source-semantics/target-type-subject-facts.js";
export { test, assert, argumentPassingFactKey, attributeFactKey, defaultValueFactKey, deferObservation, fieldFactKey, flowStateFactKey, functionPointerFactKey, pointerFactKey, providerVirtualDeclarationFactKey, selectedTargetSignatureFactKey, sourcePrimitiveFactKey, structFactKey, targetBindingFactKey, csharpTargetOperationFactKey, createCsharpNativeOperationsProvider, selectTargetMember, validateCsharpTargetConstraintFactsBeforeFinalization, csharpNullableValueTargetType, csharpSourcePrimitiveDotnetMetadataName, resolveTargetTypeRefFromSubjectFacts };




























































































export function getNativeSemanticProvider(options = {}) {
  const bindings = new Map((options.bindings ?? []).map((binding) => [binding.id, binding]));
  const metadataBindings = new Map(options.metadataBindings ?? []);
  const baseTypes = new Map(options.baseTypes ?? []);
  const assignableTypes = new Map(options.assignableTypes ?? []);
  const resolveSubjectFactTarget = (subject, context, resolutionOptions = {}) =>
    resolveTargetTypeRefFromSubjectFacts(subject, context, resolutionOptions, resolveSubjectFactTarget);
  return createCsharpNativeOperationsProvider({
    getCsharpTargetBindingByTargetId: (targetId) => bindings.get(targetId),
    getCsharpTargetBindingByMetadataName: (metadataName) => metadataBindings.get(metadataName),
    getTargetTypeRefForSubject(subject, context) {
      const mappedTargetType = options.targetTypesBySubject?.get(subject);
      if (mappedTargetType !== undefined) {
        return mappedTargetType;
      }
      if (subject !== undefined && typeof subject === "object" && typeof subject.kind === "string") {
        return subject;
      }
      return resolveSubjectFactTarget(subject, context);
    },
    getBaseTargetTypeRef(type) {
      return type.kind === "target-named" ? baseTypes.get(type.id) : undefined;
    },
    getAssignableTargetTypeRefs(type) {
      return type.kind === "target-named" ? assignableTypes.get(type.id) ?? [] : [];
    },
    getCsharpObjectShapeFactForSubject: (subject) => options.objectShapesBySubject?.get(subject),
    mapRuntimeCarrier() {
      return deferObservation;
    },
  });
}

export function method(id, parameterType, options = {}) {
  return {
    id,
    sourceName: options.sourceName ?? "m",
    targetName: options.targetName ?? "M",
    kind: "method",
    ...(options.static === true ? { static: true } : {}),
    parameters: [{
      name: "value",
      type: parameterType,
      passingMode: "by-value",
    }],
    returnType: csharpVoidType(),
    overloadGroup: options.overloadGroup ?? "Example.Target.m",
    ...(options.providerSourceSignatureId === undefined ? {} : { providerSourceSignatureId: options.providerSourceSignatureId }),
  };
}

export function property(id, sourceName, targetName) {
  return {
    id,
    sourceName,
    targetName,
    kind: "property",
    parameters: [],
    returnType: { kind: "source-primitive", name: "int32" },
  };
}

export function field(id, sourceName, targetName) {
  return {
    id,
    sourceName,
    targetName,
    kind: "field",
    parameters: [],
    returnType: { kind: "source-primitive", name: "int32" },
  };
}

export function eventMember(id, sourceName, targetName) {
  return {
    id,
    sourceName,
    targetName,
    kind: "event",
    parameters: [],
    returnType: csharpVoidType(),
  };
}

export function constructorMember(id, parameterType) {
  return {
    id,
    sourceName: "constructor",
    targetName: ".ctor",
    kind: "constructor",
    parameters: [{
      name: "value",
      type: parameterType,
      passingMode: "by-value",
    }],
    overloadGroup: "Example.Target..ctor",
  };
}

export function targetParameterWithOptions(name, type, options = {}) {
  return {
    name,
    type,
    passingMode: options.passingMode ?? "by-value",
    ...(options.optional === true ? { optional: true } : {}),
    ...(options.paramsArray === true ? { paramsArray: true } : {}),
  };
}

export function unsupportedMember(memberKind, targetId, sourceName, targetName, reason, options = {}) {
  return {
    kind: "unsupported-member",
    memberKind,
    sourceName,
    targetName,
    targetId,
    metadataName: options.metadataName ?? targetId,
    reason,
  };
}

export function assertUnsupportedDiagnosticEvidence(diagnostic, targetId, memberKind) {
  assert.ok(diagnostic.evidence?.some((entry) =>
    entry.message.includes("unsupported target member") &&
    entry.details?.targetId === targetId &&
    entry.details?.memberKind === memberKind &&
    typeof entry.details.reason === "string"
  ), JSON.stringify(diagnostic.evidence));
}

export function indexer(id, parameterType, options = {}) {
  return {
    id,
    sourceName: options.sourceName ?? "Item",
    targetName: options.targetName ?? "Item",
    kind: "indexer",
    parameters: [{
      name: "index",
      type: parameterType,
      passingMode: "by-value",
    }],
    returnType: csharpStringType(),
    overloadGroup: options.overloadGroup ?? "Example.Target.Item",
  };
}

export function csharpStringType() {
  return {
    kind: "target-named",
    id: "System.String",
    csharpRender: { kind: "predefined", name: "string" },
    csharpSpecialType: "string",
  };
}

export function csharpObjectType() {
  return {
    kind: "target-named",
    id: "System.Object",
    csharpRender: { kind: "predefined", name: "object" },
  };
}

export function csharpVoidType() {
  return {
    kind: "target-named",
    id: "System.Void",
    csharpRender: { kind: "predefined", name: "void" },
    csharpSpecialType: "void",
  };
}

export function csharpReadOnlySpanType(element) {
  return {
    kind: "target-named",
    id: "System.ReadOnlySpan`1",
    typeArguments: [element],
    csharpRender: { kind: "named", namespace: ["System"], name: "ReadOnlySpan" },
  };
}

export function csharpIEnumerableType(element) {
  return {
    kind: "target-named",
    id: "System.Collections.Generic.IEnumerable`1",
    typeArguments: [element],
    csharpRender: { kind: "named", namespace: ["System", "Collections", "Generic"], name: "IEnumerable" },
    csharpArrayLiteralElementType: element,
    csharpEnumerableElementType: element,
  };
}

export function overlapExtensionsBinding() {
  const int32 = { kind: "source-primitive", name: "int32" };
  const typeParameter = { kind: "type-parameter", name: "T" };
  return {
    id: "Example.MemoryExtensions",
    sourceName: "MemoryExtensions",
    targetName: "Example.MemoryExtensions",
    target: "csharp",
    kind: "class",
    members: [
      overlapMethod("Example.MemoryExtensions.Overlaps(Example.Span`1<T>,Example.ReadOnlySpan`1<T>)", [
        targetParameter("span", spanType(typeParameter)),
        targetParameter("other", readOnlySpanType(typeParameter)),
      ]),
      overlapMethod("Example.MemoryExtensions.Overlaps(Example.Span`1<T>,Example.ReadOnlySpan`1<T>,System.Int32)", [
        targetParameter("span", spanType(typeParameter)),
        targetParameter("other", readOnlySpanType(typeParameter)),
        targetParameter("elementOffset", int32, "byref-writeonly-must-init"),
      ]),
    ],
  };
}

export function overlapMethod(id, parameters) {
  return {
    id,
    sourceName: "overlaps",
    targetName: "Overlaps",
    kind: "method",
    static: true,
    receiverPassing: "first-argument",
    typeParameters: [{ name: "T" }],
    parameters,
    returnType: { kind: "source-primitive", name: "bool" },
    overloadGroup: "Example.MemoryExtensions.Overlaps",
  };
}

export function targetParameter(name, type, passingMode = "by-value") {
  return {
    name,
    type,
    passingMode,
  };
}

export function spanType(element) {
  return {
    kind: "target-named",
    id: "Example.Span`1",
    typeArguments: [element],
    csharpRender: { kind: "named", namespace: ["Example"], name: "Span" },
  };
}

export function readOnlySpanType(element) {
  return {
    kind: "target-named",
    id: "Example.ReadOnlySpan`1",
    typeArguments: [element],
    csharpRender: { kind: "named", namespace: ["Example"], name: "ReadOnlySpan" },
  };
}

export function coreLangMarker(exportName) {
  return {
    providerId: "test",
    providerVersion: "0",
    providerModuleId: "@tsonic/core/lang.js",
    moduleSpecifier: "@tsonic/core/lang.js",
    virtualFileName: "tsts-provider://@tsonic/core/lang.js",
    exportName,
    memberId: `@tsonic/core/lang.js::${exportName}`,
  };
}

export function virtualMember(memberId, memberName = "m", targetId = targetIdFromMemberId(memberId)) {
  return {
    providerId: "test",
    providerVersion: "0",
    providerModuleId: "test",
    moduleSpecifier: "test",
    virtualFileName: "tsts-provider://test",
    memberName,
    memberId,
    targetIdentity: { kind: "target-named", id: targetId },
  };
}

export function propertyAccessCallee(receiver, name) {
  return {
    Kind: "KindPropertyAccessExpression",
    Expression: receiver,
    name: { Kind: "KindIdentifier", Text: name },
  };
}

export function targetIdFromMemberId(memberId) {
  if (memberId.includes("..ctor")) {
    return memberId.slice(0, memberId.indexOf("..ctor"));
  }
  const lastDot = memberId.lastIndexOf(".");
  return lastDot < 0 ? memberId : memberId.slice(0, lastDot);
}

export function fakeObservationContext(options) {
  return {
    facts: {
      get(subject, key) {
        const mappedFact = options.factsBySubject?.get(subject)?.get(key);
        if (mappedFact !== undefined) {
          return mappedFact;
        }
        if (subject === options.selectedSignatureSubject && key === selectedTargetSignatureFactKey) {
          return options.selectedSignature;
        }
        if (subject === options.virtualSignatureSubject && key === providerVirtualDeclarationFactKey) {
          return options.virtualSignatureDeclaration;
        }
        if (subject === options.virtualDeclarationSubject && key === providerVirtualDeclarationFactKey) {
          return options.virtualDeclaration;
        }
        if (subject === options.virtualDeclarationSubject && key === targetBindingFactKey && options.targetBinding !== undefined) {
          return options.targetBinding;
        }
        if (subject === options.attributeSubject && key === attributeFactKey) {
          return options.attribute;
        }
        if (subject === options.fieldSubject && key === fieldFactKey) {
          return options.field;
        }
        if (key === argumentPassingFactKey && options.argumentPassingBySubject?.has(subject)) {
          return options.argumentPassingBySubject.get(subject);
        }
        if (subject === options.argumentPassingSubject && key === argumentPassingFactKey) {
          return options.argumentPassing;
        }
        if (subject === options.defaultValueSubject && key === defaultValueFactKey) {
          return options.defaultValue;
        }
        if (subject === options.flowStateSubject && key === flowStateFactKey) {
          return options.flowState;
        }
        if (subject === options.structFactSubject && key === structFactKey) {
          return options.structFact;
        }
        return undefined;
      },
      set(subject, key, value, evidence) {
        options.recordedFacts?.push({ subject, key, value, evidence });
      },
    },
    factResolver: {
      resolve(subject, key) {
        const mappedFact = options.factsBySubject?.get(subject)?.get(key);
        if (mappedFact !== undefined) {
          return mappedFact;
        }
        if (subject === options.selectedSignatureSubject && key === selectedTargetSignatureFactKey) {
          return options.selectedSignature;
        }
        if (subject === options.virtualSignatureSubject && key === providerVirtualDeclarationFactKey) {
          return options.virtualSignatureDeclaration;
        }
        if (subject === options.virtualDeclarationSubject && key === providerVirtualDeclarationFactKey) {
          return options.virtualDeclaration;
        }
        if (subject === options.virtualDeclarationSubject && key === targetBindingFactKey && options.targetBinding !== undefined) {
          return options.targetBinding;
        }
        if (subject === options.attributeSubject && key === attributeFactKey) {
          return options.attribute;
        }
        if (subject === options.fieldSubject && key === fieldFactKey) {
          return options.field;
        }
        if (key === argumentPassingFactKey && options.argumentPassingBySubject?.has(subject)) {
          return options.argumentPassingBySubject.get(subject);
        }
        if (subject === options.argumentPassingSubject && key === argumentPassingFactKey) {
          return options.argumentPassing;
        }
        if (subject === options.defaultValueSubject && key === defaultValueFactKey) {
          return options.defaultValue;
        }
        if (subject === options.flowStateSubject && key === flowStateFactKey) {
          return options.flowState;
        }
        if (subject === options.structFactSubject && key === structFactKey) {
          return options.structFact;
        }
        if (subject === options.targetBindingSubject && key === targetBindingFactKey) {
          return options.targetBinding;
        }
        if (subject === options.sourcePrimitiveSubject && key === sourcePrimitiveFactKey) {
          return options.sourcePrimitive;
        }
        return undefined;
      },
    },
    diagnostics: [],
    compiler: {
      ast: {
        kindName: (node) => node === undefined ? "Undefined" : node.Kind === 1 ? "KindNumericLiteral" : String(node.Kind),
        getSourceFile: () => undefined,
        parent: (node) => node?.Parent,
        name: (node) => node?.name ?? node?.Name,
        text: (node) => node?.Text ?? "",
        typeArguments: (node) => options.typeArgumentsByNode?.get(node) ?? [],
        is: {
          IsIdentifier: (node) => node?.Kind === "KindIdentifier",
          IsPrivateIdentifier: () => false,
          IsQualifiedName: () => false,
          IsPropertyAccessExpression: (node) => node?.Kind === "KindPropertyAccessExpression",
          IsVariableDeclaration: () => false,
          IsParameterDeclaration: () => false,
          IsBindingElement: () => false,
          IsFunctionDeclaration: () => false,
          IsCallExpression: (node) => node?.Kind === "KindCallExpression",
          IsNewExpression: (node) => node?.Kind === "KindNewExpression",
          IsClassDeclaration: () => false,
          IsMethodDeclaration: () => false,
          IsPropertyDeclaration: () => false,
          IsKeywordTypeNode: () => false,
          IsTypeReferenceNode: () => false,
          IsUnionTypeNode: () => false,
          IsIntersectionTypeNode: () => false,
          IsConditionalTypeNode: () => false,
          IsInferTypeNode: () => false,
          IsArrayTypeNode: () => false,
          IsIndexedAccessTypeNode: () => false,
          IsLiteralTypeNode: () => false,
          IsThisTypeNode: () => false,
          IsMappedTypeNode: () => false,
          IsTupleTypeNode: () => false,
          IsOptionalTypeNode: () => false,
          IsRestTypeNode: () => false,
          IsParenthesizedTypeNode: () => false,
          IsFunctionTypeNode: () => false,
          IsConstructorTypeNode: () => false,
          IsTemplateLiteralTypeNode: () => false,
          IsImportTypeNode: () => false,
          IsStringLiteral: () => false,
        },
      },
      checker: {
        getSymbolAtLocation: (node) => options.symbolsByNode?.get(node),
        getResolvedSymbol: (node) => options.resolvedSymbolsByNode?.get(node),
        getResolvedSymbolOrNil: (node) => options.resolvedSymbolsByNode?.get(node),
        getAliasedSymbol: () => undefined,
        getTypeAtLocation: (node) => options.typesByNode?.get(node) ?? (node !== undefined && typeof node === "object" && typeof node.kind === "string" ? node : undefined),
        getTypeSymbol: (type) => options.typeSymbolsByType?.get(type),
        getSymbolDeclarations: (symbol) => options.declarationsBySymbol?.get(symbol) ?? [],
      },
    },
  };
}
