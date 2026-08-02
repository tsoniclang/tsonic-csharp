import assert from "node:assert/strict";
import { test } from "node:test";
import {
  argumentPassingFactKey,
  providerVirtualDeclarationFactKey,
} from "@tsonic/tsts";
import {
  csharpObjectTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpVoidTargetType,
  targetMethod,
  targetParameter,
  targetProperty,
} from "../dist/policy/types/index.js";
import {
  selectCsharpProviderCall,
  selectCsharpProviderElement,
  selectCsharpProviderProperty,
  selectCsharpTargetCall,
  selectCsharpTargetElement,
  selectCsharpTargetProperty,
} from "../dist/policy/members/index.js";
import {
  createCsharpProviderRelationCatalog,
  providerMemberSourceIdentity,
  providerSignatureSourceIdentity,
  providerTypeSourceIdentity,
  providerValueSourceIdentity,
} from "../dist/provider/target-relations/index.js";

export {
  assert,
  csharpObjectTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpVoidTargetType,
  selectCsharpProviderCall,
  selectCsharpProviderElement,
  selectCsharpProviderProperty,
  selectCsharpTargetCall,
  selectCsharpTargetElement,
  selectCsharpTargetProperty,
  targetMethod,
  targetParameter,
  targetProperty,
  test,
};

export function providerDeclaration(options = {}) {
  return Object.freeze({
    providerId: options.providerId ?? "fixture-provider",
    providerVersion: options.providerVersion ?? "1.0.0",
    providerModuleId: options.providerModuleId ?? "fixture.module",
    moduleSpecifier: options.moduleSpecifier ?? "@fixture/provider.js",
    artifactFileName:
      options.artifactFileName ?? "tsts-provider://fixture/provider.d.ts",
    exportId: options.exportId ?? "FixtureType",
    exportName: options.exportName ?? "FixtureType",
    ...(options.memberId === null
      ? {}
      : { memberId: options.memberId ?? "fixture.member" }),
    ...(options.memberStatic === null
      ? {}
      : { memberStatic: options.memberStatic ?? false }),
    ...(options.memberKey === null
      ? {}
      : {
          memberKey: options.memberKey ?? {
            kind: "property-key",
            name: options.memberName ?? "member",
          },
        }),
    ...(options.signatureId === null
      ? {}
      : { signatureId: options.signatureId ?? "fixture.signature" }),
  });
}

export function providerBinding(options = {}) {
  const id = options.id ?? "Fixture.Target";
  const typeParameters = options.typeParameters ?? [];
  return Object.freeze({
    id,
    sourceName: options.sourceName ?? "FixtureType",
    targetName: options.targetName ?? id,
    target: "csharp",
    kind: options.kind ?? "class",
    ...(typeParameters.length === 0 ? {} : { typeParameters }),
    ...(options.members === undefined ? {} : { members: options.members }),
    ...(options.conversionOperators === undefined
      ? {}
      : { conversionOperators: options.conversionOperators }),
  });
}

export function providerMethod(options = {}) {
  const parameters = options.parameters ?? [];
  return Object.freeze({
    ...targetMethod(
      options.id ?? "Fixture.Target.Member()",
      options.sourceName ?? "member",
      options.targetName ?? "Member",
      parameters,
      options.returnType ?? csharpVoidTargetType(),
      {
        declaringType: options.declaringType ?? {
          kind: "target-named",
          id: options.declaringTypeId ?? "Fixture.Target",
        },
        static: options.static ?? false,
        ...(options.receiverPassing === undefined
          ? {}
          : { receiverPassing: options.receiverPassing }),
      },
    ),
    ...(options.typeParameters === undefined
      ? {}
      : { typeParameters: options.typeParameters }),
  });
}

export function providerConstructor(options = {}) {
  const declaringType = options.declaringType ?? {
    kind: "target-named",
    id: options.declaringTypeId ?? "Fixture.Target",
  };
  return Object.freeze({
    id: options.id ?? "Fixture.Target..ctor()",
    sourceName: options.sourceName ?? "FixtureType",
    targetName: options.targetName ?? ".ctor",
    kind: "constructor",
    static: false,
    parameters: options.parameters ?? [],
    declaringType,
    returnType: declaringType,
  });
}

