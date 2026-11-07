import assert from "node:assert/strict";
import { checkedProviderCall, providerCallSource } from "./direct-provider-call-source.mjs";
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
} from "../../../dist/policy/types/index.js";
import { selectCsharpProviderCall } from "../../../dist/analysis/operations/members/calls/selection.js";
import { selectCsharpProviderElement } from "../../../dist/analysis/operations/members/element-selection.js";
import { selectCsharpProviderProperty } from "../../../dist/analysis/operations/members/property-selection.js";
import { selectCsharpTargetCall, selectCsharpTargetElement, selectCsharpTargetProperty } from "../../../dist/analysis/operations/members/selected-members.js";
import {
  createCsharpProviderRelationCatalog,
  providerMemberSourceIdentity,
  providerSignatureSourceIdentity,
  providerTypeSourceIdentity,
  providerValueSourceIdentity,
} from "../../../dist/providers/model/provider-relations.js";

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
  test,
  providerCallSource,
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
    ...(options.csharpType === undefined ? {} : { csharpType: options.csharpType }),
    ...(typeParameters.length === 0 ? {} : { typeParameters }),
    ...(options.members === undefined ? {} : { members: options.members }),
    ...(options.implementedContracts === undefined
      ? {}
      : { implementedContracts: options.implementedContracts }),
    ...(options.csharpAbstract === true ? { csharpAbstract: true } : {}),
    ...(options.csharpUnmanagedTypeParameterIndexes === undefined
      ? {}
      : {
          csharpUnmanagedTypeParameterIndexes:
            options.csharpUnmanagedTypeParameterIndexes,
        }),
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
          kind: "target-named", csharpAllowsRefLikeTypeArguments: [],
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
    ...(options.csharpInvocation === undefined
      ? {}
      : { csharpInvocation: options.csharpInvocation }),
  });
}

export function providerConstructor(options = {}) {
  const declaringType = options.declaringType ?? {
    kind: "target-named", csharpAllowsRefLikeTypeArguments: [],
    id: options.declaringTypeId ?? "Fixture.Target",
  };
  return Object.freeze({
    id: options.id ?? "Fixture.Target..ctor()",
    sourceName: options.sourceName ?? "FixtureType",
    targetName: options.targetName ?? ".ctor",
    kind: "constructor",
    csharpConstructorAccessibility: options.accessibility ?? "public",
    csharpConstructorObsolete: false,
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
      kind: "target-named", csharpAllowsRefLikeTypeArguments: [],
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
      kind: "target-named", csharpAllowsRefLikeTypeArguments: [],
      id: options.declaringTypeId ?? "Fixture.Target",
    },
    ...(options.readonly === true ? { readonly: true } : {}),
  });
}


// Basis (nextgen C-2542, signed by Claude): Native provider fixtures read published Source facts only. A call is the
// Host call selection of an actual checked program (facts.selections.call); property and element accesses are Host
// SourceMemberAccessSelection / SourceElementAccessRecord records. Native carriers are keyed by Source node (types.value),
// by published descriptor identity (types.represent) and by use (types.instantiation): never by a checker Type.
export function callEvidence(spec) {
  return checkedProviderCall(spec);
}

const unknownDescriptor = Object.freeze({ kind: "intrinsic", intrinsic: "unknown" });

export function providerCallNativeEvidence(source, options, binding, member) {
  const receiver = options.receiverTarget ?? {
    kind: "target-named", csharpAllowsRefLikeTypeArguments: (binding.typeParameters ?? []).map(() => false),
    id: binding.id,
    ...(binding.typeParameters === undefined ? {} : {
      typeArguments: binding.typeParameters.map(() => csharpStringTargetType()),
    }),
  };
  const arguments_ = options.sourceArgumentTargets ?? [];
  const selection = source.evidence;
  const nodeTypes = sourceArgumentExpressions(source).map((expression, index) => [expression, arguments_[index]]);
  if (selection.receiver !== undefined) nodeTypes.push([selection.receiver, receiver]);
  // The call's own value is the selected member result (the old Type-keyed `sourceResultType` entry).
  nodeTypes.push([source.call, member.returnType]);
  const descriptorTypes = [[selection.result, member.returnType]];
  const method = [];
  const binders = source.program.facts.instantiations.at(source.call);
  const explicit = source.program.syntax.typeArguments(source.call);
  for (const [index, native] of (options.nativeTypeArguments ?? []).entries()) {
    assert.equal(binders !== undefined && binders.kind !== "refused" && binders.method[index] !== undefined, true,
      "each Native generic leaf belongs to this checked call's published method binder");
    if (native.explicitTarget !== undefined) {
      assert.equal(explicit[index] !== undefined, true,
        "the authored generic argument is retained, not manufactured by the Native fixture");
      nodeTypes.push([explicit[index], native.explicitTarget]);
    }
    method.push(native.explicitTarget ?? native.selectedTarget);
  }
  const extra = options.nativeEvidence?.(source) ?? {};
  assert.equal(extra.semanticTypes === undefined, true, "Native evidence is keyed by node or descriptor, never by a checker Type");
  return {
    nodeTypes: [...nodeTypes, ...(extra.nodeTypes ?? [])].filter((entry) => entry[1] !== undefined),
    descriptorTypes: [...descriptorTypes, ...(extra.descriptorTypes ?? [])].filter((entry) => entry[1] !== undefined),
    instantiations: method.length === 0 ? [] : [[source.call, method]],
    facts: extra.facts ?? [],
  };
}

