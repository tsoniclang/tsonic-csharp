import { jsRegExpSourceProfileIdentity } from "@tsonic/js-source-profile";

import type { TargetTypeRef } from "../../../types/index.js";
import { csharpJsRegExpIndicesArrayTargetType, csharpJsRegExpNamedGroupsTargetType } from "../../../../target-model/types/carriers/js.js";
import { csharpNullableTargetType } from "../../../../target-model/types/index.js";
import type { CsharpSourceProfilePropertyPolicy } from "../../../model/source-profiles.js";
import { jsMemberIdentity, jsPropertyPolicy, targetProperty } from "./common.js";

const identity = jsRegExpSourceProfileIdentity;
const regexpResultMembers = identity.regExpResultMembers;

const indicesArrayType = csharpJsRegExpIndicesArrayTargetType();
const namedGroupsType = csharpJsRegExpNamedGroupsTargetType();
const instanceReceiver = { kind: "instance" } as const;

export function regexpResultPropertyPolicies(
  owner: string,
  declaringType: TargetTypeRef,
  indexType: TargetTypeRef,
  inputType: TargetTypeRef,
  groupsType: TargetTypeRef = namedGroupsType,
  indicesType: TargetTypeRef = indicesArrayType,
): readonly CsharpSourceProfilePropertyPolicy[] {
  return [
    jsPropertyPolicy(
      jsMemberIdentity(owner, regexpResultMembers.index),
      () =>
        targetProperty(
          `Tsonic.CSharp.Js.${owner}.index`,
          regexpResultMembers.index,
          regexpResultMembers.index,
          declaringType,
          indexType,
          { readonly: true },
        ),
      instanceReceiver,
    ),
    jsPropertyPolicy(
      jsMemberIdentity(owner, regexpResultMembers.input),
      () =>
        targetProperty(
          `Tsonic.CSharp.Js.${owner}.input`,
          regexpResultMembers.input,
          regexpResultMembers.input,
          declaringType,
          inputType,
          { readonly: true },
        ),
      instanceReceiver,
    ),
    jsPropertyPolicy(
      jsMemberIdentity(owner, regexpResultMembers.groups),
      () =>
        targetProperty(
          `Tsonic.CSharp.Js.${owner}.groups`,
          regexpResultMembers.groups,
          regexpResultMembers.groups,
          declaringType,
          csharpNullableTargetType(groupsType),
          { readonly: true },
        ),
      instanceReceiver,
    ),
    jsPropertyPolicy(
      jsMemberIdentity(owner, regexpResultMembers.indices),
      () =>
        targetProperty(
          `Tsonic.CSharp.Js.${owner}.indices`,
          regexpResultMembers.indices,
          regexpResultMembers.indices,
          declaringType,
          csharpNullableTargetType(indicesType),
          { readonly: true },
        ),
      instanceReceiver,
    ),
  ];
}
