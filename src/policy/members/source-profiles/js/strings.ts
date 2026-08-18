import type {
  CsharpTargetMember,
  CsharpTargetParameter,
} from "../../../types/index.js";
import {
  csharpJsArrayTargetType,
  csharpNullableTargetType,
  csharpNullableValueTargetType,
  csharpObjectTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
} from "../../../types/index.js";
import type {
  CsharpSourceProfileCallPolicy,
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
  jsRuntimeTargetType,
  jsUnsupportedCallPolicy,
  receiverHelperMethod,
  staticMethod,
  targetIndexer,
  targetParameter,
  targetProperty,
} from "./common.js";

const stringType = csharpStringTargetType();
const intType = csharpSourcePrimitiveTargetType("int32");
const doubleType = csharpSourcePrimitiveTargetType("float64");
const boolType = csharpSourcePrimitiveTargetType("bool");
const stringHelperType = jsRuntimeTargetType("String");
const globalsType = jsRuntimeTargetType("Globals");

const stringReceiver = { kind: "target-parameter", targetParameterIndex: 0 } as const;
const noReceiver = { kind: "none" } as const;

const stringHelperRows = [
  {
    sourceName: "includes",
    targetName: "includes",
    parameters: [
      targetParameter("search", stringType),
      targetParameter("position", intType, { optional: true }),
    ],
    returnType: boolType,
  },
  {
    sourceName: "startsWith",
    targetName: "startsWith",
    parameters: [
      targetParameter("search", stringType),
      targetParameter("position", intType, { optional: true }),
    ],
    returnType: boolType,
  },
  {
    sourceName: "endsWith",
    targetName: "endsWith",
    parameters: [
      targetParameter("search", stringType),
      targetParameter("endPosition", intType, { optional: true }),
    ],
    returnType: boolType,
  },
  {
    sourceName: "indexOf",
    targetName: "indexOf",
    parameters: [
      targetParameter("search", stringType),
      targetParameter("position", intType, { optional: true }),
    ],
    returnType: intType,
  },
  {
    sourceName: "lastIndexOf",
    targetName: "lastIndexOf",
    parameters: [
      targetParameter("search", stringType),
      targetParameter("position", intType, { optional: true }),
    ],
    returnType: intType,
  },
  {
    sourceName: "charAt",
    targetName: "charAt",
    parameters: [targetParameter("index", intType)],
    returnType: stringType,
  },
  {
    sourceName: "charCodeAt",
    targetName: "charCodeAt",
    parameters: [targetParameter("index", intType)],
    returnType: doubleType,
  },
  {
    sourceName: "codePointAt",
    targetName: "codePointAt",
    parameters: [targetParameter("index", intType)],
    returnType: csharpNullableValueTargetType(intType),
  },
  {
    sourceName: "at",
    targetName: "at",
    parameters: [targetParameter("index", intType)],
    returnType: csharpNullableTargetType(stringType),
  },
  {
    sourceName: "split",
    targetName: "split",
    parameters: [
      targetParameter("separator", stringType),
      targetParameter("limit", intType, { optional: true }),
    ],
    returnType: csharpJsArrayTargetType(stringType),
  },
  {
    sourceName: "replace",
    targetName: "replace",
    parameters: [
      targetParameter("search", stringType),
      targetParameter("replacement", stringType),
    ],
    returnType: stringType,
  },
  {
    sourceName: "replaceAll",
    targetName: "replaceAll",
    parameters: [
      targetParameter("search", stringType),
      targetParameter("replacement", stringType),
    ],
    returnType: stringType,
  },
  {
    sourceName: "search",
    targetName: "search",
    parameters: [targetParameter("pattern", stringType)],
    returnType: intType,
  },
  {
    sourceName: "slice",
    targetName: "slice",
    parameters: [
      targetParameter("start", intType, { optional: true }),
      targetParameter("end", intType, { optional: true }),
    ],
    returnType: stringType,
  },
  {
    sourceName: "substring",
    targetName: "substring",
    parameters: [
      targetParameter("start", intType),
      targetParameter("end", intType, { optional: true }),
    ],
    returnType: stringType,
  },
  {
    sourceName: "substr",
    targetName: "substr",
    parameters: [
      targetParameter("start", intType),
      targetParameter("length", intType, { optional: true }),
    ],
    returnType: stringType,
  },
  {
    sourceName: "concat",
    targetName: "concat",
    parameters: [
      targetParameter("strings", stringType, { paramsArray: true }),
    ],
    returnType: stringType,
  },
  {
    sourceName: "repeat",
    targetName: "repeat",
    parameters: [targetParameter("count", intType)],
    returnType: stringType,
  },
  {
    sourceName: "padStart",
    targetName: "padStart",
    parameters: [
      targetParameter("maxLength", intType),
      targetParameter("fillString", stringType, { optional: true }),
    ],
    returnType: stringType,
  },
  {
    sourceName: "padEnd",
    targetName: "padEnd",
    parameters: [
      targetParameter("maxLength", intType),
      targetParameter("fillString", stringType, { optional: true }),
    ],
    returnType: stringType,
  },
  {
    sourceName: "normalize",
    targetName: "normalize",
    parameters: [targetParameter("form", stringType, { optional: true })],
    returnType: stringType,
  },
] as const;

