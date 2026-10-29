import { selectCsharpFlowReadCarrier } from "../../policy/conversions/flow-read.js";
import { isCsharpFlowReadEvidenceNode, inferCallableReturnType, freezeSourceArgumentClassification } from "./source-values.js";
import type { ExtensionFactSubject, Node, ResolvedSourceGeneratorInfo, ResolvedSourceWellKnownSymbolInfo, ResolvedSourceYieldInfo, SourceFile, Type, Signature } from "@tsonic/tsts";
import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import { sourceClassFieldIsTypeOnly } from "@tsonic/target-api/source";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { csharpNativePropertyNameIssue } from "../objects/computed-field-names.js";
import { selectCsharpSemanticCarrier } from "../../policy/types/resolution/semantic-types.js";
import type { CsharpTypePolicy } from "./types/resolution/model.js";
import { isCsharpJsValueTargetType, targetTypeRefEquals, targetTypeRefKey } from "../../policy/types/index.js";
import { isTypeParameterTargetRef } from "../../policy/ownership/type-categories.js";
import { csharpTargetTypeComponents } from "../../target-model/types/components.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { csharpSourceTypeParameter } from "../../source/extension/type-parameters.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpSemanticTypeClassification, CsharpContextualTupleClassification, CsharpContextualTypeEvidence, CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";
import type { CsharpSourceEvidenceResult } from "./model.js";
import type { CsharpTypeParameterConstraintResolution } from "../../policy/constraints/index.js";
import { selectCsharpSourceArgument } from "../../source/extension/arguments.js";
import { csharpFixedArrayRepresentationRejection } from "../../policy/types/collections/fixed-arrays.js";
import { readCsharpSourceDefaultValue, readCsharpSourceField, readCsharpSourceFixedArrayType, readCsharpSourceStruct } from "../../source/extension/markers.js";

const missing = Symbol("csharp.source-evidence.missing");
import { createTsonicMemoryMetadataIndex, createTsonicPointerBackingDemands, createTsonicClosedArrayStorageQueries } from "@tsonic/source-core/facts";
import type { CsharpPointerReturnContract } from "../../target-model/records/calls/pointer-return.js";
import { analyzeCsharpTypeOnlyDeclarations } from "../declarations/type-only.js";
import type { CsharpSourceParameterClassifications } from "../../target-model/records/callables/source-callable-contract.js";
type Cached<Value> = Value | typeof missing;

export type CsharpSourceParameterDeclarationEvidence = Pick<CsharpSourceEvidenceIndex,
  "contextualType" | "expressionType" | "compileTimeMetadata">;

