import { jsRegExpSourceProfileIdentity } from "@tsonic/js-source-profile";
import type {
  CsharpTargetMember,
  TargetTypeRef,
} from "../../../types/index.js";
import {
  csharpJsRegExpExecArrayTargetType,
  csharpJsArrayTargetType,
  csharpJsRegExpIndicesArrayTargetType,
  csharpJsRegExpMatchArrayTargetType,
  csharpJsRegExpNamedGroupsTargetType,
  csharpJsRegExpNamedIndicesTargetType,
  csharpJsRegExpStringIteratorTargetType,
  csharpJsRegExpTargetType,
  csharpExactJsRegExpExecArrayTargetType,
  csharpExactJsRegExpIndicesArrayTargetType,
  csharpExactJsRegExpMatchArrayTargetType,
  csharpExactJsRegExpNamedGroupsTargetType,
  csharpExactJsRegExpNamedIndicesTargetType,
  csharpExactJsRegExpStringIteratorTargetType,
  csharpJsStringTargetType,
  csharpNullableTargetType,
  csharpRuntimeUndefinedTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  targetTypeRefEquals,
} from "../../../types/index.js";
import type {
  CsharpSourceProfileCallPolicy,
  CsharpSourceProfileCallPolicyContext,
  CsharpSourceProfileElementPolicy,
  CsharpSourceProfilePropertyPolicy,
} from "../source-profile-policy.js";
import {
  instanceMethod,
  jsCallIdentity,
  jsCallPolicy,
  jsConstructIdentity,
  jsElementPolicy,
  jsIndexerIdentity,
  jsMemberIdentity,
  jsPropertyPolicy,
  staticMethod,
  targetIndexer,
  targetParameter,
  targetProperty,
} from "./common.js";
import {
  csharpJsReplacementCallbackParameter,
} from "./replacement-callback.js";

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
const undefinedType = csharpRuntimeUndefinedTargetType();
const pairType: TargetTypeRef = {
  kind: "tuple",
  elements: [doubleType, doubleType],
};
const nullableStringType = csharpNullableTargetType(stringType);
const nullablePairType = csharpNullableTargetType(pairType);
const noReceiver = { kind: "none" } as const;
const instanceReceiver = { kind: "instance" } as const;

export const csharpJsRegExpCallPolicies:
  readonly CsharpSourceProfileCallPolicy[] = Object.freeze([
    jsCallPolicy(
      jsConstructIdentity(regexpConstructorOwner),
      (context) => regexpConstructionMember(context, "constructor"),
      noReceiver,
      { targetParameterBySourceParameter: regexpConstructionParameterMapping },
    ),
    jsCallPolicy(
      jsCallIdentity(regexpConstructorOwner),
      (context) => regexpConstructionMember(context, "call"),
      noReceiver,
      { targetParameterBySourceParameter: regexpConstructionParameterMapping },
    ),
    jsCallPolicy(
      jsMemberIdentity(regexpConstructorOwner, regexpConstructorMembers.escape),
      (context) => regexpEscapeMember(context),
      noReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity(regexpOwner, regexpMembers.test),
      (context) => regexpInputMember(context, "test"),
      instanceReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity(regexpOwner, regexpMembers.exec),
      (context) => regexpInputMember(context, "exec"),
      instanceReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity(regexpOwner, regexpMembers.toString),
      () => regexpInstanceMethod(regexpMembers.toString, [], stringType),
      instanceReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity(regexpOwner, wellKnown.match),
      (context) => regexpInputMember(context, "match"),
      instanceReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity(regexpOwner, wellKnown.matchAll),
      (context) => regexpInputMember(context, "matchAll"),
      instanceReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity(regexpOwner, wellKnown.replace),
      (context) => regexpReplacementMember(context),
      instanceReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity(regexpOwner, wellKnown.search),
      (context) => regexpInputMember(context, "search"),
      instanceReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity(regexpOwner, wellKnown.split),
      (context) => regexpInputMember(context, "split"),
      instanceReceiver,
    ),
  ]);

const regexpStringProperties = [regexpMembers.source, regexpMembers.flags] as const;
const regexpBoolProperties = [
  regexpMembers.global,
  regexpMembers.hasIndices,
  regexpMembers.ignoreCase,
  regexpMembers.multiline,
  regexpMembers.dotAll,
  regexpMembers.sticky,
  regexpMembers.unicode,
  regexpMembers.unicodeSets,
] as const;

