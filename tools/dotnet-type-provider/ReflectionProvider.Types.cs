using System.Collections.Concurrent;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using System.Text.Json.Serialization;

sealed partial class ReflectionProvider
{
    object? ToTypeExport(Type type)
    {
        var typeParameters = TypeParameters(type);
        var members = Members(type).ToArray();
        var conversionOperators = ConversionOperators(type).ToArray();
        var unsupportedMembers = UnsupportedMembers(type);
        var baseType = BaseType(type);
        var implementedContracts = ImplementedContracts(type);
        var sourceShape = ExportSourceShape(type);
        var attributes = AttributeFacts(type.GetCustomAttributesData(), "type", TargetId(type));
        if (IsDelegate(type) && sourceShape is null)
        {
            return null;
        }
        return new
        {
            kind = "type",
            typeKind = TypeKind(type),
            sourceName = SourceTypeName(type),
            namespaceName = activeNamespaceName,
            targetId = TargetId(type),
            metadataName = MetadataName(type),
            displayName = DisplayName(type),
            renderShape = RenderShape(type),
            attributes = attributes.Supported.Length == 0 ? null : attributes.Supported,
            unsupportedAttributes = attributes.Unsupported.Length == 0 ? null : attributes.Unsupported,
            typeParameters = typeParameters.Length == 0 ? null : typeParameters,
            baseType,
            implementedContracts = implementedContracts.Length == 0 ? null : implementedContracts,
            sourceShape,
            throwable = typeof(Exception).IsAssignableFrom(type) ? true : (bool?)null,
            members = members.Length == 0 ? null : members,
            conversionOperators = conversionOperators.Length == 0 ? null : conversionOperators,
            unsupportedMembers = unsupportedMembers.Length == 0 ? null : unsupportedMembers,
        };
    }

    object? BaseType(Type type)
    {
        if (!type.IsClass || IsDelegate(type) || type.BaseType is null || type.BaseType == typeof(object))
        {
            return null;
        }
        return TypeRef(type.BaseType);
    }

    static object ToUnsupportedTypeFamilyExport(IGrouping<string, Type> group)
    {
        return new
        {
            kind = "unsupported-type-family",
            sourceName = group.Key,
            reason = "Multiple CLR metadata types share this source name. This requires a provider type-family declaration model before it can be exposed safely.",
            targetIds = group.Select(TargetId).OrderBy(name => name, StringComparer.Ordinal).ToArray(),
            metadataNames = group.Select(MetadataName).OrderBy(name => name, StringComparer.Ordinal).ToArray(),
            assemblies = group.Select(type => AssemblyReference(type.Assembly)).ToArray(),
        };
    }

    static object ToUnsupportedNestedTypeExport(Type type)
    {
        return new
        {
            kind = "unsupported-nested-type",
            sourceName = SourceTypeName(type),
            reason = "Nested CLR types require a provider nested-type declaration model before they can be exposed safely as source declarations.",
            targetId = TargetId(type),
            metadataName = MetadataName(type),
            assembly = AssemblyReference(type.Assembly),
            declaringMetadataName = type.DeclaringType is null ? null : MetadataName(type.DeclaringType),
        };
    }
}
