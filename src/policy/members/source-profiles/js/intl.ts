import type {
  CsharpTargetMember,
  TargetTypeRef,
} from "../../../types/index.js";
import {
  csharpJsDateTargetType,
  csharpJsIntlTargetType,
  csharpNullableTargetType,
  csharpQualifiedTypeRenderShape,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
  csharpTsValueTargetType,
  type CsharpJsIntlCarrierName,
} from "../../../types/index.js";
import type {
  CsharpSourceProfileCallPolicy,
  CsharpSourceProfileCallPolicyContext,
  CsharpSourceProfilePropertyPolicy,
} from "../source-profile-policy.js";
import { resolveCsharpSelectedSourceValue } from "../source-profile-policy.js";
import {
  instanceMethod,
  jsCallPolicy,
  jsConstructIdentity,
  jsMemberIdentity,
  jsPropertyPolicy,
  jsRuntimeTargetType,
  targetParameter,
  targetProperty,
} from "./common.js";

const doubleType = csharpSourcePrimitiveTargetType("float64");
const boolType = csharpSourcePrimitiveTargetType("bool");
const stringType = csharpStringTargetType();
const valueType = csharpTsValueTargetType();
const dateType = csharpJsDateTargetType();
const instanceReceiver = { kind: "instance" } as const;
const noReceiver = { kind: "none" } as const;
const intlRuntimeType = jsRuntimeTargetType("Intl");

const constructors = [
  {
    source: "IntlDateTimeFormatConstructor",
    target: "IntlDateTimeFormat",
  },
  {
    source: "IntlNumberFormatConstructor",
    target: "IntlNumberFormat",
  },
  {
    source: "IntlCollatorConstructor",
    target: "IntlCollator",
  },
] as const;

export const csharpJsIntlCallPolicies:
  readonly CsharpSourceProfileCallPolicy[] = Object.freeze([
    ...constructors.map((entry) =>
      jsCallPolicy(
        jsConstructIdentity(entry.source),
        () => intlConstructor(entry.target),
        noReceiver,
      )
    ),
    ...["format", "formatToParts"].map((name) =>
      jsCallPolicy(
        jsMemberIdentity("IntlDateTimeFormat", name),
        (context) => dateTimeFormatMember(context, name),
        instanceReceiver,
      )
    ),
    jsCallPolicy(
      jsMemberIdentity("IntlDateTimeFormat", "resolvedOptions"),
      (context) => directIntlMember(context, "IntlDateTimeFormat", "resolvedOptions", []),
      instanceReceiver,
    ),
    ...["format", "formatToParts"].map((name) =>
      jsCallPolicy(
        jsMemberIdentity("IntlNumberFormat", name),
        (context) => directIntlMember(
          context,
          "IntlNumberFormat",
          name,
          [targetParameter("value", doubleType)],
        ),
        instanceReceiver,
      )
    ),
    jsCallPolicy(
      jsMemberIdentity("IntlNumberFormat", "resolvedOptions"),
      (context) => directIntlMember(context, "IntlNumberFormat", "resolvedOptions", []),
      instanceReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity("IntlCollator", "compare"),
      (context) => directIntlMember(
        context,
        "IntlCollator",
        "compare",
        [
          targetParameter("left", stringType),
          targetParameter("right", stringType),
        ],
      ),
      instanceReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity("IntlCollator", "resolvedOptions"),
      (context) => directIntlMember(context, "IntlCollator", "resolvedOptions", []),
      instanceReceiver,
    ),
  ]);

