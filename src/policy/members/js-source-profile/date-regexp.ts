import type {
  CsharpTargetMember,
} from "../../types/index.js";
import {
  csharpJsDateTargetType,
  csharpJsRegExpTargetType,
  csharpNullableTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
} from "../../types/index.js";
import type {
  CsharpSourceProfileCallPolicy,
  CsharpSourceProfileCallPolicyContext,
  CsharpSourceProfilePropertyPolicy,
} from "../source-profile-policy.js";
import {
  closedObjectParameter,
  instanceMethod,
  jsCallIdentity,
  jsCallPolicy,
  jsConstructIdentity,
  jsMemberIdentity,
  jsPropertyPolicy,
  jsRuntimeTargetType,
  staticMethod,
  targetParameter,
  targetProperty,
} from "./common.js";

const dateType = csharpJsDateTargetType();
const regexpType = csharpJsRegExpTargetType();
const stringType = csharpStringTargetType();
const doubleType = csharpSourcePrimitiveTargetType("float64");
const intType = csharpSourcePrimitiveTargetType("int32");
const boolType = csharpSourcePrimitiveTargetType("bool");
const regexpMatchType = jsRuntimeTargetType("RegExpMatchResult");
const noReceiver = { kind: "none" } as const;
const instanceReceiver = { kind: "instance" } as const;

export const csharpJsDateRegExpCallPolicies:
  readonly CsharpSourceProfileCallPolicy[] = Object.freeze([
    jsCallPolicy(
      jsConstructIdentity("DateConstructor"),
      (context) => dateConstructor(context),
      noReceiver,
    ),
    jsCallPolicy(
      jsCallIdentity("DateConstructor"),
      () =>
        staticMethod(
          "Tsonic.CSharp.Js.Date.call",
          "constructor",
          "call",
          dateType,
          [],
          stringType,
        ),
      noReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity("DateConstructor", "now"),
      () =>
        staticMethod(
          "Tsonic.CSharp.Js.Date.now",
          "now",
          "now",
          dateType,
          [],
          doubleType,
        ),
      noReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity("DateConstructor", "parse"),
      () =>
        staticMethod(
          "Tsonic.CSharp.Js.Date.parse",
          "parse",
          "parse",
          dateType,
          [targetParameter("value", stringType)],
          doubleType,
        ),
      noReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity("DateConstructor", "UTC"),
      () =>
        staticMethod(
          "Tsonic.CSharp.Js.Date.UTC",
          "UTC",
          "UTC",
          dateType,
          [
            targetParameter("year", intType),
            targetParameter("monthIndex", intType),
            targetParameter("date", intType, { optional: true }),
            targetParameter("hours", intType, { optional: true }),
            targetParameter("minutes", intType, { optional: true }),
            targetParameter("seconds", intType, { optional: true }),
            targetParameter("ms", intType, { optional: true }),
          ],
          doubleType,
        ),
      noReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity("Date", "getTime"),
      () =>
        instanceMethod(
          "Tsonic.CSharp.Js.Date.getTime",
          "getTime",
          "getTime",
          dateType,
          [],
          doubleType,
        ),
      instanceReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity("Date", "toString"),
      () =>
        instanceMethod(
          "Tsonic.CSharp.Js.Date.ToString",
          "toString",
          "ToString",
          dateType,
          [],
          stringType,
        ),
      instanceReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity("Date", "toISOString"),
      () =>
        instanceMethod(
          "Tsonic.CSharp.Js.Date.toISOString",
          "toISOString",
          "toISOString",
          dateType,
          [],
          stringType,
        ),
      instanceReceiver,
    ),
    jsCallPolicy(
      jsConstructIdentity("RegExpConstructor"),
      () => regexpConstructor(),
      noReceiver,
    ),
    jsCallPolicy(
      jsCallIdentity("RegExpConstructor"),
      () =>
        staticMethod(
          "Tsonic.CSharp.Js.RegExp.create",
          "constructor",
          "create",
          regexpType,
          [
            closedObjectParameter("pattern"),
            targetParameter("flags", stringType, { optional: true }),
          ],
          regexpType,
        ),
      noReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity("RegExp", "test"),
      () =>
        instanceMethod(
          "Tsonic.CSharp.Js.RegExp.test",
          "test",
          "test",
          regexpType,
          [targetParameter("value", stringType)],
          boolType,
        ),
      instanceReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity("RegExp", "exec"),
      () =>
        instanceMethod(
          "Tsonic.CSharp.Js.RegExp.exec",
          "exec",
          "exec",
          regexpType,
          [targetParameter("value", stringType)],
          csharpNullableTargetType(regexpMatchType),
        ),
      instanceReceiver,
    ),
  ]);

const regexpStringProperties = ["source", "flags"] as const;
const regexpBoolProperties = ["global", "ignoreCase", "multiline"] as const;

export const csharpJsDateRegExpPropertyPolicies:
  readonly CsharpSourceProfilePropertyPolicy[] = Object.freeze([
    ...regexpStringProperties.map((name) =>
      jsPropertyPolicy(
        jsMemberIdentity("RegExp", name),
        () =>
          targetProperty(
            `Tsonic.CSharp.Js.RegExp.${name}`,
            name,
            name,
            regexpType,
            stringType,
            { readonly: true },
          ),
        instanceReceiver,
      )
    ),
    ...regexpBoolProperties.map((name) =>
      jsPropertyPolicy(
        jsMemberIdentity("RegExp", name),
        () =>
          targetProperty(
            `Tsonic.CSharp.Js.RegExp.${name}`,
            name,
            name,
            regexpType,
            boolType,
            { readonly: true },
          ),
        instanceReceiver,
      )
    ),
    jsPropertyPolicy(
      jsMemberIdentity("RegExp", "lastIndex"),
      () =>
        targetProperty(
          "Tsonic.CSharp.Js.RegExp.lastIndex",
          "lastIndex",
          "lastIndex",
          regexpType,
          intType,
        ),
      instanceReceiver,
    ),
  ]);

function dateConstructor(
  context: CsharpSourceProfileCallPolicyContext,
): CsharpTargetMember | undefined {
  const argument = context.source.sourceArguments[0];
  const argumentType = argument === undefined
    ? undefined
    : context.host.types.resolveType(argument.type, context.sourceFile);
  if (
    context.source.sourceArguments.length > 1 ||
    argument !== undefined && argumentType === undefined
  ) {
    return undefined;
  }
  return Object.freeze({
    id: argument === undefined
      ? "Tsonic.CSharp.Js.Date..ctor()"
      : `Tsonic.CSharp.Js.Date..ctor(${argumentType!.kind})`,
    sourceName: "constructor",
    targetName: "Date",
    kind: "constructor",
    declaringType: dateType,
    parameters: argument === undefined
      ? []
      : [targetParameter("value", argumentType!)],
    returnType: dateType,
  });
}

function regexpConstructor(): CsharpTargetMember {
  return Object.freeze({
    id: "Tsonic.CSharp.Js.RegExp..ctor",
    sourceName: "constructor",
    targetName: "RegExp",
    kind: "constructor",
    declaringType: regexpType,
    parameters: [
      closedObjectParameter("pattern"),
      targetParameter("flags", stringType, { optional: true }),
    ],
    returnType: regexpType,
  });
}
