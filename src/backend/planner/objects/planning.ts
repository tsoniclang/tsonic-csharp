import type {
  CsharpPlanningContext,
} from "../context.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpClassDeclaration,
  CsharpCompilationUnit,
  CsharpTypeDeclaration,
  CsharpTypeNode,
} from "../../roslyn/syntax.js";
import type {
  CsharpOutputSourceFile,
} from "../../artifacts/model.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";
import type {
  CsharpObjectShapeFact,
} from "../../../policy/types/index.js";
import {
  isCsharpJsValueObjectShapeTargetType,
} from "../../../policy/types/index.js";
import {
  objectShapeDeclarationMatches,
  renderObjectShapeInterfaces,
  renderObjectShapeMembers,
  renderObjectShapeTypeParameters,
} from "./declarations.js";
import {
  csharpJsonValueInterfaceType,
  renderJsonSerializableObjectShapeMethod,
} from "./json-object-shapes.js";
import {
  renderObjectShapeProjectionMethods,
} from "./closed-object-shapes.js";
import {
  finalizeCsharpCompilationUnit,
} from "../program/compilation-unit.js";
import {
  readNamespace,
} from "../project/project-artifacts.js";
import {
  readCsharpLanguageDialect,
} from "../../../options/csharp-target-options.js";

export {
  objectShapeAccessorGetterStorageMemberName,
  objectShapeAccessorSetterStorageMemberName,
  objectShapeMethodStorageTargetType,
  objectShapeStorageMemberName,
} from "./object-shape-storage.js";

export function registerSourceObjectShape(
  input: CsharpPlanningContext,
  fact: CsharpObjectShapeFact,
  diagnostics: TargetDiagnostic[],
  diagnosticSubject: Parameters<typeof unsupportedNodeDiagnostic>[0],
): boolean {
  const result = input.artifacts.registerObjectShape(fact, "source");
  if (result.kind === "accepted") {
    return true;
  }
  diagnostics.push(unsupportedNodeDiagnostic(
    diagnosticSubject,
    result.reason,
  ));
  return false;
}

export function csharpTypeFromObjectShapeFact(
  input: CsharpPlanningContext,
  fact: CsharpObjectShapeFact,
  diagnostics?: TargetDiagnostic[],
  diagnosticSubject?: Parameters<typeof unsupportedNodeDiagnostic>[0],
): CsharpTypeNode | undefined {
  const targetType = csharpTypeFromTargetTypeRef(fact.targetType);
  if (targetType === undefined) {
    reportObjectShapeFailure(
      diagnostics,
      diagnosticSubject,
      "Object-shape fact must carry a renderable named target carrier type before C# emission.",
    );
    return undefined;
  }
  if (isCsharpJsValueObjectShapeTargetType(fact.targetType)) {
    return targetType;
  }
  if (targetType.kind !== "IdentifierName") {
    reportObjectShapeFailure(
      diagnostics,
      diagnosticSubject,
      "Generated object-shape declarations require one exact unqualified compiler-owned target type name.",
    );
    return undefined;
  }
  if (fact.constructible === true || isSourceDeclaredNominalShape(fact)) {
    const result = input.artifacts.registerObjectShape(fact, "source");
    if (result.kind === "rejected") {
      reportObjectShapeFailure(
        diagnostics,
        diagnosticSubject,
        result.reason,
      );
      return undefined;
    }
    return targetType;
  }
  const result = input.artifacts.registerObjectShape(fact, "synthetic");
  if (result.kind === "rejected") {
    reportObjectShapeFailure(
      diagnostics,
      diagnosticSubject,
      result.reason,
    );
    return undefined;
  }
  return targetType;
}

export function csharpConstructibleTypeFromObjectShapeFact(
  input: CsharpPlanningContext,
  fact: CsharpObjectShapeFact,
  diagnostics?: TargetDiagnostic[],
  diagnosticSubject?: Parameters<typeof unsupportedNodeDiagnostic>[0],
): CsharpTypeNode | undefined {
  if (fact.constructible === false) {
    reportObjectShapeFailure(
      diagnostics,
      diagnosticSubject,
      "Class object literal emission requires an exact constructible source class with a parameterless constructor.",
    );
    return undefined;
  }
  return csharpTypeFromObjectShapeFact(
    input,
    fact,
    diagnostics,
    diagnosticSubject,
  );
}

