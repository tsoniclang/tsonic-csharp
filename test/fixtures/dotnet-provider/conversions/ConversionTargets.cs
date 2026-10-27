namespace ProviderConversionFixtures;

public readonly struct Meter
{
    public Meter(double value)
    {
        Value = value;
    }

    public double Value { get; }

    public static explicit operator Meter(double value)
    {
        return new Meter(value);
    }

    public static implicit operator double(Meter value)
    {
        return value.Value;
    }
}

public unsafe readonly struct PointerSourceConversion
{
    public static explicit operator PointerSourceConversion(int* value)
    {
        return new PointerSourceConversion();
    }
}

public readonly struct ReturnSelectedConversion
{
    public ReturnSelectedConversion(long value)
    {
        Value = value;
    }

    public long Value { get; }

    public static explicit operator int(ReturnSelectedConversion value)
    {
        return checked((int)value.Value);
    }

    public static explicit operator long(ReturnSelectedConversion value)
    {
        return value.Value;
    }

    public static explicit operator ulong(ReturnSelectedConversion value)
    {
        return checked((ulong)value.Value);
    }
}