export function analyzeCsharpSourceEvidence(
  source: TargetSourceProgram,
  sourceFiles: readonly SourceFile[],
  types: CsharpTypePolicy,
  policy: CsharpPolicyContext,
  publishParameters: (declarations: CsharpSourceParameterDeclarationEvidence) => CsharpSourceParameterClassifications,
): CsharpSourceEvidenceResult {
  const memoryMetadata = createTsonicMemoryMetadataIndex(source);
  const pointerBacking = createTsonicPointerBackingDemands(source);
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
    const intrinsic: CsharpSemanticTypeClassification["intrinsic"] =
      semantics.types.isAny(type)
        ? "any"
        : semantics.types.isUnknown(type)
          ? "unknown"
          : semantics.types.isBooleanLike(type)
            ? "boolean"
            : semantics.types.isNumberLike(type)
              ? "number"
              : semantics.types.isStringLike(type)
                ? "string"
                : semantics.types.isBigIntLike(type)
                  ? "bigint"
                  : semantics.types.isVoidLike(type)
                    ? "void"
                    : "other";
    const targetType = recordTargetType(types.resolveType(type, sourceFile));
    const symbol = semantics.declarations.typeSymbol(type);
    const typeParameters = symbol === undefined ? [] : semantics.declarations.symbolDeclarations(symbol)
      .filter(declaration => source.ast.is.IsTypeParameterDeclaration(declaration));
    const typeParameter = typeParameters.length === 1
      ? csharpSourceTypeParameter(typeParameters[0]!, source.ast) : undefined;
    const classification = Object.freeze({
      carrier: selectCsharpSemanticCarrier({ intrinsic, targetType, typeParameter }),
      intrinsic,
      nullish: semantics.types.isNullish(type),
      ...(targetType === undefined ? {} : { targetType }),
      ...(typeParameter === undefined ? {} : { typeParameter }),
    });
    bySourceFile ??= new Map();
    bySourceFile.set(sourceFile, classification);
    semanticTypes.set(type, bySourceFile);
    return classification;
  };

  const declarationExpressionType = (node: Node): Type | undefined => {
    const cached = expressionTypes.get(node);
    if (cached !== undefined) return cachedValue(cached);
    const selected = source.semantics.forNode(node).types.expressionType(node);
    expressionTypes.set(node, selected ?? missing);
    return selected;
  };
  const declarationContext = (node: Node): CsharpContextualTypeEvidence | undefined => {
    const cached = contextualTypes.get(node);
    if (cached !== undefined) return cachedValue(cached);
    const sourceFile = source.ast.getSourceFile(node);
    const component = source.semantics.forNode(node).types.contextualType(node);
    const selected = component === undefined || sourceFile === undefined ? undefined : Object.freeze({ ...component,
      targetType: recordTargetType(types.resolveSelectedType(component.authoredTypeNode, component.selectedType, sourceFile)) });
    contextualTypes.set(node, selected ?? missing);
    return selected;
  };
  const sourceParameters = publishParameters(Object.freeze({
    contextualType: Object.freeze({ get: declarationContext }),
    expressionType: Object.freeze({ get: declarationExpressionType }),
    compileTimeMetadata: Object.freeze({ get: (node: Node) => compileTimeMetadata.has(node) ||
      memoryMetadata.declaration(node) !== undefined || memoryMetadata.isCompileTimeExpression(node) }),
  }));
  for (const sourceFile of sourceFiles) {
    visit(sourceFile, sourceFile);
  }

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
    if (!typeOnly && policy.types.nativeUnreachable(node)) return;
    if (source.ast.is.IsVariableDeclaration(node)) {
      const alias = policy.callOnlyAlias(node);
      if (alias !== undefined) {
        for (const declaration of alias.declarations) compileTimeMetadata.add(declaration);
        return;
      }
    }
    pointerBacking.record(node);
    const declaration = memoryMetadata.declaration(node);
    if (declaration !== undefined || memoryMetadata.isCompileTimeExpression(node)) {
      compileTimeMetadata.add(node);
      for (const issue of declaration?.issues ?? []) memoryMetadataIssues.push(Object.freeze({
        node: issue.node, code: "CSHARP_MEMORY_METADATA_RUNTIME_ESCAPE", message: issue.reason,
      }));
      return;
    }
    if (
      node === sourceFile ||
      source.ast.is.IsImportDeclaration(node) ||
      source.ast.is.IsImportClause(node) ||
      source.ast.kindName(node) === "KindEndOfFile"
    ) {
      source.ast.forEachChild(node, (child) => {
        if (child !== undefined) {
          visit(child, sourceFile, typeOnly || source.ast.is.IsImportDeclaration(node) || source.ast.is.IsImportClause(node));
        }
      });
      return;
    }
    const semantics = source.semantics.forFile(sourceFile);
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
    typeOnly ||= source.ast.is.IsTypeAliasDeclaration(node) || source.ast.is.IsInterfaceDeclaration(node) || source.ast.is.IsExportDeclaration(node);
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
    arguments_.set(
      node,
      freezeSourceArgumentClassification(
        selectCsharpSourceArgument(source.sourceFacts, node),
      ),
    );
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
    const nodeSelection = types.resolveNode(node, sourceFile);
    nodeTargetTypes.set(node, recordTargetType(nodeSelection?.kind === "resolved" ? nodeSelection.type : undefined) ?? missing);
    const nodeTargetType = cachedValue(nodeTargetTypes.get(node));
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
    const expressionType = declarationExpressionType(node);
    if (expressionType !== undefined) {
      if (!typeOnly) recordSelectedFixedArrayIssues(node, expressionType, sourceFile);
      classifyType(expressionType, sourceFile);
    }
    const contextualType = declarationContext(node);
    if (contextualType !== undefined) classifyType(contextualType.selectedType, sourceFile);
    if (!typeOnly && contextualType !== undefined) recordSelectedFixedArrayIssues(node, contextualType.selectedType, sourceFile);
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
    source.ast.forEachChild(node, (child) => {
      if (child !== undefined) {
        visit(child, sourceFile, typeOnly);
      }
    });
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

  const index: CsharpSourceEvidenceIndex = {
    sourceParameters,
    bindingProjection: Object.freeze({ get: node => bindingProjections.get(node) }),
    pointerBackingDemands: pointerBacking.entries(),
    memoryMetadataIssues: Object.freeze([...memoryMetadataIssues, ...pointerBacking.issues().map(issue => ({
      node: issue.node, code: "CSHARP_POINTER_BACKING_NOT_PROVEN", message: issue.reason,
    }))]),
    fixedArrayIssues: Object.freeze(fixedArrayIssues),
    compileTimeMetadata: Object.freeze({ get: node => compileTimeMetadata.has(node) }),
    classConstructorType: Object.freeze({ get: node => cachedValue(classConstructorTypes.get(node)) }),
    targetTypes: Object.freeze([...targetTypes.values()]),
    nodeTargetType: Object.freeze({ get(node) {
      return cachedValue(nodeTargetTypes.get(node));
    } }),
    storageTargetType: Object.freeze({ get(node) {
      return cachedValue(storageTargetTypes.get(node));
    } }),
    readStorageTargetType: Object.freeze({ get(node) {
      return cachedValue(readStorageTargetTypes.get(node));
    } }),
    expressionType: Object.freeze({ get(node) {
      return cachedValue(expressionTypes.get(node));
    } }),
    contextualType: Object.freeze({ get(node) {
      return cachedValue(contextualTypes.get(node));
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
    valueRefinement: Object.freeze({ get(node) {
      return refinements.get(node);
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
    sourceArgument: Object.freeze({ get(node) {
      return arguments_.get(node);
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
    typeParameterConstraints: Object.freeze({ get(node) {
      return typeParameterConstraints.get(node);
    } }),
    sourceOwnedProjectShape: Object.freeze({ get(node) {
      return sourceOwnedProjectShapes.get(node);
    } }),
  };
  return Object.freeze({ index: Object.freeze(index), nativeExpressionIssues: Object.freeze([...nativeExpressionIssues].map(([sourceNode, issue]) =>
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

function cachedValue<Value>(value: Cached<Value> | undefined): Value | undefined {
  return value === undefined || value === missing ? undefined : value;
}