/** The authored argument expressions of a selected call, in Host argument order. */
export function sourceArgumentExpressions(source) {
  return source.evidence.arguments.map(argument => argument.argument);
}

export function propertyEvidence(options = {}) {
  const expression = options.expression ?? { kind: "property" };
  assert.equal(options.selectedSymbol === undefined, true, "a Host member selection carries declarations, never a Symbol");
  const declarations = options.selectedDeclaration === null ? [] : [options.selectedDeclaration ?? {}];
  const access = options.accessMode ?? "read";
  return {
    expression,
    evidence: Object.freeze({
      use: expression,
      receiver: options.receiverExpression ?? { kind: "receiver" },
      receiverType: options.receiverType ?? unknownDescriptor,
      name: options.name ?? "member",
      selected: Object.freeze({ kind: "member", declarations: Object.freeze(declarations) }),
      result: (access === "write" ? options.writeType : options.readType) ?? unknownDescriptor,
      access,
      optionalChain: options.optionalChain ?? false,
    }),
  };
}

export function elementEvidence(options = {}) {
  const argumentExpression = options.argumentExpression ?? { kind: "index" };
  const expression = options.expression ?? { kind: "element" };
  // The element selector reads the index expression from authored syntax; the fixture syntax is the node itself.
  if (expression.ArgumentExpression === undefined && !Object.isFrozen(expression)) expression.ArgumentExpression = argumentExpression;
  assert.equal(options.selectedSymbol === undefined, true, "a Host element record carries declarations, never a Symbol");
  const access = options.accessMode ?? "read";
  const selected = options.selectedDeclaration === null
    ? options.selectedElementIndex === undefined ? { kind: "element" } : { kind: "tuple", position: options.selectedElementIndex }
    : { kind: options.indexSignature === true ? "index-signature" : "member", declaration: options.selectedDeclaration ?? {},
      ...(options.indexSignature === true ? {} : { name: options.name ?? "item" }) };
  return {
    expression,
    evidence: Object.freeze({
      node: expression,
      receiver: options.receiverExpression ?? { kind: "receiver" },
      receiverType: options.receiverType ?? unknownDescriptor,
      index: options.argumentType ?? unknownDescriptor,
      selected: Object.freeze(selected),
      result: (access === "write" ? options.writeType : options.readType) ?? unknownDescriptor,
      readonly: options.readonly ?? false,
      access,
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
      sourceAcceptsOmission:
        parameter.optional === true || parameter.paramsArray === true,
      targetAcceptsOmission:
        parameter.optional === true ||
        parameter.csharpOmittableOptionalArgument === true ||
        parameter.paramsArray === true,
      sourceRest: parameter.paramsArray === true,
      targetParamsArray: parameter.paramsArray === true,
    }));
  const bindingTypeArgumentSource = options.bindingTypeArgumentSource ??
    (member.kind === "constructor"
      ? "selected-operation-type-arguments"
      : member.static === true
        ? "callee"
        : "receiver");
  const bindingTypeParameters = options.bindingTypeParameters ??
    (binding.typeParameters ?? []).map((_, index) => ({
      sourceTypeParameterIndex: index,
      targetTypeParameterIndex: index,
    }));
  const methodTypeParameters = options.methodTypeParameters ??
    (member.typeParameters ?? []).map((_, index) => ({
      sourceTypeParameterIndex: index,
      targetTypeParameterIndex: index,
    }));
  const invocationTypeParameters = options.invocationTypeParameters ?? [];
  const selectedTypeParameterCount = options.selectedTypeParameterCount ??
    selectedSourceTypeParameterCount(
      bindingTypeArgumentSource === "selected-operation-type-arguments"
        ? bindingTypeParameters
        : [],
      methodTypeParameters,
      invocationTypeParameters,
    );
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
    bindingTypeParameters,
    bindingTypeArgumentSource,
    methodTypeParameters,
    invocationTypeParameters,
    selectedTypeParameterCount,
  });
}

