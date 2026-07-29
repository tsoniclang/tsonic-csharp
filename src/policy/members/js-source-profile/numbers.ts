import type {
  CsharpTargetMember,
  TargetTypeRef,
} from "../../types/index.js";
import {
  csharpObjectTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
} from "../../types/index.js";
import type {
  CsharpSourceProfileCallPolicy,
  CsharpSourceProfilePropertyPolicy,
} from "../source-profile-policy.js";
import {
  closedObjectParameter,
  jsCallIdentity,
  jsCallPolicy,
  jsConstructIdentity,
  jsMemberIdentity,
  jsPropertyPolicy,
  jsRuntimeTargetType,
  jsUnsupportedCallPolicy,
  receiverHelperMethod,
  staticMethod,
  targetParameter,
  targetProperty,
} from "./common.js";

const numberType = csharpSourcePrimitiveTargetType("float64");
const intType = csharpSourcePrimitiveTargetType("int32");
const boolType = csharpSourcePrimitiveTargetType("bool");
const stringType = csharpStringTargetType();
const numberHelperType = jsRuntimeTargetType("Number");
const booleanHelperType = jsRuntimeTargetType("BooleanOps");
const globalsType = jsRuntimeTargetType("Globals");
const noReceiver = { kind: "none" } as const;
const firstParameterReceiver = {
  kind: "target-parameter",
  targetParameterIndex: 0,
} as const;

const numberInstanceRows = [
  {
    sourceName: "toString",
    targetName: "toString",
    parameters: [targetParameter("radix", intType, { optional: true })],
    returnType: stringType,
  },
  {
    sourceName: "toLocaleString",
    targetName: "toLocaleString",
    parameters: [
      closedObjectParameter("locales", { optional: true }),
      closedObjectParameter("options", { optional: true }),
    ],
    returnType: stringType,
  },
  {
    sourceName: "toFixed",
    targetName: "toFixed",
    parameters: [targetParameter("fractionDigits", intType, { optional: true })],
    returnType: stringType,
  },
  {
    sourceName: "toExponential",
    targetName: "toExponential",
    parameters: [targetParameter("fractionDigits", intType, { optional: true })],
    returnType: stringType,
  },
  {
    sourceName: "toPrecision",
    targetName: "toPrecision",
    parameters: [targetParameter("precision", intType, { optional: true })],
    returnType: stringType,
  },
  {
    sourceName: "valueOf",
    targetName: "valueOf",
    parameters: [],
    returnType: numberType,
  },
] as const;

const numberStaticRows = [
  {
    sourceName: "parseFloat",
    parameters: [targetParameter("value", stringType)],
    returnType: numberType,
  },
  {
    sourceName: "parseInt",
    parameters: [
      targetParameter("value", stringType),
      targetParameter("radix", intType, { optional: true }),
    ],
    returnType: numberType,
  },
  ...["isFinite", "isInteger", "isNaN", "isSafeInteger"].map(
    (sourceName) => ({
      sourceName,
      parameters: [
        targetParameter("value", numberType, {
          csharpAcceptsCheckedSourceArgument: true,
        }),
      ],
      returnType: boolType,
    }),
  ),
] as const;

