import {
  csharpBigIntegerTargetType,
  csharpStringTargetType,
  csharpSourcePrimitiveTargetType,
  targetTypeRefEquals,
  type CsharpRuntimeUnionTargetTypeRef,
  type TargetTypeRef,
} from "../../../types/index.js";
import { resolveCsharpSelectedSourceValue, type CsharpSourceProfileCallPolicy } from "../source-profile-policy.js";
import { jsCallIdentity, jsCallPolicy, jsMemberIdentity, jsRuntimeTargetType, receiverHelperMethod, staticMethod, targetParameter } from "./common.js";

const primitiveKinds = new Set([
  "bool", "int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64",
  "native-int", "native-uint", "int128", "uint128", "float16", "float32", "float64", "decimal",
]);

function isBigIntInput(type: TargetTypeRef): boolean {
  return type.kind === "source-primitive" && primitiveKinds.has(type.name) ||
    targetTypeRefEquals(type, csharpBigIntegerTargetType()) ||
    targetTypeRefEquals(type, csharpStringTargetType());
}

export const csharpJsBigIntCallPolicies: readonly CsharpSourceProfileCallPolicy[] = [
  jsCallPolicy(jsMemberIdentity("BigInt", "toString"), context => {
    const receiver = resolveCsharpSelectedSourceValue(context, context.source.sourceReceiver);
    if (receiver === undefined || !(targetTypeRefEquals(receiver, csharpBigIntegerTargetType()) ||
      receiver.kind === "source-primitive" && ["int8", "uint8", "int16", "uint16", "int32", "uint32",
        "int64", "uint64", "int128", "uint128", "native-int", "native-uint"].includes(receiver.name))) return undefined;
    const helper = targetTypeRefEquals(receiver, csharpBigIntegerTargetType()) ? "BigIntOps" : "Number";
    return receiverHelperMethod(`Tsonic.CSharp.Js.${helper}.toString:bigint`, "toString", "toString",
      jsRuntimeTargetType(helper), receiver,
      [targetParameter("radix", csharpSourcePrimitiveTargetType("int32"), { optional: true })],
      csharpStringTargetType());
  }, { kind: "target-parameter", targetParameterIndex: 0 }),
  ...["asIntN", "asUintN"].map(name => jsCallPolicy(jsMemberIdentity("BigIntConstructor", name), context => {
    const argument = resolveCsharpSelectedSourceValue(context, context.source.sourceArguments[1]);
    if (argument === undefined || context.source.sourceArguments.length !== 2 ||
      !(targetTypeRefEquals(argument, csharpBigIntegerTargetType()) ||
        argument.kind === "source-primitive" && ["int8", "uint8", "int16", "uint16", "int32", "uint32",
          "int64", "uint64", "native-int", "native-uint", "int128", "uint128"].includes(argument.name))) return undefined;
    return staticMethod(`Tsonic.CSharp.Js.BigIntOps.${name}`, name, name, jsRuntimeTargetType("BigIntOps"),
      [targetParameter("bits", csharpSourcePrimitiveTargetType("float64")), targetParameter("value", argument)],
      csharpBigIntegerTargetType());
  }, { kind: "none" })),
  jsCallPolicy(jsCallIdentity("BigIntConstructor"), context => {
    const argument = resolveCsharpSelectedSourceValue(context, context.source.sourceArguments[0]);
    if (argument === undefined || context.source.sourceArguments.length !== 1) return undefined;
    const arms = argument.kind === "target-named"
      ? (argument as Partial<CsharpRuntimeUnionTargetTypeRef>).csharpRuntimeUnionArms
      : undefined;
    if (!(arms === undefined ? isBigIntInput(argument) : arms.every(isBigIntInput))) return undefined;
    return staticMethod("Tsonic.CSharp.Js.BigIntOps.from", "constructor", "from",
      jsRuntimeTargetType("BigIntOps"), [targetParameter("value", argument)], csharpBigIntegerTargetType());
  }, { kind: "none" }),
];
