import type {
  TargetMember,
} from "@tsonic/tsts";
import {
  targetMethod,
  targetParameter,
} from "../../js/source-library.js";
import {
  nodeBufferAllocExportName,
  nodeBufferAllocTargetMemberId,
  nodeBufferAllocUnsafeExportName,
  nodeBufferAllocUnsafeSlowExportName,
  nodeBufferAllocUnsafeSlowTargetMemberId,
  nodeBufferAllocUnsafeTargetMemberId,
  nodeBufferAtobExportName,
  nodeBufferAtobTargetMemberId,
  nodeBufferBtoaExportName,
  nodeBufferBtoaTargetMemberId,
  nodeBufferByteLengthExportName,
  nodeBufferByteLengthTargetMemberId,
  nodeBufferCompareExportName,
  nodeBufferCompareTargetMemberId,
  nodeBufferConcatExportName,
  nodeBufferConcatTargetMemberId,
  nodeBufferFromExportName,
  nodeBufferFromStringTargetMemberId,
  nodeBufferIsAsciiExportName,
  nodeBufferIsAsciiTargetMemberId,
  nodeBufferIsEncodingExportName,
  nodeBufferIsEncodingTargetMemberId,
  nodeBufferIsUtf8ExportName,
  nodeBufferIsUtf8TargetMemberId,
  nodeBufferModuleTargetType,
  nodeBufferOfExportName,
  nodeBufferOfTargetMemberId,
  nodeBufferTargetType,
} from "./identities.js";
import {
  nodeBufferBoolTargetType,
  nodeBufferIntTargetType,
  nodeBufferNullableIntTargetType,
  nodeBufferStringTargetType,
} from "./helpers.js";

export function getNodeBufferFromStringTargetMember(): TargetMember {
  return targetMethod(
    nodeBufferFromStringTargetMemberId,
    nodeBufferFromExportName,
    nodeBufferFromExportName,
    [
      targetParameter("value", nodeBufferStringTargetType),
      targetParameter("encoding", nodeBufferStringTargetType, { optional: true }),
    ],
    nodeBufferTargetType,
    {
      declaringType: nodeBufferTargetType,
      static: true,
    },
  );
}

export function getNodeBufferAllocTargetMember(): TargetMember {
  return targetMethod(
    nodeBufferAllocTargetMemberId,
    nodeBufferAllocExportName,
    nodeBufferAllocExportName,
    [targetParameter("size", nodeBufferIntTargetType)],
    nodeBufferTargetType,
    {
      declaringType: nodeBufferTargetType,
      static: true,
    },
  );
}

export function getNodeBufferAllocUnsafeTargetMember(): TargetMember {
  return targetMethod(
    nodeBufferAllocUnsafeTargetMemberId,
    nodeBufferAllocUnsafeExportName,
    nodeBufferAllocUnsafeExportName,
    [targetParameter("size", nodeBufferIntTargetType)],
    nodeBufferTargetType,
    {
      declaringType: nodeBufferTargetType,
      static: true,
    },
  );
}

export function getNodeBufferAllocUnsafeSlowTargetMember(): TargetMember {
  return targetMethod(
    nodeBufferAllocUnsafeSlowTargetMemberId,
    nodeBufferAllocUnsafeSlowExportName,
    nodeBufferAllocUnsafeSlowExportName,
    [targetParameter("size", nodeBufferIntTargetType)],
    nodeBufferTargetType,
    {
      declaringType: nodeBufferTargetType,
      static: true,
    },
  );
}

export function getNodeBufferByteLengthTargetMember(): TargetMember {
  return targetMethod(
    nodeBufferByteLengthTargetMemberId,
    nodeBufferByteLengthExportName,
    nodeBufferByteLengthExportName,
    [
      targetParameter("value", nodeBufferStringTargetType),
      targetParameter("encoding", nodeBufferStringTargetType, { optional: true }),
    ],
    nodeBufferIntTargetType,
    {
      declaringType: nodeBufferTargetType,
      static: true,
    },
  );
}

export function getNodeBufferCompareTargetMember(): TargetMember {
  return targetMethod(
    nodeBufferCompareTargetMemberId,
    nodeBufferCompareExportName,
    nodeBufferCompareExportName,
    [
      targetParameter("buf1", nodeBufferTargetType),
      targetParameter("buf2", nodeBufferTargetType),
    ],
    nodeBufferIntTargetType,
    {
      declaringType: nodeBufferTargetType,
      static: true,
    },
  );
}

export function getNodeBufferConcatTargetMember(): TargetMember {
  return targetMethod(
    nodeBufferConcatTargetMemberId,
    nodeBufferConcatExportName,
    nodeBufferConcatExportName,
    [
      targetParameter("list", { kind: "array", element: nodeBufferTargetType }),
      targetParameter("totalLength", nodeBufferNullableIntTargetType(), { optional: true }),
    ],
    nodeBufferTargetType,
    {
      declaringType: nodeBufferTargetType,
      static: true,
    },
  );
}

export function getNodeBufferIsEncodingTargetMember(): TargetMember {
  return targetMethod(
    nodeBufferIsEncodingTargetMemberId,
    nodeBufferIsEncodingExportName,
    nodeBufferIsEncodingExportName,
    [targetParameter("encoding", nodeBufferStringTargetType)],
    nodeBufferBoolTargetType,
    {
      declaringType: nodeBufferTargetType,
      static: true,
    },
  );
}

export function getNodeBufferOfTargetMember(): TargetMember {
  return targetMethod(
    nodeBufferOfTargetMemberId,
    nodeBufferOfExportName,
    nodeBufferOfExportName,
    [targetParameter("items", nodeBufferIntTargetType, { paramsArray: true })],
    nodeBufferTargetType,
    {
      declaringType: nodeBufferTargetType,
      static: true,
    },
  );
}

export function getNodeBufferAtobTargetMember(): TargetMember {
  return targetMethod(
    nodeBufferAtobTargetMemberId,
    nodeBufferAtobExportName,
    nodeBufferAtobExportName,
    [targetParameter("data", nodeBufferStringTargetType)],
    nodeBufferStringTargetType,
    {
      declaringType: nodeBufferModuleTargetType,
      static: true,
    },
  );
}

export function getNodeBufferBtoaTargetMember(): TargetMember {
  return targetMethod(
    nodeBufferBtoaTargetMemberId,
    nodeBufferBtoaExportName,
    nodeBufferBtoaExportName,
    [targetParameter("data", nodeBufferStringTargetType)],
    nodeBufferStringTargetType,
    {
      declaringType: nodeBufferModuleTargetType,
      static: true,
    },
  );
}

export function getNodeBufferIsAsciiTargetMember(): TargetMember {
  return targetMethod(
    nodeBufferIsAsciiTargetMemberId,
    nodeBufferIsAsciiExportName,
    nodeBufferIsAsciiExportName,
    [targetParameter("value", nodeBufferTargetType)],
    nodeBufferBoolTargetType,
    {
      declaringType: nodeBufferModuleTargetType,
      static: true,
    },
  );
}

export function getNodeBufferIsUtf8TargetMember(): TargetMember {
  return targetMethod(
    nodeBufferIsUtf8TargetMemberId,
    nodeBufferIsUtf8ExportName,
    nodeBufferIsUtf8ExportName,
    [targetParameter("value", nodeBufferTargetType)],
    nodeBufferBoolTargetType,
    {
      declaringType: nodeBufferModuleTargetType,
      static: true,
    },
  );
}