export const csharpJsRegExpPropertyPolicies:
  readonly CsharpSourceProfilePropertyPolicy[] = Object.freeze([
    ...regexpStringProperties.map((name) =>
      jsPropertyPolicy(
        jsMemberIdentity(regexpOwner, name),
        () => regexpProperty(name, stringType, true),
        instanceReceiver,
      )
    ),
    ...regexpBoolProperties.map((name) =>
      jsPropertyPolicy(
        jsMemberIdentity(regexpOwner, name),
        () => regexpProperty(name, boolType, true),
        instanceReceiver,
      )
    ),
    jsPropertyPolicy(
      jsMemberIdentity(regexpOwner, regexpMembers.lastIndex),
      () => regexpProperty(regexpMembers.lastIndex, doubleType, false),
      instanceReceiver,
    ),
    ...regexpResultPropertyPolicies(
      regexpExecArrayOwner,
      execArrayType,
      doubleType,
      stringType,
    ),
    ...regexpResultPropertyPolicies(
      regexpMatchArrayOwner,
      matchArrayType,
      csharpNullableTargetType(doubleType),
      csharpNullableTargetType(stringType),
    ),
    ...regexpResultPropertyPolicies(
      exactExecArrayOwner,
      exactExecArrayType,
      doubleType,
      jsStringType,
      exactNamedGroupsType,
      exactIndicesArrayType,
    ),
    ...regexpResultPropertyPolicies(
      exactMatchArrayOwner,
      exactMatchArrayType,
      csharpNullableTargetType(doubleType),
      csharpNullableTargetType(jsStringType),
      exactNamedGroupsType,
      exactIndicesArrayType,
    ),
    jsPropertyPolicy(
      jsMemberIdentity(regexpIndicesArrayOwner, regexpResultMembers.groups),
      () =>
        targetProperty(
          "Tsonic.CSharp.Js.RegExpIndicesArray.groups",
          regexpResultMembers.groups,
          regexpResultMembers.groups,
          indicesArrayType,
          csharpNullableTargetType(namedIndicesType),
          { readonly: true },
        ),
      instanceReceiver,
    ),
    jsPropertyPolicy(
      jsIndexerIdentity(regexpNamedGroupsOwner),
      () =>
        targetIndexer(
          "Tsonic.CSharp.Js.RegExpNamedGroups.indexer",
          namedGroupsType,
          stringType,
          nullableStringType,
          false,
        ),
      instanceReceiver,
      { kind: "source-name-indexer" },
    ),
    jsPropertyPolicy(
      jsIndexerIdentity(regexpNamedIndicesOwner),
      () =>
        targetIndexer(
          "Tsonic.CSharp.Js.RegExpNamedIndices.indexer",
          namedIndicesType,
          stringType,
          nullablePairType,
          false,
        ),
      instanceReceiver,
      { kind: "source-name-indexer" },
    ),
    jsPropertyPolicy(
      jsMemberIdentity(exactIndicesArrayOwner, regexpResultMembers.groups),
      () =>
        targetProperty(
          "Tsonic.CSharp.Js.JsRegExpIndicesArray.groups",
          regexpResultMembers.groups,
          regexpResultMembers.groups,
          exactIndicesArrayType,
          csharpNullableTargetType(exactNamedIndicesType),
          { readonly: true },
        ),
      instanceReceiver,
    ),
    jsPropertyPolicy(
      jsIndexerIdentity(exactNamedGroupsOwner),
      () =>
        targetIndexer(
          "Tsonic.CSharp.Js.JsRegExpNamedGroups.indexer",
          exactNamedGroupsType,
          stringType,
          csharpNullableTargetType(jsStringType),
          false,
        ),
      instanceReceiver,
      { kind: "source-name-indexer" },
    ),
    jsPropertyPolicy(
      jsIndexerIdentity(exactNamedIndicesOwner),
      () =>
        targetIndexer(
          "Tsonic.CSharp.Js.JsRegExpNamedIndices.indexer",
          exactNamedIndicesType,
          stringType,
          nullablePairType,
          false,
        ),
      instanceReceiver,
      { kind: "source-name-indexer" },
    ),
  ]);

