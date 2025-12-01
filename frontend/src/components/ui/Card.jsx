import { motion } from 'framer-motion';

export function Card({
    children,
    className = '',
    hover = false,
    gradient = false,
    padding = true,
    ...props
}) {
    const baseStyles = `
    bg-dark-200 border border-gray-800 rounded-2xl
    ${padding ? 'p-6' : ''}
    ${hover ? 'hover:border-gray-700 hover:bg-dark-200/80 cursor-pointer' : ''}
    ${gradient ? 'bg-gradient-to-br from-dark-200 to-dark-300' : ''}
  `;

    return (
        <motion.div
            whileHover={hover ? { y: -2 } : {}}
            className={`${baseStyles} ${className}`}
            {...props}
        >
            {children}
        </motion.div>
    );
}

export function StatCard({
    title,
    value,
    change,
    icon: Icon,
    trend = 'neutral',
    prefix = '',
    suffix = '',
}) {
    const trendColors = {
        up: 'text-accent-green',
        down: 'text-accent-red',
        neutral: 'text-gray-400',
    };

    return (
        <Card className="stat-card">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-sm text-gray-400">{title}</p>
                    <p className="text-2xl font-bold text-white mt-1">
                        {prefix}{value}{suffix}
                    </p>
                    {change !== undefined && (
                        <p className={`text-sm mt-1 ${trendColors[trend]}`}>
                            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : ''}
                            {change}
                        </p>
                    )}
                </div>
                {Icon && (
                    <div className="p-3 bg-primary-600/20 rounded-xl">
                        <Icon className="w-6 h-6 text-primary-400" />
                    </div>
                )}
            </div>
        </Card>
    );
}

export default Card;