export function providerIndexer(options = {}) {
  return Object.freeze({
    id: options.id ?? "Fixture.Target.Item(System.Int32)",
    sourceName: options.sourceName ?? "item",
    targetName: options.targetName ?? "Item",
    kind: "indexer",
    static: false,
    parameters: options.parameters ?? [
      targetParameter("index", csharpSourcePrimitiveTargetType("int32")),
    ],
    returnType: options.returnType ?? csharpStringTargetType(),
    declaringType: options.declaringType ?? {
      kind: "target-named",
      id: options.declaringTypeId ?? "Fixture.Target",
    },
    ...(options.readonly === true ? { readonly: true } : {}),
  });
}

export function providerField(options = {}) {
  return Object.freeze({
    id: options.id ?? "Fixture.Target.Value",
    sourceName: options.sourceName ?? "value",
    targetName: options.targetName ?? "Value",
    kind: options.kind ?? "field",
    static: options.static ?? false,
    parameters: [],
    returnType: options.returnType ?? csharpStringTargetType(),
    declaringType: options.declaringType ?? {
      kind: "target-named",
      id: options.declaringTypeId ?? "Fixture.Target",
    },
    ...(options.readonly === true ? { readonly: true } : {}),
  });
}

export function sourceParameter(options = {}) {
  return Object.freeze({
    parameterIndex: options.parameterIndex ?? 0,
    parameterName: options.parameterName ?? "value",
    parameterSymbol: options.parameterSymbol ?? {},
    parameterDeclaration: options.parameterDeclaration ?? {},
    selectedType: options.selectedType ?? {},
    ...(options.authoredTypeNode === undefined
      ? {}
      : { authoredTypeNode: options.authoredTypeNode }),
    acceptsOmission: options.acceptsOmission ?? false,
    rest: options.rest ?? false,
  });
}

export function sourceArgumentBinding(options = {}) {
  return Object.freeze({
    sourceArgumentIndex: options.sourceArgumentIndex ?? 0,
    effectiveArgumentIndex: options.effectiveArgumentIndex ??
      options.sourceArgumentIndex ?? 0,
    sourceForm: options.sourceForm ?? "value",
    ...(options.spreadElementIndex === undefined
      ? {}
      : { spreadElementIndex: options.spreadElementIndex }),
    sourceParameterIndex: options.sourceParameterIndex ?? 0,
    sourceParameterForm: options.sourceParameterForm ?? "parameter",
    selectedArgumentType: options.selectedArgumentType ?? {},
    selectedParameterType: options.selectedParameterType ?? {},
  });
}

export function callEvidence(options = {}) {
  const call = options.call ?? { kind: "call" };
  const selectedSignature = options.selectedSignature ?? {};
  const signatureDeclaration = options.signatureDeclaration ?? {};
  const calleeExpression = options.calleeExpression ?? { kind: "callee" };
  const calleeType = options.calleeType ?? {};
  const argumentExpressions = options.argumentExpressions ??
    (options.argumentTypes ?? []).map((_, index) => ({
      kind: "argument",
      index,
    }));
  const argumentTypes = options.argumentTypes ??
    argumentExpressions.map(() => ({}));
  const parameters = options.parameters ??
    argumentTypes.map((type, index) =>
      sourceParameter({
        parameterIndex: index,
        parameterName: `value${index}`,
        selectedType: type,
      }));
  const bindings = options.bindings ??
    argumentTypes.map((type, index) =>
      sourceArgumentBinding({
        sourceArgumentIndex: index,
        effectiveArgumentIndex: index,
        sourceParameterIndex: index,
        selectedArgumentType: type,
        selectedParameterType: parameters[index]?.selectedType ?? type,
      }));
  const receiverExpression = options.receiverExpression ?? {
    kind: "receiver",
  };
  const receiverType = options.receiverType ?? {};
  return {
    call,
    signatureDeclaration,
    evidence: Object.freeze({
      outcome: options.outcome ?? "applicable",
      call,
      selectedSignature,
      sourceSelectedSignatureKind:
        options.sourceSelectedSignatureKind ?? "resolved",
      ...(options.methodTypeArguments === undefined
        ? {}
        : { sourceSelectedMethodTypeArguments: options.methodTypeArguments }),
      sourceSelectedSignatureParameters: parameters,
      sourceCallee: Object.freeze({
        expression: calleeExpression,
        type: calleeType,
        ...(options.selectedCalleeDeclaration === undefined
          ? {}
          : { selectedDeclaration: options.selectedCalleeDeclaration }),
      }),
      sourceArguments: argumentExpressions.map((expression, index) =>
        Object.freeze({
          expression,
          type: argumentTypes[index],
        })),
      sourceArgumentBindings: bindings,
      ...(options.receiver === false
        ? {}
        : {
            sourceReceiver: Object.freeze({
              expression: receiverExpression,
              type: receiverType,
            }),
          }),
      sourceResultType: options.resultType ?? {},
    }),
  };
}

