import { createCsharpObjectShapeMemberResolver } from "./member-evidence.js";
import { objectShapeMemberTargetName } from "../../../policy/identities/source-member-names.js";
import { createStructuralObjectShapeTarget, mergeCsharpObjectShapeSubjects } from "./construction.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { csharpObjectShapesEqual } from "../../../target-model/types/object-shape-equality.js";
import { csharpObjectShapeContractKey, csharpObjectShapeMemberContractKey } from "../../../target-model/types/object-shape-identity.js";
import { isProjectSourceTargetType, projectClassIsObjectInitializable, requiresUnresolvedStructuralProjection, selectedObjectShapeSource, sourceSubjects, typeHasProjectOwnedShapeDeclaration, typeIsExcludedFromObjectShape } from "./source-evidence.js";
import { readCsharpSourceField, readCsharpSourceStruct } from "../../../source/extension/markers.js";
import { Node_Initializer } from "@tsonic/target-api/source";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../target-model/types/equality.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpRuntimeUnionTargetTypeRef, CsharpSourceMemberKey, CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";
import type { Node, ExtensionFactSubject, SourceFile, Type } from "@tsonic/tsts";
import type { CsharpTypeResolutionState } from "../../source-evidence/types/resolution/model.js";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import { nextState } from "../../source-evidence/types/resolution/state.js";
import { csharpSourceTemplateState } from "../../source-evidence/types/resolution/type-bindings.js";
import { substituteObjectShapeMemberTargetTypeParameters } from "../../../policy/types/resolution/substitution.js";
import { isCsharpJsValueTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { csharpPropertySourceMemberKey, csharpSourceMemberKeysEqual } from "../../../target-model/types/source-member-keys.js";
import { resolveProviderObjectLiteralShape } from "./provider-construction.js";
import { createCsharpStructuralUnionDefinitions } from "./union-definitions.js";
import { selectCsharpObjectMethodImplementation } from "./method-implementations.js";

import { csharpObjectMethodValueIsExtracted, resolveCsharpCopiedObjectShape, retainCsharpMethodValueContracts, selectCsharpWritableMethodContract } from "./method-values.js";
import { csharpObjectShapeMethodDeclaration, csharpPresentObjectShapeMethod } from "../../../target-model/types/method-values.js";

import { parameterizeCsharpStructuralContract } from "./structural-contracts.js";

import { retainCsharpGenericCallableValue } from "../../callables/generics/generic-values.js";

import type { CsharpObjectShapePolicyHost, CsharpRecursiveObjectShapePolicy } from "./model.js";

import { instantiateCsharpObjectShape } from "../../../policy/types/objects/instantiation.js";
import { resolveCsharpObjectShapeMemberBySelectedSubject } from "../../../target-model/types/object-shape-members.js";

import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { createCsharpLiteralShapeResolver } from "./literal-construction.js";
import { createCsharpProjectShapeProjection } from "./project-construction.js";
import type { CsharpNativeSourceCarrierSelection } from "../../../target-model/records/objects/object-shapes.js";
import { projectCsharpNativeSourceStorageCarrier } from "../value-domain-carriers.js";
import { createCsharpMetadataBudget } from "../../../target-model/metadata/immutable.js";
import { csharpObjectMethodHasFixedNativeExposure } from "../../../policy/types/objects/object-members.js";
export function createCsharpObjectShapePolicy(
  host: CsharpObjectShapePolicyHost,
): CsharpRecursiveObjectShapePolicy {
  const environment = host.typeParameterConstraints;
  const { deriveMembers, instantiateMemberEvidence, retainMemberDeclarationEvidence, resolvePropertyType, retainLiteralMemberEvidence } = createCsharpObjectShapeMemberResolver(host);
  const activeNodes = new WeakSet<object>();
  const activeTypes = new WeakSet<object>();
  const nodeShapes = new WeakMap<object, CsharpObjectShapeFact>();
  const targetShapes = new Map<string, CsharpObjectShapeFact>();
  const genericShapes = new Map<string, CsharpObjectShapeFact>();
  const unionDefinitions = createCsharpStructuralUnionDefinitions(host, (type, file, state) =>
    resolveTypeWithState(type, file, undefined, state), environment);

  function resolveNativeParameter(
    declaration: Node,
    parameter: Node,
    type: TargetTypeRef,
  ): CsharpNativeSourceCarrierSelection {
    const rejected = (reason: string): CsharpNativeSourceCarrierSelection => Object.freeze({ kind: "rejected", subject: parameter,
      code: "CSHARP_SOURCE_STORAGE_NOT_PROVEN", reason });
    const element = getCsharpNullableElementTargetType(type);
    const present = element ?? type;
    const target = present.kind === "target-named" ? present as CsharpTargetNamedTypeRef : undefined;
    if (target === undefined || target.csharpStructuralContract !== true && target.csharpSourceDeclarationKind !== "interface")
      return Object.freeze({ kind: "resolved", type });
    const shape = resolveTarget(present) ?? (target?.csharpSourceDeclarationKind === "interface"
      ? resolveProjectInterfaceShape(target, { depth: 0 }) : undefined);
    if (shape === undefined || !shape.members.some(member => member.memberKind === "method") ||
      host.ast.body(declaration) === undefined) return Object.freeze({ kind: "resolved", type });
    const demand = host.sourceStorage.formalMemberWriteDemand(declaration, parameter);
    if (demand.kind !== "complete") return rejected(demand.reason);
    const written: CsharpObjectShapeMemberFact[] = [];
    for (const declaration of demand.members) {
      const selected = resolveCsharpObjectShapeMemberBySelectedSubject(shape, [declaration]);
      if (selected.kind !== "resolved") return rejected("A native method-write destination requires exact checked formal/member correspondence.");
      if (selected.member.memberKind === "method" && !written.includes(selected.member)) written.push(selected.member);
    }
    const view = nativeMethodParameterView(shape, parameter, written);
    const selected = selectCsharpWritableMethodContract(view, written, environment);
    if (selected === undefined) return rejected("A native method-write destination requires an exact writable source method contract.");
    if (selected === shape) return Object.freeze({ kind: "resolved", type });
    const resolved = rememberTargetShape(selected).targetType;
    return Object.freeze({ kind: "resolved", type: element === undefined ? resolved : csharpNullableTargetType(resolved) });
  }

  function nativeMethodParameterView(
    shape: CsharpObjectShapeFact,
    parameter: Node,
    written: readonly CsharpObjectShapeMemberFact[],
  ): CsharpObjectShapeFact {
    if (shape.sourceType === undefined || shape.methodImplementation !== undefined || shape.targetType.kind !== "target-named" ||
      (shape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract !== true) return shape;
    const candidates = new Set(shape.members.filter(member => member.memberKind === "method" &&
      member.methodValueStorage?.kind === "delegate" && member.optional !== true &&
      (member.typeParameters?.length ?? 0) === 0 && !written.includes(member)));
    if (candidates.size === 0) return shape;
    const subject = host.sourceStorage.subjectFor(parameter);
    const origins = subject.kind === "resolved" ? host.sourceStorage.closedOriginsFor(subject.subject) : undefined;
    if (origins?.kind !== "complete" || origins.origins.length === 0) return shape;
    const contracts = new Map<CsharpObjectShapeMemberFact, TargetTypeRef>();
    const budget = createCsharpMetadataBudget();
    for (const origin of origins.origins) {
      budget.reserve(1);
      const carrier = projectCsharpNativeSourceStorageCarrier(
        host.typeResolver.resolveNode(origin.subject.node, origin.sourceFile, { depth: 0 }),
        origin.subject, { resolveTarget }, budget.reserve,
      );
      const source = resolveTarget(carrier);
      if (source === undefined) return shape;
      const pairs = host.semantics(origin.sourceFile).types.structuralMembers(origin.type, shape.sourceType, "read");
      if (pairs.kind !== "available") return shape;
      const selected = new Map<CsharpObjectShapeMemberFact, TargetTypeRef>();
      for (const pair of pairs.members) {
        if (pair.kind !== "present") continue;
        const destination = resolveCsharpObjectShapeMemberBySelectedSubject(shape,
          [pair.destination.property.symbol, ...pair.destination.property.rootSymbols, ...pair.destination.declarations]);
        if (destination.kind !== "resolved" || !candidates.has(destination.member)) continue;
        const member = resolveCsharpObjectShapeMemberBySelectedSubject(source,
          [pair.source.property.symbol, ...pair.source.property.rootSymbols, ...pair.source.declarations]);
        if (member.kind !== "resolved" || member.member.methodValueStorage !== undefined ||
          member.member.methodValueContract === undefined || !targetTypeRefEquals(member.member.type, destination.member.type)) continue;
        const declaration = csharpObjectShapeMethodDeclaration(source, member.member);
        const physical = declaration === undefined ? undefined : host.sourceStorage.memberSubjectFor(declaration);
        if (declaration === undefined || csharpObjectMethodValueIsExtracted(host.sourceStorage, declaration) || physical?.kind !== "resolved" ||
          !csharpObjectMethodHasFixedNativeExposure(host.sourceStorage.memberWritesFor(physical.subject))) continue;
        selected.set(destination.member, member.member.methodValueContract);
      }
      for (const member of candidates) {
        const contract = selected.get(member);
        const previous = contracts.get(member);
        if (contract === undefined || previous !== undefined && !targetTypeRefEquals(previous, contract)) {
          candidates.delete(member);
          contracts.delete(member);
        } else contracts.set(member, contract);
      }
      if (candidates.size === 0) return shape;
    }
    const protocols = new Map<string, CsharpObjectShapeFact>();
    for (const [member, contract] of contracts) {
      const key = targetTypeRefKey(contract);
      const protocol = protocols.get(key) ?? resolveTarget(contract);
      const signature = csharpPresentObjectShapeMethod(member);
      if (protocol === undefined || signature === undefined) return shape;
      const matches = protocol.members.filter(candidate =>
        csharpObjectShapeMemberContractKey(candidate) === csharpObjectShapeMemberContractKey(signature));
      if (matches.length !== 1) return shape;
      const correspondence = { ...protocol, members: protocol.members.map(candidate => candidate !== matches[0] ? candidate : {
        ...candidate,
        ...(signature.sourceSubjects === undefined ? {} : { sourceSubjects: signature.sourceSubjects }),
        ...(signature.sourceDeclarations === undefined ? {} : { sourceDeclarations: signature.sourceDeclarations }),
        ...(signature.sourceTypes === undefined ? {} : { sourceTypes: signature.sourceTypes }),
      }) };
      protocols.set(key, mergeCsharpObjectShapeSubjects(protocol, correspondence));
    }
    for (const protocol of protocols.values()) rememberTargetShape(protocol);
    const members = shape.members.map(member => {
      const contract = contracts.get(member);
      if (contract === undefined) return member;
      const { methodValueStorage: _storage, ...retained } = member;
      return Object.freeze({ ...retained, methodValueContract: contract });
    });
    const implemented = new Map((shape.implements ?? []).map(type => [targetTypeRefKey(type), type]));
    for (const contract of contracts.values()) implemented.set(targetTypeRefKey(contract), contract);
    const interfaces = Object.freeze([...implemented.values()]);
    const { declarationTemplate: _template, ...retained } = shape;
    return Object.freeze({ ...retained, members: Object.freeze(members), implements: interfaces,
      targetType: createStructuralObjectShapeTarget(members, interfaces, environment, true) });
  }

  function resolveNativeReturn(
    declaration: Node,
    type: TargetTypeRef,
    observed: readonly TargetTypeRef[],
  ): CsharpNativeSourceCarrierSelection {
    const unchanged: CsharpNativeSourceCarrierSelection = Object.freeze({ kind: "resolved", type });
    const element = getCsharpNullableElementTargetType(type);
    const present = element ?? type;
    if (present.kind !== "target-named") return unchanged;
    const target = present as CsharpTargetNamedTypeRef;
    if (target.csharpStructuralContract !== true && target.csharpSourceDeclarationKind !== "interface") return unchanged;
    const shape = resolveTarget(present);
    if (shape === undefined || observed.length === 0) return unchanged;
    const producers = observed.map(carrier => resolveTarget(carrier));
    if (producers.some(producer => producer === undefined || producer.targetType.kind !== "target-named" ||
      (producer.targetType as CsharpTargetNamedTypeRef).csharpValueType === true ||
      !targetTypeRefEquals(producer.targetType, present) &&
        !producer.implements?.some(implemented => targetTypeRefEquals(implemented, present)))) return unchanged;
    const written = shape.members.filter(member => {
      if (member.memberKind !== "method" || member.readonly === true) return false;
      const signature = csharpPresentObjectShapeMethod(member);
      return signature !== undefined && producers.every(producer => {
        const candidates = producer!.members.filter(candidate => {
          const selected = csharpPresentObjectShapeMethod(candidate);
          return selected !== undefined && csharpObjectShapeMemberContractKey(selected) === csharpObjectShapeMemberContractKey(signature);
        });
        return candidates.length === 1 && candidates[0]!.methodValueStorage !== undefined &&
          candidates[0]!.sourceDeclarations?.some(declaration => {
            const subject = host.sourceStorage.memberSubjectFor(declaration);
            if (subject.kind !== "resolved") return false;
            const writes = host.sourceStorage.memberWritesFor(subject.subject);
            return writes.kind !== "unresolved" && writes.writes.length > 0;
          }) === true;
      });
    });
    if (written.length === 0) return unchanged;
    const selected = selectCsharpWritableMethodContract(shape, written, environment);
    if (selected === undefined) return Object.freeze({ kind: "rejected", subject: declaration,
      code: "CSHARP_SOURCE_STORAGE_NOT_PROVEN", reason: "A native return requires the exact common writable source method contract of every reaching producer." });
    const resolved = rememberTargetShape(selected).targetType;
    return Object.freeze({ kind: "resolved", type: element === undefined ? resolved : csharpNullableTargetType(resolved) });
  }

  function resolveNode(
    node: Node | undefined,
    sourceFile?: SourceFile,
  ): CsharpObjectShapeFact | undefined {
    return resolveNodeWithState(node, sourceFile, { depth: 0 });
  }

  function resolveNodeWithState(
    node: Node | undefined,
    sourceFile: SourceFile | undefined,
    state: CsharpTypeResolutionState,
  ): CsharpObjectShapeFact | undefined {
    if (node === undefined) {
      return undefined;
    }
    if (
      host.ast.is.IsSourceFile(node) ||
      host.ast.is.IsImportDeclaration(node) ||
      host.ast.is.IsImportClause(node) ||
      host.ast.kindName(node) === "KindEndOfFile"
    ) {
      return undefined;
    }
    const cached = state.sourceBindings === undefined ? nodeShapes.get(node) : undefined;
    if (cached !== undefined) {
      return cached;
    }
    if (activeNodes.has(node)) {
      return undefined;
    }
    activeNodes.add(node);
    try {
      const queries = sourceFile === undefined
        ? host.semanticsFor(node)
        : host.semantics(sourceFile);
      const directStruct = resolveStructShape(node, queries, state);
      if (directStruct !== undefined) {
        remember(node, directStruct);
        return directStruct;
      }
      const source = selectedObjectShapeSource(node, queries, host, state);
      const selectedTarget = host.ast.is.IsClassDeclaration(node) || host.ast.is.IsClassExpression(node)
        ? host.typeResolver.resolveType(source.type, queries.sourceFile, nextState(state))
        : host.typeResolver.resolveNode(node, queries.sourceFile, nextState(state));
      const selectedShape = resolveTarget(selectedTarget);
      if (selectedShape !== undefined && source.type !== undefined &&
        (!host.ast.is.IsObjectLiteralExpression(node) || selectedShape.constructible === true)) {
        const actualType = host.ast.is.IsObjectLiteralExpression(node) ? queries.types.expressionType(node) : source.type;
        const members = actualType === undefined ? undefined
          : instantiateMemberEvidence(selectedShape.members, actualType, queries, selectedShape.sourceType);
        if (members !== undefined) return state.sourceBindings === undefined
          ? remember(node, { ...selectedShape, sourceType: actualType, members })
          : rememberTargetShape({ ...selectedShape, sourceType: actualType, members });
      }
      const declaration = host.navigation.declarationFor(node);
      const authoredTypeRoot = declaration === undefined
        ? undefined
        : host.ast.typeNode(declaration);
      const shape = resolveSemanticShape(
        source.type,
        node,
        queries,
        state,
        source.contextualTarget ?? selectedTarget,
        authoredTypeRoot,
      );
      if (shape !== undefined) {
        return state.sourceBindings === undefined ? remember(node, shape) : rememberTargetShape(shape);
      }
      if (selectedShape !== undefined) {
        return remember(node, selectedShape);
      }
      return undefined;
    } finally {
      activeNodes.delete(node);
    }
  }

  function resolveTarget(
    type: TargetTypeRef | undefined,
  ): CsharpObjectShapeFact | undefined {
    if (type === undefined) {
      return undefined;
    }
    const nullableElement = getCsharpNullableElementTargetType(type);
    if (nullableElement !== undefined) {
      return resolveTarget(nullableElement);
    }
    const direct = targetShapes.get(targetTypeRefKey(type));
    if (direct !== undefined) {
      return direct;
    }
    if (type.kind !== "target-named") {
      return undefined;
    }
    const template = genericShapes.get(type.id);
    if (template !== undefined) {
      const owner = nativeProjectOwner(type);
      if (owner === undefined) return undefined;
      const selected = instantiateCsharpObjectShape(template, owner);
      if (selected !== undefined) return rememberTargetShape(selected);
    }
    const union = type as Partial<CsharpRuntimeUnionTargetTypeRef>;
    const arms = union.csharpRuntimeUnionArms;
    const shapes = union.csharpRuntimeUnionObjectShapes;
    if (arms === undefined || shapes === undefined) {
      return undefined;
    }
    const present = shapes.filter(
      (shape): shape is CsharpObjectShapeFact => shape !== undefined,
    );
    return present.length === 1 ? present[0] : undefined;
  }

  function resolveType(
    type: Type | undefined,
    sourceFile: SourceFile,
    authoredTypeRoot?: Node,
  ): CsharpObjectShapeFact | undefined {
    return resolveTypeWithState(
      type,
      sourceFile,
      authoredTypeRoot,
      { depth: 0 },
    );
  }

  function resolveTypeWithState(
    type: Type | undefined,
    sourceFile: SourceFile,
    authoredTypeRoot: Node | undefined,
    state: CsharpTypeResolutionState,
  ): CsharpObjectShapeFact | undefined {
    if (type === undefined) {
      return undefined;
    }
    const authoredLiteral = authoredTypeRoot !== undefined && host.ast.is.IsObjectLiteralExpression(authoredTypeRoot)
      ? authoredTypeRoot : undefined;
    if (authoredLiteral !== undefined) {
      const queries = host.semanticsFor(authoredLiteral);
      const expressionType = queries.types.expressionType(authoredLiteral);
      if (expressionType === undefined || !queries.types.isIdentical(expressionType, type)) return undefined;
    }
    const shape = resolveSemanticShape(
      type,
      authoredLiteral,
      host.semantics(sourceFile),
      state,
      undefined,
      authoredLiteral === undefined ? authoredTypeRoot : undefined,
    );
    return shape === undefined ? undefined : rememberTargetShape(shape);
  }

  const resolveObjectLiteralTargetShape = createCsharpLiteralShapeResolver(host, {
    resolveNode, resolveType, retainLiteralMemberEvidence, instantiateMemberEvidence, rememberTargetShape,
  });
  const resolveProjectConstructibleSelectedType = createCsharpProjectShapeProjection(host, deriveMembers);

  function remember(
    node: Node,
    shape: CsharpObjectShapeFact,
  ): CsharpObjectShapeFact {
    shape = rememberTargetShape(shape);
    nodeShapes.set(node, shape);
    return shape;
  }

  function rememberTargetShape(
    shape: CsharpObjectShapeFact,
  ): CsharpObjectShapeFact {
    if (
      isCsharpJsValueTargetType(shape.targetType) ||
      shape.targetType.kind === "type-parameter"
    ) {
      return shape;
    }
    if (shape.declarationTemplate !== undefined) {
      shape = { ...shape, declarationTemplate: rememberTargetShape(shape.declarationTemplate) };
    }
    shape = retainCsharpMethodValueContracts(shape, rememberTargetShape, environment, host.sourceStorage);
    const key = targetTypeRefKey(shape.targetType);
    const existing = targetShapes.get(key);
    if (existing !== undefined && !csharpObjectShapesEqual(existing, shape)) {
      const existingContract = csharpObjectShapeContractKey(existing);
      const incomingContract = csharpObjectShapeContractKey(shape);
      let offset = 0;
      while (offset < existingContract.length && offset < incomingContract.length &&
        existingContract[offset] === incomingContract[offset]) {
        offset += 1;
      }
      const start = Math.max(0, offset - 64);
      const end = offset + 96;
      failTargetAnalysisInvariant("tsonic-csharp",
        `C# object-shape target '${key}' resolved to contradictory structural contracts. ` +
        `Canonical contract offset ${offset}; existing length ${existingContract.length}, ` +
        `excerpt ${JSON.stringify(existingContract.slice(start, end))}; ` +
        `incoming length ${incomingContract.length}, excerpt ${JSON.stringify(incomingContract.slice(start, end))}.`);
    }
    const canonical = existing === undefined
      ? shape
      : mergeCsharpObjectShapeSubjects(existing, shape);
    targetShapes.set(key, canonical);
    if (canonical.targetType.kind === "target-named" &&
      (canonical.targetType.typeArguments?.length ?? 0) > 0 &&
      canonical.targetType.typeArguments!.every(argument => argument.kind === "type-parameter")) {
      const existingTemplate = genericShapes.get(canonical.targetType.id);
      if (existingTemplate?.targetType.kind === "target-named") {
        const instantiated = instantiateCsharpObjectShape(existingTemplate, canonical.targetType);
        if (instantiated === undefined || !csharpObjectShapesEqual(instantiated, canonical)) {
          failTargetAnalysisInvariant("tsonic-csharp", "C# structural generic template resolved to contradictory contracts.");
        }
      } else {
        genericShapes.set(canonical.targetType.id, canonical);
      }
    }
    return shape;
  }

  function resolveStructShape(
    node: Node,
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
  ): CsharpObjectShapeFact | undefined {
    const parent = host.ast.parent(node);
    const declaration = host.ast.is.IsVariableDeclaration(node) ? node
      : parent !== undefined && host.ast.is.IsVariableDeclaration(parent) &&
        Node_Initializer(host.ast, parent) === node ? parent : undefined;
    const definition = host.projectTypeCatalog.definitionForDeclaration(declaration);
    if (definition?.kind !== "struct") return undefined;
    for (const subject of sourceSubjects(node, queries)) {
      const fact = readCsharpSourceStruct(host.sourceFacts, subject);
      if (fact === undefined) {
        continue;
      }
      const targetType = host.projectTypeCatalog.targetTypeForDeclaration(definition.declaration, []);
      if (targetType === undefined) {
        return undefined;
      }
      const selectedType = queries.types.expressionType(definition.declaration) ?? queries.types.authoredType(definition.declaration);
      if (selectedType === undefined) return undefined;
      const selectedMembers = deriveMembers(selectedType, queries, state);
      const initializer = Node_Initializer(host.ast, definition.declaration);
      const shapeNode = initializer === undefined || readCsharpSourceStruct(host.sourceFacts, initializer) === undefined
        ? undefined : host.ast.arguments(initializer)[0];
      const shapeType = shapeNode === undefined ? undefined : queries.types.expressionType(shapeNode);
      const correspondence = selectedType === undefined || shapeType === undefined
        ? undefined : queries.types.structuralMembers(shapeType, selectedType, "correspondence");
      if (correspondence?.kind !== "available") return undefined;
      const members = fact.fields.map((field) => {
        const type = host.typeResolver.resolveNode(
          field.sourceType,
          queries.sourceFile,
          nextState(state),
        );
        const sourceType = queries.types.authoredType(field.sourceType);
        const sourceMembers = correspondence.members.filter(member => member.kind === "present" &&
          readCsharpSourceField(host.sourceFacts, [member.source.property.symbol,
            ...member.source.declarations])?.sourceType === field.sourceType);
        const destination = sourceMembers.length === 1 ? sourceMembers[0]!.destination : undefined;
        const subjects: readonly ExtensionFactSubject[] = destination === undefined
          ? [] : [destination.property.symbol, ...destination.declarations];
        const selected = selectedMembers?.filter(member =>
          member.sourceSubjects?.some(subject => subjects.includes(subject)) === true);
        const selectedMember = selected?.length === 1 ? selected[0] : undefined;
        const targetName = objectShapeMemberTargetName(field.sourceName);
        return type === undefined || selectedMember === undefined || targetName === undefined
          ? undefined
          : {
              sourceKey: csharpPropertySourceMemberKey(field.sourceName),
              sourceName: field.sourceName,
              sourceSubjects: [field.sourceType, ...(selectedMember?.sourceSubjects ?? [])],
              ...(selectedMember?.sourceDeclarations === undefined ? {} : { sourceDeclarations: selectedMember.sourceDeclarations }),
              ...(selectedMember.sourceMemberEvidence === undefined ? {} : { sourceMemberEvidence: selectedMember.sourceMemberEvidence }),
              ...(selectedMember?.bound === true ? { bound: true as const } : {}),
              ...(sourceType === undefined
                ? {}
                : { sourceTypes: [sourceType] }),
              targetName,
              memberKind: "property" as const,
              type,
              ...(field.readonly ? { readonly: true } : {}),
            };
      });
      return members.some((member) => member === undefined)
        ? undefined
        : {
            targetType,
            sourceType: selectedType,
            members: members as readonly CsharpObjectShapeMemberFact[],
            constructible: true,
          };
    }
    return undefined;
  }

  function resolveSemanticShape(
    type: Type | undefined,
    node: Node | undefined,
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
    selectedTarget?: TargetTypeRef,
    authoredTypeRoot?: Node,
  ): CsharpObjectShapeFact | undefined {
    if (
      type === undefined ||
      activeTypes.has(type) ||
      requiresUnresolvedStructuralProjection(type, node, queries, host) ||
      typeIsExcludedFromObjectShape(type, queries, host)
    ) {
      return undefined;
    }
    activeTypes.add(type);
    try {
      const transformation = queries.types.standardTransformation(authoredTypeRoot, type);
      if (transformation?.kind === "component") {
        const component = transformation.component;
        const native = resolveTypeWithState(component.selectedType, queries.sourceFile,
          component.authoredTypeNode, nextState(state));
        const members = native?.sourceType === undefined ? undefined
          : instantiateMemberEvidence(native.members, type, queries, native.sourceType);
        return native === undefined || members === undefined ? undefined : { ...native, sourceType: type, members };
      }
      const selectedType = selectedTarget ?? (authoredTypeRoot === undefined
        ? host.typeResolver.resolveType(
          type,
          queries.sourceFile,
          nextState(state),
        )
        : host.typeResolver.resolveSelectedType(authoredTypeRoot, type, queries.sourceFile, nextState(state)));
      const targetType = selectedType === undefined
        ? undefined
        : getCsharpNullableElementTargetType(selectedType) ?? selectedType;
      const providerShape = resolveProviderObjectLiteralShape({
        type,
        queries,
        state,
        selectedTarget: targetType,
        authoredTypeRoot,
        host,
        resolvePropertyType,
      });
      if (providerShape !== undefined) {
        const members = retainMemberDeclarationEvidence(providerShape.members, type, queries);
        return members === undefined ? undefined : { ...providerShape, members };
      }
      const contextualProjectType = targetType !== undefined &&
          isProjectSourceTargetType(targetType)
        ? targetType
        : undefined;
      const objectLiteral = node !== undefined &&
        host.ast.is.IsObjectLiteralExpression(node);
      const declaredKind = contextualProjectType?.csharpSourceDeclarationKind;
      if (declaredKind === "struct" && contextualProjectType !== undefined) {
        const definition = host.projectTypeCatalog.definitionForTarget(contextualProjectType);
        const shape = definition?.kind === "struct"
          ? resolveStructShape(definition.declaration, host.semantics(definition.sourceFile), nextState(state)) : undefined;
        return shape !== undefined && targetTypeRefEquals(shape.targetType, contextualProjectType) ? shape : undefined;
      }
      if (!typeHasProjectOwnedShapeDeclaration(type, node ?? authoredTypeRoot, queries, host)) {
        return undefined;
      }
      if (declaredKind === "enum") {
        return undefined;
      }
      if (declaredKind === "class" && contextualProjectType !== undefined &&
        queries.types.constructSignatures(type).length > 0) {
        const definition = host.projectTypeCatalog.definitionForTarget(contextualProjectType);
        const instance = definition === undefined ? undefined
          : queries.declarations.declaredType(definition.declaration);
        if (instance === undefined || instance === type) return undefined;
        return resolveSemanticShape(instance, undefined, queries, nextState(state), contextualProjectType);
      }
      const declaredShape = contextualProjectType !== undefined && declaredKind === "class"
        ? resolveProjectDeclarationShape(contextualProjectType, state) : undefined;
      if (declaredKind === "class" && declaredShape === undefined) return undefined;
      const members = declaredShape === undefined
        ? deriveMembers(type, queries, nextState(state), authoredTypeRoot, contextualProjectType)
        : instantiateMemberEvidence(declaredShape.members, type, queries, declaredShape.sourceType);
      if (members === undefined) {
        return undefined;
      }
      if (
        contextualProjectType !== undefined &&
        declaredKind === "class"
      ) {
        return {
              ...declaredShape!,
              sourceType: type,
              members,
            };
      }
      if (
        contextualProjectType !== undefined &&
        declaredKind === "interface" &&
        !objectLiteral
      ) {
        const declared = resolveProjectInterfaceShape(
          contextualProjectType,
          state,
        );
        if (declared === undefined) return {
          targetType: contextualProjectType,
          sourceType: type,
          members,
        };
        const instantiatedMembers = instantiateMemberEvidence(declared.members, type, queries, declared.sourceType);
        return instantiatedMembers === undefined ? undefined : { ...declared, sourceType: type, members: instantiatedMembers };
      }
      const implemented = contextualProjectType !== undefined &&
          declaredKind === "interface"
        ? [contextualProjectType]
        : undefined;
      const symbol = queries.declarations.typeSymbol(type);
      const literals = symbol === undefined ? [] : queries.declarations.symbolDeclarations(symbol)
        .filter(declaration => host.ast.is.IsObjectLiteralExpression(declaration));
      const authoredLiteral = objectLiteral ? node : literals.length === 1 ? literals[0] : undefined;
      const structuralContract = !objectLiteral && !members.some(member => member.bound === true) &&
        (queries.types.isIntersection(type) || symbol !== undefined &&
          queries.declarations.symbolDeclarations(symbol).some(declaration =>
            host.ast.is.IsTypeLiteralNode(declaration) || host.ast.is.IsMappedTypeNode(declaration)));
      const methodImplementation = structuralContract ? undefined : selectCsharpObjectMethodImplementation(members, host, state, authoredLiteral);
      const shape: CsharpObjectShapeFact = {
        targetType: unionDefinitions.reference(type) ?? createStructuralObjectShapeTarget(members, implemented, environment, structuralContract, methodImplementation),
        sourceType: type,
        members: unionDefinitions.substituteMembers(type, members),
        ...(methodImplementation === undefined ? {} : { methodImplementation }),
        ...(implemented === undefined ? {} : { implements: implemented }),
      };
      if (authoredLiteral !== undefined) {
        const selected = resolveObjectLiteralTargetShape(shape, authoredLiteral, queries.sourceFile);
        if (selected.kind !== "resolved") return undefined;
        const members = instantiateMemberEvidence(selected.shape.members, type, queries, selected.shape.sourceType);
        return members === undefined ? undefined : { ...selected.shape, sourceType: type, members };
      }
      return structuralContract && unionDefinitions.reference(type) === undefined &&
        !host.representations.requiresClosedStructuralContract(shape.targetType)
        ? parameterizeCsharpStructuralContract(shape, environment) : shape;
    } finally {
      activeTypes.delete(type);
    }
  }

  function resolveProjectInterfaceShape(
    targetType: CsharpTargetNamedTypeRef,
    state: CsharpTypeResolutionState,
  ): CsharpObjectShapeFact | undefined {
    return resolveProjectDeclarationShape(targetType, state);
  }

  function nativeProjectOwner(type: CsharpTargetNamedTypeRef): CsharpTargetNamedTypeRef | undefined {
    const definition = host.projectTypeCatalog.definitionForTarget(type);
    if (definition?.kind !== "class" && definition?.kind !== "interface" || type.typeArguments === undefined) return type;
    const arguments_ = type.typeArguments.map(argument => {
      if (argument.kind !== "type-parameter") return argument;
      const constraints = environment(argument);
      return constraints.kind === "resolved" ? Object.freeze({ ...argument, csharpConstraints: constraints }) : undefined;
    });
    return arguments_.some(argument => argument === undefined) ? undefined
      : { ...type, typeArguments: Object.freeze(arguments_ as readonly TargetTypeRef[]) };
  }

  function resolveProjectDeclarationShape(
    targetType: CsharpTargetNamedTypeRef,
    state: CsharpTypeResolutionState,
  ): CsharpObjectShapeFact | undefined {
    const definition = host.projectTypeCatalog.definitionForTarget(targetType);
    const typeArguments = targetType.typeArguments ?? [];
    if (
      (definition?.kind !== "interface" && definition?.kind !== "class") ||
      typeArguments.length !== definition.typeParameterBindings.length
    ) {
      return undefined;
    }
    state = csharpSourceTemplateState([...definition.outerTypeParameters, ...definition.typeParameters], state);
    const owner = nativeProjectOwner(targetType);
    if (owner === undefined) return undefined;
    targetType = owner;
    const declarationType = host.projectTypeCatalog.targetTypeForDeclaration(
      definition.declaration,
      definition.typeParameterBindings,
    );
    if (declarationType === undefined) return undefined;
    if (!targetTypeRefEquals(declarationType, targetType)) {
      const existing = resolveTarget(declarationType);
      const declared = existing ?? resolveProjectDeclarationShape(declarationType, nextState(state));
      return declared === undefined ? undefined
        : instantiateCsharpObjectShape(rememberTargetShape(declared), targetType);
    }
    const queries = host.semantics(definition.sourceFile);
    const declaredType = queries.declarations.declaredType(
      definition.declaration,
    );
    if (declaredType === undefined) {
      return undefined;
    }
    const declaredMembers = deriveMembers(
      declaredType,
      queries,
      nextState(state),
      host.ast.typeNode(definition.declaration),
      targetType,
    );
    if (declaredMembers === undefined) {
      return undefined;
    }
    const substitutions = new Map(
      definition.typeParameterBindings.map((parameter, index) => [
        parameter.identity,
        targetType.typeArguments![index]!,
      ]),
    );
    const implemented = definition.kind === "interface" ? host.projectTypes().directSupertypes(targetType) : [];
    if (implemented === undefined) return undefined;
    const members: CsharpObjectShapeMemberFact[] = [];
    for (const declared of declaredMembers) {
      let member = substituteObjectShapeMemberTargetTypeParameters(declared, substitutions);
      if (member.memberKind === "method") {
        const owners = new Map((member.sourceDeclarations ?? []).flatMap(declaration => {
          const owner = host.projectTypeCatalog.definitionForDeclaration(host.ast.parent(declaration));
          return owner === undefined ? [] : [[owner.id, owner] as const];
        }));
        if (owners.size > 1) return undefined;
        const owner = owners.values().next().value;
        if (owner !== undefined && owner.id !== definition.id) {
          const ownerType = host.projectTypeCatalog.targetTypeForDeclaration(owner.declaration, owner.typeParameterBindings);
          const selectedOwner = ownerType === undefined ? undefined
            : host.projectTypes().instantiateDeclarationType(owner.declaration, targetType, ownerType);
          if (selectedOwner?.kind !== "resolved" || selectedOwner.type.kind !== "target-named") return undefined;
          const existing = resolveTarget(selectedOwner.type);
          const inherited = existing ?? resolveProjectDeclarationShape(selectedOwner.type, nextState(state));
          if (inherited === undefined) return undefined;
          const completed = rememberTargetShape(inherited);
          const selected = resolveCsharpObjectShapeMemberBySelectedSubject(completed,
            [...member.sourceSubjects ?? [], ...member.sourceDeclarations ?? []]);
          if (selected.kind !== "resolved" || selected.member.memberKind !== "method") return undefined;
          member = Object.freeze({ ...selected.member,
            sourceSubjects: Object.freeze([...new Set([...selected.member.sourceSubjects ?? [], ...member.sourceSubjects ?? []])]),
            sourceMemberEvidence: Object.freeze([...new Set([
              ...selected.member.sourceMemberEvidence ?? [], ...member.sourceMemberEvidence ?? [],
            ])]),
            ...(member.sourceTypes === undefined ? {} : { sourceTypes: member.sourceTypes }),
          });
        }
      }
      members.push(member);
    }
    return {
      targetType,
      sourceType: declaredType,
      members: Object.freeze(members),
      ...(definition.kind !== "class" ? {} : {
        constructible: projectClassIsObjectInitializable(declaredType, queries, host),
      }),
      ...(implemented.length === 0 ? {} : { implements: implemented }),
    };

  }

  function resolveTypeMember(
    type: Type | undefined,
    sourceFile: SourceFile,
    sourceKey: CsharpSourceMemberKey,
  ): CsharpObjectShapeMemberFact | undefined {
    if (type === undefined || activeTypes.has(type)) {
      return undefined;
    }
    const queries = host.semantics(sourceFile);
    activeTypes.add(type);
    try {
      const members = deriveMembers(type, queries, { depth: 0 });
      const matches = members?.filter((member) =>
        csharpSourceMemberKeysEqual(member.sourceKey, sourceKey)
      ) ?? [];
      return matches.length === 1 ? matches[0] : undefined;
    } finally {
      activeTypes.delete(type);
    }
  }

  return Object.freeze({
    resolveNativeParameter,
    resolveNativeReturn,
    retainConstructionSource(node: Node, type: Type, shape: CsharpObjectShapeFact, sourceFile: SourceFile): CsharpObjectShapeFact | undefined {
      const queries = host.semantics(sourceFile);
      const members = instantiateMemberEvidence(shape.members, type, queries, shape.sourceType);
      return members === undefined ? undefined : remember(node, { ...shape, sourceType: type, members });
    },
    resolveCallableValue: (signature: TargetTypeRef, typeParameters: NonNullable<CsharpObjectShapeMemberFact["typeParameters"]>) =>
      retainCsharpGenericCallableValue(signature, typeParameters, rememberTargetShape, environment),
    resolveCopyShape(shape: CsharpObjectShapeFact, source?: CsharpObjectShapeFact): CsharpObjectShapeFact | undefined {
      return resolveCsharpCopiedObjectShape(shape, host.ast, environment, resolveNode, rememberTargetShape, host.sourceStorage, source);
    },
    resolveReference: unionDefinitions.reference,
    resolveUnion: unionDefinitions.resolve,
    resolveNode,
    resolveNodeWithState,
    resolveTarget,
    resolveType,
    resolveTypeMember,
    resolveTypeWithState,
    resolveObjectLiteralTargetShape,
    resolveProjectConstructibleSelectedType,
  });
}
