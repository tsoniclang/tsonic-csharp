import type { ResolvedSourceElementAccessInfo, ResolvedSourcePropertyAccessInfo, SourceFile } from "@tsonic/tsts";
import type { CsharpProviderCallSelectionHost } from "../../members/selection/call-selection.js";
import type { CsharpArrayLikeUnionProjection } from "../../../conversions/selection/model.js";
import type { CsharpSourceProfileElementPolicyResult, CsharpSourceProfilePropertyPolicyResult } from "../source-profile-policy.js";
import { sourceProfilePropertyIdentities } from "../source-profile-policy.js";
import { csharpSourceProfileDeclarationIdentity, type CsharpSourceProfileDeclarationIdentity } from "../source-profile-identity.js";
import { csharpArrayLikeElement, csharpArrayLikeTargetType } from "../../../../target-model/types/array-like.js";
import { getCsharpRuntimeUnionArms } from "../../../../target-model/types/runtime-carriers.js";
import { csharpNullableValueTargetType } from "../../../../target-model/types/nullable.js";
import { csharpSourcePrimitiveTargetType } from "../../../../target-model/types/scalar-types.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { typedArrayNames } from "../../../types/resolution/surface-types.js";
import { jsRuntimeTargetType, staticMethod, targetParameter, targetProperty } from "./common.js";

const owners: ReadonlySet<string> = new Set(["Array", "ReadonlyArray", "TypedArray", ...typedArrayNames]);
const numberType = csharpSourcePrimitiveTargetType("float64");

function project(
  host: CsharpProviderCallSelectionHost,
  receiver: ResolvedSourceElementAccessInfo["receiver"],
  sourceFile: SourceFile,
): CsharpArrayLikeUnionProjection | undefined {
  if (!host.semantics(sourceFile).types.isUnion(receiver.type)) return undefined;
  const source = host.types.resolveSelectedValue(receiver.expression, receiver.type, sourceFile);
  const arms = getCsharpRuntimeUnionArms(source);
  const element = csharpArrayLikeElement(source);
  return source === undefined || arms === undefined || element === undefined || !targetTypeRefEquals(element, numberType)
    ? undefined : { source, target: csharpArrayLikeTargetType(element), conversion: { kind: "array-like-union", arms } };
}

function owned(identity: CsharpSourceProfileDeclarationIdentity | undefined): boolean {
  return identity?.owner === "js" && identity.declaringName !== undefined && owners.has(identity.declaringName);
}

export function selectCsharpArrayUnionProperty(
  host: CsharpProviderCallSelectionHost,
  source: ResolvedSourcePropertyAccessInfo,
  sourceFile: SourceFile,
): CsharpSourceProfilePropertyPolicyResult | undefined {
  if (source.optionalChain || source.accessMode !== "read") return undefined;
  const projection = project(host, source.receiver, sourceFile);
  if (projection === undefined) return undefined;
  const identities = sourceProfilePropertyIdentities(host, source, sourceFile);
  if (identities.length === 0 || identities.some(identity => !owned(identity) || identity.kind !== "member" || identity.name !== "length")) return undefined;
  return {
    kind: "resolved", receiver: { kind: "instance" }, invocation: { kind: "array-like", projection },
    targetMember: targetProperty("Tsonic.CSharp.Js.IArrayLike.Length", "length", "Length", projection.target, csharpSourcePrimitiveTargetType("int32"), { readonly: true }),
  };
}

export function selectCsharpArrayUnionElement(
  host: CsharpProviderCallSelectionHost,
  source: ResolvedSourceElementAccessInfo,
  sourceFile: SourceFile,
): CsharpSourceProfileElementPolicyResult | undefined {
  if (source.optionalChain || source.accessMode !== "read") return undefined;
  const projection = project(host, source.receiver, sourceFile);
  if (projection === undefined) return undefined;
  const semantics = host.semantics(sourceFile);
  if (!semantics.types.isNumberLike(source.argument.type)) return undefined;
  const indexes = semantics.types.indexInfos(source.receiver.type).filter(info => info.keyType !== undefined && semantics.types.isNumberLike(info.keyType));
  if (indexes.length !== 1) return undefined;
  const selected = indexes[0]!;
  const declarations = selected.declaration === undefined ? selected.components : [selected.declaration];
  if (declarations.length === 0 || declarations.some(declaration => {
    const identity = csharpSourceProfileDeclarationIdentity(host.ast, semantics, host.sourceFacts, declaration);
    return !owned(identity) || identity?.kind !== "indexer";
  })) return undefined;
  return {
    kind: "resolved", receiver: { kind: "instance" }, targetParameterIndex: 0,
    invocation: { kind: "array-like", projection },
    targetMember: staticMethod("Tsonic.CSharp.Js.ArrayLike.ReadNumber", "index", "ReadNumber", jsRuntimeTargetType("ArrayLike"),
      [targetParameter("index", numberType)], csharpNullableValueTargetType(numberType)),
  };
}
