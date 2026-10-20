import { jsRegExpSourceProfileIdentity } from "@tsonic/js-source-profile";

import type { TargetTypeRef } from "../../../types/index.js";
import { csharpJsRegExpExecArrayTargetType, csharpJsRegExpIndicesArrayTargetType, csharpRegExpIndexPairTargetType, csharpJsRegExpMatchArrayTargetType, csharpJsRegExpNamedGroupsTargetType, csharpJsRegExpNamedIndicesTargetType, csharpJsRegExpStringIteratorTargetType, csharpJsRegExpTargetType, csharpExactJsRegExpExecArrayTargetType, csharpExactJsRegExpIndicesArrayTargetType, csharpExactJsRegExpMatchArrayTargetType, csharpExactJsRegExpNamedGroupsTargetType, csharpExactJsRegExpNamedIndicesTargetType, csharpExactJsRegExpStringIteratorTargetType } from "../../../../target-model/types/carriers/js.js";
import { csharpJsStringTargetType, csharpNullableTargetType, csharpAbsenceTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../../target-model/types/index.js";
import type { CsharpSourceProfilePropertyPolicy } from "../../../model/source-profiles.js";
import { jsMemberIdentity, jsPropertyPolicy, targetProperty } from "./common.js";

const identity = jsRegExpSourceProfileIdentity;
const regexpOwner = identity.owners.regExp;
const regexpConstructorOwner = identity.owners.regExpConstructor;
const regexpExecArrayOwner = identity.owners.regExpExecArray;
const regexpMatchArrayOwner = identity.owners.regExpMatchArray;
const regexpIndicesArrayOwner = identity.owners.regExpIndicesArray;
const regexpNamedGroupsOwner = identity.owners.regExpNamedGroups;
const regexpNamedIndicesOwner = identity.owners.regExpNamedIndices;
const exactExecArrayOwner = identity.owners.jsRegExpExecArray;
const exactMatchArrayOwner = identity.owners.jsRegExpMatchArray;
const exactIndicesArrayOwner = identity.owners.jsRegExpIndicesArray;
const exactNamedGroupsOwner = identity.owners.jsRegExpNamedGroups;
const exactNamedIndicesOwner = identity.owners.jsRegExpNamedIndices;
const regexpMembers = identity.regExpMembers;
const regexpConstructorMembers = identity.regExpConstructorMembers;
const regexpResultMembers = identity.regExpResultMembers;
const wellKnown = identity.wellKnownMemberKeys;

const regexpType = csharpJsRegExpTargetType();
const execArrayType = csharpJsRegExpExecArrayTargetType();
const matchArrayType = csharpJsRegExpMatchArrayTargetType();
const indicesArrayType = csharpJsRegExpIndicesArrayTargetType();
const namedGroupsType = csharpJsRegExpNamedGroupsTargetType();
const namedIndicesType = csharpJsRegExpNamedIndicesTargetType();
const iteratorType = csharpJsRegExpStringIteratorTargetType();
const stringType = csharpStringTargetType();
const jsStringType = csharpJsStringTargetType();
const exactExecArrayType = csharpExactJsRegExpExecArrayTargetType();
const exactMatchArrayType = csharpExactJsRegExpMatchArrayTargetType();
const exactIndicesArrayType = csharpExactJsRegExpIndicesArrayTargetType();
const exactNamedGroupsType = csharpExactJsRegExpNamedGroupsTargetType();
const exactNamedIndicesType = csharpExactJsRegExpNamedIndicesTargetType();
const exactIteratorType = csharpExactJsRegExpStringIteratorTargetType();
const doubleType = csharpSourcePrimitiveTargetType("float64");
const intType = csharpSourcePrimitiveTargetType("int32");
const boolType = csharpSourcePrimitiveTargetType("bool");
const undefinedType = csharpAbsenceTargetType();
const nullableStringType = csharpNullableTargetType(stringType);
const nullablePairType = csharpNullableTargetType(csharpRegExpIndexPairTargetType());
const noReceiver = { kind: "none" } as const;
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
