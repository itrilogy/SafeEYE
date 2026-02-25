import React, { useState, useEffect, useRef } from 'react';
import { Target, AlertTriangle, ShieldCheck, CheckCircle2 } from 'lucide-react';

export default function InteractionJudge({ onExamStart, onExamChange }) {
    const [allExams, setAllExams] = useState([]);
    const [isTesting, setIsTesting] = useState(false);
    const [selectedExam, setSelectedExam] = useState(null);

    const [images, setImages] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [clausesDict, setClausesDict] = useState({});

    // 当前题目的游戏状态
    const [metaData, setMetaData] = useState(null);
    const [foundItems, setFoundItems] = useState([]); // 存已找到的打点ID
    const [missCount, setMissCount] = useState(0);
    const [showHints, setShowHints] = useState(false); // 超过允许次数显示解析

    // 瞬时反馈效果坐标与状态 {x,y, type:'hit'|'miss'}
    const [effectPoint, setEffectPoint] = useState(null);
    const imageRef = useRef(null);
    const MAX_MISS = 3;

    const [userName, setUserName] = useState("匿名审计员-" + Math.floor(Math.random() * 1000));
    const [examId, setExamId] = useState(null);
    const [totalScore, setTotalScore] = useState(0);

    useEffect(() => {
        // 读取最新的考卷试题结构
        fetchInitData();
    }, []);

    const fetchInitData = async () => {
        // 1. 获取四级级联字典映射
        const kRes = await fetch('/api/knowledge');
        const kData = await kRes.json();
        const dict = {};
        kData.knowledgeTree?.forEach(sceneObj => {
            sceneObj.types?.forEach(typeObj => {
                typeObj.items?.forEach(item => {
                    dict[item.id] = { name: typeObj.typeName, content: item.clause };
                });
            });
        });
        setClausesDict(dict);

        // 2. 拉取所有已发行的考卷列表供用户挑选
        const pRes = await fetch('/api/exams');
        if (pRes.ok) {
            const exams = await pRes.json();
            setAllExams(exams);
            if (exams.length > 0) {
                setSelectedExam(exams[0]);
                if (onExamChange) onExamChange(exams[0].examName);
            }
        }
    };

    const startExam = () => {
        if (!selectedExam) return;

        const testPaper = selectedExam.slides.map(name => ({
            name,
            url: `/assets/raw/${name}`
        }));

        setExamId(selectedExam.examName);
        setImages(testPaper);
        setCurrentIndex(0);
        setTotalScore(0);
        loadQuestion(testPaper[0]);
        setIsTesting(true);
        if (onExamStart) onExamStart(selectedExam.examName);
    };

    const loadQuestion = async (img) => {
        if (!img) return;
        const res = await fetch(`/api/assets/meta/${img.name}`);
        const data = await res.json();

        setMetaData(data.meta.items || []);
        setFoundItems([]);
        setMissCount(0);
        setShowHints(false);
        setEffectPoint(null);
    };

    const handleNext = async () => {
        if (currentIndex < images.length - 1) {
            const nextIdx = currentIndex + 1;
            setCurrentIndex(nextIdx);
            loadQuestion(images[nextIdx]);
        } else {
            // 最后一关完成，提交成绩
            try {
                await fetch('/api/session/record', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userName,
                        examId: examId || "Fallback-Training",
                        score: totalScore,
                        completedAt: Date.now()
                    })
                });
                alert(`🎊 考核通过！你在本次防爆巡检实勘中斩获 ${totalScore} 分。成绩已上报安监大屏！`);
                // 返回大厅
                setIsTesting(false);
                setCurrentIndex(0);
                setTotalScore(0);
            } catch (e) {
                alert('成绩上传异常');
            }
        }
    };

    const handleCanvasClick = (e) => {
        if (showHints) return; // 已经炸了不能再点
        if (!imageRef.current || !metaData) return;

        const rect = imageRef.current.getBoundingClientRect();
        // 计算转换后的测试百分比坐标
        const uX = (e.clientX - rect.left) / rect.width;
        const uY = (e.clientY - rect.top) / rect.height;

        let hitItem = null;

        // 碰撞计算核心逻辑：包围盒判定
        for (let item of metaData) {
            const r = item.rect;
            // 简单检测中心点位在靶向内的正选区域
            if (uX >= r.x && uX <= r.x + r.w && uY >= r.y && uY <= r.y + r.h) {
                hitItem = item;
                break;
            }
        }

        if (hitItem) {
            if (!foundItems.includes(hitItem.id)) {
                setFoundItems(prev => {
                    const newFound = [...prev, hitItem.id];
                    // 动态加分
                    setTotalScore(s => s + (hitItem.scoreWeight || 10));

                    // 瞬时判断是否通关
                    if (newFound.length >= metaData.length) {
                        setTimeout(() => setShowHints(true), 800);
                    }
                    return newFound;
                });
            }
            triggerMomentaryEffect(uX, uY, 'hit');
        } else {
            setMissCount(prev => prev + 1);
            triggerMomentaryEffect(uX, uY, 'miss');
            if (missCount + 1 >= MAX_MISS) {
                setShowHints(true); // 3次错误自动投降
            }
        }
    };

    // Vibe交互：0.8s 瞬时动效
    const triggerMomentaryEffect = (x, y, type) => {
        setEffectPoint({ x, y, type });
        setTimeout(() => setEffectPoint(null), 800);
    };

    // 移除多余的重复声明
    const activeImage = images[currentIndex];

    // 空转防御
    if (images.length === 0 && isTesting) { // Only show this if testing is active but no images loaded
        return <div className="p-10 text-center text-gray-500">检测不到包含标注元的测试试卷...请先在后台生成标记。</div>;
    }

    const isAllFound = foundItems.length === metaData?.length && metaData?.length > 0;

    if (!isTesting) {
        return (
            <div className="flex-1 flex items-center justify-center bg-gray-900 p-8">
                <div className="max-w-xl w-full bg-gray-800 rounded-3xl p-10 shadow-3xl border border-gray-700">
                    <div className="text-center mb-10">
                        <div className="w-20 h-20 bg-indigo-600/20 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-indigo-500/30">
                            <Target className="w-10 h-10 text-indigo-500" />
                        </div>
                        <h1 className="text-3xl font-black text-white tracking-tight mb-3">防爆大决战中心</h1>
                        <p className="text-gray-400">请选择今日巡检任务，开启沉浸式红线排查考核</p>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-gray-400 mb-2">选择考核卷宗</label>
                            <select
                                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-4 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                value={selectedExam?.examName || ''}
                                onChange={(e) => {
                                    const exam = allExams.find(ex => ex.examName === e.target.value);
                                    setSelectedExam(exam);
                                    if (onExamChange) onExamChange(exam.examName);
                                }}
                            >
                                {allExams.map(ex => (
                                    <option key={ex.examName} value={ex.examName}>{ex.examName}</option>
                                ))}
                                {allExams.length === 0 && <option disabled>暂无发布中的试卷</option>}
                            </select>
                        </div>

                        {selectedExam && (
                            <div className="bg-gray-900/50 rounded-2xl p-6 border border-gray-700/50">
                                <h3 className="text-indigo-400 font-bold mb-2 flex justify-between">
                                    卷面详情
                                    <span className="text-gray-500 text-xs font-normal">包含 {selectedExam.slides?.length || 0} 个场景</span>
                                </h3>
                                <p className="text-sm text-gray-300 leading-relaxed italic">
                                    "{selectedExam.description || '暂无详细任务指引。'}"
                                </p>
                            </div>
                        )}

                        <button
                            disabled={!selectedExam}
                            onClick={startExam}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white font-black py-5 rounded-2xl shadow-xl transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center text-lg"
                        >
                            <ShieldCheck className="w-6 h-6 mr-3" />
                            🚀 立即奔赴现场
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex bg-gray-900 h-full rounded-xl overflow-hidden shadow-2xl">
            {/* 左侧考卷图呈现区 */}
            <div className="flex-1 relative flex items-center justify-center bg-black/90 p-4 border-r border-gray-700">
                <div className="absolute top-4 left-4 bg-white/10 backdrop-blur-md px-4 py-2 rounded-lg flex space-x-4 border border-white/20 z-10">
                    <div className="text-white">
                        <span className="text-sm text-gray-400">本题隐患数:</span>
                        <span className="ml-2 font-bold text-lg text-emerald-400">{foundItems.length} / {metaData?.length || 0}</span>
                    </div>
                    <div className="border-l border-white/20"></div>
                    <div className="text-white">
                        <span className="text-sm text-gray-400">误点容错:</span>
                        <span className="ml-2 font-bold text-lg text-red-400">{missCount} / {MAX_MISS}</span>
                    </div>
                </div>

                <div className="relative flex items-center justify-center w-full h-full p-4 overflow-hidden">
                    <div className="relative inline-block shadow-2xl" style={{ maxWidth: '100%', maxHeight: '100%' }}>
                        <img
                            ref={imageRef}
                            src={activeImage.url}   // 由于配置了 /assets 代理，无需再补全 localhost
                            alt="现场原片"
                            className={`block select-none cursor-crosshair transition pointer-events-auto ${showHints ? 'opacity-50' : ''}`}
                            style={{ maxWidth: '100%', maxHeight: 'calc(100vh - 200px)', width: 'auto', height: 'auto' }}
                            draggable="false"
                            onClick={handleCanvasClick}
                        />

                        {/* 热力学常驻渲染（被找到的、或者是彻底失败抛底展现的） */}
                        {metaData?.map(item => {
                            const isFound = foundItems.includes(item.id);
                            if (!isFound && !showHints) return null; // 未找出的潜行状态

                            return (
                                <div
                                    key={item.id}
                                    className={`absolute border-[3px] transition-all duration-500 pointer-events-none 
                                      ${isFound ? 'border-emerald-500 bg-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.5)]' : 'border-red-500 border-dashed bg-red-500/20'}
                                      ${item.shape === 'circle' ? 'rounded-[50%]' : 'rounded-sm'}`}
                                    style={{
                                        left: `${item.rect.x * 100}%`, top: `${item.rect.y * 100}%`,
                                        width: `${item.rect.w * 100}%`, height: `${item.rect.h * 100}%`
                                    }}
                                >
                                    <div className={`absolute -top-7 left-0 px-2 py-1 text-xs text-white font-bold whitespace-nowrap rounded z-10 shadow ${isFound ? 'bg-emerald-600' : 'bg-red-600'}`}>
                                        [命中] 权重 {item.scoreWeight}
                                    </div>
                                </div>
                            );
                        })}

                        {/* 点刺瞬时波纹反馈 (Vibe) */}
                        {effectPoint && (
                            <div
                                className={`absolute w-12 h-12 -ml-6 -mt-6 rounded-full border-4 pointer-events-none animate-ping
                                   ${effectPoint.type === 'hit' ? 'border-emerald-400' : 'border-red-500'}`}
                                style={{
                                    left: `${effectPoint.x * 100}%`,
                                    top: `${effectPoint.y * 100}%`
                                }}
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* 右侧业务/法规展示面板 (Judge Panel) */}
            <div className="w-[350px] bg-gray-800 text-gray-200 p-6 flex flex-col">
                <div className="mb-6 pb-4 border-b border-gray-700">
                    <h2 className="text-xl font-bold flex items-center">
                        <Target className="w-5 h-5 mr-2 text-blue-400" />
                        第 {currentIndex + 1} 题
                        <span className="text-sm font-normal text-gray-500 ml-2">/ 共 {images.length} 题</span>
                    </h2>
                </div>

                {/* 即时线索分析流水线 */}
                <div className="flex-1 overflow-y-auto space-y-4">
                    {foundItems.length === 0 && !showHints && (
                        <div className="text-center text-gray-500 py-10">
                            <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-20" />
                            <p>请点击左侧现场图片<br />进行地毯式隐患排查...</p>
                        </div>
                    )}

                    {/* 命中推演栏 */}
                    {metaData?.map((item, idx) => {
                        const isFound = foundItems.includes(item.id);
                        if (!isFound && !showHints) return null; // Hide

                        const clauseDetail = clausesDict[item.clauseId];

                        return (
                            <div key={item.id} className={`p-3 rounded-lg border ${isFound ? 'border-emerald-500/50 bg-emerald-900/20' : 'border-red-500/50 bg-red-900/20'}`}>
                                <div className="flex justify-between items-start mb-2">
                                    <span className={`text-xs font-bold px-2 py-1 rounded ${isFound ? 'bg-emerald-800 text-emerald-100' : 'bg-red-800 text-red-100'}`}>
                                        {isFound ? `命中隐患 ${idx + 1}` : `遗漏盲盒 ${idx + 1}`}
                                    </span>
                                    <span className="text-xs text-gray-400">{item.scoreWeight} 学分</span>
                                </div>
                                <h4 className="text-sm font-semibold text-blue-300 mb-1">{clauseDetail ? clauseDetail.name : item.clauseId}</h4>
                                <p className="text-xs text-gray-400 leading-relaxed">
                                    {clauseDetail ? clauseDetail.content : '缺失法条同步'}
                                </p>
                            </div>
                        )
                    })}
                </div>

                {/* 过场底部控制器 */}
                <div className="mt-4 pt-4 border-t border-gray-700">
                    {showHints ? (
                        <div className="space-y-3">
                            {isAllFound ? (
                                <div className="bg-emerald-900/30 text-emerald-400 p-3 rounded text-sm text-center font-bold flex items-center justify-center">
                                    <CheckCircle2 className="w-5 h-5 mr-2" /> 通关！全部排查完毕
                                </div>
                            ) : (
                                <div className="bg-red-900/30 text-red-400 p-3 rounded text-sm text-center font-bold flex items-center justify-center">
                                    <AlertTriangle className="w-5 h-5 mr-2" /> 任务失败！请研读残留隐患
                                </div>
                            )}
                            <button onClick={handleNext} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg shadow-lg transition">
                                {currentIndex < images.length - 1 ? '进行下一场景' : '终结并提交考卷'}
                            </button>
                        </div>
                    ) : (
                        <div className="text-xs text-center text-gray-500 bg-gray-900 p-3 rounded border border-gray-700">
                            侦破此现场全部 {metaData?.length || 0} 处隐患后可前往下一关。
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
