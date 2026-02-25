import React, { useState, useEffect } from 'react';
import { Trophy, Medal, Star, ShieldCheck } from 'lucide-react';

export default function ScoreKeeper({ activeExamId }) {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchRecords = async () => {
        try {
            setLoading(true);
            const url = activeExamId ? `/api/session/records/latest?examId=${encodeURIComponent(activeExamId)}` : '/api/session/records/latest';
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                setRecords(data || []);
            }
        } catch (e) {
            console.error('获取成绩列表失败', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRecords();
        // 简单轮询，每10秒刷新一次最新战报排行榜
        const timer = setInterval(() => {
            fetchRecords();
        }, 10000);
        return () => clearInterval(timer);
    }, [activeExamId]);

    return (
        <div className="bg-gray-900 h-full rounded-xl flex overflow-hidden text-gray-200">
            <div className="w-64 p-5 border-r border-gray-800 bg-gray-800/50 flex flex-col justify-between">
                <div>
                    <h2 className="text-xl font-bold flex items-center text-white mb-2">
                        <Trophy className="w-6 h-6 mr-3 text-yellow-500" />
                        龙虎榜
                    </h2>
                    <div className="inline-block px-3 py-1 bg-gray-800 rounded-full text-xs font-semibold text-gray-400">实时滚动刷榜</div>
                </div>
                <button
                    onClick={fetchRecords}
                    className="text-xs font-semibold text-gray-500 hover:text-white transition-colors text-left"
                >
                    手动刷新数据墙
                </button>
            </div>

            <div className="flex-1 overflow-x-auto p-4 flex space-x-4 items-center config-scrollbar">
                {loading && records.length === 0 ? (
                    <div className="text-center w-full opacity-50 animate-pulse flex flex-col items-center">
                        <ShieldCheck className="w-8 h-8 mb-2 text-gray-500" />
                        读取成绩网络...
                    </div>
                ) : records.length === 0 ? (
                    <div className="text-center w-full text-gray-500 flex flex-col items-center">
                        <Star className="w-8 h-8 mb-2 opacity-30" />
                        <p>大屏虚位以待，等待英雄</p>
                    </div>
                ) : (
                    records.map((r, i) => {
                        let rankColor = "text-gray-400 font-bold";
                        let bgItem = "bg-gray-800";
                        if (i === 0) { rankColor = "text-yellow-400 font-black text-xl"; bgItem = "bg-yellow-900/20 border-yellow-500/30 border"; }
                        else if (i === 1) { rankColor = "text-gray-300 font-bold text-lg"; bgItem = "bg-gray-800 border-gray-600 border"; }
                        else if (i === 2) { rankColor = "text-amber-600 font-bold text-lg"; bgItem = "bg-gray-800 border-amber-900/50 border"; }

                        return (
                            <div key={i} className={`flex-shrink-0 w-64 p-4 rounded-xl flex items-center justify-between shadow-lg transition-transform hover:scale-[1.02] ${bgItem}`}>
                                <div className="flex items-center space-x-3">
                                    <div className={`w-8 text-center ${rankColor}`}>
                                        {i === 0 ? <Medal className="w-6 h-6 mx-auto" /> : `#${i + 1}`}
                                    </div>
                                    <div className="min-w-0 pr-2">
                                        <div className="font-bold text-gray-100 truncate">{r.userName || "热心市民"}</div>
                                        <div className="text-xs text-gray-500 font-mono mt-0.5 truncate" title={r.examId}>卷宗集: {String(r.examId).substring(0, 16)}...</div>
                                    </div>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <div className="text-2xl font-black text-emerald-400 shadow-emerald-500/20 drop-shadow-md">
                                        {r.score}
                                    </div>
                                </div>
                            </div>
                        )
                    })
                )}
            </div>
        </div>
    );
}
