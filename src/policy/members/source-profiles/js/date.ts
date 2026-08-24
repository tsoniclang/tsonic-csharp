import type {
  CsharpTargetMember,
} from "../../../types/index.js";
import {
  csharpJsDateTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
} from "../../../types/index.js";
import type {
  CsharpSourceProfileCallPolicy,
  CsharpSourceProfileCallPolicyContext,
} from "../source-profile-policy.js";
import {
  instanceMethod,
  jsCallIdentity,
  jsCallPolicy,
  jsConstructIdentity,
  jsMemberIdentity,
  staticMethod,
  targetParameter,
} from "./common.js";

const dateType = csharpJsDateTargetType();
const stringType = csharpStringTargetType();
const doubleType = csharpSourcePrimitiveTargetType("float64");
const intType = csharpSourcePrimitiveTargetType("int32");
const noReceiver = { kind: "none" } as const;
const instanceReceiver = { kind: "instance" } as const;

export const csharpJsDateCallPolicies:
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
  ]);

function dateConstructor(
  context: CsharpSourceProfileCallPolicyContext,
): CsharpTargetMember | undefined {
  const argument = context.source.sourceArguments[0];
  const argumentType = argument === undefined
    ? undefined
    : context.host.types.resolveSelectedValue(
        argument.expression,
        argument.type,
        context.sourceFile,
      );
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
