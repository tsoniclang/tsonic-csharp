using System.Collections.Concurrent;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using System.Text.Json.Serialization;

sealed partial class ReflectionProvider
{
    Type[] SourceClosureTypes(Type[] allTypes, Type[] exportedTypes, ISet<string> sourceExportableTargetIds)
    {
        if (request.Exports.Count == 0 && request.TargetIds.Count == 0 && request.MetadataNames.Count == 0)
        {
            return [];
        }
        var allTypesByTargetId = allTypes.ToDictionary(TargetId, StringComparer.Ordinal);
        var exportedTargetIds = exportedTypes.Select(TargetId).ToHashSet(StringComparer.Ordinal);
        var closureTargetIds = new SortedSet<string>(StringComparer.Ordinal);
        foreach (var exportedType in exportedTypes)
        {
            foreach (var dependency in DirectSourceDependencies(exportedType))
            {
                var normalized = NormalizeClosureType(dependency);
                if (normalized is null ||
                    normalized.Namespace != activeNamespaceName ||
                    exportedTargetIds.Contains(TargetId(normalized)) ||
                    !sourceExportableTargetIds.Contains(TargetId(normalized)) ||
                    !allTypesByTargetId.ContainsKey(TargetId(normalized)))
                {
                    continue;
                }
                closureTargetIds.Add(TargetId(normalized));
            }
        }
        return closureTargetIds
            .Select(targetId => allTypesByTargetId[targetId])
            .Where(type => sourceExportableTargetIds.Contains(TargetId(type)))
            .ToArray();
    }

    object ToShallowTypeExport(Type type)
    {
        var typeParameters = TypeParameters(type);
        var sourceShape = ExportSourceShape(type);
        var attributes = AttributeFacts(type.GetCustomAttributesData(), "type", TargetId(type));
        return new
        {
            kind = "type",
            typeKind = TypeKind(type),
            sourceName = ProviderSourceTypeName(type),
            namespaceName = activeNamespaceName,
            targetId = TargetId(type),
            metadataName = MetadataName(type),
            assembly = AssemblyReference(type.Assembly),
            displayName = DisplayName(type),
            renderShape = RenderShape(type),
            attributes = attributes.Supported.Length == 0 ? null : attributes.Supported,
            unsupportedAttributes = attributes.Unsupported.Length == 0 ? null : attributes.Unsupported,
            typeParameters = typeParameters.Length == 0 ? null : typeParameters,
            sourceShape,
            throwable = typeof(Exception).IsAssignableFrom(type) ? true : (bool?)null,
        };
    }

    IEnumerable<Type> DirectSourceDependencies(Type type)
    {
        if (type.BaseType is not null && type.BaseType != typeof(object))
        {
            yield return type.BaseType;
        }
        foreach (var contract in type.GetInterfaces())
        {
            yield return contract;
        }
        foreach (var constructor in type.GetConstructors(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly))
        {
            foreach (var parameter in constructor.GetParameters())
            {
                yield return parameter.ParameterType;
            }
        }
        foreach (var property in type.GetProperties(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly))
        {
            yield return property.PropertyType;
            foreach (var parameter in property.GetIndexParameters())
            {
                yield return parameter.ParameterType;
            }
        }
        foreach (var field in type.GetFields(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly))
        {
            yield return field.FieldType;
        }
        foreach (var eventInfo in type.GetEvents(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly))
        {
            if (eventInfo.EventHandlerType is not null)
            {
                yield return eventInfo.EventHandlerType;
            }
        }
        foreach (var method in type.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly))
        {
            yield return method.ReturnType;
            foreach (var parameter in method.GetParameters())
            {
                yield return parameter.ParameterType;
            }
            foreach (var methodParameter in method.GetGenericArguments())
            {
                foreach (var constraint in methodParameter.GetGenericParameterConstraints())
                {
                    yield return constraint;
                }
            }
        }
        foreach (var typeParameter in type.GetGenericArguments().Where(parameter => parameter.IsGenericParameter))
        {
            foreach (var constraint in typeParameter.GetGenericParameterConstraints())
            {
                yield return constraint;
            }
        }
    }

    static Type? NormalizeClosureType(Type type)
    {
        type = UnwrapByRef(type);
        if (type.IsPointer || type.IsGenericParameter || type == typeof(void))
        {
            return null;
        }
        if (type.IsArray)
        {
            return NormalizeClosureType(type.GetElementType()!);
        }
        if (IsNullableShape(type, out var nullableElement))
        {
            return NormalizeClosureType(nullableElement);
        }
        return type.IsGenericType && !type.IsGenericTypeDefinition
            ? type.GetGenericTypeDefinition()
            : type;
    }
}
