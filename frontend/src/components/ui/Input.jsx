import { forwardRef } from 'react';

export const Input = forwardRef(({
    label,
    type = 'text',
    placeholder,
    value,
    onChange,
    error,
    disabled = false,
    suffix,
    prefix,
    className = '',
    inputClassName = '',
    ...props
}, ref) => {
    return (
        <div className={`space-y-1 ${className}`}>
            {label && (
                <label className="block text-sm font-medium text-gray-400">
                    {label}
                </label>
            )}
            <div className="relative">
                {prefix && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                        {prefix}
                    </div>
                )}
                <input
                    ref={ref}
                    type={type}
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    disabled={disabled}
                    className={`
            w-full bg-dark-400 border border-gray-700 rounded-xl px-4 py-3
            text-white placeholder-gray-500
            focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all duration-200
            ${prefix ? 'pl-10' : ''}
            ${suffix ? 'pr-16' : ''}
            ${error ? 'border-accent-red focus:ring-accent-red' : ''}
            ${inputClassName}
          `}
                    {...props}
                />
                {suffix && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">
                        {suffix}
                    </div>
                )}
            </div>
            {error && (
                <p className="text-sm text-accent-red">{error}</p>
            )}
        </div>
    );
});

Input.displayName = 'Input';

export default Input;
