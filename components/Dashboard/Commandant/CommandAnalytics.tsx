import React from 'react';
import { HistoricalTrends } from '../../Analytics/HistoricalTrends';
import { DefaulterAnalysis } from './DefaulterAnalysis';

export const CommandAnalytics: React.FC = () => {
    return (
        <div className="space-y-8 pb-12">
            <div className="space-y-8">
                <HistoricalTrends showChart={false} />
            </div>

            <div className="pt-8 border-t border-slate-200">
                <div className="mb-6">
                    <h3 className="text-xl font-bold text-slate-800">Defaulter Deep-Dive</h3>
                    <p className="text-sm text-slate-500">Individual cadet accountability tracking</p>
                </div>
                <DefaulterAnalysis />
            </div>
        </div>
    );
};
