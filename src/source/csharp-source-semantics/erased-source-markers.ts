import {
  attributeFactKey,
  providerVirtualDeclarationFactKey,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  ProviderVirtualDeclarationFact,
  TargetMember,
} from "@tsonic/tsts";
import {
  csharpLangModule,
  neutralLangModule,
} from "./identity.js";

export function isErasedSourceSemanticsCall(declaration: ProviderVirtualDeclarationFact | undefined): declaration is ProviderVirtualDeclarationFact {
  if (declaration === undefined) {
    return false;
  }
  if (declaration.moduleSpecifier !== neutralLangModule && declaration.moduleSpecifier !== csharpLangModule) {
    return false;
  }
  return declaration.exportName === "attribute" ||
    declaration.exportName === "field" ||
    declaration.exportName === "struct" ||
    declaration.exportName === "defaultof" ||
    declaration.exportName === "out" ||
    declaration.exportName === "ref" ||
    declaration.exportName === "inref" ||
    declaration.exportName === "borrow" ||
    declaration.exportName === "borrowMut" ||
    declaration.exportName === "move" ||
    declaration.exportName === "__TsonicAttributeBuilder" ||
    declaration.exportName === "__TsonicAttributeMemberBuilder";
}

export function isCheckedAttributeBuilderCall(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): boolean {
  return context.facts.get(request.call, attributeFactKey) !== undefined ||
    context.facts.get(request.calleeReceiver, attributeFactKey) !== undefined ||
    context.facts.get(request.sourceSelectedDeclaration, providerVirtualDeclarationFactKey)?.exportName === "__TsonicAttributeBuilder";
}

export function erasedSourceSemanticsMember(
  declaration: ProviderVirtualDeclarationFact | undefined,
  request: CheckedCallMappingRequest,
): TargetMember {
  const sourceName = declaration?.memberName ?? declaration?.exportName ?? request.calleePropertyName ?? "sourceMarker";
  return {
    id: declaration?.signatureId ?? `${declaration?.providerModuleId ?? "source-semantics"}.${sourceName}`,
    sourceName,
    targetName: "__tsonic_erased_source_marker",
    kind: "method",
    parameters: [],
  };
}
