import type { ResolvedSourceElementAccessInfo, ResolvedSourcePropertyAccessInfo, SourceFile } from "@tsonic/tsts";
import type { CsharpProviderCallSelectionHost } from "../../../policy/model/provider-calls.js";
import type { CsharpArrayLikeUnionProjection } from "../../../target-model/conversions/selection.js";
import type { CsharpSourceProfileElementPolicyResult } from "../../../policy/model/source-profiles.js";
import type { CsharpSourceProfilePropertyPolicyResult } from "../../../target-model/records/source-profile-invocations.js";
import { sourceProfilePropertyIdentities } from "../../source-profiles/policy-selection.js";
import { csharpSourceProfileDeclarationIdentity, type CsharpSourceProfileDeclarationIdentity } from "../../../policy/identities/selected-source.js";
import { csharpArrayLikeElement, csharpArrayLikeTargetType } from "../../../target-model/types/carriers/array-like.js";
import { getCsharpRuntimeUnionArms } from "../../../target-model/types/carriers/runtime-carriers.js";

import { csharpSourcePrimitiveTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { typedArrayNames } from "../../../target-model/types/carriers/js.js";

import { selectCsharpArrayUnionPropertyPlan, selectCsharpArrayUnionElementPlan } from "../../../policy/operations/source-profiles/js/array-unions.js";
const owners: ReadonlySet<string> = new Set(["Array", "ReadonlyArray", "TypedArray", ...typedArrayNames]);
const numberType = csharpSourcePrimitiveTargetType("float64");

function project(
  host: CsharpProviderCallSelectionHost,
  receiver: ResolvedSourceElementAccessInfo["receiver"],
  sourceFile: SourceFile,
): CsharpArrayLikeUnionProjection | undefined {
  if (!host.semantics(sourceFile).types.isUnion(receiver.type)) return undefined;
  const source = host.types.resolveSelectedValue(receiver.expression, receiver.type, sourceFile);
  const arms = getCsharpRuntimeUnionArms(source, host.typeDefinitions);
  const element = csharpArrayLikeElement(source, host.typeDefinitions);
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
  return selectCsharpArrayUnionPropertyPlan(projection);
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
  return selectCsharpArrayUnionElementPlan(projection);
}
