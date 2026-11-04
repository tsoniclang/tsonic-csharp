import type { Node, Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpProjectTypeDeclaration } from "../../../../target-model/records/types/project-types.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { nextState } from "./state.js";

export interface CsharpProjectDeclarationArgumentCapture {
  readonly declaration: CsharpProjectTypeDeclaration;
  readonly queries: SourceFileSemantics;
  readonly selectedType: Type | undefined;
  readonly sources: readonly (Type | undefined)[];
  readonly outer: readonly { readonly parameter: Node; readonly source: Type | undefined }[];
}

export interface CsharpProjectDeclarationArgumentsSource extends Omit<CsharpProjectDeclarationArgumentCapture, "outer"> {
  readonly capture: CsharpProjectDeclarationArgumentCapture;
  readonly state: CsharpTypeResolutionState;
  readonly outer: readonly (CsharpProjectDeclarationArgumentCapture["outer"][number] & {
    readonly state: CsharpTypeResolutionState;
  })[];
}

export interface CsharpProjectDeclarationArguments {
  readonly source: CsharpProjectDeclarationArgumentsSource;
  readonly arguments: readonly TargetTypeRef[];
  readonly outerArguments: readonly TargetTypeRef[];
  readonly sourceArguments: readonly Type[];
}

export function formCsharpProjectDeclarationArgumentCapture(
  { host }: Pick<CsharpTypeResolutionScope, "host">,
  declaration: CsharpProjectTypeDeclaration,
  sourceArguments: readonly (Type | undefined)[] | undefined,
  selectedType: Type | undefined,
): CsharpProjectDeclarationArgumentCapture {
  const queries = host.semanticsFor(declaration.declaration);
  const bindings = selectedType === undefined ? undefined : queries.types.typeArgumentBindings(selectedType);
  const outer = declaration.outerTypeParameters.map(parameter => Object.freeze({ parameter,
    source: selectedType === undefined ? queries.types.authoredType(parameter)
      : bindings?.find(binding => binding.declaration === parameter && binding.scope === "outer")?.argumentType,
  }));
  const sources = sourceArguments ?? declaration.typeParameters.map(parameter =>
    parameter === undefined ? undefined : queries.types.authoredType(parameter));
  return Object.freeze({ declaration, queries, selectedType,
    outer: Object.freeze(outer), sources: Object.freeze([...sources]),
  });
}

export function bindCsharpProjectDeclarationArguments(
  capture: CsharpProjectDeclarationArgumentCapture,
  state: CsharpTypeResolutionState,
): CsharpProjectDeclarationArgumentsSource {
  return Object.freeze({ ...capture, capture, state,
    outer: Object.freeze(capture.outer.map(outer => Object.freeze({ ...outer, state: Object.freeze(nextState(state)) }))),
  });
}

export function completeCsharpProjectDeclarationArguments(
  scope: CsharpTypeResolutionScope,
  source: CsharpProjectDeclarationArgumentsSource,
  arguments_: readonly TargetTypeRef[],
): CsharpProjectDeclarationArguments | undefined {
  const declaration = source.declaration;
  if (source.capture === undefined || source.capture.declaration !== declaration ||
    source.capture.queries !== source.queries || source.capture.selectedType !== source.selectedType ||
    source.capture.sources !== source.sources || source.outer.length !== source.capture.outer.length ||
    scope.host.projectTypeCatalog.declarationForNode(declaration.declaration) !== declaration ||
    source.queries.sourceFile !== declaration.sourceFile || source.outer.length !== declaration.outerTypeParameters.length ||
    Array.from(source.outer).some((outer, index) => outer === undefined || outer.parameter !== declaration.outerTypeParameters[index] ||
      outer.parameter !== source.capture.outer[index]?.parameter || outer.source !== source.capture.outer[index]?.source ||
      outer.state.depth !== source.state.depth + 1 || outer.state.sourceBindings !== source.state.sourceBindings ||
      outer.state.sourceStorageSubject !== source.state.sourceStorageSubject ||
      outer.state.sourceStorageBindings !== source.state.sourceStorageBindings ||
      outer.state.rejectNativeResolution !== source.state.rejectNativeResolution)) {
    return failTargetAnalysisInvariant("tsonic-csharp", "Declared project arguments require their exact D owner and bound child frame.", declaration.declaration);
  }
  const outerArguments = source.outer.map((outer, index) => source.selectedType === undefined
    ? declaration.authoredTypeParameterBindings[index]
    : outer.source === undefined ? undefined : scope.resolveTypeWithState(outer.source, source.queries.sourceFile, outer.state));
  const outerSources = source.outer.map(outer => outer.source);
  if (!outerArguments.every((argument): argument is TargetTypeRef => argument !== undefined) ||
    !outerSources.every((type): type is Type => type !== undefined)) return undefined;
  const sources = Array.from(source.sources);
  if (!sources.every((type): type is Type => type !== undefined) ||
    arguments_.length !== declaration.sourceTypeParameterCount || Array.from(arguments_).some(argument => argument === undefined)) return undefined;
  return Object.freeze({ source, arguments: Object.freeze([...arguments_]), outerArguments: Object.freeze(outerArguments),
    sourceArguments: Object.freeze([...outerSources, ...sources]),
  });
}