export const csharpJsRegExpElementPolicies:
  readonly CsharpSourceProfileElementPolicy[] = Object.freeze([
    ...([
      [regexpExecArrayOwner, execArrayType],
      [regexpMatchArrayOwner, matchArrayType],
    ] as const).map(([owner, receiverType]) =>
      jsElementPolicy(
        jsMemberIdentity(owner, regexpResultMembers.first),
        () =>
          targetIndexer(
            `Tsonic.CSharp.Js.${owner}.first`,
            receiverType,
            intType,
            stringType,
            false,
          ),
      )
    ),
    ...([
      [exactExecArrayOwner, exactExecArrayType],
      [exactMatchArrayOwner, exactMatchArrayType],
    ] as const).map(([owner, receiverType]) =>
      jsElementPolicy(
        jsMemberIdentity(owner, regexpResultMembers.first),
        () =>
          targetIndexer(
            `Tsonic.CSharp.Js.${owner}.first`,
            receiverType,
            intType,
            jsStringType,
            false,
          ),
      )
    ),
    jsElementPolicy(
      jsIndexerIdentity(regexpNamedGroupsOwner),
      () =>
        targetIndexer(
          "Tsonic.CSharp.Js.RegExpNamedGroups.indexer",
          namedGroupsType,
          stringType,
          nullableStringType,
          false,
        ),
    ),
    jsElementPolicy(
      jsIndexerIdentity(regexpNamedIndicesOwner),
      () =>
        targetIndexer(
          "Tsonic.CSharp.Js.RegExpNamedIndices.indexer",
          namedIndicesType,
          stringType,
          nullablePairType,
          false,
      ),
    ),
    jsElementPolicy(
      jsIndexerIdentity(exactNamedGroupsOwner),
      () =>
        targetIndexer(
          "Tsonic.CSharp.Js.JsRegExpNamedGroups.indexer",
          exactNamedGroupsType,
          stringType,
          csharpNullableTargetType(jsStringType),
          false,
        ),
    ),
    jsElementPolicy(
      jsIndexerIdentity(exactNamedIndicesOwner),
      () =>
        targetIndexer(
          "Tsonic.CSharp.Js.JsRegExpNamedIndices.indexer",
          exactNamedIndicesType,
          stringType,
          nullablePairType,
          false,
        ),
    ),
  ]);

function regexpConstructionMember(
  context: CsharpSourceProfileCallPolicyContext,
  form: "constructor" | "call",
): CsharpTargetMember | undefined {
  const arguments_ = context.source.sourceArguments;
  if (arguments_.length > 2) {
    return undefined;
  }
  const pattern = resolveArgumentType(context, 0);
  const flags = resolveArgumentType(context, 1);
  const patternInvalid = arguments_[0] !== undefined && (
    pattern === undefined ||
      !targetTypeRefEquals(pattern, stringType) &&
      !targetTypeRefEquals(pattern, jsStringType) &&
      !targetTypeRefEquals(pattern, regexpType) &&
      !targetTypeRefEquals(pattern, undefinedType)
  );
  const flagsInvalid = arguments_[1] !== undefined && (
    flags === undefined ||
    !targetTypeRefEquals(flags, stringType) &&
      !targetTypeRefEquals(flags, undefinedType)
  );
  if (patternInvalid || flagsInvalid) {
    return undefined;
  }
  const parameters = [
    ...(pattern === undefined ? [] : [targetParameter("pattern", pattern)]),
    ...(flags === undefined ? [] : [targetParameter("flags", flags)]),
  ];
  if (form === "call") {
    return staticMethod(
      `Tsonic.CSharp.Js.RegExp.create:${targetTypeListKey(parameters)}`,
      "constructor",
      "create",
      regexpType,
      parameters,
      regexpType,
    );
  }
  return Object.freeze({
    id: `Tsonic.CSharp.Js.RegExp..ctor:${targetTypeListKey(parameters)}`,
    sourceName: "constructor",
    targetName: "RegExp",
    kind: "constructor",
    declaringType: regexpType,
    parameters: Object.freeze(parameters),
    returnType: regexpType,
  });
}

function regexpEscapeMember(
  context: CsharpSourceProfileCallPolicyContext,
): CsharpTargetMember | undefined {
  const input = resolveArgumentType(context, 0);
  if (
    input === undefined ||
    !targetTypeRefEquals(input, stringType) &&
      !targetTypeRefEquals(input, jsStringType)
  ) {
    return undefined;
  }
  return staticMethod(
    `Tsonic.CSharp.Js.RegExp.escape:${targetTypeListKey([{ type: input }])}`,
    regexpConstructorMembers.escape,
    "escape",
    regexpType,
    [targetParameter("value", input)],
    stringType,
  );
}

