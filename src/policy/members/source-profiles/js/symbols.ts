import {
  csharpJsSymbolTargetType,
  csharpNullableTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
} from "../../../types/index.js";
import type {
  CsharpSourceProfileCallPolicy,
} from "../source-profile-policy.js";
import {
  jsCallIdentity,
  jsCallPolicy,
  jsMemberIdentity,
  staticMethod,
  targetParameter,
} from "./common.js";

const symbolType = csharpJsSymbolTargetType();
const stringType = csharpStringTargetType();
const doubleType = csharpSourcePrimitiveTargetType("float64");
const noReceiver = { kind: "none" } as const;

export const csharpJsSymbolCallPolicies:
  readonly CsharpSourceProfileCallPolicy[] = Object.freeze([
    jsCallPolicy(
      jsCallIdentity("SymbolConstructor"),
      (context) => {
        const argument = context.source.sourceArguments[0];
        const argumentType = argument === undefined
          ? undefined
          : context.host.types.resolveSelectedValue(
              argument.expression,
              argument.type,
              context.sourceFile,
            );
        const parameters = argument === undefined
          ? []
          : argumentType?.kind === "source-primitive" &&
              argumentType.name === "float64"
            ? [targetParameter("description", doubleType)]
            : argumentType?.kind === "target-named" &&
                argumentType.id === stringType.id
              ? [targetParameter("description", stringType)]
              : undefined;
        return parameters === undefined || context.source.sourceArguments.length > 1
          ? undefined
          : staticMethod(
              `Tsonic.CSharp.Js.Symbol.create:${parameters.length === 0 ? "empty" : parameters[0]!.type.kind}`,
              "constructor",
              "create",
              symbolType,
              parameters,
              symbolType,
            );
      },
      noReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity("SymbolConstructor", "for"),
      () =>
        staticMethod(
          "Tsonic.CSharp.Js.Symbol.for",
          "for",
          "@for",
          symbolType,
          [targetParameter("key", stringType)],
          symbolType,
        ),
      noReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity("SymbolConstructor", "keyFor"),
      () =>
        staticMethod(
          "Tsonic.CSharp.Js.Symbol.keyFor",
          "keyFor",
          "keyFor",
          symbolType,
          [targetParameter("symbol", symbolType)],
          csharpNullableTargetType(stringType),
        ),
      noReceiver,
    ),
  ]);
