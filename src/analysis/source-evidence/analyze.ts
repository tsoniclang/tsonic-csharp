import type {
  ExtensionFactSubject,
  Node,
  ResolvedSourceGeneratorInfo,
  ResolvedSourceWellKnownSymbolInfo,
  ResolvedSourceYieldInfo,
  SourceFile,
  Type,
  Signature,
} from "@tsonic/tsts";
import {
  providerVirtualDeclarationFactKey,
} from "@tsonic/tsts";
import type {
  TargetSourceProgram,
} from "@tsonic/target-api/source";
import { sourceClassFieldIsTypeOnly } from "@tsonic/target-api/source";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { csharpNativePropertyNameIssue } from "../objects/computed-field-names.js";
import type {
  CsharpTypePolicy,
} from "../../policy/types/index.js";
import {
  combineCsharpTargetUnionMembers,
  getCsharpNullableElementTargetType,
  isCsharpAbsenceTargetType,
  isCsharpJsValueTargetType,
  isTypeParameterTargetRef,
  targetTypeRefEquals,
  targetTypeRefKey,
} from "../../policy/types/index.js";
import {
  csharpTargetTypeComponents,
} from "../../target-model/types/components.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { csharpSourceTypeParameter } from "../../target-model/names/type-parameters.js";
import type {
  TargetTypeRef,
} from "../../target-model/types/model.js";
import type { CsharpSemanticTypeClassification, CsharpContextualTupleClassification, CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpSourceEvidenceResult } from "./model.js";
import {
  resolveCsharpTypeParameterConstraints,
} from "../../policy/constraints/index.js";
import type {
  CsharpTypeParameterConstraintResolution,
} from "../../policy/constraints/index.js";
import {
  selectCsharpSourceArgument,
} from "../../policy/operations/members/index.js";
import {
  csharpFixedArrayRepresentationRejection,
  readCsharpSourceDefaultValue,
  readCsharpSourceField,
  readCsharpSourceFixedArrayType,
  readCsharpSourceStruct,
} from "../../policy/types/index.js";

const missing = Symbol("csharp.source-evidence.missing");
import { createTsonicMemoryMetadataIndex, createTsonicPointerBackingDemands, createTsonicClosedArrayStorageQueries } from "@tsonic/source-core/facts";
import type { CsharpPointerReturnContract } from "../../target-model/records/pointer-return.js";
import { analyzeCsharpTypeOnlyDeclarations } from "../declarations/type-only.js";
type Cached<Value> = Value | typeof missing;

