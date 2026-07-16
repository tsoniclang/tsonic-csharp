using System.Reflection;

sealed partial class ReflectionProvider
{
    static readonly SourceTypeArgumentProjection[] SourceTypeArgumentProjections =
    [
        new("System.Linq.Expressions", "System.Linq.Expressions.Expression`1", 1, 0),
    ];

    object? ProviderSourceProjectionShape(
        Type type,
        GenericParameterContext genericParameters,
        NullabilityInfo? typeNullability,
        NullableMetadata? typeNullabilityMetadata,
        GenericNullabilityContext genericNullability)
    {
        var definition = type.IsGenericType ? type.GetGenericTypeDefinition() : type;
        var assemblyName = definition.Assembly.GetName().Name;
        var metadataName = MetadataName(definition);
        var projection = SourceTypeArgumentProjections.SingleOrDefault(candidate =>
            StringComparer.Ordinal.Equals(candidate.AssemblyName, assemblyName) &&
            StringComparer.Ordinal.Equals(candidate.MetadataName, metadataName));
        if (projection is null)
        {
            return null;
        }
        var arguments = type.GetGenericArguments();
        if (arguments.Length != projection.TypeArgumentCount)
        {
            throw new InvalidOperationException($"Provider source projection '{projection.AssemblyName}::{projection.MetadataName}' expected {projection.TypeArgumentCount} type arguments, but reflected {arguments.Length}.");
        }
        return SourceShape(
            arguments[projection.SourceTypeArgumentIndex],
            genericParameters,
            GenericArgumentNullability(typeNullability, projection.SourceTypeArgumentIndex),
            GenericArgumentNullabilityMetadata(typeNullabilityMetadata, projection.SourceTypeArgumentIndex),
            genericNullability);
    }

    sealed record SourceTypeArgumentProjection(
        string AssemblyName,
        string MetadataName,
        int TypeArgumentCount,
        int SourceTypeArgumentIndex);
}
