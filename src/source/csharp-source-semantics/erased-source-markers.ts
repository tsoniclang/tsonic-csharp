import {
  fieldFactKey,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  FieldFact,
  ProviderVirtualDeclarationFact,
  TargetMember,
} from "@tsonic/tsts";
import {
  csharpLangModule,
} from "./identity.js";
import {
  tsonicAttributeBuilderFactKey,
  tsonicCoreLangModule,
} from "@tsonic/source-core";
import type {
  TsonicAttributeBuilderFact,
} from "@tsonic/source-core";
export function isErasedSourceSemanticsCall(declaration: ProviderVirtualDeclarationFact | undefined): declaration is ProviderVirtualDeclarationFact {
  if (declaration === undefined) {
    return false;
  }
  if (declaration.moduleSpecifier !== tsonicCoreLangModule && declaration.moduleSpecifier !== csharpLangModule) {
    return false;
  }
  return declaration.exportName === "struct" ||
    declaration.exportName === "defaultof" ||
    declaration.exportName === "out" ||
    declaration.exportName === "ref" ||
    declaration.exportName === "inref" ||
    declaration.exportName === "borrow" ||
    declaration.exportName === "borrowMut" ||
    declaration.exportName === "move";
}

export function isErasedFieldSourceSemanticsCall(declaration: ProviderVirtualDeclarationFact | undefined): declaration is ProviderVirtualDeclarationFact {
  if (declaration === undefined) {
    return false;
  }
  if (declaration.moduleSpecifier !== tsonicCoreLangModule && declaration.moduleSpecifier !== csharpLangModule) {
    return false;
  }
  return declaration.exportName === "field";
}

export function getCheckedAttributeBuilderFact(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): TsonicAttributeBuilderFact | undefined {
  return context.factResolver.resolve(request.call, tsonicAttributeBuilderFactKey) ??
    context.facts.get(request.call, tsonicAttributeBuilderFactKey);
}

export function getCheckedFieldFact(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): FieldFact | undefined {
  return context.factResolver.resolve(request.call, fieldFactKey) ??
    context.facts.get(request.call, fieldFactKey);
}

export function erasedSourceSemanticsMember(
  declaration: ProviderVirtualDeclarationFact | undefined,
): TargetMember | undefined {
  const sourceName = declaration?.memberName ?? declaration?.exportName;
  const id = declaration?.signatureId ?? declaration?.memberId;
  if (sourceName === undefined || id === undefined) {
    return undefined;
  }
  return erasedMarkerMember(id, sourceName);
}

export function erasedAttributeFactMember(): TargetMember {
  return erasedMarkerMember("source-core.attribute-builder", "attribute");
}

export function erasedFieldFactMember(field: FieldFact): TargetMember {
  return erasedMarkerMember(`source-semantics.field:${field.name}`, "field");
}

function erasedMarkerMember(id: string, sourceName: string): TargetMember {
  return {
    id,
    sourceName,
    targetName: "__tsonic_erased_source_marker",
    kind: "method",
    parameters: [],
  };
}
