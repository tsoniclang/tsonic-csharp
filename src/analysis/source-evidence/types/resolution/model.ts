import type { CsharpNodeTypeResolution, CsharpTypeQueries } from "../../../../policy/model/type-resolution.js";
import type { AstReader, ExtensionFactSubject, Node, ReadonlySourceFactResolver, SourceFile, Type } from "@tsonic/tsts";
import type { TargetSelection } from "@tsonic/target-api";
import type { TsonicPointerStorageRelation, TsonicMemoryBindingIndex } from "@tsonic/source-core/facts";

import type { SourceFileSemantics, SourceProgramNavigation } from "@tsonic/target-api/source";
import type { CsharpProjectTypeCatalog, CsharpProjectTypePolicy } from "../../../../target-model/records/types/project-types.js";
import type { CsharpProviderRelationResolver } from "../../../../providers/model/relation-resolver.js";
import type { SourceCallableContract, SourceCallableSourceContract } from "../../../../target-model/records/callables/source-callable-contract.js";

import type { TargetTypeRef, CsharpSourceTargetTypeBinding, CsharpObjectShapeFact } from "../../../../target-model/types/model.js";
import type { CsharpObjectShapePolicy } from "../../../../target-model/records/objects/object-shapes.js";
import type { CsharpObjectMethodSources } from "../../../../target-model/records/native/native-value-carriers.js";
import type { CsharpCompletedStructuralMemberChildren, CsharpStructuralMemberInheritance,
  CsharpStructuralPropertyApplication, CsharpStructuralTypeApplication } from "./structural-applications.js";
import type { CsharpObjectShapeNodeSource } from "../../../objects/shapes/node-source.js";
import type { CsharpObjectShapeTypeSource } from "../../../objects/shapes/type-source.js";
import type { CsharpStructuralNodeSourceInput, CsharpStructuralTypeSourceInput } from "./root-sources.js";

export type ResolvedSourceCallInfo = NonNullable<
  ReturnType<SourceFileSemantics["operations"]["call"]>
>;


export interface CsharpPlanningRepresentationQueries {
  genericProjections(declaration: Node): readonly import("../../../../target-model/types/projections.js").CsharpProjectedType[];
  requiresClosedStructuralContract(type: TargetTypeRef): boolean;
  scopedTargetType(node: Node): TargetTypeRef | undefined;
  closedInputContract(node: Node): SourceCallableSourceContract | undefined;
  sourceCallableSource(
    source: ResolvedSourceCallInfo,
    sourceFile: SourceFile,
  ): import("../../../program/source-callable-source.js").CsharpSourceCallableSource;
  completeSourceCallable(
    source: import("../../../program/source-callable-source.js").CsharpSourceCallableSource,
    selection: "checked" | "implementation",
  ): SourceCallableContract | undefined;
}

export interface CsharpTypePolicyBaseHost {
  readonly moduleCallables: import("../../../../target-model/records/callables/module-callables.js").CsharpModuleCallableIdentities;
  readonly integerRanges: import("../../../../target-model/records/operations/integer-ranges.js").CsharpIntegerRangeIndex;
  readonly objectMethodSources: CsharpObjectMethodSources;
  readonly literalValues: import("@tsonic/target-api/source").SourceLiteralIndex;
  readonly sourceStorage: import("@tsonic/target-api/analysis").SourceStorageQueries;
  callOnlyAlias(declaration: Node): import("@tsonic/target-api/source").SourceCallOnlyAlias | undefined;
  readonly typeDefinitions?: import("../../../program/records/types/type-definitions.js").CsharpTypeDefinitionWriter;
  readonly ast: AstReader;
  readonly sourceFiles: readonly SourceFile[];
  readonly sourceFacts?: ReadonlySourceFactResolver;
  readonly navigation: SourceProgramNavigation;
  readonly pointerStorage: TsonicPointerStorageRelation;
  readonly memoryBindings: TsonicMemoryBindingIndex;
  readonly providers: CsharpProviderRelationResolver;
  readonly target: TargetSelection;
  semantics(sourceFile: SourceFile): SourceFileSemantics;
  semanticsFor(node: Node): SourceFileSemantics;
  hasSemantics(sourceFile: SourceFile): boolean;
}

