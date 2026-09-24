import type { CsharpTargetMember } from "../../../types/index.js";
import {
  csharpJsArrayTargetType,
  csharpJsRegExpMatchArrayTargetType,
  csharpJsRegExpStringIteratorTargetType,
  csharpExactJsRegExpMatchArrayTargetType,
  csharpExactJsRegExpStringIteratorTargetType,
  csharpJsRegExpTargetType,
  csharpJsStringTargetType,
  csharpNullableTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  targetTypeRefEquals,
} from "../../../types/index.js";
import type { CsharpSourceProfileCallPolicy } from "../source-profile-policy.js";
import { jsRuntimeTargetType, receiverHelperMethod, targetParameter } from "./common.js";
import { csharpJsReplacementCallbackParameter } from "./replacement-callback.js";
import {
  customProtocolTargetMember,
  resolveCustomRegExpProtocol,
  resolveStringOperationArgument,
  targetTypeKey,
} from "./regexp-protocol.js";

const stringType = csharpStringTargetType();
const jsStringType = csharpJsStringTargetType();
const doubleType = csharpSourcePrimitiveTargetType("float64");
const intType = csharpSourcePrimitiveTargetType("int32");
const stringHelperType = jsRuntimeTargetType("String");

export function exactJsStringRegExpMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
  operation: "match" | "matchAll" | "search" | "split",
): CsharpTargetMember | undefined {
  const pattern = resolveStringOperationArgument(context, 0);
  if (
    pattern === undefined ||
    !targetTypeRefEquals(pattern, csharpJsRegExpTargetType()) &&
      (operation !== "split" || !targetTypeRefEquals(pattern, jsStringType))
  ) {
    return undefined;
  }
  const resultType = operation === "match"
    ? csharpNullableTargetType(csharpExactJsRegExpMatchArrayTargetType())
    : operation === "matchAll"
      ? csharpExactJsRegExpStringIteratorTargetType()
      : operation === "search"
        ? intType
        : csharpJsArrayTargetType(targetTypeRefEquals(pattern, jsStringType)
          ? jsStringType : csharpNullableTargetType(jsStringType));
  const parameters = [targetParameter("pattern", pattern)];
  if (operation === "split") {
    parameters.push(targetParameter("limit", doubleType, { optional: true }));
  }
  return receiverHelperMethod(
    `Tsonic.CSharp.Js.JsString.${operation}:${targetTypeKey(pattern)}`,
    operation,
    operation,
    stringHelperType,
    jsStringType,
    parameters,
    resultType,
  );
}

export function exactJsStringReplacementMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
  operation: "replace" | "replaceAll",
): CsharpTargetMember | undefined {
  const search = resolveStringOperationArgument(context, 0);
  const replacement = context.host.types.resolveSourceCallParameter(
    context.source,
    1,
    context.sourceFile,
  );
  if (
    search === undefined ||
    replacement === undefined ||
    !targetTypeRefEquals(search, jsStringType) &&
      !targetTypeRefEquals(search, csharpJsRegExpTargetType())
  ) {
    return undefined;
  }
  const replacementParameter = targetTypeRefEquals(replacement, jsStringType)
    ? targetParameter("replacement", jsStringType)
    : csharpJsReplacementCallbackParameter(
        "replacement",
        replacement,
        jsStringType,
      );
  const replacementKind = targetTypeRefEquals(replacement, jsStringType)
    ? "string"
    : "callback";
  return replacementParameter === undefined
    ? undefined
    : receiverHelperMethod(
        `Tsonic.CSharp.Js.JsString.${operation}:${targetTypeKey(search)}:${replacementKind}`,
        operation,
        operation,
        stringHelperType,
        jsStringType,
        [
          targetParameter("search", search),
          replacementParameter,
        ],
        jsStringType,
      );
}

export function stringRegExpPatternMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
  operation: "match" | "matchAll" | "search" | "split",
): CsharpTargetMember | undefined {
  const pattern = resolveStringOperationArgument(context, 0);
  const custom = resolveCustomRegExpProtocol(
    context,
    0,
    operation === "matchAll" ? "match-all" : operation,
  );
  if (
    pattern === undefined ||
    !targetTypeRefEquals(pattern, stringType) &&
      !targetTypeRefEquals(pattern, csharpJsRegExpTargetType()) &&
      custom === undefined
  ) {
    return undefined;
  }
  if (
    operation === "matchAll" &&
    !targetTypeRefEquals(pattern, csharpJsRegExpTargetType()) &&
    custom === undefined
  ) {
    return undefined;
  }
  const resultType = operation === "match"
    ? csharpNullableTargetType(csharpJsRegExpMatchArrayTargetType())
    : operation === "matchAll"
      ? csharpJsRegExpStringIteratorTargetType()
      : operation === "search"
        ? intType
        : csharpJsArrayTargetType(targetTypeRefEquals(pattern, stringType)
          ? stringType : csharpNullableTargetType(stringType));
  if (custom !== undefined) {
    return customProtocolTargetMember(
      operation,
      custom,
      custom.signature.returnType,
      operation === "split"
        ? custom.signature.parameters.slice(1).map((type, index) =>
            targetParameter(`argument${index}`, type, {
              ...(custom.signature.optionalParameterIndexes?.includes(index + 1) === true
                ? { optional: true }
                : {}),
            })
          )
        : [],
    );
  }
  const parameters = [targetParameter("pattern", pattern)];
  if (operation === "split") {
    parameters.push(targetParameter("limit", doubleType, { optional: true }));
  }
  return receiverHelperMethod(
    `Tsonic.CSharp.Js.String.${operation}:${targetTypeKey(pattern)}`,
    operation,
    operation,
    stringHelperType,
    stringType,
    parameters,
    resultType,
  );
}

export function stringReplacementMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
  operation: "replace" | "replaceAll",
): CsharpTargetMember | undefined {
  const search = resolveStringOperationArgument(context, 0);
  const replacement = context.host.types.resolveSourceCallParameter(
    context.source,
    1,
    context.sourceFile,
  );
  const custom = resolveCustomRegExpProtocol(context, 0, "replace");
  if (
    search === undefined ||
    replacement === undefined ||
    !targetTypeRefEquals(search, stringType) &&
      !targetTypeRefEquals(search, csharpJsRegExpTargetType()) &&
      custom === undefined
  ) {
    return undefined;
  }
  if (custom !== undefined) {
    const selectedReplacement = custom.signature.parameters[1];
    if (
      custom.signature.parameters.length !== 2 ||
      selectedReplacement === undefined ||
      !targetTypeRefEquals(selectedReplacement, replacement)
    ) {
      return undefined;
    }
    return customProtocolTargetMember(
      operation,
      custom,
      stringType,
      [targetParameter("replacement", replacement)],
    );
  }
  const replacementParameter = targetTypeRefEquals(replacement, stringType)
    ? targetParameter("replacement", stringType)
    : csharpJsReplacementCallbackParameter(
        "replacement",
        replacement,
        stringType,
      );
  if (replacementParameter === undefined) {
    return undefined;
  }
  return receiverHelperMethod(
    `Tsonic.CSharp.Js.String.${operation}:${targetTypeKey(search)}:${
      targetTypeRefEquals(replacement, stringType) ? "string" : "callback"
    }`,
    operation,
    operation,
    stringHelperType,
    stringType,
    [
      targetParameter("search", search),
      replacementParameter,
    ],
    stringType,
  );
}
