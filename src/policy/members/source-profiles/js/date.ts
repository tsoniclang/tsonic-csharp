import type {
  CsharpTargetMember,
  TargetTypeRef,
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
const dateNoArgumentRows: readonly {
  readonly sourceName: string;
  readonly targetName: string;
  readonly returnType: TargetTypeRef;
}[] = Object.freeze([
  { sourceName: "valueOf", targetName: "valueOf", returnType: doubleType },
  { sourceName: "getUTCFullYear", targetName: "getUTCFullYear", returnType: doubleType },
  { sourceName: "getUTCMonth", targetName: "getUTCMonth", returnType: doubleType },
  { sourceName: "getUTCDate", targetName: "getUTCDate", returnType: doubleType },
  { sourceName: "getUTCDay", targetName: "getUTCDay", returnType: doubleType },
  { sourceName: "getUTCHours", targetName: "getUTCHours", returnType: doubleType },
  { sourceName: "getUTCMinutes", targetName: "getUTCMinutes", returnType: doubleType },
  { sourceName: "getUTCSeconds", targetName: "getUTCSeconds", returnType: doubleType },
  { sourceName: "getUTCMilliseconds", targetName: "getUTCMilliseconds", returnType: doubleType },
  { sourceName: "toUTCString", targetName: "toUTCString", returnType: stringType },
  { sourceName: "toJSON", targetName: "toJSON", returnType: stringType },
]);

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
    ...dateNoArgumentRows.map(({ sourceName, targetName, returnType }) =>
      jsCallPolicy(
        jsMemberIdentity("Date", sourceName),
        () =>
          instanceMethod(
            `Tsonic.CSharp.Js.Date.${targetName}`,
            sourceName,
            targetName,
            dateType,
            [],
            returnType,
          ),
        instanceReceiver,
      )
    ),
    ...dateMutationPolicies(),
  ]);

function dateMutationPolicies(): readonly CsharpSourceProfileCallPolicy[] {
  const rows = [
    ["setTime", ["time"]],
    ["setUTCMilliseconds", ["ms"]],
    ["setUTCSeconds", ["sec", "ms"]],
    ["setUTCMinutes", ["min", "sec", "ms"]],
    ["setUTCHours", ["hours", "min", "sec", "ms"]],
    ["setUTCDate", ["date"]],
    ["setUTCMonth", ["month", "date"]],
    ["setUTCFullYear", ["year", "month", "date"]],
  ] as const;
  return rows.map(([name, parameters]) =>
    jsCallPolicy(
      jsMemberIdentity("Date", name),
      () =>
        instanceMethod(
          `Tsonic.CSharp.Js.Date.${name}`,
          name,
          name,
          dateType,
          parameters.map((parameter, index) =>
            targetParameter(parameter, doubleType, {
              ...(index === 0 ? { csharpAcceptsCheckedSourceArgument: true } : {}),
              ...(index > 0 ? { optional: true, csharpAcceptsCheckedSourceArgument: true } : {}),
            })
          ),
          doubleType,
        ),
      instanceReceiver,
    )
  );
}

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
