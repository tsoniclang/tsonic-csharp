import type { Node, SourceFile, Type } from "@tsonic/tsts";

import type { TsonicFixedArraySelection } from "@tsonic/source-core/facts";
import type { CsharpPointerReturnContract } from "../../target-model/records/calls/pointer-return.js";

import type { CsharpSourceTypedLocationOperation } from "../../source/extension/typed-locations.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";

import type { CsharpArrayLiteralSelection } from "../../target-model/records/operations/array-literals.js";

import type { ResolvedSourceCallInfo } from "../../target-model/records/calls/source-calls.js";
import type { CsharpSourceCallResult } from "../../target-model/operations/source-call-results.js";
import type { CsharpNativeSourceCarrierSelection } from "../../target-model/records/objects/object-shapes.js";

export type CsharpNodeTypeResolution = CsharpNativeSourceCarrierSelection;

export interface CsharpTypeQueries {
  resolveArrayLiteral(node: Node, sourceFile: SourceFile): CsharpArrayLiteralSelection;
  nativeGuardResult(expression: Node): boolean | undefined;
  nativeUnreachable(node: Node): boolean;
  nativeFlowMembers(reference: Node, sourceCarrier: TargetTypeRef): readonly TargetTypeRef[] | undefined;
  nativeFlowTypes(reference: Node, sourceType: Type): readonly Type[] | undefined;
  resolveBindingProjection(node: Node, sourceFile: SourceFile): import("../../target-model/records/storage/binding-projection-policy.js").CsharpBindingProjection | undefined;
  selectFixedArray(type: Type, sourceFile: SourceFile): TsonicFixedArraySelection | undefined;
  resolvePointerReturn(declaration: Node): CsharpPointerReturnContract | undefined;
  resolveNode(node: Node | undefined, sourceFile?: SourceFile): CsharpNodeTypeResolution | undefined;
  resolveStorage(node: Node | undefined, sourceFile?: SourceFile): TargetTypeRef | undefined;
  resolveReadStorage(node: Node | undefined, sourceFile?: SourceFile): TargetTypeRef | undefined;
  resolveType(type: Type | undefined, sourceFile: SourceFile): TargetTypeRef | undefined;
  selectSourceUnionMember(carrier: TargetTypeRef, selected: Type, sourceFile: SourceFile):
    { readonly kind: "unavailable" | "rejected" } | { readonly kind: "resolved"; readonly carrier: TargetTypeRef };
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
  ): readonly import("../../target-model/types/model.js").CsharpTargetParameter[] | undefined;
  resolveSourceCallArgumentParameter(
    source: ResolvedSourceCallInfo,
    binding: ResolvedSourceCallInfo["sourceArgumentBindings"][number],
    sourceFile: SourceFile,
    excludedSourceArgumentIndexes?: ReadonlySet<number>,
  ): TargetTypeRef | undefined;
  resolveSourceCallResult(
    source: ResolvedSourceCallInfo,
    sourceFile: SourceFile,
    nativeType: TargetTypeRef | undefined,
  ): CsharpSourceCallResult | undefined;
}