export interface CsharpTypePolicyHost extends CsharpTypePolicyBaseHost {
  readonly typeParameterConstraints: import("../../../../target-model/records/types/type-parameter-constraints.js").CsharpTypeParameterEnvironment;
  closedTypeGuard(node: Node): import("@tsonic/target-api/source").SourceNativeGuard<import("../../../../target-model/operations/type-tests.js").CsharpClosedTypePredicate> | undefined;
  bindingProjection(node: Node, sourceFile: SourceFile): import("../../../../target-model/records/storage/binding-projection-policy.js").CsharpBindingProjection | undefined;
  readonly representations: CsharpPlanningRepresentationQueries;
  readonly projectTypeCatalog: CsharpProjectTypeCatalog;
  readonly objectShapes: CsharpObjectShapePolicy;
  projectTypeABI(): import("../../../../target-model/records/types/project-types.js").CsharpProjectTypeABIPolicy;
  projectTypes(): CsharpProjectTypePolicy;
  targetTypeComponents(type: TargetTypeRef): readonly TargetTypeRef[];
  readonly structuralTypes: {
    memberInheritance(application: CsharpStructuralTypeApplication, memberIndex: number): CsharpStructuralMemberInheritance;
    resolveReference(type: Type): TargetTypeRef | undefined;
    resolveUnion(type: Type, sourceFile: SourceFile, state: CsharpTypeResolutionState): import("../../../objects/shapes/model.js").CsharpStructuralUnionResolution;
    resolveTarget(type: TargetTypeRef): CsharpObjectShapeFact | undefined;
    formNodeSource(
      node: Node,
      queries: SourceFileSemantics,
      state: CsharpTypeResolutionState,
    ): CsharpObjectShapeNodeSource | undefined;
    completeNodeSource(source: CsharpStructuralNodeSourceInput): TargetTypeRef | undefined;
    formTypeSource(
      type: Type,
      queries: SourceFileSemantics,
      state: CsharpTypeResolutionState,
      authoredTypeRoot?: Node,
    ): CsharpObjectShapeTypeSource | undefined;
    completeTypeSource(source: CsharpStructuralTypeSourceInput): TargetTypeRef | undefined;
    resolveSelectedProperty(
      receiverType: TargetTypeRef | undefined,
      selectedSubjects: readonly ExtensionFactSubject[],
      selectedType: Type | undefined,
      sourceFile: SourceFile,
      declaredMemberType: Type | undefined,
    ): TargetTypeRef | undefined;
  };
}

export type CsharpScopedTypePolicyResult =
  | {
      readonly kind: "resolved";
      readonly policy: CsharpTypePolicy;
    }
  | {
      readonly kind: "rejected";
      readonly reason: string;
    };

export interface CsharpTypePolicy extends CsharpTypeQueries {
  withSourceTargetBindings(
    bindings: readonly CsharpSourceTargetTypeBinding[],
  ): CsharpScopedTypePolicyResult;
}

export interface CsharpTypeResolutionState {
  readonly depth: number;
  readonly sourceStorageBindings?: import("@tsonic/target-api/analysis").SourceStorageBindings;
  readonly rejectNativeResolution?: (rejection: Extract<CsharpNodeTypeResolution, { readonly kind: "rejected" }>) => void;
  readonly sourceStorageSubject?: import("@tsonic/target-api/analysis").SourceStorageSubject;
  readonly sourceBindings?: ReadonlyMap<Node, {
    readonly sourceType: Type;
    readonly targetType: TargetTypeRef;
  }>;
}

export interface CsharpRecursiveTypeResolver {
  resolveStructuralPropertyType(application: CsharpStructuralPropertyApplication): TargetTypeRef | undefined;
  resolveStructuralMemberChildren(application: CsharpStructuralTypeApplication,
    memberIndex: number): CsharpCompletedStructuralMemberChildren | undefined;
  resolveNode(
    node: Node | undefined,
    sourceFile: SourceFile | undefined,
    state: CsharpTypeResolutionState,
  ): TargetTypeRef | undefined;
  resolveType(
    type: Type | undefined,
    sourceFile: SourceFile,
    state: CsharpTypeResolutionState,
  ): TargetTypeRef | undefined;
  resolveSelectedType(
    authoredTypeNode: Node | undefined,
    selectedType: Type | undefined,
    selectedSourceFile: SourceFile,
    state: CsharpTypeResolutionState,
  ): TargetTypeRef | undefined;
}

export const maximumTypeResolutionDepth = 128;
