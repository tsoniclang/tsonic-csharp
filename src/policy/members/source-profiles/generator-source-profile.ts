import type {
  CsharpTargetMember,
  CsharpTargetParameter,
  TargetTypeRef,
} from "../../types/index.js";
import {
  combineCsharpTargetUnionMembers,
  csharpIteratorResultTargetType,
  csharpSourcePrimitiveTargetType,
  csharpTaskTargetType,
  getCsharpGeneratorProtocol,
  getCsharpIteratorResultProtocol,
  isCsharpThrowableType,
} from "../../types/index.js";
import type {
  CsharpSourceProfileCallPolicy,
  CsharpSourceProfileCallPolicyContext,
  CsharpSourceProfileCallPolicyResult,
  CsharpSourceProfileIdentitySelector,
  CsharpSourceProfilePropertyPolicy,
  CsharpSourceProfilePropertyPolicyContext,
  CsharpSourceProfilePropertyPolicyResult,
} from "./source-profile-policy.js";
import {
  csharpSourceProfileCall,
  csharpSourceProfileDiagnostic,
  resolveCsharpSelectedSourceValue,
} from "./source-profile-policy.js";
import type {
  CsharpSourceProfileOwner,
} from "./source-profile-identity.js";

const owners: readonly CsharpSourceProfileOwner[] = Object.freeze([
  "csharp-provider",
  "js",
]);
const instanceReceiver = { kind: "instance" } as const;

type GeneratorKind = "sync" | "async";
type GeneratorParameterType = "next-value" | "return-value" | "selected-argument";

interface GeneratorDeclarationPolicy {
  readonly sourceName: "Generator" | "AsyncGenerator";
  readonly generatorKind: GeneratorKind;
}

interface GeneratorCallParameterPolicy {
  readonly name: string;
  readonly type: GeneratorParameterType;
  readonly argumentIndex?: number;
  readonly constraint?: "throwable";
}

interface GeneratorCallSignaturePolicy {
  readonly parameterCount: number;
  readonly parameters: readonly GeneratorCallParameterPolicy[];
}

interface GeneratorCallPolicySpec {
  readonly identity: string;
  readonly sourceName: "next" | "return" | "throw";
  readonly targetNames: Readonly<Record<GeneratorKind, string>>;
  readonly signatures: readonly GeneratorCallSignaturePolicy[];
}

type IteratorResultValuePolicy =
  | "done"
  | "combined-value"
  | "yield-value"
  | "return-value";

interface IteratorResultPropertyPolicySpec {
  readonly identity: string;
  readonly source: Omit<CsharpSourceProfileIdentitySelector, "owner">;
  readonly sourceName: "done" | "value";
  readonly targetName: "Done" | "Value" | "YieldValue" | "ReturnValue";
  readonly valuePolicy: IteratorResultValuePolicy;
}

const generatorDeclarationPolicies: readonly GeneratorDeclarationPolicy[] = Object.freeze([
  { sourceName: "Generator", generatorKind: "sync" },
  { sourceName: "AsyncGenerator", generatorKind: "async" },
]);

const generatorCallPolicySpecs = Object.freeze([
  {
    identity: "tsonic.csharp.generator.advance",
    sourceName: "next",
    targetNames: Object.freeze({ sync: "Next", async: "NextAsync" }),
    signatures: Object.freeze([
      generatorCallSignature(0, []),
      generatorCallSignature(1, [{ name: "value", type: "next-value" }]),
    ]),
  },
  {
    identity: "tsonic.csharp.generator.complete",
    sourceName: "return",
    targetNames: Object.freeze({ sync: "Return", async: "ReturnAsync" }),
    signatures: Object.freeze([
      generatorCallSignature(1, [{ name: "value", type: "return-value" }]),
    ]),
  },
  {
    identity: "tsonic.csharp.generator.raise",
    sourceName: "throw",
    targetNames: Object.freeze({ sync: "Throw", async: "ThrowAsync" }),
    signatures: Object.freeze([
      generatorCallSignature(1, [{
        name: "error",
        type: "selected-argument",
        argumentIndex: 0,
        constraint: "throwable",
      }]),
    ]),
  },
] satisfies readonly GeneratorCallPolicySpec[]);

