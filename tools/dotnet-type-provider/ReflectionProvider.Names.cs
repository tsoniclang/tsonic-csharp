using System.Collections.Concurrent;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using System.Text.Json.Serialization;

sealed partial class ReflectionProvider
{
    static string TypeKind(Type type)
    {
        if (type.IsEnum)
        {
            return "enum";
        }
        if (IsDelegate(type))
        {
            return "delegate";
        }
        if (type.IsInterface)
        {
            return "interface";
        }
        if (type.IsValueType)
        {
            return "struct";
        }
        return "class";
    }

    static string? SourcePrimitiveName(Type type)
    {
        if (type == typeof(bool)) return "bool";
        if (type == typeof(char)) return "char";
        if (type == typeof(sbyte)) return "int8";
        if (type == typeof(byte)) return "uint8";
        if (type == typeof(short)) return "int16";
        if (type == typeof(ushort)) return "uint16";
        if (type == typeof(int)) return "int32";
        if (type == typeof(uint)) return "uint32";
        if (type == typeof(long)) return "int64";
        if (type == typeof(ulong)) return "uint64";
        if (type == typeof(IntPtr)) return "native-int";
        if (type == typeof(UIntPtr)) return "native-uint";
        if (type == typeof(Half)) return "float16";
        if (type == typeof(float)) return "float32";
        if (type == typeof(double)) return "float64";
        if (type == typeof(decimal)) return "decimal";
        if (type.FullName == "System.Int128") return "int128";
        if (type.FullName == "System.UInt128") return "uint128";
        return null;
    }

    static bool IsDelegate(Type type)
    {
        return type.BaseType is not null && typeof(MulticastDelegate).IsAssignableFrom(type.BaseType);
    }

    static bool UsesDeclaringTypeParameter(MethodInfo method, Type declaringType)
    {
        return UsesDeclaringTypeParameter(method.ReturnType, declaringType) ||
            method.GetParameters().Any(parameter => UsesDeclaringTypeParameter(parameter.ParameterType, declaringType));
    }

    static bool UsesDeclaringTypeParameter(Type type, Type declaringType)
    {
        type = UnwrapByRef(type);
        if (type.IsGenericParameter)
        {
            return type.DeclaringType == declaringType;
        }
        if (type.HasElementType)
        {
            return UsesDeclaringTypeParameter(type.GetElementType()!, declaringType);
        }
        return type.IsGenericType &&
            type.GetGenericArguments().Any(argument => UsesDeclaringTypeParameter(argument, declaringType));
    }

    static Type UnwrapByRef(Type type)
    {
        return type.IsByRef ? type.GetElementType()! : type;
    }

    static string MethodGroupKey(MethodInfo method)
    {
        return $"{method.IsStatic}:{method.Name}";
    }

    static string MethodId(MethodInfo method)
    {
        return $"{TargetId(method.DeclaringType!)}.{MethodMetadataName(method)}({string.Join(",", method.GetParameters().Select(ParameterTargetId))})";
    }

    static string MethodMetadataId(MethodInfo method)
    {
        return $"{MetadataName(method.DeclaringType!)}.{MethodMetadataName(method)}({string.Join(",", method.GetParameters().Select(ParameterMetadataName))})";
    }

    static string ConstructorId(ConstructorInfo constructor)
    {
        return $"{TargetId(constructor.DeclaringType!)}..ctor({string.Join(",", constructor.GetParameters().Select(ParameterTargetId))})";
    }

    static string ConstructorMetadataName(ConstructorInfo constructor)
    {
        return $"{MetadataName(constructor.DeclaringType!)}..ctor({string.Join(",", constructor.GetParameters().Select(ParameterMetadataName))})";
    }

    static string MethodMetadataName(MethodInfo method)
    {
        return method.IsGenericMethodDefinition
            ? $"{method.Name}``{method.GetGenericArguments().Length}"
            : method.Name;
    }

    static string ParameterMetadataName(ParameterInfo parameter)
    {
        var typeName = TypeMetadataName(UnwrapByRef(parameter.ParameterType));
        if (!parameter.ParameterType.IsByRef)
        {
            return typeName;
        }
        if (parameter.IsOut)
        {
            return $"out {typeName}";
        }
        return parameter.GetCustomAttribute<System.Runtime.InteropServices.InAttribute>() is not null
            ? $"in {typeName}"
            : $"ref {typeName}";
    }

    static string ParameterTargetId(ParameterInfo parameter)
    {
        var typeName = TypeTargetId(UnwrapByRef(parameter.ParameterType));
        if (!parameter.ParameterType.IsByRef)
        {
            return typeName;
        }
        if (parameter.IsOut)
        {
            return $"out {typeName}";
        }
        return parameter.GetCustomAttribute<System.Runtime.InteropServices.InAttribute>() is not null
            ? $"in {typeName}"
            : $"ref {typeName}";
    }

