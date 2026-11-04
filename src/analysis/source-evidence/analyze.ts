import { selectCsharpFlowReadCarrier } from "../../policy/conversions/flow-read.js";
import { isCsharpFlowReadEvidenceNode, inferCallableReturnType, freezeSourceArgumentClassification } from "./source-values.js";
import type { ExtensionFactSubject, Node, ResolvedSourceGeneratorInfo, ResolvedSourceWellKnownSymbolInfo, ResolvedSourceYieldInfo, SourceFile, Type, Signature } from "@tsonic/tsts";
import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import type { TargetSourceProgram, SourceFileSemantics } from "@tsonic/target-api/source";
import { sourceClassFieldIsTypeOnly } from "@tsonic/target-api/source";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { csharpNativePropertyNameIssue } from "../objects/computed-field-names.js";
import { formCsharpSemanticTypeClassificationSource, completeCsharpSemanticTypeClassification } from "./semantic-classification-source.js";
import type { CsharpTypePolicy } from "./types/resolution/model.js";
import { isCsharpJsValueTargetType, targetTypeRefEquals, targetTypeRefKey } from "../../policy/types/index.js";
import { isTypeParameterTargetRef } from "../../policy/ownership/type-categories.js";
import { csharpTargetTypeComponents } from "../../target-model/types/components.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { csharpSourceTypeParameter } from "../../source/extension/type-parameters.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpSemanticTypeClassification, CsharpContextualTupleClassification, CsharpContextualTypeEvidence, CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";
import type { CsharpSourceEvidenceResult, CsharpCurrentNativeNodeInput, CsharpCurrentNativeTypeInput,
  CsharpCurrentDeclaredBodyInput, CsharpCapturedBodySource } from "./model.js";
import { requireCsharpDeclaredProjectSelfCompletion } from "./types/resolution/declared-project-self.js";
import type { CsharpTypeProjectionOwnerSource } from "../declarations/type-projection-source.js";
import type { CsharpTypeResolutionServices } from "./types/resolution/engine.js";
import type { CsharpNativeConstructionSource } from "../objects/native-construction-source.js";
import type { CsharpNodeQuerySource } from "./types/resolution/root-sources.js";
import type { CsharpTypeParameterConstraintResolution } from "../../policy/constraints/index.js";
import { selectCsharpSourceArgument } from "../../source/extension/arguments.js";
import { csharpFixedArrayRepresentationRejection } from "../../policy/types/collections/fixed-arrays.js";
import { readCsharpSourceDefaultValue, readCsharpSourceField, readCsharpSourceFixedArrayType, readCsharpSourceStruct } from "../../source/extension/markers.js";

const missing = Symbol("csharp.source-evidence.missing");
import { createTsonicMemoryMetadataIndex, createTsonicClosedArrayStorageQueries } from "@tsonic/source-core/facts";
import type { TsonicPointerStorageRelation } from "@tsonic/source-core/facts";
import { createCsharpPointerBackingDemands } from "./pointer-backing.js";
import type { CsharpPointerReturnContract } from "../../target-model/records/calls/pointer-return.js";
import { analyzeCsharpTypeOnlyDeclarations } from "../declarations/type-only.js";
type Cached<Value> = Value | typeof missing;

export interface CsharpSourceEvidenceProducer {
  readonly body: Pick<CsharpSourceEvidenceIndex, "bindingProjection" | "compileTimeMetadata" | "nodeTargetType" |
    "storageTargetType" | "readStorageTargetType" | "sourceArgument" | "typeParameterConstraints" | "valueRefinement" | "contextualType">;
  complete(node: Node, sourceFile: SourceFile, typeOnly: boolean): void;
  captureBody(owner: CsharpTypeProjectionOwnerSource): readonly CsharpCapturedBodySource[];
  prepareBody(owner: CsharpTypeProjectionOwnerSource,
    deferred: { readonly captures: ReadonlySet<Node>; readonly projectSelf: ReadonlySet<Node> }): readonly CsharpCurrentDeclaredBodyInput[];
  completeBodyDependencies(owner: CsharpTypeProjectionOwnerSource): readonly CsharpCurrentDeclaredBodyInput[];
  nodeInputs(): readonly CsharpCurrentNativeNodeInput[];
  typeInputs(): readonly CsharpCurrentNativeTypeInput[];
  seal(): CsharpSourceEvidenceResult;
}