const iteratorResultPropertyPolicySpecs:
  readonly IteratorResultPropertyPolicySpec[] = Object.freeze([
    iteratorResultPropertyPolicy(
      "tsonic.csharp.generator.iterator-result.combined.done",
      ["IteratorYieldResult", "IteratorReturnResult"],
      "done",
      "Done",
      "done",
    ),
    iteratorResultPropertyPolicy(
      "tsonic.csharp.generator.iterator-result.combined.value",
      ["IteratorYieldResult", "IteratorReturnResult"],
      "value",
      "Value",
      "combined-value",
    ),
    iteratorResultPropertyPolicy(
      "tsonic.csharp.generator.iterator-result.yield.done",
      "IteratorYieldResult",
      "done",
      "Done",
      "done",
    ),
    iteratorResultPropertyPolicy(
      "tsonic.csharp.generator.iterator-result.yield.value",
      "IteratorYieldResult",
      "value",
      "YieldValue",
      "yield-value",
    ),
    iteratorResultPropertyPolicy(
      "tsonic.csharp.generator.iterator-result.return.done",
      "IteratorReturnResult",
      "done",
      "Done",
      "done",
    ),
    iteratorResultPropertyPolicy(
      "tsonic.csharp.generator.iterator-result.return.value",
      "IteratorReturnResult",
      "value",
      "ReturnValue",
      "return-value",
    ),
  ]);

export const csharpGeneratorSourceProfileCallPolicies:
  readonly CsharpSourceProfileCallPolicy[] = Object.freeze(
    owners.flatMap((owner) =>
      generatorDeclarationPolicies.flatMap((declaration) =>
        generatorCallPolicySpecs.map((policy) => ({
          source: {
            owner,
            kind: "member" as const,
            declaringName: declaration.sourceName,
            name: policy.sourceName,
          },
          select(
            context: CsharpSourceProfileCallPolicyContext,
          ): CsharpSourceProfileCallPolicyResult {
            return selectGeneratorCall(context, declaration, policy);
          },
        })),
      ),
    ),
  );

export const csharpGeneratorSourceProfilePropertyPolicies:
  readonly CsharpSourceProfilePropertyPolicy[] = Object.freeze(
    owners.flatMap((owner) =>
      iteratorResultPropertyPolicySpecs.map((policy) => ({
        source: { owner, ...policy.source },
        select(
          context: CsharpSourceProfilePropertyPolicyContext,
        ): CsharpSourceProfilePropertyPolicyResult {
          return selectIteratorResultProperty(context, policy);
        },
      })),
    ),
  );

function selectGeneratorCall(
  context: CsharpSourceProfileCallPolicyContext,
  declaration: GeneratorDeclarationPolicy,
  policy: GeneratorCallPolicySpec,
): CsharpSourceProfileCallPolicyResult {
  const receiverType = resolveCsharpSelectedSourceValue(
    context,
    context.source.sourceReceiver,
  );
  const protocol = getCsharpGeneratorProtocol(receiverType);
  if (receiverType === undefined || protocol?.kind !== declaration.generatorKind) {
    return rejectedGeneratorCall(
      `The exact ${declaration.sourceName}.${policy.sourceName} receiver does not resolve to its closed C# generator protocol.`,
    );
  }
  const resultType = csharpIteratorResultTargetType(protocol);
  const targetResult = protocol.kind === "sync"
    ? resultType
    : csharpTaskTargetType(resultType);
  const parameterCount = context.source.sourceSelectedSignatureParameters.length;
  const parameters = generatorTargetParameters(
    context,
    policy,
    parameterCount,
    protocol,
  );
  if (parameters === undefined) {
    return rejectedGeneratorCall(
      `The exact selected ${declaration.sourceName}.${policy.sourceName} signature has no matching native generator protocol member.`,
    );
  }
  const targetMember: CsharpTargetMember = Object.freeze({
    id: `${policy.identity}.${protocol.kind}.${parameterCount}`,
    sourceName: policy.sourceName,
    targetName: policy.targetNames[protocol.kind],
    kind: "method",
    declaringType: receiverType,
    parameters,
    returnType: targetResult,
  });
  const call = csharpSourceProfileCall(
    context.source,
    targetMember,
    instanceReceiver,
  );
  return call === undefined
    ? rejectedGeneratorCall(
        `The exact selected ${declaration.sourceName}.${policy.sourceName} arguments do not form a closed C# generator protocol call.`,
      )
    : { kind: "resolved", call };
}

function selectIteratorResultProperty(
  context: CsharpSourceProfilePropertyPolicyContext,
  policy: IteratorResultPropertyPolicySpec,
): CsharpSourceProfilePropertyPolicyResult {
  const receiverType = context.host.types.resolveStorage(
    context.source.receiver.expression,
    context.sourceFile,
  ) ?? context.host.types.resolveNode(
    context.source.receiver.expression,
    context.sourceFile,
  ) ?? context.host.types.resolveSelectedValue(
      context.source.receiver.expression,
      context.source.receiver.type,
      context.sourceFile,
    );
  const protocol = getCsharpIteratorResultProtocol(receiverType);
  if (receiverType === undefined || protocol === undefined) {
    return rejectedGeneratorProperty(
      `The exact iterator-result ${policy.sourceName} receiver does not resolve to a closed C# iterator-result protocol.`,
    );
  }
  const returnType = iteratorResultPropertyType(policy.valuePolicy, protocol);
  if (returnType === undefined) {
    return rejectedGeneratorProperty(
      "The exact iterator-result value cannot be represented by the closed C# runtime-union contract.",
    );
  }
  return {
    kind: "resolved",
    targetMember: Object.freeze({
      id: policy.identity,
      sourceName: policy.sourceName,
      targetName: policy.targetName,
      kind: "property",
      declaringType: receiverType,
      parameters: [],
      returnType,
      readonly: true,
    }),
    receiver: instanceReceiver,
  };
}

