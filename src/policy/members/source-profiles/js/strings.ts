import type {
  CsharpTargetMember,
  CsharpTargetParameter,
} from "../../../types/index.js";
import {
  csharpJsArrayTargetType,
  csharpJsRegExpMatchArrayTargetType,
  csharpJsRegExpStringIteratorTargetType,
  csharpExactJsRegExpMatchArrayTargetType,
  csharpExactJsRegExpStringIteratorTargetType,
  csharpJsRegExpTargetType,
  csharpJsStringTargetType,
  csharpNullableTargetType,
  csharpNullableValueTargetType,
  csharpObjectTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  targetTypeRefEquals,
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
import {
  jsRegExpSourceProfileIdentity,
  jsSourceSemanticsIdentity,
} from "@tsonic/js-source-profile";
import {
  csharpJsReplacementCallbackParameter,
} from "./replacement-callback.js";
import {
  customProtocolTargetMember,
  resolveCustomRegExpProtocol,
  resolveStringOperationArgument,
  targetTypeKey,
} from "./regexp-protocol.js";

const stringType = csharpStringTargetType();
const jsStringType = csharpJsStringTargetType();
const intType = csharpSourcePrimitiveTargetType("int32");
const doubleType = csharpSourcePrimitiveTargetType("float64");
const boolType = csharpSourcePrimitiveTargetType("bool");
const stringHelperType = jsRuntimeTargetType("String");
const globalsType = jsRuntimeTargetType("Globals");

const stringReceiver = { kind: "target-parameter", targetParameterIndex: 0 } as const;
const noReceiver = { kind: "none" } as const;
const regexpStringMembers = jsRegExpSourceProfileIdentity.stringMembers;
const stringOwner = jsRegExpSourceProfileIdentity.owners.string;
const jsStringOwner = jsSourceSemanticsIdentity.typeExport;

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
    jsCallPolicy(
      jsMemberIdentity(stringOwner, regexpStringMembers.match),
      (context) => stringRegExpPatternMember(context, "match"),
      stringReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity(stringOwner, regexpStringMembers.matchAll),
      (context) => stringRegExpPatternMember(context, "matchAll"),
      stringReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity(stringOwner, regexpStringMembers.replace),
      (context) => stringReplacementMember(context, "replace"),
      stringReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity(stringOwner, regexpStringMembers.replaceAll),
      (context) => stringReplacementMember(context, "replaceAll"),
      stringReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity(stringOwner, regexpStringMembers.search),
      (context) => stringRegExpPatternMember(context, "search"),
      stringReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity(stringOwner, regexpStringMembers.split),
      (context) => stringRegExpPatternMember(context, "split"),
      stringReceiver,
    ),
    ...exactJsStringCallPolicies(),
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
    jsPropertyPolicy(
      jsMemberIdentity(jsStringOwner, "length"),
      () =>
        targetProperty(
          "Tsonic.CSharp.Js.JsString.Length",
          "length",
          "Length",
          jsStringType,
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
    jsElementPolicy(
      jsIndexerIdentity(jsStringOwner),
      () =>
        targetIndexer(
          "tsonic.csharp.js.JsString.codeUnit",
          jsStringType,
          intType,
          jsStringType,
          true,
        ),
      {
        kind: "method",
        targetName: "Substring",
        appendInt32Literal: 1,
      },
    ),
  ]);

function exactJsStringCallPolicies(): readonly CsharpSourceProfileCallPolicy[] {
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
      parameters: [targetParameter("strings", jsStringType, { paramsArray: true })],
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

function exactJsStringRegExpMember(
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
        ? doubleType
        : csharpJsArrayTargetType(jsStringType);
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

function exactJsStringReplacementMember(
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

function stringRegExpPatternMember(
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
        ? doubleType
        : csharpJsArrayTargetType(stringType);
  if (custom !== undefined) {
    return customProtocolTargetMember(
      operation,
      custom,
      resultType,
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

function stringReplacementMember(
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