export function propertyEvidence(options = {}) {
  const expression = options.expression ?? { kind: "property" };
  return {
    expression,
    evidence: Object.freeze({
      expression,
      receiver: Object.freeze({
        expression: options.receiverExpression ?? { kind: "receiver" },
        type: options.receiverType ?? {},
      }),
      ...(options.selectedSymbol === null
        ? {}
        : { selectedSymbol: options.selectedSymbol ?? {} }),
      ...(options.selectedDeclaration === null
        ? {}
        : { selectedDeclaration: options.selectedDeclaration ?? {} }),
      ...(options.accessMode === "write"
        ? { accessMode: "write", sourceWriteType: options.writeType ?? {} }
        : options.accessMode === "read-write"
          ? {
              accessMode: "read-write",
              sourceReadType: options.readType ?? {},
              sourceWriteType: options.writeType ?? {},
            }
          : {
              accessMode: options.accessMode ?? "read",
              sourceReadType: options.readType ?? {},
            }),
      optionalChain: options.optionalChain ?? false,
      callCallee: options.callCallee ?? false,
    }),
  };
}

export function elementEvidence(options = {}) {
  const expression = options.expression ?? { kind: "element" };
  return {
    expression,
    evidence: Object.freeze({
      expression,
      receiver: Object.freeze({
        expression: options.receiverExpression ?? { kind: "receiver" },
        type: options.receiverType ?? {},
      }),
      argument: Object.freeze({
        expression: options.argumentExpression ?? { kind: "index" },
        type: options.argumentType ?? {},
      }),
      ...(options.selectedSymbol === null
        ? {}
        : { selectedSymbol: options.selectedSymbol ?? {} }),
      ...(options.selectedDeclaration === null
        ? {}
        : { selectedDeclaration: options.selectedDeclaration ?? {} }),
      ...(options.selectedElementIndex === undefined
        ? {}
        : { selectedElementIndex: options.selectedElementIndex }),
      ...(options.accessMode === "write"
        ? { accessMode: "write", sourceWriteType: options.writeType ?? {} }
        : options.accessMode === "read-write"
          ? {
              accessMode: "read-write",
              sourceReadType: options.readType ?? {},
              sourceWriteType: options.writeType ?? {},
            }
          : {
              accessMode: options.accessMode ?? "read",
              sourceReadType: options.readType ?? {},
            }),
      optionalChain: options.optionalChain ?? false,
      callCallee: options.callCallee ?? false,
    }),
  };
}