function resolveArgumentType(
  context: CsharpSourceProfileCallPolicyContext,
  index: number,
): TargetTypeRef | undefined {
  const argument = context.source.sourceArguments[index];
  return argument === undefined
    ? undefined
    : context.host.types.resolveSelectedValue(
        argument.expression,
        argument.type,
        context.sourceFile,
      );
}

function regexpConstructionParameterMapping(
  context: CsharpSourceProfileCallPolicyContext,
): readonly (number | undefined)[] {
  const argumentCount = context.source.sourceArguments.length;
  return context.source.sourceSelectedSignatureParameters?.map(
    (_parameter, sourceIndex) =>
      sourceIndex < argumentCount ? sourceIndex : undefined,
  ) ?? [];
}

function regexpInstanceMethod(
  sourceName: string,
  parameterTypes: readonly TargetTypeRef[],
  returnType: TargetTypeRef,
  targetName = sourceName,
  options: { readonly optionalIndexes?: readonly number[] } = {},
): CsharpTargetMember {
  const optionalIndexes = new Set(options.optionalIndexes ?? []);
  return instanceMethod(
    `Tsonic.CSharp.Js.RegExp.${sourceName}`,
    sourceName,
    targetName,
    regexpType,
    parameterTypes.map((type, index) =>
      targetParameter(`argument${index}`, type, {
        ...(optionalIndexes.has(index) ? { optional: true } : {}),
      })
    ),
    returnType,
  );
}

function regexpInputMember(
  context: CsharpSourceProfileCallPolicyContext,
  operation: "test" | "exec" | "match" | "matchAll" | "search" | "split",
): CsharpTargetMember | undefined {
  const inputType = resolveArgumentType(context, 0);
  if (
    inputType === undefined ||
    !targetTypeRefEquals(inputType, stringType) &&
      !targetTypeRefEquals(inputType, jsStringType)
  ) {
    return undefined;
  }
  const exact = targetTypeRefEquals(inputType, jsStringType);
  const sourceName = operation === "test" || operation === "exec"
    ? regexpMembers[operation]
    : wellKnown[operation === "matchAll" ? "matchAll" : operation];
  const targetName = operation === "test" || operation === "exec"
    ? operation
    : operation;
  const resultType = operation === "test"
    ? boolType
    : operation === "exec"
      ? csharpNullableTargetType(exact ? exactExecArrayType : execArrayType)
      : operation === "match"
        ? csharpNullableTargetType(exact ? exactMatchArrayType : matchArrayType)
        : operation === "matchAll"
          ? exact ? exactIteratorType : iteratorType
          : operation === "search"
            ? doubleType
            : csharpJsArrayTargetType(exact ? jsStringType : stringType);
  return regexpInstanceMethod(
    sourceName,
    operation === "split" ? [inputType, doubleType] : [inputType],
    resultType,
    targetName,
    operation === "split" ? { optionalIndexes: [1] } : {},
  );
}

function regexpReplacementMember(
  context: CsharpSourceProfileCallPolicyContext,
): CsharpTargetMember | undefined {
  const input = resolveArgumentType(context, 0);
  const replacement = resolveArgumentType(context, 1);
  if (
    input === undefined ||
    replacement === undefined ||
    !targetTypeRefEquals(input, stringType) &&
      !targetTypeRefEquals(input, jsStringType)
  ) {
    return undefined;
  }
  if (targetTypeRefEquals(replacement, input)) {
    return regexpInstanceMethod(
      wellKnown.replace,
      [input, input],
      input,
      "replace",
    );
  }
  const callback = csharpJsReplacementCallbackParameter(
    "replacement",
    replacement,
    input,
  );
  return callback === undefined
    ? undefined
    : instanceMethod(
        "Tsonic.CSharp.Js.RegExp.replace:callback",
        wellKnown.replace,
        "replace",
        regexpType,
        [targetParameter("input", input), callback],
        input,
      );
}

function regexpProperty(
  name: string,
  type: TargetTypeRef,
  readonly: boolean,
): CsharpTargetMember {
  return targetProperty(
    `Tsonic.CSharp.Js.RegExp.${name}`,
    name,
    name,
    regexpType,
    type,
    { readonly },
  );
}

function regexpResultPropertyPolicies(
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

function targetTypeListKey(
  parameters: readonly { readonly type: TargetTypeRef }[],
): string {
  return parameters.map((parameter) =>
    parameter.type.kind === "target-named"
      ? parameter.type.id
      : parameter.type.kind
  ).join(",");
}