function generatorTargetParameters(
  context: CsharpSourceProfileCallPolicyContext,
  policy: GeneratorCallPolicySpec,
  parameterCount: number,
  protocol: NonNullable<ReturnType<typeof getCsharpGeneratorProtocol>>,
): readonly CsharpTargetParameter[] | undefined {
  const signature = policy.signatures.find((candidate) =>
    candidate.parameterCount === parameterCount);
  if (signature === undefined) {
    return undefined;
  }
  const parameters = signature.parameters.map((parameter) => {
    const type = generatorParameterType(context, parameter, protocol);
    return type === undefined ||
        parameter.constraint === "throwable" &&
          !isCsharpThrowableType(context.host, type)
      ? undefined
      : targetParameter(parameter.name, type);
  });
  return parameters.some((parameter) => parameter === undefined)
    ? undefined
    : parameters as readonly CsharpTargetParameter[];
}

function generatorParameterType(
  context: CsharpSourceProfileCallPolicyContext,
  parameter: GeneratorCallParameterPolicy,
  protocol: NonNullable<ReturnType<typeof getCsharpGeneratorProtocol>>,
): TargetTypeRef | undefined {
  switch (parameter.type) {
    case "next-value":
      return protocol.nextType;
    case "return-value":
      return protocol.returnType;
    case "selected-argument":
      return parameter.argumentIndex === undefined
        ? undefined
        : resolveCsharpSelectedSourceValue(
            context,
            context.source.sourceArguments[parameter.argumentIndex],
          );
  }
}

function iteratorResultPropertyType(
  policy: IteratorResultValuePolicy,
  protocol: NonNullable<ReturnType<typeof getCsharpIteratorResultProtocol>>,
): TargetTypeRef | undefined {
  switch (policy) {
    case "done":
      return csharpSourcePrimitiveTargetType("bool");
    case "combined-value":
      return combineCsharpTargetUnionMembers([
        protocol.yieldType,
        protocol.returnType,
      ]);
    case "yield-value":
      return protocol.yieldType;
    case "return-value":
      return protocol.returnType;
  }
}

function iteratorResultPropertyPolicy(
  identity: string,
  declaring: string | readonly string[],
  sourceName: IteratorResultPropertyPolicySpec["sourceName"],
  targetName: IteratorResultPropertyPolicySpec["targetName"],
  valuePolicy: IteratorResultValuePolicy,
): IteratorResultPropertyPolicySpec {
  return Object.freeze({
    identity,
    source: Array.isArray(declaring)
      ? {
          kind: "member" as const,
          declaringNames: Object.freeze([...declaring]),
          declarationCardinality: "multiple" as const,
          name: sourceName,
        }
      : {
          kind: "member" as const,
          declaringName: declaring as string,
          declarationCardinality: "single" as const,
          name: sourceName,
        },
    sourceName,
    targetName,
    valuePolicy,
  });
}

function generatorCallSignature(
  parameterCount: number,
  parameters: readonly GeneratorCallParameterPolicy[],
): GeneratorCallSignaturePolicy {
  return Object.freeze({
    parameterCount,
    parameters: Object.freeze([...parameters]),
  });
}

function targetParameter(
  name: string,
  type: TargetTypeRef,
): CsharpTargetParameter {
  return { name, type, passingMode: "by-value" };
}

function rejectedGeneratorCall(
  message: string,
): CsharpSourceProfileCallPolicyResult {
  return {
    kind: "rejected",
    diagnostic: generatorDiagnostic(
      "CSHARP_GENERATOR_SOURCE_PROFILE_CALL_NOT_CLOSED",
      9100921,
      message,
    ),
  };
}

function rejectedGeneratorProperty(
  message: string,
): CsharpSourceProfilePropertyPolicyResult {
  return {
    kind: "rejected",
    diagnostic: generatorDiagnostic(
      "CSHARP_GENERATOR_SOURCE_PROFILE_PROPERTY_NOT_CLOSED",
      9100922,
      message,
    ),
  };
}

function generatorDiagnostic(
  code: string,
  numericCode: number,
  message: string,
) {
  return csharpSourceProfileDiagnostic(code, numericCode, message, [
    "The selected declaration belongs to the explicit generator source profile.",
    "No source-name recovery or target fallback is permitted.",
  ]);
}
