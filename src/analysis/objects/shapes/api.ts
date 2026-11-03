import { createCsharpObjectShapeMemberResolver } from "./member-evidence.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { csharpObjectShapesEqual } from "../../../target-model/types/object-shape-equality.js";
import { csharpObjectShapeContractKey } from "../../../target-model/types/object-shape-identity.js";
import { completeSelectedObjectShapeSource, isCsharpNativeSourceProfileMemberDeclaration, isProjectSourceTargetType } from "./source-evidence.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../target-model/types/equality.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpRuntimeUnionTargetTypeRef, CsharpSourceMemberKey, CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";
import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpTypeResolutionState } from "../../source-evidence/types/resolution/model.js";
import { nextState } from "../../source-evidence/types/resolution/state.js";
import { isCsharpJsValueTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { csharpSourceMemberKeysEqual } from "../../../target-model/types/source-member-keys.js";
import { resolveProviderObjectLiteralShape } from "./provider-construction.js";
import { createCsharpStructuralUnionDefinitions } from "./union-definitions.js";
import { selectCsharpObjectMethodImplementation } from "./method-implementations.js";

import { resolveCsharpCopiedObjectShape, retainCsharpMethodValueContracts,
  type CsharpObjectShapeTargetInput } from "./method-values.js";

import { parameterizeCsharpStructuralContract } from "./structural-contracts.js";

import { retainCsharpGenericCallableValue } from "../../callables/generics/generic-values.js";

import type { CsharpObjectShapePolicyHost, CsharpRecursiveObjectShapePolicy } from "./model.js";

import { completeCsharpObjectShapeInstantiation, formCsharpObjectShapeInstantiationHeader,
  instantiateCsharpObjectShape } from "../../../policy/types/objects/instantiation.js";

import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { createCsharpLiteralShapeResolver } from "./literal-construction.js";
import { createCsharpProjectShapeProjection } from "./project-construction.js";
import { createCsharpNativeShapeProjections } from "./native-projections.js";
import { createCsharpObjectShapeSourceFormation, type CsharpObjectShapeTypeSource } from "./type-source.js";
import { formCsharpObjectShapeNodeSource } from "./node-source.js";
import { createCsharpProjectDeclarationApplications } from "./project-declaration-application.js";
import { completeCsharpStructShapeSource, type CsharpStructShapeSource } from "./struct-source.js";
import type { CsharpStructuralNodeSourceInput, CsharpStructuralTypeSourceInput } from "../../source-evidence/types/resolution/root-sources.js";
import { completeCsharpObjectShapePublication, formCsharpObjectShapePublication,
  formCsharpObjectShapePublicationSource, formCsharpObjectShapeTargetSource,
  type CsharpObjectShapePublication, type CsharpObjectShapeTargetSelection,
  type CsharpObjectShapeTargetSource } from "./publication.js";
import { completeCsharpObjectShapeOwnerHeader, formCsharpObjectShapeHeader } from "../../../target-model/types/object-shape-header.js";
import { formCsharpObjectShapeProofRows, requireCsharpObjectShapeProofRows } from "./construction.js";
import type { CsharpNativeConstructionRetention } from "../native-construction-source.js";

export function createCsharpObjectShapePolicy(
  host: CsharpObjectShapePolicyHost,
): CsharpRecursiveObjectShapePolicy {
  const environment = host.typeParameterConstraints;
  const { formMembersSource, collectMembers, memberInheritance, completeMembers, formSourceMembersHeader, completeSourceMembers,
    instantiateMemberEvidence, retainMemberDeclarationEvidence,
    retainLiteralMemberEvidence } = createCsharpObjectShapeMemberResolver(host);
  const formation = createCsharpObjectShapeSourceFormation(host, { collectMembers, formMembersSource });
  const activeNodes = new WeakSet<object>();
  const activeTypes = new WeakSet<object>();
  const nodeShapes = new WeakMap<object, CsharpObjectShapeFact>();
  const targetShapes = new Map<string, CsharpObjectShapePublication>();
  const genericShapes = new Map<string, CsharpObjectShapePublication>();
  const declarationApplications = createCsharpProjectDeclarationApplications(host, formation,
    { formSourceMembersHeader, completeSourceMembers }, { formTargetShape, rememberTargetShape });
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
    const queries = sourceFile === undefined ? host.semanticsFor(node) : host.semantics(sourceFile);
    return completeNodeSource(Object.freeze({ node, queries, state, source: formNodeSource(node, queries, state) }));
  }

  function formNodeSource(node: Node, queries: SourceFileSemantics, state: CsharpTypeResolutionState) {
    return formCsharpObjectShapeNodeSource(host, formation, node, queries, state);
  }

  function completeNodeSource(request: CsharpStructuralNodeSourceInput): CsharpObjectShapeFact | undefined {
    const { node, queries, state, source: input } = request;
    if (input === undefined) return undefined;
    if (input.node !== node || input.queries !== queries || input.state !== state) {
      return failTargetAnalysisInvariant("tsonic-csharp", "Shape completion requires its exact original node source occurrence.", node);
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
      const directStruct = resolveStructShape(input.struct);
      if (directStruct !== undefined) {
        remember(node, directStruct);
        return directStruct;
      }
      const source = completeSelectedObjectShapeSource(input.selection, input.selection.contextual === undefined ? undefined
        : { dependency: input.selection.contextual,
            targetType: host.completeAuthoredSelection(input.selection.contextual.selection) });
      const selectedTarget = input.classDeclaration
        ? host.typeResolver.resolveType(source.type, queries.sourceFile, input.nativeState)
        : host.typeResolver.resolveNode(node, queries.sourceFile, input.nativeState);
      const header = resolveTargetSelection(selectedTarget);
      const actualType = header === undefined || source.type === undefined ||
        input.objectLiteral && header.header.contract.constructible !== true
        ? undefined : input.objectLiteral ? input.selection.type : source.type;
      const selectedSource = header === undefined ? undefined : formCsharpObjectShapeTargetSource(header, actualType, queries);
      const selectedShape = selectedSource === undefined ? undefined : completeTargetSelection(selectedSource);
      if (selectedShape !== undefined && selectedSource?.instantiation !== undefined) {
        const members = instantiateMemberEvidence(selectedShape.members, selectedSource.instantiation);
        if (members !== undefined) {
          const { targetType, ...selected } = selectedShape;
          const completed = formTargetShape({ ...selected, sourceType: actualType, members,
            target: Object.freeze({ kind: "existing", type: targetType }) });
          return state.sourceBindings === undefined ? remember(node, completed) : rememberTargetShape(completed);
        }
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
    const header = resolveTargetSelection(type);
    return header === undefined ? undefined : completeTargetSelection(formCsharpObjectShapeTargetSource(header, undefined, undefined));
  }

  function completeTargetSelection(source: CsharpObjectShapeTargetSource): CsharpObjectShapeFact {
    const complete = (selection: CsharpObjectShapeTargetSelection): CsharpObjectShapeFact => {
      if (selection.kind === "nullable") return complete(selection.selection);
      if (selection.kind === "canonical") return selection.publication.shape;
      if (selection.kind === "attached") return selection.shapes[selection.index]!;
      const { targetType, ...shape } = completeCsharpObjectShapeInstantiation(selection.instantiation, selection.template.shape);
      return rememberTargetShape(formTargetShape({ ...shape, target: Object.freeze({ kind: "existing", type: targetType }) }));
    };
    const shape = complete(source.selection);
    requireCsharpObjectShapeProofRows(source.rows, shape);
    return shape;
  }

  function resolveTargetSelection(type: TargetTypeRef | undefined): CsharpObjectShapeTargetSelection | undefined {
    if (type === undefined) {
      return undefined;
    }
    const nullableElement = getCsharpNullableElementTargetType(type);
    if (nullableElement !== undefined) {
      const selection = resolveTargetSelection(nullableElement);
      return selection === undefined ? undefined : Object.freeze({ kind: "nullable", type, selection, header: selection.header });
    }
    const direct = targetShapes.get(targetTypeRefKey(type));
    if (direct !== undefined) {
      return Object.freeze({ kind: "canonical", type, publication: direct, header: direct.header });
    }
    if (type.kind !== "target-named") {
      return undefined;
    }
    const template = genericShapes.get(type.id);
    if (template !== undefined) {
      const owner = completeCsharpObjectShapeOwnerHeader(type,
        type.csharpSourceDeclarationKind === "class" || type.csharpSourceDeclarationKind === "interface", environment);
      if (owner === undefined) return undefined;
      const instantiation = formCsharpObjectShapeInstantiationHeader(template.header, owner);
      if (instantiation !== undefined) return Object.freeze({ kind: "template", type, template, owner,
        instantiation, header: instantiation.header });
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
    return present.length === 1 ? Object.freeze({ kind: "attached", type, shapes,
      index: shapes.indexOf(present[0]!), header: formCsharpObjectShapeHeader(present[0]!) }) : undefined;
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
    const queries = host.semantics(sourceFile);
    return completeTypeSource(Object.freeze({ type, queries, state, authoredTypeRoot,
      source: formTypeSource(type, queries, state, authoredTypeRoot) }));
  }

  function formTypeSource(type: Type, queries: SourceFileSemantics, state: CsharpTypeResolutionState,
    authoredTypeRoot?: Node): CsharpObjectShapeTypeSource | undefined {
    const authoredLiteral = authoredTypeRoot !== undefined && host.ast.is.IsObjectLiteralExpression(authoredTypeRoot)
      ? authoredTypeRoot : undefined;
    if (authoredLiteral !== undefined) {
      const literalQueries = host.semanticsFor(authoredLiteral);
      const expressionType = literalQueries.types.expressionType(authoredLiteral);
      if (expressionType === undefined || !literalQueries.types.isIdentical(expressionType, type)) return undefined;
    }
    return formation.formTypeSource(type, authoredLiteral, queries, state, authoredTypeRoot,
      host.projectSemanticSource(type, queries, state));
  }

  function completeTypeSource(request: CsharpStructuralTypeSourceInput): CsharpObjectShapeFact | undefined {
    const { type, queries, state, authoredTypeRoot, source } = request;
    if (source !== undefined && (source.type !== type || source.queries !== queries || source.state !== state ||
      source.authoredTypeRoot !== authoredTypeRoot)) return failTargetAnalysisInvariant("tsonic-csharp",
      "Shape completion requires its exact original semantic source occurrence.", authoredTypeRoot);
    const shape = source === undefined ? undefined : resolveSemanticShape(source);
    return shape === undefined ? undefined : rememberTargetShape(shape);
  }

  const resolveObjectLiteralTargetShape = createCsharpLiteralShapeResolver(host, { resolveNode, retainLiteralMemberEvidence,
    instantiateMemberEvidence, formTargetShape, rememberTargetShape });
  const projectConstruction = createCsharpProjectShapeProjection(host,
    { collectMembers, formSourceMembersHeader, completeSourceMembers, formTargetShape });

  function formTargetShape(input: CsharpObjectShapeTargetInput): CsharpObjectShapeFact {
    return retainCsharpMethodValueContracts(input, rememberTargetShape, environment, host.sourceStorage);
  }

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
    const key = targetTypeRefKey(shape.targetType);
    const publication = targetShapes.get(key);
    const existing = publication?.shape;
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
    const header = formCsharpObjectShapePublication(formCsharpObjectShapeHeader(shape), publication?.header);
    const source = formCsharpObjectShapePublicationSource(header,
      formCsharpObjectShapeProofRows(header.incoming, shape), publication?.source.output);
    const completed = completeCsharpObjectShapePublication(source, shape, existing);
    const canonical = completed.shape;
    targetShapes.set(key, completed);
    if (canonical.targetType.kind === "target-named" &&
      (canonical.targetType.typeArguments?.length ?? 0) > 0 &&
      canonical.targetType.typeArguments!.every(argument => argument.kind === "type-parameter")) {
      const existingTemplate = genericShapes.get(canonical.targetType.id);
      if (existingTemplate?.shape.targetType.kind === "target-named") {
        const instantiated = instantiateCsharpObjectShape(existingTemplate.shape, canonical.targetType);
        if (instantiated === undefined || !csharpObjectShapesEqual(instantiated, canonical)) {
          failTargetAnalysisInvariant("tsonic-csharp", "C# structural generic template resolved to contradictory contracts.");
        }
      } else {
        genericShapes.set(canonical.targetType.id, completed);
      }
    }
    return shape;
  }

  function resolveStructShape(
    source: CsharpStructShapeSource | undefined,
  ): CsharpObjectShapeFact | undefined {
    const header = source?.members === undefined ? undefined : formSourceMembersHeader(source.members, undefined);
    return source === undefined ? undefined : completeCsharpStructShapeSource(host, source, header, completeSourceMembers);
  }

  function resolveSemanticShape(
    input: CsharpObjectShapeTypeSource,
    selectedTarget?: TargetTypeRef,
  ): CsharpObjectShapeFact | undefined {
    const { type, queries, state, selectedTypeRoot: authoredTypeRoot } = input;
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
      const projectSource = contextualProjectType === undefined ? undefined
        : input.projects.find(project => project.definition.id === contextualProjectType.id);
      const application = contextualProjectType !== undefined && (declaredKind === "class" || declaredKind === "interface") &&
          projectSource?.declared !== undefined
        ? declarationApplications.formDeclarationApplication(contextualProjectType, projectSource.declared, state) : undefined;
      const instantiated = application === undefined ? undefined : projectSource?.instantiated;
      const declaredShape = declaredKind === "class" && application !== undefined
        ? declarationApplications.completeDeclarationApplication(application) : undefined;
      if (declaredKind === "class" && declaredShape === undefined) return undefined;
      const memberHeaders = declaredShape !== undefined || input.members === undefined ? undefined
        : formSourceMembersHeader(input.members, contextualProjectType);
      const members = declaredShape === undefined
        ? memberHeaders === undefined ? undefined : completeSourceMembers(memberHeaders)
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
      const reference = unionDefinitions.reference(type);
      const shape = formTargetShape({
        target: reference === undefined ? Object.freeze({ kind: "structural", contract: structuralContract })
          : Object.freeze({ kind: "existing", type: reference }),
        sourceType: type,
        members: unionDefinitions.substituteMembers(type, members),
        ...(methodImplementation === undefined ? {} : { methodImplementation }),
        ...(implemented === undefined ? {} : { implements: implemented }),
      });
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

  function resolveProjectDeclarationShape(
    targetType: CsharpTargetNamedTypeRef,
    state: CsharpTypeResolutionState,
  ): CsharpObjectShapeFact | undefined {
    const definition = host.projectDeclarations.declarationForTarget(targetType);
    const source = definition === undefined ? undefined : formation.projectDeclarationSource(definition.declaration);
    const application = source === undefined ? undefined : declarationApplications.formDeclarationApplication(
      targetType, source, state);
    return application === undefined ? undefined : declarationApplications.completeDeclarationApplication(application);
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
      const headers = source === undefined ? undefined : formSourceMembersHeader(source, undefined);
      const members = headers === undefined ? undefined : completeSourceMembers(headers);
      const matches = members?.filter((member) =>
        csharpSourceMemberKeysEqual(member.sourceKey, sourceKey)
      ) ?? [];
      return matches.length === 1 ? matches[0] : undefined;
    } finally {
      activeTypes.delete(type);
    }
  }

  return Object.freeze({
    formNodeSource,
    completeNodeSource,
    formTypeSource,
    completeTypeSource,
    collectMembers,
    memberInheritance,
    completeMembers,
    formSourceMembersHeader,
    completeSourceMembers,
    resolveNativeParameter,
    resolveNativeReturn,
    retainConstructionSource(input: CsharpNativeConstructionRetention<CsharpStructuralTypeSourceInput>, shape: CsharpObjectShapeFact): CsharpObjectShapeFact | undefined {
      const { node, queries, presentTypes } = input.publication;
      if (presentTypes.length !== 1) return failTargetAnalysisInvariant("tsonic-csharp",
        "Construction source retention requires its exact single-component publication.", node);
      const type = presentTypes[0]!;
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