export const csharpJsNumberCallPolicies:
  readonly CsharpSourceProfileCallPolicy[] = Object.freeze([
    ...numberInstanceRows.map((row) =>
      jsCallPolicy(
        jsMemberIdentity("Number", row.sourceName),
        (context) =>
          numberReceiverMember(
            context.host.types.resolveType(
              context.source.sourceReceiver?.type,
              context.sourceFile,
            ),
            row,
          ),
        firstParameterReceiver,
      )
    ),
    ...numberStaticRows.map((row) =>
      jsCallPolicy(
        jsMemberIdentity("NumberConstructor", row.sourceName),
        () =>
          staticMethod(
            `Tsonic.CSharp.Js.Number.${row.sourceName}`,
            row.sourceName,
            row.sourceName,
            numberHelperType,
            row.parameters,
            row.returnType,
          ),
        noReceiver,
      )
    ),
    jsCallPolicy(
      jsCallIdentity("NumberConstructor"),
      () =>
        staticMethod(
          "Tsonic.CSharp.Js.Globals.Number",
          "constructor",
          "Number",
          globalsType,
          [
            targetParameter("value", csharpObjectTargetType(), {
              optional: true,
              csharpAcceptsClosedSourceArgument: true,
            }),
          ],
          numberType,
        ),
      noReceiver,
    ),
    jsUnsupportedCallPolicy(
      jsConstructIdentity("NumberConstructor"),
      "new Number(...) requires an explicit wrapper-object carrier; the JS source profile only supports primitive Number(...) conversion.",
    ),
    jsCallPolicy(
      jsMemberIdentity("Boolean", "toString"),
      (context) =>
        booleanReceiverMember(
          context.host.types.resolveType(
            context.source.sourceReceiver?.type,
            context.sourceFile,
          ),
          "toString",
          stringType,
        ),
      firstParameterReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity("Boolean", "valueOf"),
      (context) =>
        booleanReceiverMember(
          context.host.types.resolveType(
            context.source.sourceReceiver?.type,
            context.sourceFile,
          ),
          "valueOf",
          boolType,
        ),
      firstParameterReceiver,
    ),
    jsCallPolicy(
      jsCallIdentity("BooleanConstructor"),
      () =>
        staticMethod(
          "Tsonic.CSharp.Js.Globals.Boolean",
          "constructor",
          "Boolean",
          globalsType,
          [
            targetParameter("value", csharpObjectTargetType(), {
              optional: true,
              csharpAcceptsClosedSourceArgument: true,
            }),
          ],
          boolType,
        ),
      noReceiver,
    ),
    jsUnsupportedCallPolicy(
      jsConstructIdentity("BooleanConstructor"),
      "new Boolean(...) requires an explicit wrapper-object carrier; the JS source profile only supports primitive Boolean(...) conversion.",
    ),
  ]);

const numberProperties = [
  "MAX_VALUE",
  "MIN_VALUE",
  "NaN",
  "NEGATIVE_INFINITY",
  "POSITIVE_INFINITY",
  "MAX_SAFE_INTEGER",
  "MIN_SAFE_INTEGER",
  "EPSILON",
] as const;

export const csharpJsNumberPropertyPolicies:
  readonly CsharpSourceProfilePropertyPolicy[] = Object.freeze(
    numberProperties.map((name) =>
      jsPropertyPolicy(
        jsMemberIdentity("NumberConstructor", name),
        () =>
          targetProperty(
            `Tsonic.CSharp.Js.Number.${name}`,
            name,
            name,
            numberHelperType,
            numberType,
            { static: true, readonly: true },
          ),
        noReceiver,
      )
    ),
  );

function numberReceiverMember(
  receiverType: TargetTypeRef | undefined,
  row: {
    readonly sourceName: string;
    readonly targetName: string;
    readonly parameters: CsharpTargetMember["parameters"];
    readonly returnType: TargetTypeRef;
  },
): CsharpTargetMember | undefined {
  return receiverType === undefined
    ? undefined
    : receiverHelperMethod(
        `Tsonic.CSharp.Js.Number.${row.sourceName}`,
        row.sourceName,
        row.targetName,
        numberHelperType,
        receiverType,
        row.parameters,
        row.returnType,
      );
}

function booleanReceiverMember(
  receiverType: TargetTypeRef | undefined,
  name: string,
  returnType: TargetTypeRef,
): CsharpTargetMember | undefined {
  return receiverType === undefined
    ? undefined
    : receiverHelperMethod(
        `Tsonic.CSharp.Js.BooleanOps.${name}`,
        name,
        name,
        booleanHelperType,
        receiverType,
        [],
        returnType,
      );
}
