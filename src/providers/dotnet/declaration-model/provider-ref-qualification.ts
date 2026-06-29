import type {
  DotnetModuleModel,
} from "../model.js";
import {
  dotnetModuleSpecifierForMetadataName,
} from "../module-lookup.js";

export class DotnetProviderRefQualificationError extends Error {
  readonly evidence: Readonly<Record<string, unknown>>;

  constructor(message: string, evidence: Readonly<Record<string, unknown>>) {
    super(message);
    this.name = "DotnetProviderRefQualificationError";
    this.evidence = evidence;
  }
}

interface QualificationState {
  readonly moduleSpecifier: string;
  readonly exportNames: ReadonlySet<string>;
  readonly inferredModuleSpecifier?: string;
}

export function qualifyDotnetModuleProviderRefs(module: DotnetModuleModel): DotnetModuleModel {
  const state: QualificationState = {
    moduleSpecifier: module.moduleSpecifier,
    exportNames: new Set(module.exports.map((declaration) => declaration.sourceName)),
  };
  return qualifyValue(module, state, "$") as DotnetModuleModel;
}

function qualifyValue(value: unknown, state: QualificationState, path: string): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => qualifyValue(item, state, `${path}[${index}]`));
  }
  const record = value as Readonly<Record<string, unknown>>;
  if (record.kind === "provider-ref") {
    return qualifyProviderRef(record, state, path);
  }
  const nestedState = namedTypeState(record, state);
  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(record)) {
    result[key] = qualifyValue(nested, nestedState, `${path}.${key}`);
  }
  return result;
}

function namedTypeState(
  record: Readonly<Record<string, unknown>>,
  state: QualificationState,
): QualificationState {
  if (record.kind !== "named" || typeof record.metadataName !== "string") {
    return state;
  }
  const inferredModuleSpecifier = dotnetModuleSpecifierForMetadataName(record.metadataName);
  return inferredModuleSpecifier === undefined
    ? state
    : { ...state, inferredModuleSpecifier };
}

function qualifyProviderRef(
  record: Readonly<Record<string, unknown>>,
  state: QualificationState,
  path: string,
): Readonly<Record<string, unknown>> {
  const exportName = providerRefString(record.exportName) ?? providerRefString(record.name);
  if (exportName === undefined) {
    throw new DotnetProviderRefQualificationError(
      "Invalid .NET provider-ref: missing exportName.",
      {
        path,
        moduleSpecifier: state.moduleSpecifier,
        providerRef: record,
      },
    );
  }
  const moduleSpecifier = providerRefString(record.moduleSpecifier)
    ?? state.inferredModuleSpecifier
    ?? (state.exportNames.has(exportName) ? state.moduleSpecifier : undefined);
  if (moduleSpecifier === undefined) {
    throw new DotnetProviderRefQualificationError(
      `Invalid .NET provider-ref '${exportName}': missing moduleSpecifier.`,
      {
        path,
        exportName,
        moduleSpecifier: state.moduleSpecifier,
        providerRef: record,
      },
    );
  }
  const typeArguments = Array.isArray(record.typeArguments)
    ? record.typeArguments.map((argument, index) => qualifyValue(argument, state, `${path}.typeArguments[${index}]`))
    : undefined;
  return {
    kind: "provider-ref",
    moduleSpecifier,
    exportName,
    ...(typeArguments === undefined ? {} : { typeArguments }),
  };
}

function providerRefString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
