import type {
  AstReader,
  ExtensionFactSubject,
  Node,
  ReadonlySourceFactResolver,
  SourceFile,
  Type,
} from "@tsonic/tsts";
import type {
  TargetSelection,
  TargetTypescriptCompatibilityMode,
} from "@tsonic/target-api";
import type {
  SourceDeclarationReference,
  SourceFileSemantics,
  SourceProgramNavigation,
} from "@tsonic/target-api/source";
import type { CsharpProjectTypeCatalog, CsharpProjectTypePolicy } from "../project/project-types.js";
import type { CsharpProviderRelationResolver } from "../../../providers/model/relation-resolver.js";
import type { CsharpSourceCallableContract } from "../callables/source-callable-contract.js";
import type { CsharpSourceTypedLocationOperation } from "../../operations/typed-locations/source-typed-locations.js";
import type { TargetTypeRef } from "../model/definitions.js";

export type ResolvedSourceCallInfo = NonNullable<
  ReturnType<SourceFileSemantics["getResolvedCallInfo"]>
>;

export interface CsharpTypePolicyBaseHost {
  readonly ast: AstReader;
  readonly sourceFiles: readonly SourceFile[];
  readonly sourceFacts?: ReadonlySourceFactResolver;
  readonly navigation: SourceProgramNavigation;
  readonly providers: CsharpProviderRelationResolver;
  readonly target: TargetSelection;
  readonly typescriptCompatibility: TargetTypescriptCompatibilityMode;
  readonly scopedTargetType?: (
    node: Node,
  ) => TargetTypeRef | undefined;
  sourceCallable(
    source: ResolvedSourceCallInfo,
    sourceFile: SourceFile,
  ): CsharpSourceCallableContract | undefined;
  semantics(sourceFile: SourceFile): SourceFileSemantics;
  semanticsFor(node: Node): SourceFileSemantics;
  hasSemantics(sourceFile: SourceFile): boolean;
}

export interface CsharpTypePolicyHost extends CsharpTypePolicyBaseHost {
  readonly projectTypeCatalog: CsharpProjectTypeCatalog;
  projectTypes(): CsharpProjectTypePolicy;
  targetTypeComponents(type: TargetTypeRef): readonly TargetTypeRef[];
  readonly structuralTypes: {
    resolveNode(
      node: Node,
      sourceFile: SourceFile,
    ): TargetTypeRef | undefined;
    resolveType(
      type: Type,
      sourceFile: SourceFile,
      authoredTypeRoot?: Node,
    ): TargetTypeRef | undefined;
    resolveSelectedProperty(
      receiverType: TargetTypeRef | undefined,
      selectedSubjects: readonly ExtensionFactSubject[],
      selectedType: Type | undefined,
      sourceFile: SourceFile,
    ): TargetTypeRef | undefined;
  };
}

export interface CsharpSourceTargetTypeBinding {
  readonly declaration: Node;
  readonly targetType: TargetTypeRef;
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
  resolveSourceCallArgumentParameter(
    source: ResolvedSourceCallInfo,
    binding: ResolvedSourceCallInfo["sourceArgumentBindings"][number],
    sourceFile: SourceFile,
  ): TargetTypeRef | undefined;
  resolveSourceCallResult(
    source: ResolvedSourceCallInfo,
    sourceFile: SourceFile,
  ): TargetTypeRef | undefined;
  resolveDeclaredNamedType(
    reference: SourceDeclarationReference,
    typeArguments: readonly TargetTypeRef[],
  ): TargetTypeRef | undefined;
  withSourceTargetBindings(
    bindings: readonly CsharpSourceTargetTypeBinding[],
  ): CsharpScopedTypePolicyResult;
}

export interface CsharpTypeResolutionState {
  readonly depth: number;
}

export const maximumTypeResolutionDepth = 128;
