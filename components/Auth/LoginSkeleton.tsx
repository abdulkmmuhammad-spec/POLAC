import React from 'react';

export const LoginSkeleton: React.FC = () => {
    return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-900 relative overflow-hidden">
            {/* Background Placeholder */}
            <div className="absolute inset-0 w-full h-full bg-slate-800 opacity-30" />

            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden relative z-10 animate-pulse">
                {/* Header Skeleton */}
                <div className="bg-slate-100 p-8 text-center flex flex-col items-center">
                    <div className="w-24 h-24 bg-slate-200 rounded-full mb-4 border-4 border-white/20" />
                    <div className="h-8 bg-slate-200 w-3/4 rounded-lg mb-2" />
                    <div className="h-6 bg-slate-200 w-1/2 rounded-full" />
                </div>

                {/* Tabs Skeleton */}
                <div className="flex border-b border-slate-100">
                    <div className="flex-1 h-14 bg-slate-50 border-r border-slate-100" />
                    <div className="flex-1 h-14 bg-white" />
                </div>

                {/* Form Skeleton */}
                <div className="p-8 space-y-8">
                    <div className="text-center space-y-2">
                        <div className="h-6 bg-slate-100 w-1/3 mx-auto rounded" />
                        <div className="h-3 bg-slate-100 w-1/2 mx-auto rounded" />
                    </div>

                    <div className="space-y-6">
                        {/* Username Field */}
                        <div className="space-y-2">
                            <div className="h-4 bg-slate-100 w-20 rounded shadow-sm" />
                            <div className="h-12 bg-slate-50 rounded-xl border border-slate-100" />
                        </div>

                        {/* Password Field */}
                        <div className="space-y-2">
                            <div className="h-4 bg-slate-100 w-20 rounded shadow-sm" />
                            <div className="h-12 bg-slate-50 rounded-xl border border-slate-100" />
                        </div>

                        {/* Submit Button */}
                        <div className="h-14 bg-slate-200 rounded-xl shadow-inner mt-4" />
                    </div>

                    <div className="h-3 bg-slate-50 w-1/2 mx-auto rounded" />
                </div>
            </div>
        </div>
    );
};
