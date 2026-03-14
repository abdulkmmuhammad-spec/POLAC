import React from 'react';

interface SkeletonProps {
    className?: string;
    variant?: 'text' | 'circular' | 'rectangular';
    width?: string | number;
    height?: string | number;
    count?: number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
    className = '',
    variant = 'rectangular',
    width,
    height,
    count = 1
}) => {
    const baseClasses = 'animate-pulse bg-slate-200';

    const variantClasses = {
        text: 'rounded',
        circular: 'rounded-full',
        rectangular: 'rounded-xl'
    };

    const style: React.CSSProperties = {
        width: width || '100%',
        height: height || '1rem'
    };

    const items = Array.from({ length: count }, (_, i) => (
        <div
            key={i}
            className={`${baseClasses} ${variantClasses[variant]} ${className}`}
            style={style}
        />
    ));

    return <>{items}</>;
};

// Pre-built skeleton components for common use cases
export const CardSkeleton: React.FC<{ count?: number }> = ({ count = 1 }) => (
    <div className="space-y-4">
        {Array.from({ length: count }, (_, i) => (
            <div key={i} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
                <div className="flex items-center gap-4">
                    <Skeleton variant="circular" width={48} height={48} />
                    <div className="flex-1 space-y-2">
                        <Skeleton width="60%" height={16} />
                        <Skeleton width="40%" height={12} />
                    </div>
                </div>
                <div className="mt-4 space-y-2">
                    <Skeleton height={12} />
                    <Skeleton width="80%" height={12} />
                </div>
            </div>
        ))}
    </div>
);

export const TableSkeleton: React.FC<{ rows?: number; cols?: number }> = ({ rows = 5, cols = 4 }) => (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-100">
            <div className="flex gap-4">
                {Array.from({ length: cols }, (_, i) => (
                    <Skeleton key={i} width={100} height={16} />
                ))}
            </div>
        </div>
        <div className="divide-y divide-slate-50">
            {Array.from({ length: rows }, (_, rowIdx) => (
                <div key={rowIdx} className="px-6 py-4 flex gap-4">
                    {Array.from({ length: cols }, (_, colIdx) => (
                        <Skeleton key={colIdx} width={100} height={16} />
                    ))}
                </div>
            ))}
        </div>
    </div>
);

export const FormSkeleton: React.FC = () => (
    <div className="max-w-4xl mx-auto bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
        <div className="p-6 md:p-8 bg-blue-900 text-white">
            <Skeleton width={200} height={24} className="bg-blue-800" />
            <Skeleton width={150} height={16} className="mt-2 bg-blue-800" />
        </div>
        <div className="p-4 md:p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Skeleton height={80} />
                <Skeleton height={80} />
            </div>
            <Skeleton height={120} />
            <div className="grid grid-cols-3 gap-4">
                <Skeleton height={60} />
                <Skeleton height={60} />
                <Skeleton height={60} />
            </div>
            <Skeleton height={200} />
            <Skeleton height={48} />
        </div>
    </div>
);

export const StatsSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: count }, (_, i) => (
            <div key={i} className="bg-white rounded-2xl p-5 border border-slate-100">
                <Skeleton width={60} height={12} className="mb-3" />
                <Skeleton width={80} height={32} />
            </div>
        ))}
    </div>
);

export const ListSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => (
    <div className="space-y-3">
        {Array.from({ length: count }, (_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-100">
                <Skeleton variant="circular" width={40} height={40} />
                <div className="flex-1">
                    <Skeleton width="50%" height={14} className="mb-2" />
                    <Skeleton width="30%" height={12} />
                </div>
                <Skeleton width={80} height={24} className="rounded-full" />
            </div>
        ))}
    </div>
);