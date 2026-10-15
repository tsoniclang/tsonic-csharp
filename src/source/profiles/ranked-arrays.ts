export interface CsharpRankedArrayDescriptor {
  readonly rank: number;
  readonly exportName: string;
  readonly markerMemberId: string;
  readonly getMemberId: string;
  readonly getSignatureId: string;
  readonly setMemberId: string;
  readonly setSignatureId: string;
  readonly indexParameterNames: readonly string[];
}

export const csharpRankedArrayDescriptors: readonly CsharpRankedArrayDescriptor[] =
  Object.freeze(Array.from({ length: 31 }, (_, index) => {
    const rank = index + 2;
    const exportName = `array${rank}`;
    return Object.freeze({
      rank,
      exportName,
      markerMemberId: `${exportName}.__tsonicRankedArray`,
      getMemberId: `${exportName}.get`,
      getSignatureId: `${exportName}.get(${Array.from({ length: rank }, () => "int32").join(",")})`,
      setMemberId: `${exportName}.set`,
      setSignatureId: `${exportName}.set(${[
        ...Array.from({ length: rank }, () => "int32"),
        "T",
      ].join(",")})`,
      indexParameterNames: Object.freeze(
        Array.from({ length: rank }, (_, parameterIndex) => `index${parameterIndex}`),
      ),
    });
  }));
