import { test } from "node:test";
import assert from "node:assert/strict";
import { csharpTargetOperationFactKey } from "../dist/source/csharp-facts.js";
import { csharpDelegateTargetType, csharpEnumerableTargetType } from "../dist/source/csharp-source-semantics/target-types.js";
import { getRequiredCsharpTargetMemberOperationForSelectedSignature } from "../dist/backend/planner/csharp-target-operations.js";
import { planCallArgumentCore } from "../dist/backend/planner/expression-call-arguments.js";
import {
  planSelectedTargetCallee,
  planSelectedTargetCallArguments,
  planSelectedTargetReceiverExpression,
} from "../dist/backend/planner/expression-selected-target-members.js";
import {
  KindIdentifier,
} from "../dist/backend/planner/source-ast.js";
import {
  targetMemberAsSourceSelectedSignature,
} from "../dist/source/csharp-source-semantics/selected-target-source-signature.js";
export { test, assert, csharpTargetOperationFactKey, csharpDelegateTargetType, csharpEnumerableTargetType, getRequiredCsharpTargetMemberOperationForSelectedSignature, planCallArgumentCore, planSelectedTargetCallee, planSelectedTargetCallArguments, planSelectedTargetReceiverExpression, KindIdentifier, targetMemberAsSourceSelectedSignature };

























export function selectedMember() {
  return {
    id: "Example.Box.identity``1",
    sourceName: "identity",
    targetName: "Identity",
    kind: "method",
    parameters: [{
      name: "value",
      type: { kind: "type-parameter", name: "T" },
      passingMode: "by-value",
    }],
    returnType: { kind: "type-parameter", name: "T" },
    typeParameters: [{ name: "T" }],
  };
}

export function closedIdentityMember(type) {
  return {
    id: "Example.Box.identity``1",
    sourceName: "identity",
    targetName: "Identity",
    kind: "method",
    parameters: [{
      name: "value",
      type,
      passingMode: "by-value",
    }],
    returnType: type,
    typeParameters: [{ name: "T" }],
  };
}

export function csharpStringType() {
  return { kind: "target-named", id: "System.String" };
}

export function extensionMember() {
  const int32 = { kind: "source-primitive", name: "int32" };
  return {
    id: "Example.MemoryExtensions.Overlaps(Example.Span`1<System.Int32>,Example.ReadOnlySpan`1<System.Int32>,System.Int32)",
    sourceName: "overlaps",
    targetName: "Overlaps",
    kind: "method",
    static: true,
    receiverPassing: "first-argument",
    parameters: [
      {
        name: "span",
        type: { kind: "target-named", id: "Example.Span`1", typeArguments: [int32] },
        passingMode: "by-value",
      },
      {
        name: "other",
        type: { kind: "target-named", id: "Example.ReadOnlySpan`1", typeArguments: [int32] },
        passingMode: "by-value",
      },
      {
        name: "elementOffset",
        type: int32,
        passingMode: "byref-writeonly-must-init",
      },
    ],
    returnType: { kind: "source-primitive", name: "bool" },
    overloadGroup: "Example.MemoryExtensions.Overlaps",
  };
}

export function callableInvokeMember() {
  const int32 = { kind: "source-primitive", name: "int32" };
  return {
    id: "Example.Callback.Invoke(System.String,System.String,System.Int32[])",
    sourceName: "invoke",
    targetName: "Invoke",
    kind: "method",
    parameters: [
      {
        name: "value",
        type: csharpStringType(),
        passingMode: "by-value",
      },
      {
        name: "label",
        type: csharpStringType(),
        passingMode: "by-value",
        optional: true,
        defaultValue: { kind: "string", value: "proved" },
      },
      {
        name: "items",
        type: { kind: "array", element: int32 },
        passingMode: "by-value",
        paramsArray: true,
      },
    ],
    returnType: int32,
    overloadGroup: "Example.Callback.Invoke",
  };
}

