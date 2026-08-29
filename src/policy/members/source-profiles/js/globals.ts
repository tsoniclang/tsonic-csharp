import type {
  CsharpTargetMember,
  CsharpTargetParameter,
  TargetTypeRef,
} from "../../../types/index.js";
import {
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpVoidTargetType,
} from "../../../types/index.js";
import type {
  CsharpSourceProfileCallPolicy,
  CsharpSourceProfilePropertyPolicy,
} from "../source-profile-policy.js";
import {
  resolveCsharpSelectedSourceValue,
} from "../source-profile-policy.js";
import {
  closedObjectParameter,
  jsGlobalCallIdentity,
  jsCallPolicy,
  jsMemberIdentity,
  jsPropertyPolicy,
  jsRuntimeTargetType,
  jsUnsupportedCallPolicy,
  staticMethod,
  targetParameter,
  targetProperty,
} from "./common.js";
import {
  csharpJsArgumentVectorCallbackParameter,
} from "./replacement-callback.js";
import {
  csharpJsEventLoopBinaryEpilogue,
} from "../../../../target-model/project/binary-epilogues.js";

const doubleType = csharpSourcePrimitiveTargetType("float64");
const intType = csharpSourcePrimitiveTargetType("int32");
const boolType = csharpSourcePrimitiveTargetType("bool");
const stringType = csharpStringTargetType();
const voidType = csharpVoidTargetType();
const globalsType = jsRuntimeTargetType("Globals");
const timersType = jsRuntimeTargetType("Timers");
const timerArgumentsType = jsRuntimeTargetType("TimerCallbackArguments");
const mathType = jsRuntimeTargetType("Math");
const consoleType = jsRuntimeTargetType("console");
const noReceiver = { kind: "none" } as const;

const mathUnaryNames = [
  "abs",
  "acos",
  "acosh",
  "asin",
  "asinh",
  "atan",
  "atanh",
  "cbrt",
  "ceil",
  "cos",
  "cosh",
  "exp",
  "expm1",
  "floor",
  "fround",
  "log",
  "log1p",
  "log10",
  "log2",
  "round",
  "sign",
  "sin",
  "sinh",
  "sqrt",
  "tan",
  "tanh",
  "trunc",
] as const;

const mathBinaryNames = ["atan2", "pow"] as const;
const mathVariadicNames = ["hypot", "max", "min"] as const;

const mathCallPolicies = [
  ...mathUnaryNames.map((name) =>
    fixedStaticCall(
      "Math",
      name,
      mathType,
      [
        targetParameter("value", doubleType, {
          csharpAcceptsCheckedSourceArgument: true,
        }),
      ],
      doubleType,
    )
  ),
  ...mathBinaryNames.map((name) =>
    fixedStaticCall(
      "Math",
      name,
      mathType,
      [
        targetParameter("left", doubleType, {
          csharpAcceptsCheckedSourceArgument: true,
        }),
        targetParameter("right", doubleType, {
          csharpAcceptsCheckedSourceArgument: true,
        }),
      ],
      doubleType,
    )
  ),
  ...mathVariadicNames.map((name) =>
    fixedStaticCall(
      "Math",
      name,
      mathType,
      [
        targetParameter("values", doubleType, {
          paramsArray: true,
          csharpAcceptsCheckedSourceArgument: true,
        }),
      ],
      doubleType,
    )
  ),
  fixedStaticCall("Math", "random", mathType, [], doubleType),
  fixedStaticCall(
    "Math",
    "imul",
    mathType,
    [
      targetParameter("left", intType, {
        csharpAcceptsCheckedSourceArgument: true,
      }),
      targetParameter("right", intType, {
        csharpAcceptsCheckedSourceArgument: true,
      }),
    ],
    intType,
  ),
  fixedStaticCall(
    "Math",
    "clz32",
    mathType,
    [
      targetParameter("value", intType, {
        csharpAcceptsCheckedSourceArgument: true,
      }),
    ],
    intType,
  ),
];

const consoleVariadicNames = [
  "log",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "group",
  "groupCollapsed",
  "dirxml",
] as const;
const consoleLabelNames = [
  "time",
  "timeEnd",
  "timeStamp",
  "count",
  "countReset",
] as const;

const consoleCallPolicies = [
  ...consoleVariadicNames.map((name) =>
    fixedStaticCall(
      "Console",
      name,
      consoleType,
      [
        closedObjectParameter("data", {
          paramsArray: true,
        }),
      ],
      voidType,
    )
  ),
  ...["clear", "groupEnd"].map((name) =>
    fixedStaticCall("Console", name, consoleType, [], voidType)
  ),
  fixedStaticCall(
    "Console",
    "assert",
    consoleType,
    [
      targetParameter("condition", boolType, { optional: true }),
      closedObjectParameter("data", { paramsArray: true }),
    ],
    voidType,
  ),
  fixedStaticCall(
    "Console",
    "timeLog",
    consoleType,
    [
      targetParameter("label", stringType, { optional: true }),
      closedObjectParameter("data", { paramsArray: true }),
    ],
    voidType,
  ),
  ...consoleLabelNames.map((name) =>
    fixedStaticCall(
      "Console",
      name,
      consoleType,
      [targetParameter("label", stringType, { optional: true })],
      voidType,
    )
  ),
  fixedStaticCall(
    "Console",
    "dir",
    consoleType,
    [
      closedObjectParameter("item", { optional: true }),
      closedObjectParameter("options", { optional: true }),
    ],
    voidType,
  ),
  fixedStaticCall(
    "Console",
    "table",
    consoleType,
    [
      closedObjectParameter("tabularData", { optional: true }),
      closedObjectParameter("properties", { optional: true }),
    ],
    voidType,
  ),
];

