import { csharpJsStringTargetType, csharpNullableTargetType, csharpNullableValueTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../../target-model/types/index.js";
import type { CsharpSourceProfileCallPolicy } from "../../../model/source-profiles.js";
import { jsCallPolicy, jsMemberIdentity, jsRuntimeTargetType, receiverHelperMethod, targetParameter } from "./common.js";
import { jsSourceSemanticsIdentity } from "@tsonic/js-source-profile";
import { exactJsStringRegExpMember, exactJsStringReplacementMember } from "./string-regexp-members.js";

const stringType = csharpStringTargetType();
const jsStringType = csharpJsStringTargetType();
const intType = csharpSourcePrimitiveTargetType("int32");
const doubleType = csharpSourcePrimitiveTargetType("float64");
const boolType = csharpSourcePrimitiveTargetType("bool");
const stringHelperType = jsRuntimeTargetType("String");

const stringReceiver = { kind: "target-parameter", targetParameterIndex: 0 } as const;
const jsStringOwner = jsSourceSemanticsIdentity.typeExport;

export function exactJsStringCallPolicies(): readonly CsharpSourceProfileCallPolicy[] {
  const rows = [
    {
      sourceName: "includes",
      parameters: [
        targetParameter("searchString", jsStringType),
        targetParameter("position", intType, { optional: true }),
      ],
      returnType: boolType,
    },
    {
      sourceName: "startsWith",
      parameters: [
        targetParameter("searchString", jsStringType),
        targetParameter("position", intType, { optional: true }),
      ],
      returnType: boolType,
    },
    {
      sourceName: "endsWith",
      parameters: [
        targetParameter("searchString", jsStringType),
        targetParameter("endPosition", intType, { optional: true }),
      ],
      returnType: boolType,
    },
    {
      sourceName: "indexOf",
      parameters: [
        targetParameter("searchString", jsStringType),
        targetParameter("position", intType, { optional: true }),
      ],
      returnType: intType,
    },
    {
      sourceName: "lastIndexOf",
      parameters: [
        targetParameter("searchString", jsStringType),
        targetParameter("position", intType, { optional: true }),
      ],
      returnType: intType,
    },
    {
      sourceName: "charAt",
      parameters: [targetParameter("index", intType)],
      returnType: jsStringType,
    },
    {
      sourceName: "charCodeAt",
      parameters: [targetParameter("index", intType)],
      returnType: doubleType,
    },
    {
      sourceName: "codePointAt",
      parameters: [targetParameter("index", intType)],
      returnType: csharpNullableValueTargetType(intType),
    },
    {
      sourceName: "at",
      parameters: [targetParameter("index", intType)],
      returnType: csharpNullableTargetType(jsStringType),
    },
    {
      sourceName: "slice",
      parameters: [
        targetParameter("start", intType, { optional: true }),
        targetParameter("end", intType, { optional: true }),
      ],
      returnType: jsStringType,
    },
    {
      sourceName: "substring",
      parameters: [
        targetParameter("start", intType),
        targetParameter("end", intType, { optional: true }),
      ],
      returnType: jsStringType,
    },
    {
      sourceName: "substr",
      parameters: [
        targetParameter("start", intType),
        targetParameter("length", intType, { optional: true }),
      ],
      returnType: jsStringType,
    },
    {
      sourceName: "concat",
      parameters: [targetParameter("strings", { kind: "array", element: jsStringType }, { paramsArray: true })],
      returnType: jsStringType,
    },
    {
      sourceName: "repeat",
      parameters: [targetParameter("count", intType)],
      returnType: jsStringType,
    },
    {
      sourceName: "padStart",
      parameters: [
        targetParameter("maxLength", intType),
        targetParameter("fillString", jsStringType, { optional: true }),
      ],
      returnType: jsStringType,
    },
    {
      sourceName: "padEnd",
      parameters: [
        targetParameter("maxLength", intType),
        targetParameter("fillString", jsStringType, { optional: true }),
      ],
      returnType: jsStringType,
    },
    {
      sourceName: "normalize",
      parameters: [targetParameter("form", stringType, { optional: true })],
      returnType: jsStringType,
    },
  ] as const;
  const parameterless = [
    "trim",
    "trimStart",
    "trimEnd",
    "toLowerCase",
    "toUpperCase",
    "toString",
    "valueOf",
  ] as const;
  return Object.freeze([
    ...rows.map((row) =>
      jsCallPolicy(
        jsMemberIdentity(jsStringOwner, row.sourceName),
        () =>
          receiverHelperMethod(
            `Tsonic.CSharp.Js.JsString.${row.sourceName}`,
            row.sourceName,
            row.sourceName,
            stringHelperType,
            jsStringType,
            row.parameters,
            row.returnType,
          ),
        stringReceiver,
      )
    ),
    ...parameterless.map((sourceName) =>
      jsCallPolicy(
        jsMemberIdentity(jsStringOwner, sourceName),
        () =>
          receiverHelperMethod(
            `Tsonic.CSharp.Js.JsString.${sourceName}`,
            sourceName,
            sourceName,
            stringHelperType,
            jsStringType,
            [],
            jsStringType,
          ),
        stringReceiver,
      )
    ),
    jsCallPolicy(
      jsMemberIdentity(jsStringOwner, "isWellFormed"),
      () =>
        receiverHelperMethod(
          "Tsonic.CSharp.Js.JsString.isWellFormed",
          "isWellFormed",
          "isWellFormed",
          stringHelperType,
          jsStringType,
          [],
          boolType,
        ),
      stringReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity(jsStringOwner, "toWellFormed"),
      () =>
        receiverHelperMethod(
          "Tsonic.CSharp.Js.JsString.toWellFormed",
          "toWellFormed",
          "toWellFormed",
          stringHelperType,
          jsStringType,
          [],
          stringType,
        ),
      stringReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity(jsStringOwner, "match"),
      (context) => exactJsStringRegExpMember(context, "match"),
      stringReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity(jsStringOwner, "matchAll"),
      (context) => exactJsStringRegExpMember(context, "matchAll"),
      stringReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity(jsStringOwner, "search"),
      (context) => exactJsStringRegExpMember(context, "search"),
      stringReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity(jsStringOwner, "split"),
      (context) => exactJsStringRegExpMember(context, "split"),
      stringReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity(jsStringOwner, "replace"),
      (context) => exactJsStringReplacementMember(context, "replace"),
      stringReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity(jsStringOwner, "replaceAll"),
      (context) => exactJsStringReplacementMember(context, "replaceAll"),
      stringReceiver,
    ),
  ]);
}
