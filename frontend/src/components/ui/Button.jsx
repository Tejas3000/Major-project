import { motion } from 'framer-motion';

export function Button({
    children,
    variant = 'primary',
    size = 'md',
    disabled = false,
    loading = false,
    onClick,
    className = '',
    ...props
}) {
    const baseStyles = 'font-semibold rounded-xl transition-all duration-200 flex items-center justify-center';

    const variants = {
        primary: 'bg-gradient-to-r from-primary-600 to-primary-500 text-white hover:from-primary-500 hover:to-primary-400 shadow-lg shadow-primary-500/25',
        secondary: 'bg-dark-300 text-white hover:bg-dark-200 border border-gray-700',
        success: 'bg-gradient-to-r from-accent-green to-emerald-500 text-white hover:opacity-90',
        danger: 'bg-gradient-to-r from-accent-red to-red-500 text-white hover:opacity-90',
        ghost: 'bg-transparent text-gray-400 hover:text-white hover:bg-dark-300',
    };

    const sizes = {
        sm: 'px-3 py-1.5 text-sm',
        md: 'px-4 py-2',
        lg: 'px-6 py-3 text-lg',
        xl: 'px-8 py-4 text-xl',
    };

    const disabledStyles = disabled || loading
        ? 'opacity-50 cursor-not-allowed'
        : 'cursor-pointer';

    return (
        <motion.button
            whileHover={!disabled && !loading ? { scale: 1.02 } : {}}
            whileTap={!disabled && !loading ? { scale: 0.98 } : {}}
            className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${disabledStyles} ${className}`}
            disabled={disabled || loading}
            onClick={onClick}
            {...props}
        >
            {loading && (
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
            )}
            {children}
        </motion.button>
    );
}

export default Button;
