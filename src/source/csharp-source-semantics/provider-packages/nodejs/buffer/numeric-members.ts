import type {
  ProviderMemberDeclaration,
  ProviderParameterDeclaration,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetMember,
} from "../../../target-types.js";
import {
  targetParameter,
} from "../../../surfaces/js/source-library.js";
import type {
  NodejsClassCallTargetMember,
} from "../members/types.js";
import {
  nodeBufferTargetType,
} from "./identities.js";
import {
  nodeBufferDoubleTargetType,
  nodeBufferFloatTargetType,
  nodeBufferIntTargetType,
  nodeBufferSbyteTargetType,
  nodeBufferShortTargetType,
  nodeBufferUintTargetType,
  nodeBufferUshortTargetType,
} from "./helpers.js";
import {
  nodeBufferNumberProviderType,
} from "./provider-types.js";

interface NodeBufferNumericParameterDescriptor {
  readonly name: string;
  readonly targetType: TargetTypeRef;
}

interface NodeBufferNumericMemberDescriptor {
  readonly name: string;
  readonly parameters: readonly NodeBufferNumericParameterDescriptor[];
  readonly targetReturnType: TargetTypeRef;
}

const offsetParameter = { name: "offset", targetType: nodeBufferIntTargetType } satisfies NodeBufferNumericParameterDescriptor;

const nodeBufferNumericMembers = Object.freeze([
  readMember("readInt8", nodeBufferSbyteTargetType),
  readMember("readUInt16LE", nodeBufferUshortTargetType),
  readMember("readUInt16BE", nodeBufferUshortTargetType),
  readMember("readInt16LE", nodeBufferShortTargetType),
  readMember("readInt16BE", nodeBufferShortTargetType),
  readMember("readUInt32LE", nodeBufferUintTargetType),
  readMember("readUInt32BE", nodeBufferUintTargetType),
  readMember("readInt32LE", nodeBufferIntTargetType),
  readMember("readInt32BE", nodeBufferIntTargetType),
  readMember("readFloatLE", nodeBufferFloatTargetType),
  readMember("readFloatBE", nodeBufferFloatTargetType),
  readMember("readDoubleLE", nodeBufferDoubleTargetType),
  readMember("readDoubleBE", nodeBufferDoubleTargetType),
  writeMember("writeInt8", nodeBufferSbyteTargetType),
  writeMember("writeUInt16LE", nodeBufferUshortTargetType),
  writeMember("writeUInt16BE", nodeBufferUshortTargetType),
  writeMember("writeInt16LE", nodeBufferShortTargetType),
  writeMember("writeInt16BE", nodeBufferShortTargetType),
  writeMember("writeUInt32LE", nodeBufferUintTargetType),
  writeMember("writeUInt32BE", nodeBufferUintTargetType),
  writeMember("writeInt32LE", nodeBufferIntTargetType),
  writeMember("writeInt32BE", nodeBufferIntTargetType),
  writeMember("writeFloatLE", nodeBufferFloatTargetType),
  writeMember("writeFloatBE", nodeBufferFloatTargetType),
  writeMember("writeDoubleLE", nodeBufferDoubleTargetType),
  writeMember("writeDoubleBE", nodeBufferDoubleTargetType),
] satisfies readonly NodeBufferNumericMemberDescriptor[]);

export function nodeBufferNumericInstanceMemberDeclarations(): readonly ProviderMemberDeclaration[] {
  return nodeBufferNumericMembers.map((member) => ({
    id: nodeBufferNumericMemberId(member.name),
    name: member.name,
    kind: "method",
    signatures: [{
      id: nodeBufferNumericSignatureId(member),
      parameters: member.parameters.map(providerNumberParameter),
      returnType: nodeBufferNumberProviderType,
    }],
  }));
}

export function nodeBufferNumericClassCallTargetMembers(): readonly NodejsClassCallTargetMember[] {
  return nodeBufferNumericMembers.map((member) => ({
    exportName: "Buffer",
    memberName: member.name,
    memberId: nodeBufferNumericMemberId(member.name),
    signatureId: nodeBufferNumericSignatureId(member),
    member: nodeBufferNumericTargetMember(member),
  }));
}

function readMember(
  name: string,
  targetReturnType: TargetTypeRef,
): NodeBufferNumericMemberDescriptor {
  return {
    name,
    parameters: [offsetParameter],
    targetReturnType,
  };
}

function writeMember(
  name: string,
  valueType: TargetTypeRef,
): NodeBufferNumericMemberDescriptor {
  return {
    name,
    parameters: [
      { name: "value", targetType: valueType },
      offsetParameter,
    ],
    targetReturnType: nodeBufferIntTargetType,
  };
}

function providerNumberParameter(parameter: NodeBufferNumericParameterDescriptor): ProviderParameterDeclaration {
  return {
    name: parameter.name,
    type: nodeBufferNumberProviderType,
    optional: parameter.name === "offset" ? true : undefined,
  };
}

function nodeBufferNumericTargetMember(member: NodeBufferNumericMemberDescriptor): CsharpTargetMember {
  return {
    id: nodeBufferNumericTargetMemberId(member),
    sourceName: member.name,
    targetName: member.name,
    kind: "method",
    parameters: member.parameters.map((parameter) => targetParameter(parameter.name, parameter.targetType, { optional: parameter.name === "offset" })),
    returnType: member.targetReturnType,
    declaringType: nodeBufferTargetType,
  };
}

function nodeBufferNumericMemberId(name: string): string {
  return `node:buffer.Buffer.${name}`;
}

function nodeBufferNumericSignatureId(member: NodeBufferNumericMemberDescriptor): string {
  return `${nodeBufferNumericMemberId(member.name)}(${member.parameters.map((parameter) => targetTypeName(parameter.targetType)).join(",")})`;
}

function nodeBufferNumericTargetMemberId(member: NodeBufferNumericMemberDescriptor): string {
  return `Tsonic.CSharp.Node.Buffer.${member.name}(${member.parameters.map((parameter) => targetTypeName(parameter.targetType)).join(",")})`;
}

function targetTypeName(type: TargetTypeRef): string {
  if (type.kind !== "source-primitive") {
    throw new Error(`Unsupported NodeJS Buffer numeric target type kind '${type.kind}'.`);
  }
  return sourcePrimitiveTargetName(type.name);
}

function sourcePrimitiveTargetName(name: string): string {
  switch (name) {
    case "int8":
      return "System.SByte";
    case "uint8":
      return "System.Byte";
    case "int16":
      return "System.Int16";
    case "uint16":
      return "System.UInt16";
    case "int32":
      return "System.Int32";
    case "uint32":
      return "System.UInt32";
    case "float32":
      return "System.Single";
    case "float64":
      return "System.Double";
    default:
      throw new Error(`Unsupported NodeJS Buffer numeric target primitive '${name}'.`);
  }
}