export function materializeObjectShapeDeclarations(
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): readonly CsharpTypeDeclaration[] {
  const declarations = new Map<string, CsharpClassDeclaration>();
  for (const artifact of input.artifacts.objectShapeArtifacts()) {
    if (artifact.materialization !== "synthetic") {
      continue;
    }
    const declaration = renderObjectShapeDeclaration(
      input,
      artifact.fact,
      artifact.capabilities,
      artifact.projections,
      artifact.receiverBoundMethodKeys,
      diagnostics,
    );
    if (declaration === undefined) {
      continue;
    }
    const existing = declarations.get(declaration.name);
    if (
      existing !== undefined &&
      !objectShapeDeclarationMatches(
        existing,
        artifact.fact,
        artifact.capabilities.includes("json-serialization"),
        artifact.projections,
        new Set(artifact.receiverBoundMethodKeys),
      )
    ) {
      diagnostics.push({
        code: "CSHARP_OBJECT_SHAPE_ARTIFACT_CONFLICT",
        category: "error",
        source: "tsonic-csharp",
        message: `Generated object-shape name '${declaration.name}' is owned by incompatible target artifacts.`,
      });
      continue;
    }
    declarations.set(declaration.name, declaration);
  }
  return [...declarations.values()].sort((left, right) =>
    left.name.localeCompare(right.name)
  );
}

export function planCsharpObjectShapeSourceFile(
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): {
  readonly source: CsharpOutputSourceFile;
  readonly requiresUnsafe: boolean;
} | undefined {
  const declarations = materializeObjectShapeDeclarations(input, diagnostics);
  if (declarations.length === 0) {
    return undefined;
  }
  const unit: CsharpCompilationUnit = {
    kind: "CompilationUnit",
    usings: [{ kind: "UsingDirective", namespace: "System" }],
    members: [{
      kind: "NamespaceDeclaration",
      name: readNamespace(input),
      members: declarations,
    }],
  };
  const finalized = finalizeCsharpCompilationUnit(
    unit,
    readCsharpLanguageDialect(input.target),
  );
  return {
    source: {
      path: "generated/TsonicObjectShapes.cs",
      unit: finalized.unit,
    },
    requiresUnsafe: finalized.requiresUnsafe,
  };
}

function renderObjectShapeDeclaration(
  input: CsharpPlanningContext,
  fact: CsharpObjectShapeFact,
  capabilities: readonly import("../../../policy/types/index.js").CsharpObjectShapeCapability[],
  projections: readonly import("../../../policy/types/index.js").CsharpObjectShapeProjection[],
  receiverBoundMethodKeys: readonly string[],
  diagnostics: TargetDiagnostic[],
): CsharpClassDeclaration | undefined {
  const jsonSerializable = capabilities.includes("json-serialization");
  const targetType = csharpTypeFromTargetTypeRef(fact.targetType);
  if (targetType === undefined || targetType.kind !== "IdentifierName") {
    diagnostics.push({
      code: "CSHARP_OBJECT_SHAPE_TARGET_TYPE_INVALID",
      category: "error",
      source: "tsonic-csharp",
      message: "Generated object-shape artifact has no renderable named C# target type.",
    });
    return undefined;
  }
  const interfaces = renderObjectShapeInterfaces(fact, undefined, undefined);
  const typeParameters = renderObjectShapeTypeParameters(
    fact,
    undefined,
    undefined,
  );
  const members = renderObjectShapeMembers(
    fact,
    (interfaces?.length ?? 0) > 0,
    new Set(receiverBoundMethodKeys),
    undefined,
    undefined,
  );
  if (
    interfaces === undefined ||
    typeParameters === undefined ||
    members === undefined
  ) {
    diagnostics.push({
      code: "CSHARP_OBJECT_SHAPE_RENDERING_REJECTED",
      category: "error",
      source: "tsonic-csharp",
      message: `Generated object-shape artifact '${targetType.name}' contains a target type or member that cannot be rendered exactly.`,
    });
    return undefined;
  }
  return {
    kind: "ClassDeclaration",
    name: targetType.name,
    modifiers: ["public"],
    ...(typeParameters.length === 0 ? {} : { typeParameters }),
    ...(interfaces.length === 0 && !jsonSerializable
      ? {}
      : {
          interfaces: [
            ...interfaces,
            ...(jsonSerializable ? [csharpJsonValueInterfaceType()] : []),
          ],
        }),
    members: [
      ...members,
      ...(jsonSerializable ? [renderJsonSerializableObjectShapeMethod(fact)] : []),
      ...renderObjectShapeProjectionMethods(
        input,
        fact,
        projections,
        diagnostics,
      ),
    ],
  };
}

function reportObjectShapeFailure(
  diagnostics: TargetDiagnostic[] | undefined,
  diagnosticSubject: Parameters<typeof unsupportedNodeDiagnostic>[0] | undefined,
  message: string,
): void {
  if (diagnostics !== undefined && diagnosticSubject !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(diagnosticSubject, message));
  }
}

function isSourceDeclaredNominalShape(fact: CsharpObjectShapeFact): boolean {
  return fact.targetType.kind === "target-named" &&
    (fact.targetType as {
      readonly csharpSourceDeclarationKind?: unknown;
    }).csharpSourceDeclarationKind !== undefined;
}