    static string TypeMetadataName(Type type)
    {
        if (type.IsArray)
        {
            return $"{TypeMetadataName(type.GetElementType()!)}[]";
        }
        if (type.IsGenericParameter)
        {
            return type.Name;
        }
        if (type.IsGenericType && !type.IsGenericTypeDefinition)
        {
            return $"{MetadataName(type.GetGenericTypeDefinition())}<{string.Join(",", type.GetGenericArguments().Select(TypeMetadataName))}>";
        }
        return MetadataName(type);
    }

    static string TypeTargetId(Type type)
    {
        if (type.IsArray)
        {
            return $"{TypeTargetId(type.GetElementType()!)}[]";
        }
        if (type.IsGenericParameter)
        {
            return type.Name;
        }
        if (type.IsGenericType && !type.IsGenericTypeDefinition)
        {
            return $"{TargetId(type.GetGenericTypeDefinition())}<{string.Join(",", type.GetGenericArguments().Select(TypeTargetId))}>";
        }
        return TargetId(type);
    }

    static string MetadataName(Type type)
    {
        var name = type.FullName ?? type.Name;
        var genericArgumentStart = name.IndexOf("[[", StringComparison.Ordinal);
        return genericArgumentStart >= 0 ? name[..genericArgumentStart] : name.Replace('+', '.');
    }

    static string TargetId(Type type)
    {
        return $"{AssemblyIdentity(type.Assembly)}::{TargetMetadataName(type)}";
    }

    static string TargetMetadataName(Type type)
    {
        var name = type.FullName ?? type.Name;
        var genericArgumentStart = name.IndexOf("[[", StringComparison.Ordinal);
        return genericArgumentStart >= 0 ? name[..genericArgumentStart] : name;
    }

    static string AssemblyIdentity(Assembly assembly)
    {
        return assembly.GetName().FullName ?? assembly.FullName ?? assembly.GetName().Name ?? "";
    }

    static object AssemblyReference(Assembly assembly)
    {
        var name = assembly.GetName();
        var token = name.GetPublicKeyToken();
        var publicKeyToken = token is null || token.Length == 0
            ? null
            : Convert.ToHexString(token).ToLowerInvariant();
        return new
        {
            name = name.Name ?? "",
            version = name.Version?.ToString(),
            culture = string.IsNullOrEmpty(name.CultureName) ? null : name.CultureName,
            publicKeyToken,
            path = string.IsNullOrEmpty(assembly.Location) ? null : assembly.Location,
        };
    }

    static string DisplayName(Type type)
    {
        return MetadataName(type).Replace('+', '.');
    }

    static object RenderShape(Type type)
    {
        var parts = new List<string>();
        if (!string.IsNullOrEmpty(type.Namespace))
        {
            parts.AddRange(type.Namespace.Split('.', StringSplitOptions.RemoveEmptyEntries));
        }
        var declaringTypes = new Stack<string>();
        for (var current = type.DeclaringType; current is not null; current = current.DeclaringType)
        {
            declaringTypes.Push(StripGenericArity(current.Name));
        }
        parts.AddRange(declaringTypes);
        parts.Add(StripGenericArity(type.Name));
        var name = parts[^1];
        var namespaceParts = parts.Count > 1 ? parts.Take(parts.Count - 1).ToArray() : Array.Empty<string>();
        return new
        {
            kind = "named",
            @namespace = namespaceParts.Length == 0 ? null : namespaceParts,
            name,
        };
    }

    static string StripGenericArity(string name)
    {
        var tick = name.IndexOf('`');
        return tick < 0 ? name : name[..tick];
    }

    static string SourceTypeName(Type type)
    {
        return Identifier(StripGenericArity(type.Name));
    }

    static string LowerCamel(string name)
    {
        var source = StripGenericArity(name);
        if (source.Length == 0)
        {
            return source;
        }
        if (source.Length == 1)
        {
            return Identifier(source.ToLowerInvariant());
        }
        return Identifier(char.ToLowerInvariant(source[0]) + source[1..]);
    }

    static string OperatorSourceName(string name)
    {
        return name.StartsWith("op_", StringComparison.Ordinal)
            ? LowerCamel(name[3..])
            : LowerCamel(name);
    }

    static string Identifier(string value)
    {
        if (value.Length == 0)
        {
            return "_";
        }
        var chars = value.Select((character, index) =>
            (index == 0 ? char.IsLetter(character) || character == '_' || character == '$' : char.IsLetterOrDigit(character) || character == '_' || character == '$')
                ? character
                : '_').ToArray();
        var result = new string(chars);
        return char.IsDigit(result[0]) ? $"_{result}" : result;
    }
}