export const csharpJsIntlPropertyPolicies:
  readonly CsharpSourceProfilePropertyPolicy[] = Object.freeze([
    ...constructors.map((entry) =>
      jsPropertyPolicy(
        jsMemberIdentity("IntlObject", entry.target.replace("Intl", "")),
        () => targetProperty(
          `Tsonic.CSharp.Js.Intl.${entry.target}`,
          entry.target.replace("Intl", ""),
          entry.target.replace("Intl", ""),
          intlRuntimeType,
          intlConstructorCarrier(entry.target),
          { static: true, readonly: true },
        ),
        noReceiver,
      )
    ),
    ...[
      ["IntlDateTimeFormatPart", "type", stringType],
      ["IntlDateTimeFormatPart", "value", stringType],
      ["IntlNumberFormatPart", "type", stringType],
      ["IntlNumberFormatPart", "value", stringType],
      ["IntlResolvedDateTimeFormatOptions", "locale", stringType],
      ["IntlResolvedDateTimeFormatOptions", "calendar", stringType],
      ["IntlResolvedDateTimeFormatOptions", "numberingSystem", stringType],
      ["IntlResolvedDateTimeFormatOptions", "timeZone", stringType],
      ["IntlResolvedNumberFormatOptions", "locale", stringType],
      ["IntlResolvedNumberFormatOptions", "numberingSystem", stringType],
      ["IntlResolvedNumberFormatOptions", "style", stringType],
      ["IntlResolvedNumberFormatOptions", "minimumIntegerDigits", doubleType],
      ["IntlResolvedNumberFormatOptions", "minimumFractionDigits", doubleType],
      ["IntlResolvedNumberFormatOptions", "maximumFractionDigits", doubleType],
      ["IntlResolvedNumberFormatOptions", "useGrouping", boolType],
      ["IntlResolvedCollatorOptions", "locale", stringType],
      ["IntlResolvedCollatorOptions", "usage", stringType],
      ["IntlResolvedCollatorOptions", "sensitivity", stringType],
      ["IntlResolvedCollatorOptions", "ignorePunctuation", boolType],
      ["IntlResolvedCollatorOptions", "collation", stringType],
      ["IntlResolvedCollatorOptions", "numeric", boolType],
      ["IntlResolvedCollatorOptions", "caseFirst", stringType],
    ].map(([owner, name, result]) =>
      jsPropertyPolicy(
        jsMemberIdentity(owner as string, name as string),
        (context) => {
          const receiver = resolveCsharpSelectedSourceValue(context, context.source.receiver);
          return receiver?.kind === "target-named" && result !== undefined
            ? targetProperty(
                `Tsonic.CSharp.Js.${owner}.${name}`,
                name as string,
                name as string,
                receiver,
                result as TargetTypeRef,
                { readonly: true },
              )
            : undefined;
        },
        instanceReceiver,
      )
    ),
  ]);

function intlConstructor(name: CsharpJsIntlCarrierName): CsharpTargetMember {
  const target = csharpJsIntlTargetType(name);
  return Object.freeze({
    id: `Tsonic.CSharp.Js.${name}..ctor`,
    sourceName: "constructor",
    targetName: name,
    kind: "constructor",
    declaringType: target,
    parameters: Object.freeze([
      targetParameter("locales", valueType, {
        optional: true,
        csharpAcceptsClosedSourceArgument: true,
      }),
      targetParameter("options", valueType, {
        optional: true,
        csharpAcceptsClosedSourceArgument: true,
      }),
    ]),
    returnType: target,
  });
}

function intlConstructorCarrier(name: CsharpJsIntlCarrierName): TargetTypeRef {
  const carrierName = `${name}Constructor`;
  return csharpTargetNamedType(
    `Tsonic.CSharp.Js.${carrierName}`,
    undefined,
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", carrierName),
  );
}

function dateTimeFormatMember(
  context: CsharpSourceProfileCallPolicyContext,
  name: string,
): CsharpTargetMember | undefined {
  const argument = context.source.sourceArguments[0];
  const argumentType = resolveCsharpSelectedSourceValue(context, argument);
  const parameters = argument === undefined
    ? [targetParameter("value", csharpNullableTargetType(dateType), { optional: true })]
    : argumentType === undefined
      ? undefined
      : [targetParameter("value", argumentType)];
  return parameters === undefined
    ? undefined
    : directIntlMember(context, "IntlDateTimeFormat", name, parameters);
}

function directIntlMember(
  context: CsharpSourceProfileCallPolicyContext,
  owner: "IntlDateTimeFormat" | "IntlNumberFormat" | "IntlCollator",
  name: string,
  parameters: readonly ReturnType<typeof targetParameter>[],
): CsharpTargetMember | undefined {
  const receiver = resolveCsharpSelectedSourceValue(
    context,
    context.source.sourceReceiver,
  );
  const result = context.host.types.resolveType(
    context.source.sourceResultType,
    context.sourceFile,
  );
  return receiver?.kind !== "target-named" || result === undefined
    ? undefined
    : instanceMethod(
        `Tsonic.CSharp.Js.${owner}.${name}`,
        name,
        name,
        receiver,
        parameters,
        result,
      );
}
