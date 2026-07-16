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
            return type.DeclaringMethod is null && type.DeclaringType == declaringType;
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
        return $"{method.IsStatic}:{(IsExtensionMethod(method) ? "first-argument" : "normal")}:{method.Name}";
    }

    static string MethodId(MethodInfo method)
    {
        return $"{TargetId(method.DeclaringType!)}.{MethodMetadataName(method)}({string.Join(",", method.GetParameters().Select(ParameterTargetId))})";
    }

    static string OperatorId(MethodInfo method)
    {
        return $"{MethodId(method)}:{TypeTargetId(method.ReturnType)}";
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
            return $"{TypeMetadataName(type.GetElementType()!)}{ArrayRankSuffix(type)}";
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
            return $"{TypeTargetId(type.GetElementType()!)}{ArrayRankSuffix(type)}";
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

    static string ArrayRankSuffix(Type type)
    {
        if (type.IsSZArray)
        {
            return "[]";
        }
        var rank = type.GetArrayRank();
        return rank == 1 ? "[*]" : $"[{new string(',', rank - 1)}]";
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
        var namespaceParts = new List<string>();
        if (!string.IsNullOrEmpty(type.Namespace))
        {
            namespaceParts.AddRange(type.Namespace.Split('.', StringSplitOptions.RemoveEmptyEntries));
        }
        var typeSegments = new List<(string Name, int GenericArity)>();
        for (var current = type; current is not null; current = current.DeclaringType)
        {
            typeSegments.Add((StripGenericArity(current.Name), GenericArity(current.Name)));
        }
        typeSegments.Reverse();
        var segments = typeSegments.ToArray();
        var name = segments[0].Name;
        var genericArity = segments[0].GenericArity;
        var nested = segments
            .Skip(1)
            .Select(segment => new
            {
                name = segment.Name,
                genericArity = segment.GenericArity == 0 ? null : (int?)segment.GenericArity,
            })
            .ToArray();
        return new
        {
            kind = "named",
            @namespace = namespaceParts.Count == 0 ? null : namespaceParts.ToArray(),
            name,
            genericArity = genericArity == 0 ? null : (int?)genericArity,
            nested = nested.Length == 0 ? null : nested,
        };
    }

    static string StripGenericArity(string name)
    {
        var tick = name.IndexOf('`');
        return tick < 0 ? name : name[..tick];
    }

    static int GenericArity(string name)
    {
        var tick = name.IndexOf('`');
        return tick < 0 || tick == name.Length - 1 || !int.TryParse(name[(tick + 1)..], out var arity)
            ? 0
            : arity;
    }

    static string SourceTypeName(Type type)
    {
        return SourceTypeName(type, false);
    }

    static string SourceTypeName(Type type, bool disambiguateByArity)
    {
        var baseName = SourceTypeBaseName(type);
        var arity = GenericTypeNameArity(type);
        return disambiguateByArity && arity > 0 ? $"{baseName}_{arity}" : baseName;
    }

    static string QualifiedNestedSourceTypeName(Type type, bool disambiguateByArity)
    {
        var baseName = QualifiedNestedSourceTypeBaseName(type);
        var arity = GenericTypeNameArity(type);
        return disambiguateByArity && arity > 0 ? $"{baseName}_{arity}" : baseName;
    }

    static string SourceTypeBaseName(Type type)
    {
        return StripGenericArity(type.Name);
    }

    static string QualifiedNestedSourceTypeBaseName(Type type)
    {
        var parts = new Stack<string>();
        for (var current = type; current is not null; current = current.DeclaringType)
        {
            parts.Push(StripGenericArity(current.Name));
        }
        return string.Join("_", parts);
    }

    static int GenericTypeNameArity(Type type)
    {
        var tick = type.Name.IndexOf('`');
        return tick < 0 || tick == type.Name.Length - 1 || !int.TryParse(type.Name[(tick + 1)..], out var arity)
            ? 0
            : arity;
    }

    static string SourceMemberName(string name)
    {
        return StripGenericArity(name);
    }

    static bool IsSourceIdentifier(string value)
    {
        if (value.Length == 0 || !IsSourceIdentifierStart(value[0]))
        {
            return false;
        }
        return value.Skip(1).All(IsSourceIdentifierPart);
    }

    static bool IsSourceIdentifierStart(char character)
    {
        return character is >= 'A' and <= 'Z' or >= 'a' and <= 'z' or '_' or '$';
    }

    static bool IsSourceIdentifierPart(char character)
    {
        return IsSourceIdentifierStart(character) || character is >= '0' and <= '9';
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

    static string ParameterIdentifier(ParameterInfo parameter, int index)
    {
        var name = Identifier(parameter.Name ?? $"arg{index}");
        return IsReservedTypeScriptIdentifier(name) ? $"{name}Parameter" : name;
    }

    static bool IsReservedTypeScriptIdentifier(string name)
    {
        return name is
            "arguments" or
            "await" or
            "break" or
            "case" or
            "catch" or
            "class" or
            "const" or
            "continue" or
            "debugger" or
            "default" or
            "delete" or
            "do" or
            "else" or
            "enum" or
            "eval" or
            "export" or
            "extends" or
            "false" or
            "finally" or
            "for" or
            "function" or
            "if" or
            "implements" or
            "import" or
            "in" or
            "instanceof" or
            "interface" or
            "let" or
            "new" or
            "null" or
            "package" or
            "private" or
            "protected" or
            "public" or
            "return" or
            "static" or
            "super" or
            "switch" or
            "this" or
            "throw" or
            "true" or
            "try" or
            "typeof" or
            "undefined" or
            "var" or
            "void" or
            "while" or
            "with" or
            "yield";
    }
}
