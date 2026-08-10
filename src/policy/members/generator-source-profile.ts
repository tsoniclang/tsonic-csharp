import type {
  CsharpTargetMember,
  CsharpTargetParameter,
  TargetTypeRef,
} from "../types/index.js";
import {
  combineCsharpTargetUnionMembers,
  csharpIteratorResultTargetType,
  csharpSourcePrimitiveTargetType,
  csharpTaskTargetType,
  getCsharpGeneratorProtocol,
  getCsharpIteratorResultProtocol,
  isCsharpThrowableType,
} from "../types/index.js";
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

export const csharpGeneratorSourceProfileCallPolicies:
  readonly CsharpSourceProfileCallPolicy[] = Object.freeze(
    owners.flatMap((owner) =>
      ["Generator", "AsyncGenerator"].flatMap((declaringName) =>
        ["next", "return", "throw"].map((name) => ({
          source: generatorMemberIdentity(owner, declaringName, name),
          select(
            context: CsharpSourceProfileCallPolicyContext,
          ): CsharpSourceProfileCallPolicyResult {
            return selectGeneratorCall(context, declaringName, name);
          },
        })),
      ),
    ),
  );

export const csharpGeneratorSourceProfilePropertyPolicies:
  readonly CsharpSourceProfilePropertyPolicy[] = Object.freeze(
    owners.flatMap((owner) =>
      [
        {
          source: {
            owner,
            kind: "member" as const,
            declaringNames: [
              "IteratorYieldResult",
              "IteratorReturnResult",
            ],
            declarationCardinality: "multiple" as const,
            name: "done",
          },
          select(
            context: CsharpSourceProfilePropertyPolicyContext,
          ): CsharpSourceProfilePropertyPolicyResult {
            return selectIteratorResultProperty(
              context,
              "combined",
              "done",
            );
          },
        },
        {
          source: {
            owner,
            kind: "member" as const,
            declaringNames: [
              "IteratorYieldResult",
              "IteratorReturnResult",
            ],
            declarationCardinality: "multiple" as const,
            name: "value",
          },
          select(
            context: CsharpSourceProfilePropertyPolicyContext,
          ): CsharpSourceProfilePropertyPolicyResult {
            return selectIteratorResultProperty(
              context,
              "combined",
              "value",
            );
          },
        },
        ...["IteratorYieldResult", "IteratorReturnResult"].flatMap(
          (declaringName) => ({
            source: ["done", "value"].map((name) => ({
              ...generatorMemberIdentity(owner, declaringName, name),
              declarationCardinality: "single" as const,
            })),
            declaringName,
          }),
        ).flatMap(({ source, declaringName }) =>
          source.map((identity) => ({
            source: identity,
            select(
              context: CsharpSourceProfilePropertyPolicyContext,
            ): CsharpSourceProfilePropertyPolicyResult {
              return selectIteratorResultProperty(
                context,
                declaringName,
                identity.name!,
              );
            },
          }))
        ),
      ],
    ),
  );