export const csharpJsGlobalCallPolicies:
  readonly CsharpSourceProfileCallPolicy[] = Object.freeze([
    ...mathCallPolicies,
    ...consoleCallPolicies,
    jsCallPolicy(
      jsGlobalCallIdentity("parseInt"),
      () =>
        staticMethod(
          "Tsonic.CSharp.Js.Globals.parseInt",
          "parseInt",
          "parseInt",
          globalsType,
          [
            targetParameter("value", stringType),
            targetParameter("radix", intType, { optional: true }),
          ],
          doubleType,
        ),
      noReceiver,
    ),
    jsCallPolicy(
      jsGlobalCallIdentity("parseFloat"),
      () =>
        staticMethod(
          "Tsonic.CSharp.Js.Globals.parseFloat",
          "parseFloat",
          "parseFloat",
          globalsType,
          [targetParameter("value", stringType)],
          doubleType,
        ),
      noReceiver,
    ),
    ...["encodeURIComponent", "decodeURIComponent"].map((name) =>
      jsCallPolicy(
        jsGlobalCallIdentity(name),
        () =>
          staticMethod(
            `Tsonic.CSharp.Js.Globals.${name}`,
            name,
            name,
            globalsType,
            [targetParameter("value", stringType)],
            stringType,
          ),
        noReceiver,
      )
    ),
    ...["isNaN", "isFinite"].map((name) =>
      jsCallPolicy(
        jsGlobalCallIdentity(name),
        () =>
          staticMethod(
            `Tsonic.CSharp.Js.Globals.${name}`,
            name,
            name,
            globalsType,
            [
              targetParameter("value", doubleType, {
                csharpAcceptsCheckedSourceArgument: true,
              }),
            ],
            boolType,
          ),
        noReceiver,
      )
    ),
    jsCallPolicy(
      jsGlobalCallIdentity("setTimeout"),
      (context) => timerSchedulingMember(context, "setTimeout"),
      noReceiver,
    ),
    jsCallPolicy(
      jsGlobalCallIdentity("clearTimeout"),
      () =>
        staticMethod(
          "Tsonic.CSharp.Js.Timers.clearTimeout",
          "clearTimeout",
          "clearTimeout",
          timersType,
          [targetParameter("id", doubleType)],
          voidType,
        ),
      noReceiver,
    ),
    jsCallPolicy(
      jsGlobalCallIdentity("setInterval"),
      (context) => timerSchedulingMember(context, "setInterval"),
      noReceiver,
    ),
    jsCallPolicy(
      jsGlobalCallIdentity("clearInterval"),
      () =>
        staticMethod(
          "Tsonic.CSharp.Js.Timers.clearInterval",
          "clearInterval",
          "clearInterval",
          timersType,
          [targetParameter("id", doubleType)],
          voidType,
        ),
      noReceiver,
    ),
    jsUnsupportedCallPolicy(
      jsGlobalCallIdentity("eval"),
      "eval requires runtime source evaluation with lexical-scope access, which has no closed C# source-to-source representation.",
    ),
  ]);

function timerSchedulingMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
  name: "setTimeout" | "setInterval",
): CsharpTargetMember | undefined {
  const callbackType = resolveCsharpSelectedSourceValue(
    context,
    context.source.sourceArguments[0],
  );
  if (callbackType === undefined) {
    return undefined;
  }
  const callback = csharpJsArgumentVectorCallbackParameter(
    "callback",
    callbackType,
    voidType,
    "Tsonic.CSharp.Js.TimerCallback",
    "TimerCallback",
    timerArgumentsType,
  );
  return callback === undefined
    ? undefined
    : staticMethod(
        `Tsonic.CSharp.Js.Timers.${name}:${targetTypeIdentity(callbackType)}`,
        name,
        name,
        timersType,
        [
          callback,
          targetParameter("delay", doubleType, { optional: true }),
          closedObjectParameter("arguments", { paramsArray: true }),
        ],
        doubleType,
        { csharpBinaryEpilogues: [csharpJsEventLoopBinaryEpilogue] },
      );
}

function targetTypeIdentity(type: TargetTypeRef): string {
  if (type.kind === "target-named" || type.kind === "opaque") {
    return type.id;
  }
  return type.kind === "source-primitive" ? type.name : type.kind;
}

const mathPropertyNames = [
  "E",
  "LN2",
  "LN10",
  "LOG2E",
  "LOG10E",
  "PI",
  "SQRT1_2",
  "SQRT2",
] as const;

export const csharpJsGlobalPropertyPolicies:
  readonly CsharpSourceProfilePropertyPolicy[] = Object.freeze(
    mathPropertyNames.map((name) =>
      jsPropertyPolicy(
        jsMemberIdentity("Math", name),
        () =>
          targetProperty(
            `Tsonic.CSharp.Js.Math.${name}`,
            name,
            name,
            mathType,
            doubleType,
            { static: true, readonly: true },
          ),
        noReceiver,
      )
    ),
  );

function fixedStaticCall(
  declaringName: string,
  name: string,
  declaringType: ReturnType<typeof jsRuntimeTargetType>,
  parameters: readonly CsharpTargetParameter[],
  returnType: ReturnType<typeof csharpSourcePrimitiveTargetType> |
    ReturnType<typeof csharpVoidTargetType>,
): CsharpSourceProfileCallPolicy {
  return jsCallPolicy(
    jsMemberIdentity(declaringName, name),
    () =>
      staticMethod(
        `Tsonic.CSharp.Js.${declaringName}.${name}`,
        name,
        name,
        declaringType,
        parameters,
        returnType,
      ),
    noReceiver,
  );
}