export function callableByrefInvokeMember() {
  const int32 = { kind: "source-primitive", name: "int32" };
  const bool = { kind: "source-primitive", name: "bool" };
  const int64 = { kind: "source-primitive", name: "int64" };
  return {
    id: "Example.Callback.Invoke(ref System.Int32,out System.Boolean,in System.Int64)",
    sourceName: "invoke",
    targetName: "Invoke",
    kind: "method",
    parameters: [
      {
        name: "current",
        type: int32,
        passingMode: "byref-readwrite",
      },
      {
        name: "assigned",
        type: bool,
        passingMode: "byref-writeonly-must-init",
      },
      {
        name: "snapshot",
        type: int64,
        passingMode: "byref-readonly",
      },
    ],
    returnType: bool,
    overloadGroup: "Example.Callback.Invoke",
  };
}

export function fakeInput(options = {}) {
  return {
    facts: {
      getFact: (subject, key) =>
        subject === options.subject && key === csharpTargetOperationFactKey
          ? options.operation
          : undefined,
    },
  };
}

export function fakeArgumentInput(options = {}) {
  return {
    sourceFiles: [sourceFile],
    ast: {
      kindName: (node) => String(node?.Kind),
    },
    analysis: {
      getProjectSourceReferenceForNode: (node) => options.sourceReferences?.get(node),
      getSymbolAtLocation: () => undefined,
      getResolvedSymbol: () => undefined,
      getSymbolDeclarations: () => [],
    },
    facts: {
      getArgumentPassingFact: (subject) =>
        subject === options.argumentPassingSubject ? options.argumentPassing : undefined,
      getTargetConversionFact: (subject) =>
        subject === options.conversionSubject ? options.conversion : undefined,
      getRuntimeCarrierFact: (subject) => {
        const carrier = options.runtimeCarriers?.get(subject);
        return carrier === undefined ? undefined : { carrier };
      },
      getPointerFact: () => undefined,
      getFunctionPointerFact: () => undefined,
      getSourcePrimitiveFact: () => undefined,
      getTargetBindingFact: () => undefined,
      getFact: () => undefined,
    },
    targetFacts: {
      resolveRuntimeCarrierForNode: (subject) => {
        const carrier = options.runtimeCarriers?.get(subject);
        return carrier === undefined
          ? { kind: "missing", evidence: [] }
          : { kind: "resolved", carrier, evidence: [] };
      },
      getTargetBindingForReference: () => undefined,
    },
  };
}

export function fakeSelectedInput() {
  return {
    ast: {
      kindName: (node) => String(node?.Kind),
    },
    analysis: {
      getSymbolName: () => undefined,
      getSymbolDeclarations: () => [],
      getTypeSymbol: () => undefined,
      getTypeAliasSymbol: () => undefined,
      getProjectSourceReferenceForNode: () => undefined,
      getTargetBindingForReference: () => undefined,
    },
  };
}

export function identifier(text) {
  return { Kind: KindIdentifier, Text: text };
}

export function identifierExpressionPlanner(node) {
  return { kind: "IdentifierName", name: node.Text };
}

export function expectedIdentifierExpressionPlanner(node, _sourceFile, _input, _diagnostics, expectedType) {
  return {
    kind: "IdentifierName",
    name: `${node.Text}_as_${expectedType.name}`,
  };
}

export function expectedTypeKindExpressionPlanner(node, _sourceFile, _input, _diagnostics, expectedType) {
  return {
    kind: "IdentifierName",
    name: `${node.Text}_as_${expectedType.kind}`,
  };
}

export const sourceFile = {
  FileName: "/src/index.ts",
  IsDeclarationFile: false,
};

export const sourceFileWithText = {
  Kind: "KindSourceFile",
  FileName: "/src/index.ts",
  Text: "function f() {\n  target(value);\n}\n",
  IsDeclarationFile: false,
};

export function sourceLocatedIdentifier(text) {
  return {
    Kind: KindIdentifier,
    Text: text,
    Parent: sourceFileWithText,
    Loc: {
      pos: sourceFileWithText.Text.indexOf(text),
      end: sourceFileWithText.Text.indexOf(text) + text.length,
    },
  };
}