function selectGeneratorCall(
  context: CsharpSourceProfileCallPolicyContext,
  declaringName: string,
  sourceName: string,
): CsharpSourceProfileCallPolicyResult {
  const receiverType = resolveCsharpSelectedSourceValue(
    context,
    context.source.sourceReceiver,
  );
  const protocol = getCsharpGeneratorProtocol(receiverType);
  const expectedKind = declaringName === "Generator" ? "sync" : "async";
  if (receiverType === undefined || protocol?.kind !== expectedKind) {
    return rejectedGeneratorCall(
      `The exact ${declaringName}.${sourceName} receiver does not resolve to its closed C# generator protocol.`,
    );
  }
  const resultType = csharpIteratorResultTargetType(protocol);
  const targetResult = protocol.kind === "sync"
    ? resultType
    : csharpTaskTargetType(resultType);
  const parameterCount = context.source.sourceSelectedSignatureParameters.length;
  const throwArgumentType = sourceName === "throw"
    ? resolveCsharpSelectedSourceValue(
        context,
        context.source.sourceArguments[0],
      )
    : undefined;
  if (
    sourceName === "throw" &&
    !isCsharpThrowableType(context.host, throwArgumentType)
  ) {
    return rejectedGeneratorCall(
      "Generator.throw requires an exact statically throwable C# argument carrier.",
    );
  }
  const targetName = generatorTargetMemberName(protocol.kind, sourceName);
  const parameters = generatorTargetParameters(
    sourceName,
    parameterCount,
    protocol.nextType,
    protocol.returnType,
    throwArgumentType,
  );
  if (targetName === undefined || parameters === undefined) {
    return rejectedGeneratorCall(
      `The exact selected ${declaringName}.${sourceName} signature has no matching native generator protocol member.`,
    );
  }
  const targetMember: CsharpTargetMember = Object.freeze({
    id: `tsonic.csharp.generator.${protocol.kind}.${sourceName}.${parameterCount}`,
    sourceName,
    targetName,
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
        `The exact selected ${declaringName}.${sourceName} arguments do not form a closed C# generator protocol call.`,
      )
    : { kind: "resolved", call };
}

function selectIteratorResultProperty(
  context: CsharpSourceProfilePropertyPolicyContext,
  selection: "combined" | string,
  sourceName: string,
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
      `The exact iterator-result ${sourceName} receiver does not resolve to a closed C# iterator-result protocol.`,
    );
  }
  const returnType = sourceName === "done"
    ? csharpSourcePrimitiveTargetType("bool")
    : selection === "combined"
      ? combineCsharpTargetUnionMembers([
          protocol.yieldType,
          protocol.returnType,
        ])
      : selection === "IteratorYieldResult"
      ? protocol.yieldType
      : protocol.returnType;
  if (returnType === undefined) {
    return rejectedGeneratorProperty(
      "The exact iterator-result value cannot be represented by the closed C# runtime-union contract.",
    );
  }
  const targetName = sourceName === "done"
    ? "Done"
    : selection === "combined"
      ? "Value"
      : selection === "IteratorYieldResult"
      ? "YieldValue"
      : "ReturnValue";
  return {
    kind: "resolved",
    targetMember: Object.freeze({
      id: `tsonic.csharp.generator.iterator-result.${selection}.${sourceName}`,
      sourceName,
      targetName,
      kind: "property",
      declaringType: receiverType,
      parameters: [],
      returnType,
      readonly: true,
    }),
    receiver: instanceReceiver,
  };
}

function generatorTargetMemberName(
  kind: "sync" | "async",
  sourceName: string,
): string | undefined {
  switch (sourceName) {
    case "next":
      return kind === "sync" ? "Next" : "NextAsync";
    case "return":
      return kind === "sync" ? "Return" : "ReturnAsync";
    case "throw":
      return kind === "sync" ? "Throw" : "ThrowAsync";
    default:
      return undefined;
  }
}

function generatorTargetParameters(
  sourceName: string,
  parameterCount: number,
  nextType: TargetTypeRef,
  returnType: TargetTypeRef,
  throwType: TargetTypeRef | undefined,
): readonly CsharpTargetParameter[] | undefined {
  if (sourceName === "next") {
    return parameterCount === 0
      ? []
      : parameterCount === 1
        ? [targetParameter("value", nextType)]
        : undefined;
  }
  if (sourceName === "return" && parameterCount === 1) {
    return [targetParameter("value", returnType)];
  }
  if (
    sourceName === "throw" &&
    parameterCount === 1 &&
    throwType !== undefined
  ) {
    return [targetParameter("error", throwType)];
  }
  return undefined;
}

function targetParameter(
  name: string,
  type: TargetTypeRef,
): CsharpTargetParameter {
  return { name, type, passingMode: "by-value" };
}

function generatorMemberIdentity(
  owner: CsharpSourceProfileOwner,
  declaringName: string,
  name: string,
): CsharpSourceProfileIdentitySelector {
  return { owner, kind: "member", declaringName, name };
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
