import type {
  TargetMember,
} from "@tsonic/tsts";
import {
  targetParameter,
} from "../../js/source-library.js";
import {
  nodeBufferEqualsExportName,
  nodeBufferEqualsTargetMemberId,
  nodeBufferLengthTargetMemberId,
  nodeBufferSliceExportName,
  nodeBufferSliceTargetMemberId,
  nodeBufferSubarrayExportName,
  nodeBufferSubarrayTargetMemberId,
  nodeBufferTargetType,
  nodeBufferToStringExportName,
  nodeBufferToStringTargetMemberId,
} from "./identities.js";
import {
  nodeBufferBoolTargetType,
  nodeBufferIntTargetType,
  nodeBufferNullableIntTargetType,
  nodeBufferStringTargetType,
  nodeBufferToStringEndTargetType,
} from "./helpers.js";

export function getNodeBufferLengthTargetMember(): TargetMember {
  return {
    id: nodeBufferLengthTargetMemberId,
    sourceName: "length",
    targetName: "length",
    kind: "property",
    parameters: [],
    returnType: nodeBufferIntTargetType,
    declaringType: nodeBufferTargetType,
  };
}

export function getNodeBufferEqualsTargetMember(): TargetMember {
  return {
    id: nodeBufferEqualsTargetMemberId,
    sourceName: nodeBufferEqualsExportName,
    targetName: nodeBufferEqualsExportName,
    kind: "method",
    parameters: [targetParameter("otherBuffer", nodeBufferTargetType)],
    returnType: nodeBufferBoolTargetType,
    declaringType: nodeBufferTargetType,
  };
}

export function getNodeBufferSliceTargetMember(): TargetMember {
  return nodeBufferRangeTargetMember(
    nodeBufferSliceTargetMemberId,
    nodeBufferSliceExportName,
    "slice",
  );
}

export function getNodeBufferSubarrayTargetMember(): TargetMember {
  return nodeBufferRangeTargetMember(
    nodeBufferSubarrayTargetMemberId,
    nodeBufferSubarrayExportName,
    "subarray",
  );
}

export function getNodeBufferToStringTargetMember(): TargetMember {
  return {
    id: nodeBufferToStringTargetMemberId,
    sourceName: nodeBufferToStringExportName,
    targetName: nodeBufferToStringExportName,
    kind: "method",
    parameters: [
      targetParameter("encoding", nodeBufferStringTargetType, { optional: true }),
      targetParameter("start", nodeBufferIntTargetType, { optional: true }),
      targetParameter("end", nodeBufferToStringEndTargetType(), { optional: true }),
    ],
    returnType: nodeBufferStringTargetType,
    declaringType: nodeBufferTargetType,
  };
}

function nodeBufferRangeTargetMember(
  targetMemberId: string,
  sourceName: string,
  targetName: string,
): TargetMember {
  return {
    id: targetMemberId,
    sourceName,
    targetName,
    kind: "method",
    parameters: [
      targetParameter("start", nodeBufferNullableIntTargetType(), { optional: true }),
      targetParameter("end", nodeBufferNullableIntTargetType(), { optional: true }),
    ],
    returnType: nodeBufferTargetType,
    declaringType: nodeBufferTargetType,
  };
}