export function signatureRelation(options) {
  const identity = providerSignatureSourceIdentity(options.declaration);
  assert.equal(identity.kind, "resolved");
  const binding = options.binding ?? providerBinding();
  const member = options.member ?? providerMethod();
  const sourceParameters = options.sourceParameters ??
    member.parameters.map((parameter, index) => ({
      sourceParameterIndex: index,
      targetParameterIndex: index,
      sourcePassingMode: parameter.passingMode,
      targetPassingMode: parameter.passingMode,
      sourceAcceptsOmission: parameter.optional === true,
      targetAcceptsOmission:
        parameter.optional === true ||
        parameter.csharpOmittableOptionalArgument === true,
      sourceRest: parameter.paramsArray === true,
      targetParamsArray: parameter.paramsArray === true,
    }));
  return Object.freeze({
    kind: "signature",
    source: identity.identity,
    targetBinding: binding,
    targetMember: member,
    receiver: options.receiver ??
      (member.kind === "constructor" || member.static === true
        ? { kind: "none" }
        : { kind: "instance" }),
    parameters: sourceParameters,
    bindingTypeParameters: options.bindingTypeParameters ??
      (binding.typeParameters ?? []).map((_, index) => ({
        sourceTypeParameterIndex: index,
        targetTypeParameterIndex: index,
      })),
    bindingTypeArgumentSource: options.bindingTypeArgumentSource ??
      (member.kind === "constructor"
        ? "selected-operation-type-arguments"
        : member.static === true
          ? "callee"
          : "receiver"),
    methodTypeParameters: options.methodTypeParameters ??
      (member.typeParameters ?? []).map((_, index) => ({
        sourceTypeParameterIndex: index,
        targetTypeParameterIndex: index,
      })),
  });
}

export function memberRelation(options) {
  const identity = providerMemberSourceIdentity(options.declaration);
  assert.equal(identity.kind, "resolved");
  const binding = options.binding ?? providerBinding();
  const member = options.member ?? providerField();
  return Object.freeze({
    kind: "member",
    source: identity.identity,
    targetBinding: binding,
    targetMember: member,
    receiver: options.receiver ??
      (member.static === true ? { kind: "none" } : { kind: "instance" }),
    bindingTypeParameters: options.bindingTypeParameters ??
      (binding.typeParameters ?? []).map((_, index) => ({
        sourceTypeParameterIndex: index,
        targetTypeParameterIndex: index,
      })),
    bindingTypeArgumentSource: options.bindingTypeArgumentSource ??
      (member.static === true ? "callee" : "receiver"),
  });
}

export function directProviderHost(options = {}) {
  const sourceFile = options.sourceFile ?? { kind: "source-file" };
  const relations = options.relations ?? [];
  const sourceFacts = createSourceFacts(options.facts ?? []);
  const catalog = createCsharpProviderRelationCatalog([relations]);
  const bindings = uniqueBindings(relations);
  const nodeTypes = new Map(options.nodeTypes ?? []);
  const semanticTypes = new Map(options.semanticTypes ?? []);
  const signatureDeclarations = new Map(options.signatureDeclarations ?? []);
  const callEvidenceByNode = new Map(options.calls ?? []);
  const propertyEvidenceByNode = new Map(options.properties ?? []);
  const elementEvidenceByNode = new Map(options.elements ?? []);
  const providers = providerResolver(catalog, bindings);
  const ast = options.ast ?? fixtureAst();
  const projectDeclarations = new Set(options.projectDeclarations ?? []);
  return {
    sourceFile,
    host: Object.freeze({
      ast,
      sourceFacts,
      providers,
      navigation: Object.freeze({
        isProjectDeclaration(node) {
          return projectDeclarations.has(node);
        },
      }),
      projectTypes: Object.freeze({
        directSupertypes() {
          return undefined;
        },
        implicitConstructorForSignature(declaration, signature) {
          return options.projectConstructors?.get(declaration)?.get(signature);
        },
        implicitConstructorsForDeclaration(declaration) {
          return options.projectConstructors?.get(declaration) === undefined
            ? []
            : [...options.projectConstructors.get(declaration).values()];
        },
      }),
      target: options.target ?? { id: "csharp" },
      types: Object.freeze({
        resolveNode(node) {
          return nodeTypes.get(node);
        },
        resolveType(type) {
          return semanticTypes.get(type);
        },
        resolveValue(node, type) {
          return nodeTypes.get(node) ?? semanticTypes.get(type);
        },
        resolveSelectedType(authoredTypeNode, selectedType) {
          return nodeTypes.get(authoredTypeNode) ??
            semanticTypes.get(selectedType);
        },
      }),
      semantics(candidate) {
        assert.equal(candidate, sourceFile);
        return Object.freeze({
          sourceFile,
          getResolvedCallInfo(node) {
            return callEvidenceByNode.get(node);
          },
          getResolvedPropertyAccessInfo(node) {
            return propertyEvidenceByNode.get(node);
          },
          getResolvedElementAccessInfo(node) {
            return elementEvidenceByNode.get(node);
          },
          getSignatureDeclaration(signature) {
            return signatureDeclarations.get(signature);
          },
        });
      },
    }),
  };
}

