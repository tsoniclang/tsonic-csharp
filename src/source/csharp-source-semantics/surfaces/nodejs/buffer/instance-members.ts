import type {
  TargetMember,
} from "@tsonic/tsts";
import {
  targetMethod,
  targetParameter,
  targetProperty,
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
  return targetProperty(
    nodeBufferLengthTargetMemberId,
    "length",
    "length",
    nodeBufferIntTargetType,
    {
      declaringType: nodeBufferTargetType,
    },
  );
}

export function getNodeBufferEqualsTargetMember(): TargetMember {
  return targetMethod(
    nodeBufferEqualsTargetMemberId,
    nodeBufferEqualsExportName,
    nodeBufferEqualsExportName,
    [targetParameter("otherBuffer", nodeBufferTargetType)],
    nodeBufferBoolTargetType,
    {
      declaringType: nodeBufferTargetType,
    },
  );
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
  return targetMethod(
    nodeBufferToStringTargetMemberId,
    nodeBufferToStringExportName,
    nodeBufferToStringExportName,
    [
      targetParameter("encoding", nodeBufferStringTargetType, { optional: true }),
      targetParameter("start", nodeBufferIntTargetType, { optional: true }),
      targetParameter("end", nodeBufferToStringEndTargetType(), { optional: true }),
    ],
    nodeBufferStringTargetType,
    {
      declaringType: nodeBufferTargetType,
    },
  );
}

function nodeBufferRangeTargetMember(
  targetMemberId: string,
  sourceName: string,
  targetName: string,
): TargetMember {
  return targetMethod(
    targetMemberId,
    sourceName,
    targetName,
    [
      targetParameter("start", nodeBufferNullableIntTargetType(), { optional: true }),
      targetParameter("end", nodeBufferNullableIntTargetType(), { optional: true }),
    ],
    nodeBufferTargetType,
    {
      declaringType: nodeBufferTargetType,
    },
  );
}
