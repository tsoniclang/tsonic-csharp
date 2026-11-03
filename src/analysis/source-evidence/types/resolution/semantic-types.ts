import type { CsharpTypeResolutionScope } from "./scope.js";
import { resolveCsharpConstructorValueType } from "./constructors.js";
import { sourceTypeSyntaxIsCompositional } from "@tsonic/target-api/source";
import { completeCsharpBoundSourceType } from "./type-bindings.js";
import { resolveCsharpSemanticConditionalType } from "./conditional-types.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { ExtensionFactSubject, SourceFile, Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { csharpAnyTargetType, csharpEmptyObjectTargetType, csharpAbsenceTargetType, csharpTsValueTargetType } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { csharpBigIntegerTargetType, csharpObjectTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpNeverTargetType, csharpVoidTargetType } from "../../../../target-model/types/carriers/scalar-types.js";
import { csharpJsSymbolTargetType } from "../../../../target-model/types/carriers/js.js";
import { csharpFixedArrayRepresentationRejection } from "../../../../policy/types/collections/fixed-arrays.js";
import { classifyCsharpSourceProfileType } from "../../../../policy/identities/source-types.js";
import { csharpTargetTypeFromBinding } from "../../../../policy/types/storage/bindings.js";
import { maximumTypeResolutionDepth } from "./model.js";
import { failTargetAnalysisInvariant, failTargetCompilerResourceLimit } from "@tsonic/target-api/artifacts";
import { nextState } from "./state.js";
import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import { relateTypeArguments } from "./generic-arguments.js";
import { resolveTypeParameter, definedValues } from "./source-evidence.js";

import { csharpSourceStorageComponentContext } from "./source-storage-projection.js";
import { formCsharpSemanticTypeSource, type CsharpSemanticTypeSource } from "./root-sources.js";
import { resolveFormedCsharpProjectSemanticType } from "./project-types.js";
import { formCsharpSemanticTypeArgumentsSource, type CsharpSemanticTypeArgumentsSource } from "./semantic-argument-source.js";
import { formCsharpDirectSourceEvidence, resolveFormedCsharpDirectSourceFacts } from "./direct-source-evidence.js";

export function resolveTypeWithState(
  scope: CsharpTypeResolutionScope,
  type: Type | undefined,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  return resolveFormedCsharpSemanticTypeSource(scope, formCsharpSemanticTypeSource(scope, type, sourceFile, state));
}

