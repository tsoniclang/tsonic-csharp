import { createCsharpObjectShapeMemberResolver } from "./member-evidence.js";
import { createStructuralObjectShapeTarget, mergeCsharpObjectShapeSubjects } from "./construction.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { csharpObjectShapesEqual } from "../../../target-model/types/object-shape-equality.js";
import { csharpObjectShapeContractKey } from "../../../target-model/types/object-shape-identity.js";
import { completeSelectedObjectShapeSource, isCsharpNativeSourceProfileMemberDeclaration, isProjectSourceTargetType } from "./source-evidence.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../target-model/types/equality.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpRuntimeUnionTargetTypeRef, CsharpSourceMemberKey, CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";
import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type { CsharpTypeResolutionState } from "../../source-evidence/types/resolution/model.js";
import { nextState } from "../../source-evidence/types/resolution/state.js";
import { isCsharpJsValueTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { csharpSourceMemberKeysEqual } from "../../../target-model/types/source-member-keys.js";
import { resolveProviderObjectLiteralShape } from "./provider-construction.js";
import { createCsharpStructuralUnionDefinitions } from "./union-definitions.js";
import { selectCsharpObjectMethodImplementation } from "./method-implementations.js";

import { resolveCsharpCopiedObjectShape, retainCsharpMethodValueContracts } from "./method-values.js";

import { parameterizeCsharpStructuralContract } from "./structural-contracts.js";

import { retainCsharpGenericCallableValue } from "../../callables/generics/generic-values.js";

import type { CsharpObjectShapePolicyHost, CsharpRecursiveObjectShapePolicy } from "./model.js";

import { instantiateCsharpObjectShape } from "../../../policy/types/objects/instantiation.js";

import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { createCsharpLiteralShapeResolver } from "./literal-construction.js";
import { createCsharpProjectShapeProjection } from "./project-construction.js";
import { createCsharpNativeShapeProjections } from "./native-projections.js";
import { createCsharpObjectShapeSourceFormation, type CsharpObjectShapeTypeSource } from "./type-source.js";
import { formCsharpObjectShapeNodeSource } from "./node-source.js";
import { createCsharpProjectDeclarationApplications } from "./project-declaration-application.js";
import { completeCsharpStructShapeSource, type CsharpStructShapeSource } from "./struct-source.js";
import { formInstantiatedObjectShapeSource } from "./shape-source.js";

export function createCsharpObjectShapePolicy(
  host: CsharpObjectShapePolicyHost,
): CsharpRecursiveObjectShapePolicy {
  const environment = host.typeParameterConstraints;
  const { collectMembers, memberInheritance, completeMember, completeMembers, completeSourceMembers,
    instantiateMemberEvidence, retainMemberDeclarationEvidence,
    retainLiteralMemberEvidence } = createCsharpObjectShapeMemberResolver(host);
  const formation = createCsharpObjectShapeSourceFormation(host, collectMembers);
  const activeNodes = new WeakSet<object>();
  const activeTypes = new WeakSet<object>();
  const nodeShapes = new WeakMap<object, CsharpObjectShapeFact>();
  const targetShapes = new Map<string, CsharpObjectShapeFact>();
  const genericShapes = new Map<string, CsharpObjectShapeFact>();
  const declarationApplications = createCsharpProjectDeclarationApplications(host, formation, completeSourceMembers, rememberTargetShape);
  const unionDefinitions = createCsharpStructuralUnionDefinitions(host, (type, file, state) =>
    resolveTypeWithState(type, file, undefined, state), environment);

  const { resolveNativeParameter, resolveNativeReturn } = createCsharpNativeShapeProjections(host,
    { resolveTarget, resolveProjectInterfaceShape, rememberTargetShape });

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
      const input = formCsharpObjectShapeNodeSource(host, formation, node, queries, state);
      if (input === undefined) return undefined;
      const directStruct = resolveStructShape(input.struct);
      if (directStruct !== undefined) {
        remember(node, directStruct);
        return directStruct;
      }
      const source = completeSelectedObjectShapeSource(input.selection, input.selection.contextual === undefined ? undefined
        : { dependency: input.selection.contextual,
            targetType: host.completeAuthoredSelection(input.selection.contextual.selection) });
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
      const semantic = source.origin === "contextual" ? input.contextual : input.semantic;
      const shape = semantic === undefined ? undefined
        : resolveSemanticShape(semantic, source.contextualTarget ?? selectedTarget);
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
    if (activeTypes.has(type)) return undefined;
    const queries = host.semantics(sourceFile);
    const source = formation.formTypeSource(type, authoredLiteral, queries, state,
      authoredLiteral === undefined ? authoredTypeRoot : undefined, host.projectSemanticSource(type, queries, state));
    const shape = source === undefined ? undefined : resolveSemanticShape(source);
    return shape === undefined ? undefined : rememberTargetShape(shape);
  }

  const resolveObjectLiteralTargetShape = createCsharpLiteralShapeResolver(host, { resolveNode, retainLiteralMemberEvidence, instantiateMemberEvidence, rememberTargetShape });
  const projectConstruction = createCsharpProjectShapeProjection(host, { collectMembers, completeSourceMembers });

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
    if (shape.members.some(member => member.sourceDeclarations?.some(declaration =>
      isCsharpNativeSourceProfileMemberDeclaration(declaration, host.ast)) === true)) {
      failTargetAnalysisInvariant("tsonic-csharp", "A physical object-shape member cannot be owned by a native-mapped source-profile declaration.");
    }
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
    source: CsharpStructShapeSource | undefined,
  ): CsharpObjectShapeFact | undefined {
    return source === undefined ? undefined : completeCsharpStructShapeSource(host, source, completeSourceMembers);
  }

  function resolveSemanticShape(
    input: CsharpObjectShapeTypeSource,
    selectedTarget?: TargetTypeRef,
  ): CsharpObjectShapeFact | undefined {
    const { type, queries, state, authoredTypeRoot } = input;
    if (activeTypes.has(type)) return undefined;
    activeTypes.add(type);
    try {
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
      let providerShape: CsharpObjectShapeFact | undefined;
      if (input.provider !== undefined) {
        const completion = resolveProviderObjectLiteralShape(input.provider, targetType);
        let step = completion.next();
        while (!step.done) {
          const dependency = step.value;
          step = completion.next({ ...dependency,
            type: host.typeResolver.resolveStructuralPropertyType(dependency.application) });
        }
        providerShape = step.value;
      }
      if (providerShape !== undefined) {
        const members = input.providerShape === undefined ? undefined
          : retainMemberDeclarationEvidence(providerShape.members, input.providerShape.members.map(member => member.proof));
        return members === undefined ? undefined : { ...providerShape, members };
      }
      const contextualProjectType = targetType !== undefined &&
          isProjectSourceTargetType(targetType)
        ? targetType
        : undefined;
      const objectLiteral = input.objectLiteral;
      const declaredKind = contextualProjectType?.csharpSourceDeclarationKind;
      if (declaredKind === "struct" && contextualProjectType !== undefined) {
        const project = input.projects.find(project => project.definition.id === contextualProjectType.id);
        const shape = resolveStructShape(project?.struct);
        return shape !== undefined && targetTypeRefEquals(shape.targetType, contextualProjectType) ? shape : undefined;
      }
      if (!input.projectOwned) {
        return undefined;
      }
      if (declaredKind === "enum") {
        return undefined;
      }
      const application = contextualProjectType !== undefined && (declaredKind === "class" || declaredKind === "interface")
        ? declarationApplications.formDeclarationApplication(contextualProjectType, state) : undefined;
      const instantiated = application === undefined ? undefined
        : formInstantiatedObjectShapeSource(application.source, type, queries);
      const declaredShape = declaredKind === "class" && application !== undefined
        ? declarationApplications.completeDeclarationApplication(application) : undefined;
      if (declaredKind === "class" && declaredShape === undefined) return undefined;
      const members = declaredShape === undefined
        ? input.members === undefined ? undefined : completeSourceMembers(input.members, contextualProjectType)
        : instantiated === undefined ? undefined : instantiateMemberEvidence(declaredShape.members, instantiated.instantiation);
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
        const declared = application === undefined ? undefined : declarationApplications.completeDeclarationApplication(application);
        if (declared === undefined) return {
          targetType: contextualProjectType,
          sourceType: type,
          members,
        };
        const instantiatedMembers = instantiated === undefined ? undefined : instantiateMemberEvidence(declared.members, instantiated.instantiation);
        return instantiatedMembers === undefined ? undefined : { ...declared, sourceType: type, members: instantiatedMembers };
      }
      const implemented = contextualProjectType !== undefined &&
          declaredKind === "interface"
        ? [contextualProjectType]
        : undefined;
      const authoredLiteral = input.literal?.objectLiteral;
      const structuralContract = input.structuralContract && !members.some(member => member.bound === true);
      const methodImplementation = structuralContract ? undefined : selectCsharpObjectMethodImplementation(input.implementation,
        members.map(member => member.targetName), input.implementationCaptures.map(request =>
          host.typeResolver.resolveNode(request.node, request.sourceFile, request.state)));
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
    return declarationApplications.nativeOwner(type);
  }

  function resolveProjectDeclarationShape(
    targetType: CsharpTargetNamedTypeRef,
    state: CsharpTypeResolutionState,
  ): CsharpObjectShapeFact | undefined {
    const source = declarationApplications.formDeclarationApplication(targetType, state);
    return source === undefined ? undefined : declarationApplications.completeDeclarationApplication(source);
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
      const collection = collectMembers(type, queries, Object.freeze({ depth: 0 }));
      const source = collection === undefined ? undefined : host.structuralTypeApplication(collection);
      const members = source === undefined ? undefined : completeSourceMembers(source, undefined);
      const matches = members?.filter((member) =>
        csharpSourceMemberKeysEqual(member.sourceKey, sourceKey)
      ) ?? [];
      return matches.length === 1 ? matches[0] : undefined;
    } finally {
      activeTypes.delete(type);
    }
  }

  return Object.freeze({
    collectMembers,
    memberInheritance,
    completeMember,
    completeMembers,
    completeSourceMembers,
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
    formProjectConstructionSource: projectConstruction.formSource,
    completeProjectConstructionSource: projectConstruction.completeSource,
    resolveProjectConstructibleSelectedType: projectConstruction.resolve,
  });
}