export function analyzeCsharpSourceEvidence(
  source: TargetSourceProgram,
  sourceFiles: readonly SourceFile[],
  types: CsharpTypePolicy,
  policy: CsharpPolicyContext,
): CsharpSourceEvidenceResult {
  const memoryMetadata = createTsonicMemoryMetadataIndex(source);
  const pointerBacking = createTsonicPointerBackingDemands(source);
  const arrayStorage = createTsonicClosedArrayStorageQueries(source, 131_072);
  const typeOnlyDeclarations = analyzeCsharpTypeOnlyDeclarations(source, sourceFiles);
  const compileTimeMetadata = new WeakSet<Node>(typeOnlyDeclarations.declarations);
  const memoryMetadataIssues: { readonly node: Node; readonly code: string; readonly message: string }[] = [];
  const fixedArrayIssues: { readonly node: Node; readonly code: string; readonly message: string }[] = [];
  const nativePropertyNameIssues: TargetDiagnostic[] = [];
  const requiredPropertyNames = new WeakSet<Node>();
  const rejectedFixedArrayTypes = new Set<Type>();
  const expressionTypes = new WeakMap<Node, Cached<Type>>();
  const nodeTargetTypes = new WeakMap<Node, Cached<TargetTypeRef>>();
  const bindingProjections = new WeakMap<Node, import("../../target-model/records/binding-projection-policy.js").CsharpBindingProjection>();
  const classConstructorTypes = new WeakMap<Node, Cached<TargetTypeRef>>();
  const storageTargetTypes = new WeakMap<Node, Cached<TargetTypeRef>>();
  const readStorageTargetTypes = new WeakMap<Node, Cached<TargetTypeRef>>();
  const contextualTypes = new WeakMap<Node, Cached<Type>>();
  const contextualTargetTypes = new WeakMap<Node, Cached<TargetTypeRef>>();
  const constants = new WeakMap<Node, { readonly value: unknown }>();
  const refinements = new WeakMap<Node, import("../../target-model/records/source-evidence.js").CsharpValueRefinementClassification>();
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
    import("../../target-model/records/source-evidence.js").CsharpSourceArgumentClassification
  >();
  const defaultValues = new WeakMap<
    Node,
    import("../../target-model/records/source-markers.js").CsharpSourceDefaultValue
  >();
  const sourceFields = new WeakMap<
    Node,
    import("../../target-model/records/source-markers.js").CsharpSourceField
  >();
  const sourceStructs = new WeakMap<
    Node,
    import("../../target-model/records/source-markers.js").CsharpSourceStruct
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

  for (const sourceFile of sourceFiles) {
    visit(sourceFile, sourceFile);
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
              if (name === undefined || requiredPropertyNames.has(name)) continue;
              requiredPropertyNames.add(name);
              const selectedName = source.semantics.forNode(member).propertyNames.get(name);
              if (selectedName === undefined) {
                if (source.ast.is.IsComputedPropertyName(name)) failTargetAnalysisInvariant("tsonic-csharp",
                  "A native computed field requires its completed checked property-name selection.", name);
                continue;
              }
              const issue = csharpNativePropertyNameIssue(name, selectedName);
              if (issue !== undefined) nativePropertyNameIssues.push(issue);
            }
          }
        }
        if (nativePropertyNameIssues.length !== 0) return;
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
    nodeTargetTypes.set(
      node,
      recordTargetType(types.resolveNode(node, sourceFile)) ?? missing,
    );
    const nodeTargetType = cachedValue(nodeTargetTypes.get(node));
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
    const expressionType = semantics.types.expressionType(node);
    expressionTypes.set(node, expressionType ?? missing);
    if (expressionType !== undefined) {
      if (!typeOnly) recordSelectedFixedArrayIssues(node, expressionType, sourceFile);
      classifyType(expressionType, sourceFile);
    }
    const contextualType = semantics.types.contextualType(node);
    if (!typeOnly && contextualType !== undefined) recordSelectedFixedArrayIssues(node, contextualType, sourceFile);
    contextualTypes.set(node, contextualType ?? missing);
    contextualTargetTypes.set(
      node,
      contextualType === undefined
        ? missing
        : classifyType(contextualType, sourceFile).targetType ?? missing,
    );
    if (source.ast.is.IsEnumMember(node)) {
      const constant = source.semantics.enumConstants.get(node);
      if (constant === undefined) throw new Error("A checked enum member requires its exact completed source constant selection.");
      if (constant.kind === "resolved") constants.set(node, Object.freeze({ value: constant.value }));
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
    const absenceUsesStorage = isCsharpAbsenceTargetType(selectedTargetType) &&
      getCsharpNullableElementTargetType(readStorageTargetType) !== undefined;
    const exactSourceRead = refinement.kind === "resolved" && refinement.refinement.kind === "exact";
    const flowReadTargetType = (exactSourceRead || unrelatedSourceTypesShareTargetRepresentation || absenceUsesStorage) &&
        readStorageTargetType !== undefined
      ? readStorageTargetType
      : selectedTargetType !== undefined &&
          readStorageTargetType !== undefined &&
          !targetTypeRefEquals(readStorageTargetType, selectedTargetType)
        ? selectedTargetType
        : memberTargetTypes === undefined ||
            memberTargetTypes.some((member) => member === undefined)
          ? selectedTargetType
          : recordTargetType(combineCsharpTargetUnionMembers(
              memberTargetTypes as readonly TargetTypeRef[],
            ));
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
        typeParameterConstraints.set(
          node,
          resolveCsharpTypeParameterConstraints(
            node,
            parameter,
            sourceFile,
            { ast: source.ast, types },
          ),
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
    bindingProjection: Object.freeze({ get: node => bindingProjections.get(node) }),
    pointerBackingDemands: pointerBacking.entries(),
    memoryMetadataIssues: Object.freeze([...memoryMetadataIssues, ...pointerBacking.issues().map(issue => ({
      node: issue.node, code: "CSHARP_POINTER_BACKING_NOT_PROVEN", message: issue.reason,
    }))]),
    fixedArrayIssues: Object.freeze(fixedArrayIssues),
    compileTimeMetadata: Object.freeze({ get: node => compileTimeMetadata.has(node) }),
    typeOnlyIssues: typeOnlyDeclarations.issues,
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
    contextualTargetType: Object.freeze({ get(node) {
      return cachedValue(contextualTargetTypes.get(node));
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
  return Object.freeze({ index: Object.freeze(index), nativePropertyNameIssues: Object.freeze(nativePropertyNameIssues), inspectClosedArrayStorage: arrayStorage.resolve });
}

function isCsharpFlowReadEvidenceNode(
  ast: import("@tsonic/tsts").AstReader,
  node: Node,
): boolean {
  return ast.is.IsIdentifier(node) ||
    ast.is.IsPropertyAccessExpression(node) ||
    ast.is.IsElementAccessExpression(node);
}

function inferCallableReturnType(
  declaration: Node,
  sourceFile: SourceFile,
  source: TargetSourceProgram,
  types: CsharpTypePolicy,
): TargetTypeRef | undefined {
  const semantics = source.semantics.forFile(sourceFile);
  const declarationType = semantics.types.expressionType(declaration);
  if (declarationType === undefined) {
    return undefined;
  }
  const signatures = semantics.types.signatureInfos(declarationType, "call")
    .filter((signature) =>
      semantics.declarations.signatureDeclaration(signature.signature) === declaration);
  return signatures.length === 1
    ? types.resolveType(signatures[0]!.returnType, sourceFile)
    : undefined;
}

function cachedValue<Value>(value: Cached<Value> | undefined): Value | undefined {
  return value === undefined || value === missing ? undefined : value;
}

function freezeSourceArgumentClassification(
  value: import("../../target-model/records/source-evidence.js").CsharpSourceArgumentClassification,
): import("../../target-model/records/source-evidence.js").CsharpSourceArgumentClassification {
  return value.kind === "resolved"
    ? Object.freeze({
        kind: "resolved",
        argument: Object.freeze({
          passingMode: value.argument.passingMode,
          storageExpression: value.argument.storageExpression,
        }),
      })
    : Object.freeze({
        kind: "rejected",
        reason: value.reason,
      });
}