function selectedSourceTypeParameterCount(...relations) {
  const indexes = relations.flat().map((relation) =>
    relation.sourceTypeParameterIndex);
  return indexes.length === 0 ? 0 : Math.max(...indexes) + 1;
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

export function valueRelation(options) {
  const identity = providerValueSourceIdentity(options.declaration);
  assert.equal(identity.kind, "resolved");
  return Object.freeze({
    kind: "value",
    source: identity.identity,
    targetBinding: options.binding ?? providerBinding(),
    targetMember: options.member ?? providerField({ static: true }),
  });
}

const retiredCheckerOptions = ["semanticTypes", "signatureDeclarations", "typeSymbols", "symbolDeclarations", "rootSymbols",
  "numberLikeTypes", "effectiveTypeArguments", "propertyInfos", "indexedAccess", "nativeFlowTypes", "callResults"];

function fixtureRefusal(site) {
  return Object.freeze({ kind: "csharp-refused", code: "CSHARP_TEST_UNREPRESENTED",
    message: "The Native fixture does not represent this Source occurrence.", site });
}

export function directProviderHost(options = {}) {
  for (const name of retiredCheckerOptions) assert.equal(options[name], undefined,
    `the Native fixture option '${name}' carried checker evidence; key Native carriers by node, descriptor or use (nextgen C-2542)`);
  const program = options.sourceProgram;
  assert.equal((options.calls?.length ?? 0) === 0 || program !== undefined, true,
    "a Native call fixture must retain its own actual checked Source program");
  const sourceFile = program === undefined ? options.sourceFile ?? { kind: "source-file" }
    : program.syntax.getSourceFile(options.calls?.[0]?.[0] ?? options.elements?.[0]?.[0] ?? options.properties?.[0]?.[0]);
  if (program !== undefined) assert.equal(sourceFile !== undefined && (options.calls ?? []).every(([call, evidence]) =>
    program.facts.selections.call(call) === evidence), true,
  "every positive Source call record is the identical published Host selection rather than a reconstructed mock");
  const relations = options.relations ?? [];
  const sourceFacts = createSourceFacts(options.facts ?? [], program?.sourceFacts);
  const catalog = createCsharpProviderRelationCatalog([relations]);
  const bindings = uniqueBindings(relations);
  const nodeTypes = new Map(options.nodeTypes ?? []);
  const descriptorTypes = new Map(options.descriptorTypes ?? []);
  const instantiationTypes = new Map(options.instantiations ?? []);
  const propertyEvidenceByNode = new Map(options.properties ?? []);
  const elementEvidenceByNode = new Map(options.elements ?? []);
  const valueTypes = new Map(options.valueTypes ?? []);
  const providers = providerResolver(catalog, bindings);
  const ast = program === undefined ? options.ast ?? fixtureAst() : program.syntax;
  const projectDeclarations = new Set(options.projectDeclarations ?? []);
  // Without an actual program the fixture publishes only the Host records the test supplies; every other fact is absent.
  const facts = program?.facts ?? Object.freeze({
    selections: Object.freeze({
      call: () => undefined,
      memberAccess: node => propertyEvidenceByNode.get(node),
      objectLiteralElement: () => undefined,
    }),
    values: Object.freeze({
      type(node) {
        const type = valueTypes.get(node);
        return type === undefined
          ? { kind: "refused", source: "tsonic", code: "TSONIC_TEST_UNPUBLISHED", site: node, reason: "No fixture publication." }
          : { kind: "resolved", type, provenance: { group: node, occurrence: node, sourceFile } };
      },
      elementAccess(node) {
        const record = elementEvidenceByNode.get(node);
        assert.equal(record !== undefined, true, "the fixture publishes every element access it selects");
        return record;
      },
      literal: node => options.literals?.get(node),
    }),
    instantiations: Object.freeze({ at: () => undefined }),
    sums: Object.freeze({ sumOf: () => undefined }),
    objects: Object.freeze({ indexes: () => [], members: () => [], member: () => undefined }),
    profile: Object.freeze({ collection: () => undefined, member: () => undefined }),
    navigation: Object.freeze({
      identity: Object.freeze({
        isProjectDeclaration: node => projectDeclarations.has(node),
        target: () => undefined,
      }),
    }),
  });
  return {
    sourceFile,
    host: Object.freeze({
      ast,
      facts,
      sourceFacts,
      providers,
      projectTypes: Object.freeze({
        catalog: Object.freeze({
          definitions: Object.freeze([...(options.projectTypeDefinitions?.values() ?? [])]),
          targetTypeForDeclaration(declaration) {
            return options.projectTargetTypes?.get(declaration);
          },
          definitionForTarget(target) {
            return options.projectTypeDefinitions?.get(target.id);
          },
          definitionForId(id) {
            return options.projectTypeDefinitions?.get(id);
          },
        }),
        directSupertypes(type) {
          return options.projectDirectSupertypes?.get(type.id);
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
      objectShapes: options.objectShapes ?? Object.freeze({
        resolveNode() {
          return undefined;
        },
        resolveTarget() {
          return undefined;
        },
        resolveProjectConstructibleSelectedType() {
          return { kind: "unchanged" };
        },
      }),
      target: options.target ?? { id: "csharp" },
      types: Object.freeze({
        value: node => nodeTypes.get(node) ?? fixtureRefusal(node),
        storage: node => nodeTypes.get(node) ?? fixtureRefusal(node),
        readStorage: node => nodeTypes.get(node) ?? fixtureRefusal(node),
        represent: (descriptor, occurrence) => descriptorTypes.get(descriptor) ?? fixtureRefusal(occurrence),
        instantiation(use) {
          const method = instantiationTypes.get(use);
          if (method === undefined) return undefined;
          const instantiation = facts.instantiations.at(use);
          assert.equal(instantiation !== undefined && instantiation.kind !== "refused" && instantiation.method.length === method.length,
            true, "the Native fixture represents exactly the published method binders of this use");
          return Object.freeze({ instantiation, receiver: [], method, parameters: [], result: fixtureRefusal(use) });
        },
        typeParameterConstraints(declaration) {
          return options.typeParameterConstraints?.get(declaration) ?? { kind: "resolved", constraints: [] };
        },
      }),
    }),
  };
}

export function providerFact(subject, declaration) {
  return { subject, key: providerVirtualDeclarationFactKey, value: declaration };
}

/** WP0 A4: a provider parameter declaration carries the declaration role (mode only). */
export function declarationPassingFact(subject, mode) {
  return { subject, key: argumentPassingFactKey, value: { role: "declaration", mode } };
}

/** WP0 A4: an argument use carries the argument role with its required exact storage occurrence. */
export function argumentPassingFact(subject, mode, storageExpression) {
  return { subject, key: argumentPassingFactKey, value: { role: "argument", mode, storageExpression } };
}

export function typeEvidence(entries) {
  return {
    nodeTypes: entries
      .filter((entry) => entry.node !== undefined)
      .map((entry) => [entry.node, entry.target]),
    descriptorTypes: entries
      .filter((entry) => entry.descriptor !== undefined)
      .map((entry) => [entry.descriptor, entry.target]),
  };
}

function createSourceFacts(entries, checkedFacts) {
  const facts = new Map();
  for (const entry of entries) {
    const byKey = facts.get(entry.subject) ?? new Map();
    byKey.set(entry.key, entry.value);
    facts.set(entry.subject, byKey);
  }
  return Object.freeze({
    getFact(subject, key) {
      return facts.get(subject)?.get(key) ?? checkedFacts?.getFact(subject, key);
    },
    getFacts(subject) {
      const values = new Map((checkedFacts?.getFacts(subject) ?? []).map(fact => [fact.key, fact.value]));
      for (const [key, value] of facts.get(subject) ?? []) values.set(key, value);
      return [...values].map(([key, value]) => ({ key, value }));
    },
    getVirtualDeclarationDocument(...arguments_) {
      return checkedFacts?.getVirtualDeclarationDocument(...arguments_);
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
    findTargetBindingByTargetId(targetId, purpose) {
      assert.equal(purpose, "ordinary", "fixture lookup purpose is explicit");
      const binding = uniqueBinding(bindings.filter((binding) => binding.id === targetId));
      return binding === undefined ? { kind: "missing" } : { kind: "resolved", binding };
    },
    findTargetBindingByMetadataName(metadataName, purpose) {
      assert.equal(purpose, "ordinary", "fixture lookup purpose is explicit");
      const binding = uniqueBinding(
        bindings.filter((binding) => binding.targetName === metadataName),
      );
      return binding === undefined ? { kind: "missing" } : { kind: "resolved", binding };
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
    forEachChild(node, visit) {
      for (const child of [...(node?.children ?? []), node?.Operand, node?.Expression, node?.Left, node?.Right]) {
        if (child !== undefined) visit(child);
      }
    },
    elements(node) {
      return node?.elements ?? [];
    },
    typeArguments(node) {
      return node?.typeArguments ?? [];
    },
    kindName(node) {
      return node?.syntaxKind?.replace(/^Is/u, "Kind");
    },
    authoredRange() {
      return { kind: "synthetic" };
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
