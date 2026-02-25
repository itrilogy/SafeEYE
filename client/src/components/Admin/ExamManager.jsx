import React, { useState, useEffect } from 'react';
import { ScrollText, Play, Trash2 } from 'lucide-react';

export default function ExamManager() {
    const [exams, setExams] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchExams = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/exams'); // 需要在后端新增这个路由，返回所有试卷
            if (res.ok) {
                const data = await res.json();
                setExams(data || []);
            }
        } catch (e) {
            console.error('获取试卷列表失败', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchExams();
    }, []);

    // 简单实现删除功能或者只作为查看
    const handleDelete = async (examName) => {
        if (!window.confirm(`确认删除试卷【${examName}】吗？`)) return;
        try {
            const res = await fetch(`/api/exams/${examName}`, { method: 'DELETE' });
            if (res.ok) {
                fetchExams(); // 重新拉取
            }
        } catch (e) { }
    }

    return (
        <div className="bg-white flex flex-col h-full border-l border-gray-200">
            <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
                <h2 className="text-lg font-bold flex items-center text-gray-800">
                    <ScrollText className="w-5 h-5 mr-2 text-indigo-500" /> 已发布考卷集
                </h2>
                <button onClick={fetchExams} className="text-sm text-indigo-500 hover:text-indigo-700">刷新</button>
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-3">
                {loading ? (
                    <div className="text-center text-gray-400 py-10">加载中...</div>
                ) : exams.length === 0 ? (
                    <div className="text-center text-gray-400 py-10">暂无已发布的试卷。请先在左侧发布。</div>
                ) : (
                    exams.map((exam, i) => (
                        <div key={exam.name || i} className="border border-gray-200 p-3 rounded-lg shadow-sm hover:shadow transition flex justify-between items-center bg-white relative overflow-hidden">
                            {i === 0 && <div className="absolute top-0 left-0 w-1 h-full bg-green-500" title="当前最新的活动考卷" />}
                            <div className="pl-2">
                                <h3 className="font-bold text-gray-800">{exam.examName || exam.name}</h3>
                                <p className="text-xs text-gray-500 mt-1">包含 {exam.slides?.length || 0} 道题 | {new Date(exam.mtime || exam.createdAt).toLocaleString()}</p>
                            </div>
                            <div className="flex space-x-2">
                                <button onClick={() => handleDelete(exam.name)} className="p-2 text-gray-400 hover:text-red-500 transition rounded-full hover:bg-red-50" title="删除">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
