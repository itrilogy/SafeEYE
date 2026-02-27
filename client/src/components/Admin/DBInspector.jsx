import React, { useState, useEffect } from 'react';
import { Database, Search, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function DBInspector() {
    const [selectedTable, setSelectedTable] = useState('assets');
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [cleanupStatus, setCleanupStatus] = useState(null);

    const tables = [
        'assets', 'annotations', 'exams', 'exam_items', 'records',
        'knowledge_scenes', 'knowledge_categories', 'knowledge_items',
        'risk_dictionary', '_legacy_knowledge'
    ];

    const fetchData = async () => {
        try {
            setLoading(true);
            setData([]); // 在抓取新数据前先清空旧数据，防止 UI 错位
            const res = await fetch(`/api/admin/db/query/${selectedTable}`);
            if (res.ok) {
                const json = await res.json();
                setData(json);
            } else {
                console.error('API 返回错误状态:', res.status);
            }
        } catch (e) {
            console.error('Fetch error:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleCleanup = async () => {
        if (!window.confirm('此操作将永久删除服务器上冗余的 JSON 数据文件，请确保 SQLite 数据库内容已通过验证。继续？')) return;
        try {
            const res = await fetch('/api/admin/cleanup', { method: 'POST' });
            const result = await res.json();
            setCleanupStatus(result.message);
            setTimeout(() => setCleanupStatus(null), 5000);
        } catch (e) {
            alert('清理失败');
        }
    };

    useEffect(() => {
        fetchData();
    }, [selectedTable]);

    return (
        <div className="flex flex-col h-full bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b px-6 py-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center space-x-4">
                    <div className="bg-indigo-600 p-2 rounded-lg">
                        <Database className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">数据库结构化巡检</h1>
                        <p className="text-xs text-gray-500">验证 SQLite 表数据并清理旧有 JSON 碎片</p>
                    </div>
                </div>

                <div className="flex items-center space-x-4">
                    <select
                        value={selectedTable}
                        onChange={(e) => setSelectedTable(e.target.value)}
                        className="bg-gray-100 border-none rounded-lg px-4 py-2 text-sm font-medium text-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                        {tables.map(t => <option key={t} value={t}>数据表: {t}</option>)}
                    </select>
                    <button
                        onClick={handleCleanup}
                        className="flex items-center px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-sm font-bold transition-colors border border-red-200"
                    >
                        <Trash2 className="w-4 h-4 mr-2" />
                        清理冗余 JSON
                    </button>
                </div>
            </div>

            {/* Status Message */}
            {cleanupStatus && (
                <div className="mx-6 mt-4 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center text-green-700 animate-pulse">
                    <CheckCircle2 className="w-5 h-5 mr-3" />
                    <span className="font-medium">{cleanupStatus}</span>
                </div>
            )}

            {/* Data Table */}
            <div className="flex-1 overflow-auto p-6">
                <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
                    {loading ? (
                        <div className="p-20 text-center text-gray-400">数据加载中...</div>
                    ) : data.length === 0 ? (
                        <div className="p-20 text-center text-gray-400 flex flex-col items-center">
                            <AlertCircle className="w-12 h-12 mb-4 opacity-20" />
                            该表中暂无任何记录
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    {Object.keys(data[0]).map(key => (
                                        <th key={key} className="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-wider">{key}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {data.map((row, i) => (
                                    <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                                        {Object.values(row).map((val, j) => (
                                            <td key={j} className="px-6 py-4 text-sm text-gray-600 font-mono truncate max-w-[250px]" title={String(val)}>
                                                {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                <p className="mt-4 text-center text-xs text-gray-400">
                    仅显示前 100 条记录记录。如有更多需求请通过后端日志查询。
                </p>
            </div>
        </div>
    );
}