export function createCsharpSourceEvidence(
  source: TargetSourceProgram,
  sourceFiles: readonly SourceFile[],
  types: CsharpTypePolicy,
  policy: Pick<CsharpPolicyContext, "types" | "callOnlyAlias">,
  typeQueries: Pick<CsharpTypeResolutionServices,
    "nodeQuerySource" | "completeNodeQuery" | "typeQuerySource" | "completeTypeQuery" | "completeDeclaredReceiverBody" |
    "completeDeclaredCallableBody" | "declaredNodeBodySource" | "completeDeclaredNodeBody" | "completeDeclaredStructuralBody" |
    "completeDeclaredStructuralCaptures" | "declaredProjectSelfSource" | "completeDeclaredProjectSelf">,
  constructionSource: Pick<CsharpNativeConstructionSource<object>, "publicationFor">,
  pointerStorage: TsonicPointerStorageRelation,
): CsharpSourceEvidenceProducer {
  const memoryMetadata = createTsonicMemoryMetadataIndex(source);
  const pointerBacking = createCsharpPointerBackingDemands(source, pointerStorage, types);
  const arrayStorage = createTsonicClosedArrayStorageQueries(source, 131_072);
  const typeOnlyDeclarations = analyzeCsharpTypeOnlyDeclarations(source, sourceFiles);
  const compileTimeMetadata = new WeakSet<Node>(typeOnlyDeclarations);
  let compileTimeDeclarationsOpen = true;
  const memoryMetadataIssues: { readonly node: Node; readonly code: string; readonly message: string }[] = [];
  const fixedArrayIssues: { readonly node: Node; readonly code: string; readonly message: string }[] = [];
  const nativeExpressionIssues = new Map<Node, {
    readonly diagnostic: TargetDiagnostic;
    readonly requiredBy: Set<Node>;
  }>();
  const rejectedFixedArrayTypes = new Set<Type>();
  const expressionTypes = new WeakMap<Node, Cached<Type>>();
  const nodeTargetTypes = new WeakMap<Node, Cached<TargetTypeRef>>();
  const currentNodeInputs: CsharpCurrentNativeNodeInput[] = [];
  const currentTypeInputs: CsharpCurrentNativeTypeInput[] = [];
  const bindingProjections = new WeakMap<Node, import("../../target-model/records/storage/binding-projection-policy.js").CsharpBindingProjection>();
  const classConstructorTypes = new WeakMap<Node, Cached<TargetTypeRef>>();
  const storageTargetTypes = new WeakMap<Node, Cached<TargetTypeRef>>();
  const readStorageTargetTypes = new WeakMap<Node, Cached<TargetTypeRef>>();
  const contextualTypes = new WeakMap<Node, Cached<CsharpContextualTypeEvidence>>();
  const constants = new WeakMap<Node, { readonly value: unknown }>();
  const refinements = new WeakMap<Node, import("../../target-model/records/program/source-evidence.js").CsharpValueRefinementClassification>();
  const generators = new WeakMap<Node, Cached<ResolvedSourceGeneratorInfo>>();
  const generatorTargetTypes = new WeakMap<Node, Cached<TargetTypeRef>>();
  const yields = new WeakMap<Node, Cached<ResolvedSourceYieldInfo>>();
  const yieldTargetTypes = new WeakMap<Node, Cached<TargetTypeRef>>();
  const wellKnownSymbols = new WeakMap<
    Node,
    Cached<ResolvedSourceWellKnownSymbolInfo>
  >();
  const inferredReturns = new WeakMap<Node, Cached<TargetTypeRef>>();
  const pointerReturns = new WeakMap<Node, CsharpPointerReturnContract>();
  const arguments_ = new WeakMap<
    Node,
    import("../../target-model/records/program/source-evidence.js").CsharpSourceArgumentClassification
  >();
  const defaultValues = new WeakMap<
    Node,
    import("../../target-model/records/program/source-markers.js").CsharpSourceDefaultValue
  >();
  const sourceFields = new WeakMap<
    Node,
    import("../../target-model/records/program/source-markers.js").CsharpSourceField
  >();
  const sourceStructs = new WeakMap<
    Node,
    import("../../target-model/records/program/source-markers.js").CsharpSourceStruct
  >();
  const providerVirtualDeclarations = new WeakSet<Node>();
  const semanticTypes = new WeakMap<Type, Map<SourceFile, CsharpSemanticTypeClassification>>();
  const signatureDeclarations = new WeakMap<Signature, Cached<Node>>();
  const contextualTuples = new WeakMap<Node, CsharpContextualTupleClassification>();
  const typeParameterConstraints = new WeakMap<
    Node,
    CsharpTypeParameterConstraintResolution
  >();
  const sourceOwnedProjectShapes = new WeakMap<Node, boolean>();
  const targetTypes = new Map<string, TargetTypeRef>();
  let sourceProductionOpen = true;
  const completedNodes = new WeakMap<Node, { readonly sourceFile: SourceFile; readonly typeOnly: boolean }>();
  const completedTrees = new WeakSet<Node>();
  const declaredBodyInputs = new WeakMap<Node, CsharpCurrentDeclaredBodyInput>();
  const pendingBodyDependencies = new Set<Node>();
  const preparedNodes = new WeakMap<Node, {
    readonly sourceFile: SourceFile;
    readonly typeOnly: boolean;
    readonly excluded: boolean;
    readonly childTypeOnly: boolean;
    readonly query: ReturnType<CsharpTypeResolutionServices["nodeQuerySource"]> | undefined;
    readonly contextual: ReturnType<SourceFileSemantics["types"]["contextualType"]>;
    readonly component: ReturnType<CsharpTypeResolutionServices["declaredNodeBodySource"]> | undefined;
    readonly captured: CsharpCapturedBodySource | undefined;
    readonly argument: ReturnType<typeof freezeSourceArgumentClassification> | undefined;
  }>();
  const body: CsharpSourceEvidenceProducer["body"] = Object.freeze({
    bindingProjection: Object.freeze({ get: (node: Node) => bindingProjections.get(node) }),
    compileTimeMetadata: Object.freeze({ get: (node: Node) => compileTimeMetadata.has(node) }),
    nodeTargetType: Object.freeze({ get: (node: Node) => {
      const declared = declaredBodyInputs.get(node);
      if (declared?.kind === "project-self" && declared.body.phase === "published") return declared.body.type;
      return declared?.kind === "node" ? declared.body.type : cachedValue(nodeTargetTypes.get(node));
    } }),
    storageTargetType: Object.freeze({ get: (node: Node) => {
      const declared = declaredBodyInputs.get(node);
      return declared?.kind === "node" ? declared.body.storageType : cachedValue(storageTargetTypes.get(node));
    } }),
    readStorageTargetType: Object.freeze({ get: (node: Node) => {
      const declared = declaredBodyInputs.get(node);
      return declared?.kind === "node" ? declared.body.storageType : cachedValue(readStorageTargetTypes.get(node));
    } }),
    sourceArgument: Object.freeze({ get: (node: Node) => preparedNodes.get(node)?.argument ?? arguments_.get(node) }),
    typeParameterConstraints: Object.freeze({ get: (node: Node) => {
      const declared = declaredBodyInputs.get(node);
      const type = declared?.kind === "node" && source.ast.is.IsTypeParameterDeclaration(node) ? declared.body.type : undefined;
      return type?.kind === "type-parameter" ? type.csharpConstraints : typeParameterConstraints.get(node);
    } }),
    valueRefinement: Object.freeze({ get: (node: Node) => refinements.get(node) }),
    contextualType: Object.freeze({ get: (node: Node) => {
      const declared = declaredBodyInputs.get(node);
      return declared?.kind === "node" ? declared.body.contextualType : cachedValue(contextualTypes.get(node));
    } }),
  });

  const recordTargetType = (
    type: TargetTypeRef | undefined,
  ): TargetTypeRef | undefined => {
    if (type === undefined) {
      return undefined;
    }
    const key = targetTypeRefKey(type);
    if (targetTypes.has(key)) {
      return type;
    }
    targetTypes.set(key, type);
    for (const component of csharpTargetTypeComponents(type)) {
      recordTargetType(component);
    }
    return type;
  };

  const classifyType = (
    type: Type,
    sourceFile: SourceFile,
  ): CsharpSemanticTypeClassification => {
    let bySourceFile = semanticTypes.get(type);
    const cached = bySourceFile?.get(sourceFile);
    if (cached !== undefined) {
      return cached;
    }
    const semantics = source.semantics.forFile(sourceFile);
    const selected = formCsharpSemanticTypeClassificationSource(source, type, semantics, typeQueries);
    const targetType = recordTargetType(typeQueries.completeTypeQuery(selected.query));
    const completed = Object.freeze({ source: selected.query, type: targetType });
    currentTypeInputs.push(completed);
    const classification = completeCsharpSemanticTypeClassification(selected, completed);
    bySourceFile ??= new Map();
    bySourceFile.set(sourceFile, classification);
    semanticTypes.set(type, bySourceFile);
    return classification;
  };

  function requirePropertyName(name: Node, requiredBy: Node): void {
    const previous = nativeExpressionIssues.get(name);
    if (previous !== undefined) {
      previous.requiredBy.add(requiredBy);
      return;
    }
    const selected = source.semantics.forNode(name).propertyNames.get(name);
    if (selected === undefined) {
      if (source.ast.is.IsComputedPropertyName(name)) failTargetAnalysisInvariant("tsonic-csharp",
        "A native computed field requires its completed checked property-name selection.", name);
      return;
    }
    const diagnostic = csharpNativePropertyNameIssue(name, selected);
    if (diagnostic !== undefined) nativeExpressionIssues.set(name, { diagnostic, requiredBy: new Set([requiredBy]) });
  }

  function visit(node: Node, sourceFile: SourceFile, typeOnly = false): void {
    if (!sourceProductionOpen) return failTargetAnalysisInvariant("tsonic-csharp",
      "Source evidence cannot acquire another body after its explicit seal.", node);
    const previous = completedNodes.get(node);
    if (previous !== undefined) {
      if (previous.sourceFile !== sourceFile || previous.typeOnly !== typeOnly) return failTargetAnalysisInvariant("tsonic-csharp",
        "A body occurrence keeps its original Source file and declaration context.", node);
    } else {
      completeNode(node, sourceFile, typeOnly);
      completedNodes.set(node, Object.freeze({ sourceFile, typeOnly }));
    }
    if (completedTrees.has(node)) return;
    const prepared = prepareNode(node, sourceFile, typeOnly);
    if (!prepared.excluded) source.ast.forEachChild(node, child => {
      if (child !== undefined) visit(child, sourceFile, prepared.childTypeOnly);
    });
    completedTrees.add(node);
  }

  function prepareNode(node: Node, sourceFile: SourceFile, typeOnly: boolean) {
    const previous = preparedNodes.get(node);
    if (previous !== undefined) {
      if (previous.sourceFile !== sourceFile || previous.typeOnly !== typeOnly) return failTargetAnalysisInvariant("tsonic-csharp",
        "A source occurrence requires its original file and type-only context.", node);
      return previous;
    }
    const childTypeOnly = typeOnly || source.ast.is.IsImportDeclaration(node) || source.ast.is.IsImportClause(node) ||
      source.ast.is.IsTypeAliasDeclaration(node) || source.ast.is.IsInterfaceDeclaration(node) || source.ast.is.IsExportDeclaration(node);
    const retain = (excluded: boolean, query?: ReturnType<CsharpTypeResolutionServices["nodeQuerySource"]>) => {
      const contextual = query === undefined ? undefined : source.semantics.forFile(sourceFile).types.contextualType(node);
      const argument = query === undefined ? undefined : freezeSourceArgumentClassification(selectCsharpSourceArgument(source.sourceFacts, node));
      const projectSelf = query === undefined ? undefined : typeQueries.declaredProjectSelfSource(query);
      const component = query === undefined || projectSelf !== undefined ? undefined
        : typeQueries.declaredNodeBodySource(query, contextual);
      const captured = query === undefined ? undefined : Object.freeze({ source: query, projectSelf });
      const prepared = Object.freeze({ sourceFile, typeOnly, childTypeOnly, excluded, query, contextual, component, captured, argument });
      preparedNodes.set(node, prepared);
      return prepared;
    };
    if (!typeOnly && policy.types.nativeUnreachable(node)) return retain(true);
    if (source.ast.is.IsVariableDeclaration(node)) {
      const alias = policy.callOnlyAlias(node);
      if (alias !== undefined) {
        for (const declaration of alias.declarations) compileTimeMetadata.add(declaration);
        return retain(true);
      }
    }
    pointerBacking.record(node);
    const declaration = memoryMetadata.declaration(node);
    if (declaration !== undefined || memoryMetadata.isCompileTimeExpression(node)) {
      compileTimeMetadata.add(node);
      for (const issue of declaration?.issues ?? []) memoryMetadataIssues.push(Object.freeze({
        node: issue.node, code: "CSHARP_MEMORY_METADATA_RUNTIME_ESCAPE", message: issue.reason,
      }));
      return retain(true);
    }
    if (
      node === sourceFile ||
      source.ast.is.IsImportDeclaration(node) ||
      source.ast.is.IsImportClause(node) ||
      source.ast.kindName(node) === "KindEndOfFile"
    ) {
      return retain(false);
    }
    return retain(false, typeQueries.nodeQuerySource(node, sourceFile));
  }

  function completeNode(node: Node, sourceFile: SourceFile, typeOnly: boolean): void {
    const prepared = prepareNode(node, sourceFile, typeOnly);
    if (prepared.excluded || prepared.query === undefined) return;
    const semantics = source.semantics.forFile(sourceFile);
    const nodeQuery = prepared.query;
    const publicationSource = constructionSource.publicationFor(node);
    if (publicationSource !== undefined && publicationSource.input !== nodeQuery.root) {
      return failTargetAnalysisInvariant("tsonic-csharp",
        "The current body requires its same retained construction publication source.", node);
    }
    if (source.ast.is.IsBindingElement(node)) {
      const projection = types.resolveBindingProjection(node, sourceFile);
      if (projection !== undefined) {
        recordTargetType(projection.storageCarrier);
        bindingProjections.set(node, projection);
      }
    }
    if (source.ast.is.IsClassDeclaration(node) || source.ast.is.IsClassExpression(node)) {
      const staticType = semantics.declarations.declaredValueType(node);
      classConstructorTypes.set(node, recordTargetType(types.resolveType(staticType, sourceFile)) ?? missing);
    }
    typeOnly = prepared.childTypeOnly;
    if (!typeOnly) {
      const members = source.ast.is.IsObjectLiteralExpression(node) ? source.ast.properties(node)
        : source.ast.is.IsClassDeclaration(node) || source.ast.is.IsClassExpression(node) ? source.ast.members(node) : [];
      for (const member of members) {
        if (member === undefined || sourceClassFieldIsTypeOnly(source.ast, member)) continue;
        const name = source.ast.name(member);
        if (name !== undefined) requirePropertyName(name, node);
      }
      const argument = source.ast.is.IsElementAccessExpression(node) ? source.ast.as.AsElementAccessExpression(node)?.ArgumentExpression
        : source.ast.is.IsBindingElement(node) ? source.ast.as.AsBindingElement(node)?.PropertyName : undefined;
      if (argument !== undefined) requirePropertyName(argument, node);
      const authoredType = source.ast.is.IsTypeReferenceNode(node) ? node : source.ast.typeNode(node);
      recordFixedArrayIssues(node, [node, ...(authoredType === undefined ? [] : semantics.facts.authoredTypeSubjects(authoredType))]);
      const requiredType = authoredType === undefined ? undefined : semantics.types.authoredType(authoredType);
      if (requiredType !== undefined) {
        for (const property of semantics.types.propertyInfos(requiredType)) {
          for (const symbol of new Set([property.symbol, ...property.rootSymbols])) {
            for (const member of semantics.declarations.symbolDeclarations(symbol)) {
              if (!source.navigation.isProjectDeclaration(member) || sourceClassFieldIsTypeOnly(source.ast, member)) continue;
              let owner: Node | undefined = member;
              while (owner !== undefined && !compileTimeMetadata.has(owner)) owner = source.ast.parent(owner);
              if (owner !== undefined) continue;
              const name = source.ast.name(member);
              if (name !== undefined) requirePropertyName(name, node);
            }
          }
        }
      }
    }
    if (prepared.argument === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
      "A completed node requires its original source argument observation.", node);
    arguments_.set(node, prepared.argument);
    const defaultValue = readCsharpSourceDefaultValue(source.sourceFacts, node);
    if (defaultValue !== undefined) defaultValues.set(node, defaultValue);
    const sourceField = readCsharpSourceField(source.sourceFacts, [node]);
    if (sourceField !== undefined) sourceFields.set(node, sourceField);
    const sourceStruct = readCsharpSourceStruct(source.sourceFacts, node);
    if (sourceStruct !== undefined) sourceStructs.set(node, sourceStruct);
    if (
      source.sourceFacts?.getFact(node, providerVirtualDeclarationFactKey) !==
        undefined
    ) {
      providerVirtualDeclarations.add(node);
    }
    const declaredReceiverSource = nodeQuery.root.kind === "node" ? nodeQuery.root.declaredReceiver?.source : undefined;
    const declaredBody = declaredBodyInputs.get(node);
    const declaredReceiverBody = declaredReceiverSource === undefined ? undefined
      : declaredBody?.kind === "receiver" ? declaredBody.body
        : typeQueries.completeDeclaredReceiverBody(declaredReceiverSource);
    if (declaredReceiverSource !== undefined && declaredReceiverBody === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
      "A self-typed body node requires its actual declared receiver components before physical completion.", node);
    const nodeSelection = typeQueries.completeNodeQuery(nodeQuery);
    nodeTargetTypes.set(node, recordTargetType(nodeSelection?.kind === "resolved" ? nodeSelection.sourceResult.selectedType : undefined) ?? missing);
    const nodeTargetType = cachedValue(nodeTargetTypes.get(node));
    if (declaredBody?.kind === "project-self") requireCsharpDeclaredProjectSelfCompletion(declaredBody.body, nodeTargetType);
    if (!typeOnly && nodeSelection?.kind === "rejected") {
      const previous = nativeExpressionIssues.get(nodeSelection.subject);
      if (previous !== undefined) previous.requiredBy.add(node);
      else nativeExpressionIssues.set(nodeSelection.subject, {
        diagnostic: Object.freeze({ code: nodeSelection.code, category: "error", source: "tsonic-csharp",
          sourceNode: nodeSelection.subject, message: nodeSelection.reason }), requiredBy: new Set([node]),
      });
    }
    sourceOwnedProjectShapes.set(
      node,
      !isCsharpJsValueTargetType(nodeTargetType) &&
        (
          isTypeParameterTargetRef(nodeTargetType) ||
          source.navigation.isProjectShape(node)
        ),
    );
    storageTargetTypes.set(
      node,
      recordTargetType(types.resolveStorage(node, sourceFile)) ?? missing,
    );
    readStorageTargetTypes.set(
      node,
      recordTargetType(types.resolveReadStorage(node, sourceFile)) ?? missing,
    );
    currentNodeInputs.push(Object.freeze({ source: nodeQuery, declaredReceiverBody,
      constructionSource: publicationSource, resolution: nodeSelection,
      storageType: cachedValue(storageTargetTypes.get(node)), readStorageType: cachedValue(readStorageTargetTypes.get(node)),
    }));
    const expressionType = semantics.types.expressionType(node);
    expressionTypes.set(node, expressionType ?? missing);
    if (expressionType !== undefined) {
      if (!typeOnly) recordSelectedFixedArrayIssues(node, expressionType, sourceFile);
      classifyType(expressionType, sourceFile);
    }
    const contextualType = prepared.contextual;
    if (contextualType !== undefined) classifyType(contextualType.selectedType, sourceFile);
    if (!typeOnly && contextualType !== undefined) recordSelectedFixedArrayIssues(node, contextualType.selectedType, sourceFile);
    contextualTypes.set(node, contextualType === undefined ? missing : Object.freeze({
      ...contextualType,
      targetType: recordTargetType(types.resolveSelectedType(contextualType.authoredTypeNode, contextualType.selectedType, sourceFile)),
    }));
    if (source.ast.is.IsEnumMember(node)) {
      const constant = source.semantics.enumConstants.get(node);
      if (constant === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A checked enum member requires its exact completed source constant selection.", node);
      if (constant.kind === "resolved") {
        constants.set(node, Object.freeze({ value: constant.value }));
        const initializer = source.ast.as.AsEnumMember(node)?.Initializer;
        if (initializer !== undefined) compileTimeMetadata.add(initializer);
      }
    } else {
      const constantValue = semantics.types.constantValue(node);
      if (constantValue !== undefined) constants.set(node, Object.freeze({ value: constantValue }));
    }
    const refinement = isCsharpFlowReadEvidenceNode(source.ast, node)
      ? source.semantics.selectValueTypeRefinement(node)
      : { kind: "not-project-reference" as const };
    if (refinement.kind === "resolved") {
      classifyType(refinement.selectedType, sourceFile);
      if (refinement.refinement.kind === "members") {
        refinement.refinement.types.forEach((member) =>
          classifyType(member, sourceFile));
      }
    }
    const selectedTargetType = refinement.kind === "resolved"
      ? recordTargetType(
          types.resolveSelectedValue(
            node,
            refinement.selectedType,
            sourceFile,
          ),
        )
      : undefined;
    const memberTargetTypes = refinement.kind === "resolved" &&
        refinement.refinement.kind === "members"
      ? refinement.refinement.types.map((member) =>
          recordTargetType(types.resolveSelectedValue(node, member, sourceFile)))
      : undefined;
    const readStorageTargetType = cachedValue(readStorageTargetTypes.get(node));
    const declaredTargetType = refinement.kind === "resolved" &&
        refinement.refinement.kind === "unrelated"
      ? recordTargetType(types.resolveType(refinement.declaredType, sourceFile))
      : undefined;
    const unrelatedSourceTypesShareTargetRepresentation =
      refinement.kind === "resolved" &&
      refinement.refinement.kind === "unrelated" &&
      declaredTargetType !== undefined &&
      selectedTargetType !== undefined &&
      targetTypeRefEquals(declaredTargetType, selectedTargetType);
    const flowReadTargetType = recordTargetType(selectCsharpFlowReadCarrier({
      exactSourceRead: refinement.kind === "resolved" && refinement.refinement.kind === "exact",
      nativeSourceRead: refinement.kind === "resolved" && refinement.refinement.kind === "exact" &&
        readStorageTargetType !== undefined && types.nativeFlowMembers(node, readStorageTargetType) !== undefined,
      unrelatedSourceTypesShareTargetRepresentation, selectedTargetType, readStorageTargetType, memberTargetTypes,
    }));
    refinements.set(node, Object.freeze({
      source: refinement,
      ...(selectedTargetType === undefined ? {} : { selectedTargetType }),
      ...(memberTargetTypes === undefined
        ? {}
        : { memberTargetTypes: Object.freeze(memberTargetTypes) }),
      ...(flowReadTargetType === undefined ? {} : { flowReadTargetType }),
    }));
    const generator = semantics.operations.generator(node);
    generators.set(node, generator ?? missing);
    generatorTargetTypes.set(
      node,
      generator === undefined
        ? missing
        : recordTargetType(types.resolveSelectedType(
            source.ast.typeNode(generator.declaration),
            generator.sourceReturnType,
            sourceFile,
          )) ?? missing,
    );
    const yieldEvidence = semantics.operations.yield(node);
    yields.set(node, yieldEvidence ?? missing);
    yieldTargetTypes.set(
      node,
      yieldEvidence === undefined
        ? missing
        : recordTargetType(types.resolveSelectedValue(
            yieldEvidence.operand?.expression ?? node,
            yieldEvidence.operand?.type ?? yieldEvidence.sourceYieldType,
            sourceFile,
          )) ?? missing,
    );
    const wellKnownSymbol = semantics.operations.wellKnownSymbol(node);
    wellKnownSymbols.set(node, wellKnownSymbol ?? missing);
    const call = semantics.operations.call(node);
    if (call !== undefined) {
      signatureDeclarations.set(
        call.selectedSignature,
        semantics.declarations.signatureDeclaration(call.selectedSignature) ?? missing,
      );
    }
    if (source.ast.is.IsArrayLiteralExpression(node)) {
      const elementCount = source.ast.elements(node).length;
      const contextual = semantics.types.contextualTupleSelection(
        node,
        elementCount,
      );
      contextualTuples.set(
        node,
        contextual.kind === "unavailable"
          ? Object.freeze({ kind: "unavailable" })
          : Object.freeze({
              kind: "selected",
              elementTypes: Object.freeze(contextual.elements.map((element) =>
                recordTargetType(types.resolveSelectedType(
                  element.declaration === undefined
                    ? undefined
                    : source.ast.typeNode(element.declaration),
                  element.type,
                  sourceFile,
                )))),
              optionalElementIndexes: Object.freeze(contextual.elements.flatMap(
                (element, index) => element.elementKind === "optional" ? [index] : [],
              )),
              omittedOptionalElementIndexes: Object.freeze([
                ...contextual.omittedOptionalElementIndexes,
              ]),
            }),
      );
    }
    const inferredReturn = inferCallableReturnType(node, sourceFile, source, types);
    const pointerReturn = types.resolvePointerReturn(node);
    if (pointerReturn !== undefined) pointerReturns.set(node, pointerReturn);
    inferredReturns.set(node, recordTargetType(pointerReturn?.type ?? inferredReturn) ?? missing);
    if (source.ast.is.IsTypeParameterDeclaration(node)) {
      const parameter = csharpSourceTypeParameter(node, source.ast);
      if (parameter !== undefined) {
        const selected = types.resolveType(source.semantics.forNode(node).declarations.declaredType(node), sourceFile);
        const constraints = selected?.kind === "type-parameter" && selected.identity === parameter.identity
          ? selected.csharpConstraints : undefined;
        typeParameterConstraints.set(
          node,
          constraints ?? Object.freeze({ kind: "unsupported",
            reason: `Generic binder '${parameter.name}' has no selected native constraint contract.` }),
        );
      }
    }
  }

  function recordFixedArrayIssues(node: Node, subjects: readonly ExtensionFactSubject[]): void {
    for (const subject of subjects) {
      const fact = readCsharpSourceFixedArrayType(source.sourceFacts, subject);
      if (fact === undefined || rejectedFixedArrayTypes.has(fact.sourceType)) continue;
      const message = csharpFixedArrayRepresentationRejection(fact);
      if (message === undefined) continue;
      rejectedFixedArrayTypes.add(fact.sourceType);
      fixedArrayIssues.push(Object.freeze({ node, code: "CSHARP_FIXED_ARRAY_REPRESENTATION_UNSUPPORTED", message }));
    }
  }

  function recordSelectedFixedArrayIssues(node: Node, type: Type, sourceFile: SourceFile): void {
    let current: Type | undefined = type;
    const visited = new Set<Type>();
    while (current !== undefined && !visited.has(current)) {
      visited.add(current);
      const selected = types.selectFixedArray(current, sourceFile);
      if (selected === undefined) return;
      const message = selected.kind === "invalid"
        ? `C# FixedArray has no exact closed value representation: ${selected.reason}`
        : csharpFixedArrayRepresentationRejection(selected.fact);
      if (message !== undefined && !rejectedFixedArrayTypes.has(current)) {
        rejectedFixedArrayTypes.add(current);
        fixedArrayIssues.push(Object.freeze({ node, code: "CSHARP_FIXED_ARRAY_REPRESENTATION_UNSUPPORTED", message }));
      }
      current = selected.kind === "selected" ? selected.fact.elementSourceType : undefined;
    }
  }

  function captureBody(owner: CsharpTypeProjectionOwnerSource): readonly CsharpCapturedBodySource[] {
    if (!sourceProductionOpen || owner.nodes[0]?.node !== owner.declaration ||
      Array.from(owner.nodes).some(occurrence => occurrence === undefined)) return failTargetAnalysisInvariant("tsonic-csharp",
        "A callable body requires its complete original source inventory before evidence seals.", owner.declaration);
    const sources: CsharpCapturedBodySource[] = [];
    for (const occurrence of owner.nodes) {
      const { node } = occurrence;
      let omitted = false;
      let typeOnly = false;
      for (let parent = source.ast.parent(node); parent !== undefined; parent = source.ast.parent(parent)) {
        if (compileTimeMetadata.has(parent)) omitted = true;
        typeOnly ||= source.ast.is.IsTypeAliasDeclaration(parent) || source.ast.is.IsInterfaceDeclaration(parent) ||
          source.ast.is.IsExportDeclaration(parent) || source.ast.is.IsImportDeclaration(parent) || source.ast.is.IsImportClause(parent);
      }
      if (omitted) continue;
      const sourceFile = source.ast.getSourceFile(node);
      if (sourceFile === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
        "A declared body node requires its original source file.", node);
      const prepared = prepareNode(node, sourceFile, typeOnly);
      if (prepared.excluded || prepared.query === undefined || occurrence.name || occurrence.declarationOnly) continue;
      if (prepared.captured?.source !== prepared.query) return failTargetAnalysisInvariant("tsonic-csharp",
        "A body inventory retains its exact source and declared self application.", node);
      sources.push(prepared.captured);
    }
    return Object.freeze(sources);
  }

  function prepareBody(owner: CsharpTypeProjectionOwnerSource,
    deferred: { readonly captures: ReadonlySet<Node>; readonly projectSelf: ReadonlySet<Node> }): readonly CsharpCurrentDeclaredBodyInput[] {
    const inputs: CsharpCurrentDeclaredBodyInput[] = [];
    for (const captured of captureBody(owner)) {
      const query = captured.source;
      const node = query.node;
      const prepared = node === undefined ? undefined : preparedNodes.get(node);
      if (node === undefined || prepared?.query !== query || prepared.captured !== captured) return failTargetAnalysisInvariant("tsonic-csharp",
        "A body completion requires its original captured source occurrence.", owner.declaration);
      const { sourceFile, typeOnly } = prepared;
      const previous = declaredBodyInputs.get(node);
      if (previous !== undefined) {
        if (previous.source !== prepared.query) return failTargetAnalysisInvariant("tsonic-csharp",
          "A declared body keeps its exact original query source.", node);
        inputs.push(previous);
        continue;
      }
      const receiver = query.root.kind === "node" ? query.root.declaredReceiver?.source : undefined;
      if (receiver !== undefined) {
        const body = typeQueries.completeDeclaredReceiverBody(receiver);
        if (body === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
          "A body self-reference requires its actual declared receiver components.", node);
        const input = Object.freeze({ kind: "receiver" as const, source: query, body });
        declaredBodyInputs.set(node, input);
        inputs.push(input);
        continue;
      }
      if (captured.projectSelf !== undefined) {
        const body = deferred.projectSelf.has(captured.projectSelf.self.declaration) ? captured.projectSelf
          : typeQueries.completeDeclaredProjectSelf(captured.projectSelf);
        const input = Object.freeze({ kind: "project-self" as const, source: query, body });
        declaredBodyInputs.set(node, input);
        if (body.phase === "declared") pendingBodyDependencies.add(node);
        inputs.push(input);
        continue;
      }
      const callable = typeQueries.completeDeclaredCallableBody(query);
      if (callable.kind === "callable") {
        const input = Object.freeze({ kind: "callable" as const, source: query, body: callable });
        declaredBodyInputs.set(node, input);
        inputs.push(input);
        continue;
      }
      if (prepared.component === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
        "A body node requires its captured declared-component input.", node);
      const component = typeQueries.completeDeclaredNodeBody(prepared.component);
      if (component.kind === "component") {
        const input = Object.freeze({ kind: "node" as const, source: query, body: component });
        declaredBodyInputs.set(node, input);
        inputs.push(input);
        continue;
      }
      const previousCompletion = completedNodes.get(node);
      const structural = typeQueries.completeDeclaredStructuralBody(query, deferred.captures);
      if (structural.kind === "structural") {
        const input = Object.freeze({ kind: "structural" as const, source: query, body: structural });
        declaredBodyInputs.set(node, input);
        if (structural.captures.some(capture => capture.kind === "dependency")) pendingBodyDependencies.add(node);
        inputs.push(input);
        continue;
      }
      if (previousCompletion === undefined) {
        completeNode(node, sourceFile, typeOnly);
        completedNodes.set(node, Object.freeze({ sourceFile, typeOnly }));
      } else if (previousCompletion.sourceFile !== sourceFile || previousCompletion.typeOnly !== typeOnly) {
        return failTargetAnalysisInvariant("tsonic-csharp", "A body node keeps its actual completed source context.", node);
      }
    }
    return Object.freeze(inputs);
  }

  function completeBodyDependencies(owner: CsharpTypeProjectionOwnerSource): readonly CsharpCurrentDeclaredBodyInput[] {
    if (!sourceProductionOpen) return failTargetAnalysisInvariant("tsonic-csharp",
      "A body dependency completes before its original source producer seals.", owner.declaration);
    const inputs: CsharpCurrentDeclaredBodyInput[] = [];
    for (const occurrence of owner.nodes) {
      const input = declaredBodyInputs.get(occurrence.node);
      if (input === undefined) continue;
      if (input.kind === "project-self" && input.body.phase === "declared") {
        const completed = Object.freeze({ ...input, body: typeQueries.completeDeclaredProjectSelf(input.body) });
        declaredBodyInputs.set(occurrence.node, completed);
        pendingBodyDependencies.delete(occurrence.node);
        inputs.push(completed);
        continue;
      }
      if (input.kind !== "structural" || input.body.captures.every(capture => capture.kind === "complete")) {
        inputs.push(input);
        continue;
      }
      const completed = Object.freeze({ ...input, body: typeQueries.completeDeclaredStructuralCaptures(input.body) });
      declaredBodyInputs.set(occurrence.node, completed);
      pendingBodyDependencies.delete(occurrence.node);
      inputs.push(completed);
    }
    return Object.freeze(inputs);
  }

  function seal(): CsharpSourceEvidenceResult {
  if (!sourceProductionOpen || sourceFiles.some(sourceFile => !completedNodes.has(sourceFile))) return failTargetAnalysisInvariant("tsonic-csharp",
    "Source evidence seals once after every original source root has completed.");
  if (pendingBodyDependencies.size !== 0) return failTargetAnalysisInvariant("tsonic-csharp",
    "Source evidence cannot seal with an unconsumed actual body dependency.", pendingBodyDependencies.values().next().value);
  sourceProductionOpen = false;
  const pointerBackingRecords = pointerBacking.seal();
  const index: CsharpSourceEvidenceIndex = {
    ...body,
    nodeTargetType: Object.freeze({ get: node => cachedValue(nodeTargetTypes.get(node)) }),
    storageTargetType: Object.freeze({ get: node => cachedValue(storageTargetTypes.get(node)) }),
    readStorageTargetType: Object.freeze({ get: node => cachedValue(readStorageTargetTypes.get(node)) }),
    contextualType: Object.freeze({ get: node => cachedValue(contextualTypes.get(node)) }),
    typeParameterConstraints: Object.freeze({ get: node => typeParameterConstraints.get(node) }),
    pointerBackingUses: pointerBackingRecords.uses,
    memoryMetadataIssues: Object.freeze([...memoryMetadataIssues, ...pointerBackingRecords.issues.map(issue => ({
      node: issue.node, code: "CSHARP_POINTER_BACKING_NOT_PROVEN", message: issue.reason,
    }))]),
    fixedArrayIssues: Object.freeze(fixedArrayIssues),
    classConstructorType: Object.freeze({ get: node => cachedValue(classConstructorTypes.get(node)) }),
    targetTypes: Object.freeze([...targetTypes.values()]),
    expressionType: Object.freeze({ get(node) {
      return cachedValue(expressionTypes.get(node));
    } }),
    semanticTargetType: Object.freeze({ get(type, sourceFile) {
      return semanticTypes.get(type)?.get(sourceFile)?.targetType;
    } }),
    semanticType: Object.freeze({ get(type, sourceFile) {
      return semanticTypes.get(type)?.get(sourceFile);
    } }),
    signatureDeclaration: Object.freeze({ get(signature) {
      return cachedValue(signatureDeclarations.get(signature));
    } }),
    contextualTuple: Object.freeze({ get(node) {
      return contextualTuples.get(node);
    } }),
    constantValue: Object.freeze({ get(node) {
      return constants.get(node);
    } }),
    generator: Object.freeze({ get(node) {
      return cachedValue(generators.get(node));
    } }),
    generatorTargetType: Object.freeze({ get(node) {
      return cachedValue(generatorTargetTypes.get(node));
    } }),
    yield: Object.freeze({ get(node) {
      return cachedValue(yields.get(node));
    } }),
    yieldTargetType: Object.freeze({ get(node) {
      return cachedValue(yieldTargetTypes.get(node));
    } }),
    wellKnownSymbol: Object.freeze({ get(node) {
      return cachedValue(wellKnownSymbols.get(node));
    } }),
    inferredCallableReturnType: Object.freeze({ get(node) {
      return cachedValue(inferredReturns.get(node));
    } }),
    pointerReturn: Object.freeze({ get(node) {
      return pointerReturns.get(node);
    } }),
    sourceDefaultValue: Object.freeze({ get(node) {
      return defaultValues.get(node);
    } }),
    sourceField: Object.freeze({ get(subjects) {
      for (const subject of subjects) {
        if (subject === undefined) continue;
        const field = sourceFields.get(subject);
        if (field !== undefined) return field;
      }
      return undefined;
    } }),
    sourceStruct: Object.freeze({ get(node) {
      return sourceStructs.get(node);
    } }),
    providerVirtualDeclaration: Object.freeze({ get(node) {
      return providerVirtualDeclarations.has(node);
    } }),
    sourceOwnedProjectShape: Object.freeze({ get(node) {
      return sourceOwnedProjectShapes.get(node);
    } }),
  };
  return Object.freeze({ index: Object.freeze(index), currentNodeInputs: Object.freeze(currentNodeInputs),
    currentTypeInputs: Object.freeze(currentTypeInputs), nativeExpressionIssues: Object.freeze([...nativeExpressionIssues].map(([sourceNode, issue]) =>
    Object.freeze({ ...issue.diagnostic, sourceNode, requiredBy: Object.freeze([...issue.requiredBy]) }))), inspectClosedArrayStorage: arrayStorage.resolve,
    eraseCompileTimeDeclaration(declaration: Node): void {
      if (!compileTimeDeclarationsOpen) failTargetAnalysisInvariant("tsonic-csharp",
        "Compile-time declaration selection cannot change after native admission is sealed.", declaration);
      compileTimeMetadata.add(declaration);
    },
    sealCompileTimeDeclarations(): void {
      if (!compileTimeDeclarationsOpen) failTargetAnalysisInvariant("tsonic-csharp",
        "Compile-time declaration selection must be sealed exactly once.");
      compileTimeDeclarationsOpen = false;
    },
  });
  }
  return Object.freeze({ body, complete: visit, captureBody, prepareBody, completeBodyDependencies,
    nodeInputs: () => Object.freeze([...currentNodeInputs]), typeInputs: () => Object.freeze([...currentTypeInputs]), seal,
  });
}

function cachedValue<Value>(value: Cached<Value> | undefined): Value | undefined {
  return value === undefined || value === missing ? undefined : value;
}
