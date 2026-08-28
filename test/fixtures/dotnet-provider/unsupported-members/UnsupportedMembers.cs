namespace ProviderUnsupportedMemberFixtures;

public interface IStaticInterfaceMember
{
    static abstract int StaticCount { get; }

    static abstract int Create();
}

public sealed class StaticInterfaceImplementation : IStaticInterfaceMember
{
    public static int StaticCount => 7;

    public static int Create()
    {
        return StaticCount;
    }
}

public sealed class GenericHolder<T>
{
    public static T StaticValue => default!;

    public static T Echo(T value)
    {
        return value;
    }
}

public sealed class MultiIndexer
{
    public int this[int row, int column] => row + column;
}

public unsafe sealed class PointerSignatures
{
    public int* PointerField;

    public PointerSignatures(int* pointer)
    {
        PointerField = pointer;
    }

    public int* PointerProperty => PointerField;

    public int this[int* pointer] => *pointer;

    public int* PointerReturn()
    {
        return PointerField;
    }

    public int ReadPointer(int* pointer)
    {
        return *pointer;
    }
}

public sealed class RankedArraySignatures
{
    public int[,] MatrixField;

    public RankedArraySignatures(int[,] matrix)
    {
        MatrixField = matrix;
    }

    public int[,] MatrixProperty => MatrixField;

    public int[,] MatrixReturn()
    {
        return MatrixField;
    }

    public void AcceptMatrix(int[,] matrix)
    {
        MatrixField = matrix;
    }
}

public sealed class ByRefReturnSignatures
{
    private int _value;

    public ref int ValueProperty => ref _value;

    public ref int this[int index] => ref _value;

    public ref int ValueRef()
    {
        return ref _value;
    }

    public ref readonly int ReadonlyValueRef()
    {
        return ref _value;
    }
}

public unsafe delegate int PointerDelegate(int* pointer);

public delegate ref int RefReturnDelegate();

public unsafe sealed class FunctionPointerSignatures
{
    public delegate* unmanaged[Cdecl]<int, void> CallbackField;

    public FunctionPointerSignatures(
        delegate* unmanaged[Cdecl]<int, void> callback)
    {
        CallbackField = callback;
    }

    public delegate* unmanaged[Cdecl]<int, void> CallbackProperty =>
        CallbackField;

    public delegate* unmanaged[Cdecl]<int, void> Echo(
        delegate* unmanaged[Cdecl]<int, void> callback)
    {
        return callback;
    }
}

public sealed class EventSignatures
{
    public event Action<int>? Changed;

    public void Raise(int value)
    {
        Changed?.Invoke(value);
    }
}

public readonly struct GenericNumber<T>
{
    public static GenericNumber<T> operator +(GenericNumber<T> left, GenericNumber<T> right)
    {
        return left;
    }
}

public unsafe readonly struct PointerConversion
{
    public static explicit operator int*(PointerConversion value)
    {
        return null;
    }
}
