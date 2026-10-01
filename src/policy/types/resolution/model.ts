import type {
  AstReader,
  ExtensionFactSubject,
  Node,
  ReadonlySourceFactResolver,
  SourceFile,
  Type,
} from "@tsonic/tsts";
import type { TargetSelection } from "@tsonic/target-api";
import type { TsonicFixedArraySelection, TsonicPointerReturnQueries, TsonicMemoryBindingIndex } from "@tsonic/source-core/facts";
import type { CsharpPointerReturnContract } from "../callables/pointer-return.js";
import type {
  SourceFileSemantics,
  SourceProgramNavigation,
} from "@tsonic/target-api/source";
import type { CsharpProjectTypeCatalog, CsharpProjectTypePolicy } from "../project/project-types.js";
import type { CsharpProviderRelationResolver } from "../../../providers/model/relation-resolver.js";
import type { CsharpSourceCallableContract } from "../callables/source-callable-contract.js";
import type { CsharpSourceTypedLocationOperation } from "../../operations/typed-locations/source-typed-locations.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpSourceTargetTypeBinding } from "../../../target-model/types/model.js";
import type { CsharpObjectShapeFact } from "../../../target-model/types/model.js";
import type { CsharpObjectShapePolicy } from "../objects/object-shape-policy.js";

export type ResolvedSourceCallInfo = NonNullable<
  ReturnType<SourceFileSemantics["operations"]["call"]>
>;

export interface CsharpSourceCallResult {
  readonly nativeType: TargetTypeRef;
  readonly selectedType: TargetTypeRef;
}

export interface CsharpPlanningRepresentationQueries {
  genericProjections?(declaration: Node): readonly import("../../../target-model/types/projections.js").CsharpProjectedType[];
  requiresClosedStructuralContract(type: TargetTypeRef): boolean;
  scopedTargetType(node: Node): TargetTypeRef | undefined;
  sourceCallable(
    source: ResolvedSourceCallInfo,
    sourceFile: SourceFile,
  ): CsharpSourceCallableContract | undefined;
}

export interface CsharpTypePolicyBaseHost {
  callOnlyAlias(declaration: Node): import("@tsonic/target-api/source").SourceCallOnlyAlias | undefined;
  readonly typeDefinitions?: import("../../../target-model/types/source-union-definitions.js").CsharpTypeDefinitionWriter;
  readonly ast: AstReader;
  readonly sourceFiles: readonly SourceFile[];
  readonly sourceFacts?: ReadonlySourceFactResolver;
  readonly navigation: SourceProgramNavigation;
  readonly pointerReturns: TsonicPointerReturnQueries;
  readonly memoryBindings: TsonicMemoryBindingIndex;
  readonly providers: CsharpProviderRelationResolver;
  readonly target: TargetSelection;
  semantics(sourceFile: SourceFile): SourceFileSemantics;
  semanticsFor(node: Node): SourceFileSemantics;
  hasSemantics(sourceFile: SourceFile): boolean;
}

