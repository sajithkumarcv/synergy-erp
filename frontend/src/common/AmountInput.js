import React, { useState, useEffect, useRef } from 'react';

// ── AmountInput ──────────────────────────────────────────────────────────────
// A drop-in replacement for <input type="number"> currency entry that:
//   • right-aligns the value
//   • shows `1,234.56` when blurred (locale thousand separators, 2 decimals)
//   • shows a clean editable number while focused
//   • emits the raw numeric string back via onChange — caller stores it the
//     same way it did before (so existing form.set() / Number() calls keep
//     working unchanged)
//
// Usage:
//   <AmountInput
//       value={form.amountPaid}
//       onChange={v => set('amountPaid', v)}
//       error={errors.amountPaid}
//       min={0}
//   />
//
const AmountInput = ({
    value,
    onChange,
    error = false,
    min = 0,
    max,
    placeholder = '0.00',
    decimals = 2,
    disabled = false,
    style,
    className,
    ...rest
}) => {
    const [focused, setFocused] = useState(false);
    const inputRef = useRef(null);

    // Display string varies with focus
    const display = focused
        ? (value ?? '')
        : (value === '' || value == null || isNaN(Number(value))
            ? ''
            : Number(value).toLocaleString('en-US', {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals,
            }));

    const handleChange = (e) => {
        // While typing we only accept digits, one decimal point, and optional
        // leading minus (rejected anyway by min=0). Strip everything else.
        let raw = e.target.value;
        raw = raw.replace(/[^\d.]/g, '');
        // Collapse multiple decimals — keep only the first
        const firstDot = raw.indexOf('.');
        if (firstDot !== -1) {
            raw = raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, '');
        }
        onChange(raw);
    };

    const handleBlur = () => {
        setFocused(false);
        // Clamp + normalise the stored value on blur so the caller's Number()
        // calls always read a clean float.
        if (value === '' || value == null) return;
        const n = Number(value);
        if (isNaN(n)) { onChange(''); return; }
        let clamped = n;
        if (min != null && clamped < min) clamped = min;
        if (max != null && clamped > max) clamped = max;
        onChange(clamped.toFixed(decimals));
    };

    useEffect(() => {
        // When the value changes externally (e.g. on currency switch resetting it),
        // do nothing — the display recalculates from prop.
    }, [value]);

    return (
        <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            disabled={disabled}
            value={display}
            placeholder={placeholder}
            onFocus={() => setFocused(true)}
            onBlur={handleBlur}
            onChange={handleChange}
            className={className}
            style={{
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
                ...style,
            }}
            {...rest}
        />
    );
};

export default AmountInput;
