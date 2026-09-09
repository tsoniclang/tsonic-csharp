import type {
  ProviderExportDeclaration,
  ProviderImportDeclaration,
  ProviderRequestedExport,
  ProviderTypeExpression,
} from "@tsonic/tsts";

interface ModuleImportRequests {
  readonly named: Map<string, ProviderRequestedExport>;
  readonly defaults: Map<string, "type" | "value">;
  readonly namespaces: Map<string, "type" | "value">;
}

export function providerImportsForExports(
  moduleSpecifier: string,
  exports: readonly ProviderExportDeclaration[],
): readonly ProviderImportDeclaration[] {
  const importsByModule = new Map<string, ModuleImportRequests>();
  const addImport = (
    type: ProviderTypeExpression,
    kind: "type" | "value",
  ): void => {
    if (type.kind !== "provider-ref") {
      return;
    }
    if (type.moduleSpecifier === moduleSpecifier) {
      return;
    }
    const moduleImports = importsByModule.get(type.moduleSpecifier) ?? {
      named: new Map<string, ProviderRequestedExport>(),
      defaults: new Map<string, "type" | "value">(),
      namespaces: new Map<string, "type" | "value">(),
    };
    if (type.namespaceImport !== undefined) {
      addImportBinding(moduleImports.namespaces, type.namespaceImport, kind);
    } else if (type.exportName === "default") {
      if (type.localName !== undefined) {
        addImportBinding(moduleImports.defaults, type.localName, kind);
      }
    } else {
      const key = `${type.exportName}\u0000${type.localName ?? ""}`;
      const existing = moduleImports.named.get(key);
      const request = {
        exportedName: type.exportName,
        ...(type.localName !== undefined ? { localName: type.localName } : {}),
        kind: existing?.kind === "value" || kind === "value" ? "value" : "type",
      } satisfies ProviderRequestedExport;
      moduleImports.named.set(key, request);
    }
    importsByModule.set(type.moduleSpecifier, moduleImports);
  };
  for (const declaration of exports) {
    visitProviderExportTypes(declaration, (type) => addImport(type, "type"));
    if (declaration.kind === "class") {
      for (const heritage of declaration.heritage ?? []) {
        if (heritage.kind === "extends") {
          addImport(heritage.type, "value");
        }
      }
    }
  }
  return [...importsByModule.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([importModuleSpecifier, requests]) => {
      const imports: ProviderImportDeclaration[] = [];
      for (const [defaultImport, kind] of [...requests.defaults].sort(([left], [right]) => left.localeCompare(right))) {
        imports.push({ moduleSpecifier: importModuleSpecifier, defaultImport, typeOnly: kind === "type" });
      }
      const namedImports = [...requests.named.values()].sort((left, right) =>
        left.exportedName === right.exportedName
          ? (left.localName ?? "").localeCompare(right.localName ?? "")
          : left.exportedName.localeCompare(right.exportedName)
      );
      if (namedImports.length > 0) {
        imports.push({
          moduleSpecifier: importModuleSpecifier,
          namedImports,
          typeOnly: namedImports.every((requested) => requested.kind === "type"),
        });
      }
      for (const [namespaceImport, kind] of [...requests.namespaces].sort(([left], [right]) => left.localeCompare(right))) {
        imports.push({ moduleSpecifier: importModuleSpecifier, namespaceImport, typeOnly: kind === "type" });
      }
      return imports;
    });
}

function addImportBinding(
  bindings: Map<string, "type" | "value">,
  name: string,
  kind: "type" | "value",
): void {
  bindings.set(name, bindings.get(name) === "value" || kind === "value" ? "value" : "type");
}

function visitProviderExportTypes(
  declaration: ProviderExportDeclaration,
  visit: (type: ProviderTypeExpression) => void,
): void {
  visitOptionalProviderType(declaration.type, visit);
  visitProviderTypeParameters(declaration.typeParameters, visit);
  for (const heritage of declaration.heritage ?? []) {
    visitProviderType(heritage.type, visit);
  }
  for (const signature of declaration.signatures ?? []) {
    visitProviderTypeParameters(signature.typeParameters, visit);
    for (const parameter of signature.parameters) {
      visitProviderType(parameter.type, visit);
      visitOptionalProviderType(parameter.defaultType, visit);
    }
    visitOptionalProviderType(signature.returnType, visit);
  }
  for (const member of declaration.members ?? []) {
    visitOptionalProviderType(member.type, visit);
    for (const signature of member.signatures ?? []) {
      visitProviderTypeParameters(signature.typeParameters, visit);
      for (const parameter of signature.parameters) {
        visitProviderType(parameter.type, visit);
        visitOptionalProviderType(parameter.defaultType, visit);
      }
      visitOptionalProviderType(signature.returnType, visit);
    }
  }
}

function visitProviderTypeParameters(
  typeParameters: readonly { readonly constraints?: readonly ProviderTypeExpression[]; readonly defaultType?: ProviderTypeExpression }[] | undefined,
  visit: (type: ProviderTypeExpression) => void,
): void {
  for (const typeParameter of typeParameters ?? []) {
    for (const constraint of typeParameter.constraints ?? []) {
      visitProviderType(constraint, visit);
    }
    visitOptionalProviderType(typeParameter.defaultType, visit);
  }
}

function visitOptionalProviderType(
  type: ProviderTypeExpression | undefined,
  visit: (type: ProviderTypeExpression) => void,
): void {
  if (type !== undefined) {
    visitProviderType(type, visit);
  }
}

function visitProviderType(
  type: ProviderTypeExpression,
  visit: (type: ProviderTypeExpression) => void,
): void {
  visit(type);
  switch (type.kind) {
    case "array":
      visitProviderType(type.elementType, visit);
      return;
    case "tuple":
      for (const elementType of type.elementTypes) {
        visitProviderType(elementType, visit);
      }
      return;
    case "union":
    case "intersection":
      for (const child of type.types) {
        visitProviderType(child, visit);
      }
      return;
    case "function":
      visitProviderTypeParameters(type.typeParameters, visit);
      for (const parameter of type.parameters) {
        visitProviderType(parameter.type, visit);
        visitOptionalProviderType(parameter.defaultType, visit);
      }
      visitProviderType(type.returnType, visit);
      return;
    case "provider-ref":
      for (const typeArgument of type.typeArguments ?? []) {
        visitProviderType(typeArgument, visit);
      }
      return;
    case "source-global":
      for (const typeArgument of type.typeArguments ?? []) {
        visitProviderType(typeArgument, visit);
      }
      return;
    case "any":
    case "unknown":
    case "void":
    case "never":
    case "undefined":
    case "boolean":
    case "string":
    case "number":
    case "bigint":
    case "object":
    case "literal":
    case "source-primitive":
    case "type-parameter":
      return;
  }
}