export interface CsharpTypePolicyHost extends CsharpTypePolicyBaseHost {
  closedTypeGuard(node: Node): import("@tsonic/target-api/source").SourceNativeGuard<import("../../../target-model/operations/type-tests.js").CsharpClosedTypePredicate> | undefined;
  bindingProjection(node: Node, sourceFile: SourceFile): import("../objects/binding-projection-policy.js").CsharpBindingProjection | undefined;
  readonly representations: CsharpPlanningRepresentationQueries;
  readonly projectTypeCatalog: CsharpProjectTypeCatalog;
  readonly objectShapes: CsharpObjectShapePolicy;
  projectTypes(): CsharpProjectTypePolicy;
  targetTypeComponents(type: TargetTypeRef): readonly TargetTypeRef[];
  readonly structuralTypes: {
    resolveReference(type: Type): TargetTypeRef | undefined;
    resolveUnion(type: Type, sourceFile: SourceFile, state: CsharpTypeResolutionState): import("../objects/object-shape-policy/model.js").CsharpStructuralUnionResolution;
    resolveTarget(type: TargetTypeRef): CsharpObjectShapeFact | undefined;
    resolveNode(
      node: Node,
      sourceFile: SourceFile,
      state: CsharpTypeResolutionState,
    ): TargetTypeRef | undefined;
    resolveType(
      type: Type,
      sourceFile: SourceFile,
      state: CsharpTypeResolutionState,
      authoredTypeRoot?: Node,
    ): TargetTypeRef | undefined;
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

export interface CsharpTypePolicy {
  nativeFlowMembers(reference: Node, sourceCarrier: TargetTypeRef): readonly TargetTypeRef[] | undefined;
  nativeFlowTypes(reference: Node, sourceType: Type): readonly Type[] | undefined;
  resolveBindingProjection(node: Node, sourceFile: SourceFile): import("../objects/binding-projection-policy.js").CsharpBindingProjection | undefined;
  selectFixedArray(type: Type, sourceFile: SourceFile): TsonicFixedArraySelection | undefined;
  resolvePointerReturn(declaration: Node): CsharpPointerReturnContract | undefined;
  resolveNode(node: Node | undefined, sourceFile?: SourceFile): TargetTypeRef | undefined;
  resolveStorage(node: Node | undefined, sourceFile?: SourceFile): TargetTypeRef | undefined;
  resolveReadStorage(node: Node | undefined, sourceFile?: SourceFile): TargetTypeRef | undefined;
  resolveType(type: Type | undefined, sourceFile: SourceFile): TargetTypeRef | undefined;
  resolveValue(
    node: Node | undefined,
    type: Type | undefined,
    sourceFile: SourceFile,
  ): TargetTypeRef | undefined;
  resolveSelectedValue(
    node: Node,
    selectedType: Type,
    sourceFile: SourceFile,
  ): TargetTypeRef | undefined;
  resolveSelectedType(
    authoredTypeNode: Node | undefined,
    selectedType: Type | undefined,
    selectedSourceFile: SourceFile,
  ): TargetTypeRef | undefined;
  resolveSelectedResult(
    selectedDeclaration: Node | undefined,
    selectedType: Type | undefined,
    selectedSourceFile: SourceFile,
  ): TargetTypeRef | undefined;
  resolveTypedLocationOperationPointee(
    operation: CsharpSourceTypedLocationOperation,
    sourceFile: SourceFile,
  ): TargetTypeRef | undefined;
  resolveSourceCallTypeArguments(
    source: ResolvedSourceCallInfo,
    sourceFile: SourceFile,
  ): readonly TargetTypeRef[] | undefined;
  resolveSourceCallParameter(
    source: ResolvedSourceCallInfo,
    parameterIndex: number,
    sourceFile: SourceFile,
  ): TargetTypeRef | undefined;
  resolveSourceCallParameters(
    source: ResolvedSourceCallInfo,
    sourceFile: SourceFile,
  ): readonly import("../../../target-model/types/model.js").CsharpTargetParameter[] | undefined;
  resolveSourceCallArgumentParameter(
    source: ResolvedSourceCallInfo,
    binding: ResolvedSourceCallInfo["sourceArgumentBindings"][number],
    sourceFile: SourceFile,
  ): TargetTypeRef | undefined;
  resolveSourceCallResult(
    source: ResolvedSourceCallInfo,
    sourceFile: SourceFile,
  ): CsharpSourceCallResult | undefined;
  withSourceTargetBindings(
    bindings: readonly CsharpSourceTargetTypeBinding[],
  ): CsharpScopedTypePolicyResult;
}

export interface CsharpTypeResolutionState {
  readonly depth: number;
  readonly sourceBindings?: ReadonlyMap<Node, {
    readonly sourceType: Type;
    readonly targetType: TargetTypeRef;
  }>;
}

export interface CsharpRecursiveTypeResolver {
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