export function providerFact(subject, declaration) {
  return { subject, key: providerVirtualDeclarationFactKey, value: declaration };
}

export function passingFact(subject, mode, storageExpression) {
  return {
    subject,
    key: argumentPassingFactKey,
    value: {
      mode,
      ...(storageExpression === undefined ? {} : { storageExpression }),
    },
  };
}

export function typeEvidence(entries) {
  return {
    nodeTypes: entries
      .filter((entry) => entry.node !== undefined)
      .map((entry) => [entry.node, entry.target]),
    semanticTypes: entries
      .filter((entry) => entry.type !== undefined)
      .map((entry) => [entry.type, entry.target]),
  };
}

function createSourceFacts(entries) {
  const facts = new Map();
  for (const entry of entries) {
    const byKey = facts.get(entry.subject) ?? new Map();
    byKey.set(entry.key, entry.value);
    facts.set(entry.subject, byKey);
  }
  return Object.freeze({
    getFact(subject, key) {
      return facts.get(subject)?.get(key);
    },
    getFacts(subject) {
      return [...(facts.get(subject)?.entries() ?? [])].map(([key, value]) => ({
        key,
        value,
      }));
    },
    getVirtualDeclarationDocument() {
      return undefined;
    },
  });
}

function providerResolver(catalog, bindings) {
  function resolve(declaration, identityFunction, catalogFunction) {
    const identity = identityFunction(declaration);
    return identity.kind === "missing"
      ? identity
      : {
          kind: "resolved",
          relations: catalogFunction.call(catalog, identity.identity),
        };
  }
  return Object.freeze({
    resolveType(declaration) {
      return resolve(declaration, providerTypeSourceIdentity, catalog.resolveType);
    },
    resolveValue(declaration) {
      return resolve(declaration, providerValueSourceIdentity, catalog.resolveValue);
    },
    resolveMember(declaration) {
      return resolve(
        declaration,
        providerMemberSourceIdentity,
        catalog.resolveMember,
      );
    },
    resolveSignature(declaration) {
      return resolve(
        declaration,
        providerSignatureSourceIdentity,
        catalog.resolveSignature,
      );
    },
    findTargetBindingByTargetId(targetId) {
      return uniqueBinding(bindings.filter((binding) => binding.id === targetId));
    },
    findTargetBindingByMetadataName(metadataName) {
      return uniqueBinding(
        bindings.filter((binding) => binding.targetName === metadataName),
      );
    },
  });
}

function uniqueBindings(relations) {
  return [...new Map(
    relations.map((relation) => [relation.targetBinding.id, relation.targetBinding]),
  ).values()];
}

function uniqueBinding(bindings) {
  return bindings.length === 1 ? bindings[0] : undefined;
}

function fixtureAst() {
  return Object.freeze({
    is: new Proxy({}, {
      get(_target, name) {
        return (node) => node?.syntaxKind === name;
      },
    }),
    as: new Proxy({}, {
      get() {
        return (node) => node;
      },
    }),
    operatorKindName(node) {
      return node?.operatorKind;
    },
    getSourceFile() {
      return undefined;
    },
    getFileName() {
      return "";
    },
    text(node) {
      return node?.text;
    },
  });
}