export function resolveFormedCsharpSemanticTypeSource(
  scope: CsharpTypeResolutionScope,
  source: CsharpSemanticTypeSource,
): TargetTypeRef | undefined {
  const { host, policy, resolveCallableType, resolveCompositionalSourceTypeAlias, resolveFormedDirectSourceFacts, resolveNodeWithState, resolveProviderType, resolveFormedSemanticTypeArguments, resolveSourceProfileType, resolveTypeWithState, resolveUnionType } = scope;
  if (source.type === undefined) return undefined;
  if (source.state.depth > maximumTypeResolutionDepth) failTargetCompilerResourceLimit("tsonic-csharp",
    `Native type resolution in ${host.ast.getFileName(source.sourceFile)}`, "depth", maximumTypeResolutionDepth, source.sourceFile);
  if (source.kind === "unavailable") return undefined;
  const { type, sourceFile, state, queries } = source;
  if (source.nonPrimitive) return csharpObjectTargetType();
  const bound = completeCsharpBoundSourceType(source.binding, state);
  if (bound !== undefined) return bound.targetType;
  const conditional = resolveCsharpSemanticConditionalType(scope, type, queries, state);
  if (conditional !== undefined) return conditional.type;
  const subjects = source.subjects;
  const direct = resolveFormedDirectSourceFacts(source.direct);
  if (direct !== undefined) {
    return direct;
  }
  const fixedArray = policy.selectFixedArray(type, sourceFile);
  if (fixedArray !== undefined) {
    if (fixedArray.kind === "invalid" || csharpFixedArrayRepresentationRejection(fixedArray.fact) !== undefined) return undefined;
    const element = fixedArray.fact.elementType === undefined
      ? resolveTypeWithState(fixedArray.fact.elementSourceType, sourceFile, nextState(state))
      : resolveNodeWithState(fixedArray.fact.elementType, host.ast.getSourceFile(fixedArray.fact.elementType) ?? sourceFile, nextState(state));
    return element === undefined ? undefined : { kind: "array", element };
  }
  const substitutionBase = queries.types.substitutionBaseType(type);
  if (substitutionBase !== undefined) {
    return resolveTypeWithState(
      substitutionBase,
      sourceFile,
      nextState(state),
    );
  }
  const transformation = queries.types.standardTransformation(undefined, type);
  if (transformation !== undefined) return transformation.kind === "component"
    ? scope.resolveSourceTypeComponentEvidence(transformation.component, queries, nextState(state))
    : undefined;
  const application = queries.types.aliasApplication(type);
  if (application?.kind === "direct" && sourceTypeSyntaxIsCompositional(host.ast, application.typeNode) &&
    host.navigation.isProjectDeclaration(application.declaration)) {
    const typeName = host.ast.name(application.declaration);
    const arguments_ = application.bindings.map(binding => resolveTypeWithState(binding.argument, sourceFile, nextState(state)));
    if (typeName === undefined || arguments_.some(argument => argument === undefined)) return undefined;
    const alias = resolveCompositionalSourceTypeAlias(typeName, arguments_ as readonly TargetTypeRef[], type, queries, state,
      application.bindings.map(binding => binding.argument));
    return alias.kind === "resolved" ? alias.type : undefined;
  }
  if (source.arguments.type !== type || source.arguments.queries !== queries || source.arguments.state !== state) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "Semantic type arguments require their exact retained source occurrence.", sourceFile);
  }
  const targetTypeArguments = resolveFormedSemanticTypeArguments(source.arguments);
  if (targetTypeArguments === undefined) {
    return undefined;
  }
  const providerType = resolveProviderType(subjects, targetTypeArguments);
  if (providerType !== undefined) {
    return providerType;
  }
  const typeParameter = resolveTypeParameter(type, queries, host.ast, host.typeParameterConstraints);
  if (typeParameter !== undefined) {
    return typeParameter;
  }
  if (queries.types.isAny(type)) {
    return csharpAnyTargetType();
  }
  if (queries.types.isUnknown(type)) {
    return csharpTsValueTargetType();
  }
  if (queries.types.isNever(type)) {
    return csharpNeverTargetType();
  }
  if (queries.types.isNullish(type)) {
    return csharpAbsenceTargetType();
  }
  if (queries.types.isUnion(type)) {
    return resolveUnionType(type, queries, state);
  }
  if (queries.types.isTuple(type)) {
    const rawSourceElements = queries.types.tupleElementTypes(type);
    const sourceElements = definedValues(
      rawSourceElements,
    );
    if (sourceElements.length !== rawSourceElements.length) {
      return undefined;
    }
    const elements = sourceElements.map((element, index) =>
      resolveTypeWithState(element, sourceFile,
        nextState(csharpSourceStorageComponentContext(host, state, { kind: "tuple-element", index })))
    );
    return elements.some((element) => element === undefined)
      ? undefined
      : {
          kind: "tuple",
          elements: elements as readonly TargetTypeRef[],
        };
  }
  const profileType = classifyCsharpSourceProfileType(type, queries, host.ast);
  if (profileType !== undefined) {
    return resolveSourceProfileType(
      profileType,
      targetTypeArguments,
    );
  }
  const constructor = resolveCsharpConstructorValueType(scope, type, queries, state);
  if (constructor !== undefined) return constructor;
  const projectType = resolveFormedCsharpProjectSemanticType(scope, source.project, targetTypeArguments);
  if (projectType !== undefined) {
    return projectType;
  }
  const callable = resolveCallableType(type, queries, state);
  if (callable !== undefined) {
    return callable;
  }
  if (queries.types.isBooleanLike(type)) {
    return csharpSourcePrimitiveTargetType("bool");
  }
  if (queries.types.isNumberLike(type)) {
    return csharpSourcePrimitiveTargetType("float64");
  }
  if (queries.types.isStringLike(type)) {
    return csharpStringTargetType();
  }
  if (queries.types.isBigIntLike(type)) {
    return csharpBigIntegerTargetType();
  }
  if (host.target.surfaces?.includes("js") === true && queries.types.isSymbolLike(type)) {
    return csharpJsSymbolTargetType();
  }
  if (queries.types.isVoidLike(type)) {
    return csharpVoidTargetType();
  }
  if (!queries.types.isSymbolLike(type) && !queries.types.couldContainTypeVariables(type) && queries.types.propertyInfos(type).length === 0 &&
    queries.types.callSignatures(type).length === 0 && queries.types.constructSignatures(type).length === 0 &&
    queries.types.indexInfos(type).length === 0) {
    return csharpEmptyObjectTargetType();
  }
  return host.structuralTypes.completeTypeSource(source.structural);
}

export function resolveDirectSourceFacts(
  scope: CsharpTypeResolutionScope,
  subjects: readonly ExtensionFactSubject[],
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  return resolveFormedCsharpDirectSourceFacts(scope,
    formCsharpDirectSourceEvidence(scope, subjects, sourceFile, state));
}

export function resolveProviderType(
  { host }: CsharpTypeResolutionScope,
  subjects: readonly ExtensionFactSubject[],
  typeArguments: readonly TargetTypeRef[],
): TargetTypeRef | undefined {
  for (const subject of subjects) {
    const declaration = host.sourceFacts?.getFact(
      subject,
      providerVirtualDeclarationFactKey,
    );
    if (declaration === undefined) {
      continue;
    }
    const resolution = host.providers.resolveType(declaration);
    if (resolution.kind !== "resolved") {
      continue;
    }
    const typeRelations = resolution.relations.filter(
      (relation) => relation.kind === "type",
    );
    if (typeRelations.length !== 1) {
      continue;
    }
    const relation = typeRelations[0]!;
    const targetArguments = relateTypeArguments(
      typeArguments,
      relation.bindingTypeParameters,
      relation.targetBinding.typeParameters?.length ?? 0,
    );
    if (targetArguments === undefined) {
      continue;
    }
    const targetType = csharpTargetTypeFromBinding(
      relation.targetBinding,
      targetArguments,
    );
    if (targetType !== undefined) {
      return targetType;
    }
  }
  return undefined;
}

export function resolveSemanticTypeArguments(
  scope: CsharpTypeResolutionScope,
  type: Type,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): readonly TargetTypeRef[] | undefined {
  return resolveFormedCsharpSemanticTypeArguments(scope,
    formCsharpSemanticTypeArgumentsSource(scope, type, queries, state));
}

export function resolveFormedCsharpSemanticTypeArguments(
  { resolveTypeWithState }: CsharpTypeResolutionScope,
  source: CsharpSemanticTypeArgumentsSource,
): readonly TargetTypeRef[] | undefined {
  if (source.kind === "not-reference") return [];
  if (source.kind === "unavailable") return undefined;
  const resolved = source.arguments.map((argument) =>
    resolveTypeWithState(argument.type, source.queries.sourceFile, argument.state)
  );
  return resolved.some((argument) => argument === undefined)
    ? undefined
    : resolved as readonly TargetTypeRef[];
}