const parameterlessStringHelperRows = [
  { sourceName: "trim", targetName: "trim" },
  { sourceName: "trimStart", targetName: "trimStart" },
  { sourceName: "trimEnd", targetName: "trimEnd" },
  { sourceName: "trimLeft", targetName: "trimLeft" },
  { sourceName: "trimRight", targetName: "trimRight" },
  { sourceName: "toLowerCase", targetName: "toLowerCase" },
  { sourceName: "toUpperCase", targetName: "toUpperCase" },
  {
    sourceName: "toLocaleLowerCase",
    targetName: "toLocaleLowerCase",
    targetParameterBySourceParameter: [undefined],
  },
  {
    sourceName: "toLocaleUpperCase",
    targetName: "toLocaleUpperCase",
    targetParameterBySourceParameter: [undefined],
  },
  { sourceName: "toWellFormed", targetName: "toWellFormed" },
  { sourceName: "valueOf", targetName: "valueOf" },
] as const;

export const csharpJsStringCallPolicies: readonly CsharpSourceProfileCallPolicy[] =
  Object.freeze([
    jsCallPolicy(
      jsMemberIdentity("String", "toString"),
      () =>
        instanceMethod(
          "System.String.ToString",
          "toString",
          "ToString",
          stringType,
          [],
          stringType,
        ),
      { kind: "instance" },
    ),
    ...stringHelperRows.map((row) =>
      jsCallPolicy(
        jsMemberIdentity("String", row.sourceName),
        () => receiverStringHelper(row),
        stringReceiver,
      )
    ),
    ...parameterlessStringHelperRows.map((row) =>
      jsCallPolicy(
        jsMemberIdentity("String", row.sourceName),
        () =>
          receiverHelperMethod(
            `Tsonic.CSharp.Js.String.${row.targetName}`,
            row.sourceName,
            row.targetName,
            stringHelperType,
            stringType,
            [],
            stringType,
          ),
        stringReceiver,
        "targetParameterBySourceParameter" in row
          ? {
              targetParameterBySourceParameter:
                row.targetParameterBySourceParameter,
            }
          : {},
      )
    ),
    jsCallPolicy(
      jsMemberIdentity("String", "isWellFormed"),
      () =>
        receiverHelperMethod(
          "Tsonic.CSharp.Js.String.isWellFormed",
          "isWellFormed",
          "isWellFormed",
          stringHelperType,
          stringType,
          [],
          boolType,
        ),
      stringReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity("String", "localeCompare"),
      () =>
        receiverHelperMethod(
          "Tsonic.CSharp.Js.String.localeCompare",
          "localeCompare",
          "localeCompare",
          stringHelperType,
          stringType,
          [targetParameter("that", stringType)],
          intType,
        ),
      stringReceiver,
      { targetParameterBySourceParameter: [1, undefined, undefined] },
    ),
    ...["fromCharCode", "fromCodePoint"].map((sourceName) =>
      jsCallPolicy(
        jsMemberIdentity("StringConstructor", sourceName),
        () =>
          staticMethod(
            `Tsonic.CSharp.Js.String.${sourceName}`,
            sourceName,
            sourceName,
            stringHelperType,
            [targetParameter("codes", intType, { paramsArray: true })],
            stringType,
          ),
        noReceiver,
      )
    ),
    jsCallPolicy(
      jsCallIdentity("StringConstructor"),
      () =>
        staticMethod(
          "Tsonic.CSharp.Js.Globals.String",
          "constructor",
          "String",
          globalsType,
          [
            targetParameter("value", csharpObjectTargetType(), {
              optional: true,
              csharpAcceptsClosedSourceArgument: true,
            }),
          ],
          stringType,
        ),
      noReceiver,
    ),
    jsUnsupportedCallPolicy(
      jsConstructIdentity("StringConstructor"),
      "new String(...) requires an explicit wrapper-object carrier; the JS source profile only supports primitive String(...) conversion.",
    ),
    jsUnsupportedCallPolicy(
      jsMemberIdentity("StringConstructor", "raw"),
      "String.raw requires a closed template-raw carrier and is not represented by the current JS source-profile runtime.",
    ),
    ...["match", "matchAll"].map((sourceName) =>
      jsUnsupportedCallPolicy(
        jsMemberIdentity("String", sourceName),
        `String.${sourceName} requires an exact RegExp match-result carrier that is not represented by the current JS source-profile runtime.`,
      )
    ),
  ]);

export const csharpJsStringPropertyPolicies:
  readonly CsharpSourceProfilePropertyPolicy[] = Object.freeze([
    jsPropertyPolicy(
      jsMemberIdentity("String", "length"),
      () =>
        targetProperty(
          "System.String.Length",
          "length",
          "Length",
          stringType,
          intType,
          { readonly: true },
        ),
      { kind: "instance" },
    ),
  ]);

export const csharpJsStringElementPolicies:
  readonly CsharpSourceProfileElementPolicy[] = Object.freeze([
    jsElementPolicy(
      jsIndexerIdentity("String"),
      () =>
        targetIndexer(
          "tsonic.csharp.js.String.codeUnit",
          stringType,
          intType,
          stringType,
          true,
        ),
      {
        kind: "method",
        targetName: "Substring",
        appendInt32Literal: 1,
      },
    ),
  ]);

function receiverStringHelper(
  row: {
    readonly sourceName: string;
    readonly targetName: string;
    readonly parameters: readonly CsharpTargetParameter[];
    readonly returnType: CsharpTargetMember["returnType"];
  },
): CsharpTargetMember {
  return receiverHelperMethod(
    `Tsonic.CSharp.Js.String.${row.sourceName}`,
    row.sourceName,
    row.targetName,
    stringHelperType,
    stringType,
    row.parameters,
    row.returnType!,
  );
}
