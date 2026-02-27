import React, { useState, useRef, useEffect } from 'react';
import { MousePointer2, Save, X, Square, Circle, Scaling, Trash2 } from 'lucide-react';

export default function AnnotationEngine() {
    const [images, setImages] = useState([]);
    const [activeImage, setActiveImage] = useState(null);
    const [annotations, setAnnotations] = useState([]);
    const [hoveredAnnoId, setHoveredAnnoId] = useState(null);

    const [isDrawing, setIsDrawing] = useState(false);
    const [drawMode, setDrawMode] = useState('rect'); // 'rect' | 'circle'
    const [startPos, setStartPos] = useState(null);
    const [currentRect, setCurrentRect] = useState(null);
    const imageRef = useRef(null);
    const fileInputRef = useRef(null);

    // 缩放调整状态
    const [resizingId, setResizingId] = useState(null);
    const [resizeStart, setResizeStart] = useState(null);

    // 图元整块拖拽移动状态
    const [movingId, setMovingId] = useState(null);
    const [moveStart, setMoveStart] = useState(null);

    // 过滤与搜索状态
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'annotated', 'unannotated'
    const [filterScene, setFilterScene] = useState('all');

    // UI 提示与反馈状态 (取代会闪烁的原生 alert/confirm)
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
    const [confirmBox, setConfirmBox] = useState({ show: false, title: '', message: '', onConfirm: null });

    const showToast = (message, type = 'success') => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
    };

    const handleUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            alert('只能上传图片文件！');
            return;
        }

        const formData = new FormData();
        formData.append('image', file);

        try {
            const res = await fetch('/api/assets/upload', {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                await fetchImages();
            } else {
                const err = await res.json();
                alert(`上传失败: ${err.error || '未知错误'}`);
            }
        } catch (error) {
            console.error('文件上传异常:', error);
            showToast('本地服务器未响应或跨域被拦截！', 'error');
        } finally {
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    // 模态框状态
    const [showModal, setShowModal] = useState(false);
    const [pendingAnnotation, setPendingAnnotation] = useState(null);

    // 级联字典树状态
    const [knowledgeTree, setKnowledgeTree] = useState([]);
    const [selectedGlobalScene, setSelectedGlobalScene] = useState('');

    const [mScene, setMScene] = useState('');
    const [mType, setMType] = useState('');
    const [mItem, setMItem] = useState('');

    // 计算派生数据以支持渲染
    const currentSceneData = knowledgeTree.find(k => k.scene === mScene);
    const currentTypeData = currentSceneData?.types.find(t => t.typeName === mType);
    const currentItemData = currentTypeData?.items.find(i => i.id === mItem);

    const [riskDict, setRiskDict] = useState([]);

    useEffect(() => {
        fetchImages();
        fetchKnowledge();
        fetchRiskDict();
    }, []);

    const fetchRiskDict = async () => {
        try {
            const res = await fetch('/api/admin/risk/dict');
            if (res.ok) {
                const data = await res.json();
                setRiskDict(data);
            }
        } catch (e) { console.error('加载字典失败', e); }
    };

    const fetchImages = async () => {
        const res = await fetch('/api/assets');
        const data = await res.json();
        setImages(data.data || []);
    };

    const fetchKnowledge = async () => {
        const res = await fetch('/api/knowledge');
        const data = await res.json();
        setKnowledgeTree(data.knowledgeTree || []);
        if (data.knowledgeTree && data.knowledgeTree.length > 0) {
            setSelectedGlobalScene(data.knowledgeTree[0].scene);
        }
    };

    const loadMeta = async (imgId) => {
        const res = await fetch(`/api/assets/meta/${imgId}`);
        const data = await res.json();
        setAnnotations(data.meta.items || []);
        if (data.meta.sceneId) setSelectedGlobalScene(data.meta.sceneId);
    };

    const selectImage = (img) => {
        setActiveImage(img);
        loadMeta(img.name);
    };

    const getRatioPos = (e) => {
        if (!imageRef.current) return null;
        const rect = imageRef.current.getBoundingClientRect();
        const xClick = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const yClick = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

        return {
            xRatio: xClick / rect.width,
            yRatio: yClick / rect.height
        };
    };

    const handleMouseDown = (e) => {
        if (!activeImage || showModal) return;
        if (e.button !== 0) return; // 仅左键

        e.preventDefault();
        const pos = getRatioPos(e);
        if (!pos) return;

        setIsDrawing(true);
        setStartPos(pos);
        setCurrentRect({ x: pos.xRatio, y: pos.yRatio, w: 0, h: 0 });
    };

    const handleMouseMove = (e) => {
        const pos = getRatioPos(e);
        if (!pos) return;

        // 处理调整已有锚框大小
        if (resizingId && resizeStart) {
            setAnnotations(prev => prev.map(a => {
                if (a.id === resizingId) {
                    const dx = pos.xRatio - resizeStart.xRatio;
                    const dy = pos.yRatio - resizeStart.yRatio;
                    setResizeStart(pos);

                    let newW = Math.max(0.01, a.rect.w + dx);
                    let newH = Math.max(0.01, a.rect.h + dy);

                    // 如果按下了 Shift/Ctrl 键，强制等比例缩放（正圆/正方形）
                    if (e.shiftKey || e.ctrlKey || e.metaKey) {
                        if (imageRef.current) {
                            const rect = imageRef.current.getBoundingClientRect();
                            const pixelW = newW * rect.width;
                            const pixelH = newH * rect.height;
                            const size = Math.max(pixelW, pixelH); // 以较大的拖拽跨度为边长
                            newW = size / rect.width;
                            newH = size / rect.height;
                        }
                    }

                    return {
                        ...a,
                        rect: {
                            x: a.rect.x,
                            y: a.rect.y,
                            w: newW,
                            h: newH
                        }
                    };
                }
                return a;
            }));
            return;
        }

        // 处理整块拖拽移动图元
        if (movingId && moveStart) {
            const dx = pos.xRatio - moveStart.xRatio;
            const dy = pos.yRatio - moveStart.yRatio;
            setMoveStart(pos);
            setAnnotations(prev => prev.map(a => {
                if (a.id === movingId) {
                    return {
                        ...a,
                        rect: {
                            ...a.rect,
                            x: Math.max(0, Math.min(1 - a.rect.w, a.rect.x + dx)),
                            y: Math.max(0, Math.min(1 - a.rect.h, a.rect.y + dy))
                        }
                    };
                }
                return a;
            }));
            return;
        }

        // 处理新建拖拽绘制
        if (!isDrawing || !startPos) return;

        let x = Math.min(startPos.xRatio, pos.xRatio);
        let y = Math.min(startPos.yRatio, pos.yRatio);
        let w = Math.abs(pos.xRatio - startPos.xRatio);
        let h = Math.abs(pos.yRatio - startPos.yRatio);

        // 如果按下了 Shift/Ctrl 键，强制绘制正圆/正方形
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
            if (imageRef.current) {
                const rect = imageRef.current.getBoundingClientRect();
                const pixelW = w * rect.width;
                const pixelH = h * rect.height;
                const size = Math.max(pixelW, pixelH); // 以拖拽绝对距离更长的一边为边长

                w = size / rect.width;
                h = size / rect.height;

                // 为了防止等比拉伸后坐标越界，如果是反方向拖动（向左或向上），重新计算真正的原点
                x = pos.xRatio < startPos.xRatio ? startPos.xRatio - w : startPos.xRatio;
                y = pos.yRatio < startPos.yRatio ? startPos.yRatio - h : startPos.yRatio;
            }
        }

        setCurrentRect({ x, y, w, h });
    };

    const handleMouseUp = (e) => {
        if (resizingId) {
            setResizingId(null);
            setResizeStart(null);
            return; // 完成调整大小，不触发画框结算
        }
        if (movingId) {
            setMovingId(null);
            setMoveStart(null);
            return; // 结束移动
        }

        if (!isDrawing) return;
        setIsDrawing(false);

        // 如果拖了个有意义的框就弹窗
        if (currentRect && currentRect.w > 0.02 && currentRect.h > 0.02) {
            setPendingAnnotation({
                id: `anno-${Date.now()}`,
                rect: currentRect,
                shape: drawMode, // 记录类型，方或圆
                clauseId: '',
                description: '',
                scoreWeight: '' // 初始为空，由用户选择或输入
            });
            // 模态框级联字典重置为空，强制用户主动下拉选择
            setMScene('');
            setMType('');
            setMItem(''); // 等待用户选择最终节点
            setShowModal(true);
        }
        setCurrentRect(null);
    };

    const saveMeta = async () => {
        if (!activeImage) return;

        const payload = {
            sceneId: selectedGlobalScene,
            items: annotations
        };

        const res = await fetch(`/api/assets/meta/${activeImage.name}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            showToast('保存标注成功');
            fetchImages();
        } else {
            showToast('保存失败', 'error');
        }
    };

    const deleteAsset = async () => {
        if (!activeImage) return;

        setConfirmBox({
            show: true,
            title: '确认销毁案例',
            message: '警告：是否确定永久删除该案件资产及它关联的所有隐患红线？删除后数据无法恢复！',
            onConfirm: async () => {
                try {
                    const res = await fetch(`/api/assets/${activeImage.name}`, { method: 'DELETE' });
                    if (res.ok) {
                        setActiveImage(null);
                        setAnnotations([]);
                        fetchImages();
                        showToast('案例已永久销毁');
                    } else {
                        showToast('删除失败，服务器异常', 'error');
                    }
                } catch (e) {
                    console.error(e);
                    showToast('网络传输错误', 'error');
                }
                setConfirmBox({ ...confirmBox, show: false });
            }
        });
    };

    // 级联变更处理
    const onMSceneChange = (val) => {
        setMScene(val);
        const scene = knowledgeTree.find(k => k.scene === val);
        if (scene && scene.types.length > 0) {
            setMType(scene.types[0].typeName);
            const type = scene.types[0];
            if (type && type.items.length > 0) {
                // 不自动选第一个 item，强制用户下拉
                setMItem('');
            }
        } else {
            setMType('');
            setMItem('');
        }
    };

    const onMTypeChange = (val) => {
        setMType(val);
        setMItem(''); // 重置第三级
    };

    const handleItemChange = (itemId) => {
        setMItem(itemId);
        const itemObj = currentTypeData?.items.find(i => i.id === itemId);
        if (itemObj && pendingAnnotation) {
            setPendingAnnotation({
                ...pendingAnnotation,
                clauseId: itemObj.id,
                description: itemObj.desc,
                scoreWeight: itemObj.weight || '' // 切换时填入权重，但允许为空
            });
        }
    };

    // 建立深度映射字典 (用于支持四级检索与全量展示)
    const clauseMap = React.useMemo(() => {
        const map = {};
        knowledgeTree.forEach(sceneNode => {
            sceneNode.types.forEach(typeNode => {
                typeNode.items.forEach(item => {
                    map[item.id] = {
                        scene: sceneNode.scene,
                        type: typeNode.typeName,
                        desc: item.desc,
                        clause: item.clause,
                        likelihood_level: item.likelihood_level,
                        consequence_level: item.consequence_level
                    };
                });
            });
        });
        return map;
    }, [knowledgeTree]);

    const getRiskLabel = (lId, cId) => {
        const lName = riskDict.find(d => d.id === lId)?.level_name || '未评级';
        const cName = riskDict.find(d => d.id === cId)?.level_name || '未评级';
        return `${lName} × ${cName}`;
    };

    const filteredImages = images.filter(img => {
        // 构建全维度检索引擎文本池
        let totalText = img.name.toLowerCase();
        if (img.isAnnotated && img.meta?.items?.length > 0) {
            const annoTexts = img.meta.items.map(anno => {
                const data = clauseMap[anno.clauseId];
                return data ? `${data.scene} ${data.type} ${data.desc} ${data.clause}`.toLowerCase() : '';
            });
            totalText += ' ' + annoTexts.join(' ');
        }

        // 支持空格分割的多关键词并集(AND)模糊联查
        const keywords = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
        const matchQuery = keywords.every(kw => totalText.includes(kw));

        const matchStatus = filterStatus === 'all' ||
            (filterStatus === 'annotated' && img.isAnnotated) ||
            (filterStatus === 'unannotated' && !img.isAnnotated);

        let matchScene = true;
        if (filterScene !== 'all') {
            if (img.isAnnotated && img.meta?.items?.length > 0) {
                matchScene = img.meta.items.some(anno => clauseMap[anno.clauseId]?.scene === filterScene);
            } else {
                matchScene = false;
            }
        }

        return matchQuery && matchStatus && matchScene;
    });

    return (
        <div className="flex h-[calc(100vh-64px)] bg-gray-50 overflow-hidden" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
            {/* 左侧资源大厅 */}
            <div className="w-80 bg-white border-r border-gray-200 p-4 flex flex-col h-full flex-shrink-0">
                <h3 className="text-lg font-bold mb-4 flex items-center justify-between">
                    <span>案例库</span>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleUpload}
                        className="hidden"
                        accept="image/png, image/jpeg, image/webp"
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1 bg-blue-100 text-blue-600 text-sm font-semibold rounded hover:bg-blue-200 transition"
                    >
                        上传
                    </button>
                </h3>

                {/* 搜索与状态过滤器 */}
                <div className="mb-4 space-y-2">
                    <input
                        type="text"
                        placeholder="输入关键字检索..."
                        className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                    <div className="flex space-x-2">
                        <select
                            className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                            value={filterScene}
                            onChange={e => setFilterScene(e.target.value)}
                        >
                            <option value="all">全业务场景</option>
                            {knowledgeTree.map(k => (
                                <option key={k.scene} value={k.scene}>{k.scene}</option>
                            ))}
                        </select>
                        <select
                            className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                            value={filterStatus}
                            onChange={e => setFilterStatus(e.target.value)}
                        >
                            <option value="all">所有状态</option>
                            <option value="annotated">🟢 已排查</option>
                            <option value="unannotated">⚪️ 未排查</option>
                        </select>
                    </div>
                </div>

                <div className="overflow-y-auto space-y-2 flex-grow pr-2 config-scrollbar">
                    {filteredImages.map(img => (
                        <div
                            key={img.name}
                            onClick={() => selectImage(img)}
                            className={`p-3 rounded border cursor-pointer transition ${activeImage?.name === img.name ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500 shadow-sm' : 'border-gray-200 hover:border-blue-300 bg-white'}`}
                        >
                            <div className="flex flex-col space-y-1">
                                <span className="font-semibold text-sm truncate text-gray-800" title={img.name}>{img.name}</span>
                                <div>
                                    {img.isAnnotated ?
                                        <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded">✔ 已记录指纹</span> :
                                        <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded">待排雷</span>
                                    }
                                </div>
                            </div>
                        </div>
                    ))}
                    {filteredImages.length === 0 && <div className="text-sm text-gray-400 text-center py-6">无匹配资产...</div>}
                </div>
            </div>

            {/* 右侧核心引擎工作区 */}
            <div className="flex-1 p-6 flex flex-col relative h-full">
                {/* 顶栏控制台 */}
                <div className="flex justify-between items-center mb-4 bg-white p-4 rounded-lg shadow-sm">
                    <div className="flex items-center space-x-4">
                        <h2 className="text-xl font-bold flex items-center">
                            <MousePointer2 className="w-5 h-5 mr-2 text-indigo-500" /> 标注引擎
                        </h2>

                        {/* 画笔容器 */}
                        {activeImage && (
                            <div className="flex items-center space-x-2 bg-gray-100 p-1 rounded-lg ml-6">
                                <button onClick={() => setDrawMode('rect')} className={`p-2 rounded transition ${drawMode === 'rect' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:bg-gray-200'}`} title="矩形标注">
                                    <Square className="w-4 h-4" />
                                </button>
                                <button onClick={() => setDrawMode('circle')} className={`p-2 rounded transition ${drawMode === 'circle' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:bg-gray-200'}`} title="圆形/椭圆标注">
                                    <Circle className="w-4 h-4" />
                                </button>
                            </div>
                        )}

                        {/* 场景下拉栏已被移除，支持纯碎的画框打点 */}
                    </div>
                    {activeImage && (
                        <div className="flex space-x-3">
                            <button
                                onClick={deleteAsset}
                                className="bg-red-50 text-red-600 px-4 py-2 rounded shadow-sm hover:bg-red-100 flex items-center text-sm font-semibold transition border border-red-200"
                            >
                                <Trash2 className="w-4 h-4 mr-2" />
                                销毁案例
                            </button>
                            <button
                                onClick={saveMeta}
                                className="bg-indigo-600 text-white px-5 py-2 rounded shadow hover:bg-indigo-700 flex items-center text-sm font-semibold transition"
                            >
                                <Save className="w-4 h-4 mr-2" />
                                保存标注
                            </button>
                        </div>
                    )}
                </div>

                {/* 核心视椎体：绝对坐标锁死 */}
                <div className="flex-1 bg-gray-900 rounded-lg shadow-inner flex items-center justify-center p-4 relative overflow-hidden select-none">
                    {!activeImage ? (
                        <div className="text-gray-400 text-center">
                            <div className="text-4xl mb-2">🎯</div>
                            从左侧选择需要隐患打点的工程快照...
                        </div>
                    ) : (
                        <div className="relative flex items-center justify-center w-full h-full overflow-hidden">
                            <div className="relative inline-block shadow-2xl" style={{ maxWidth: '100%', maxHeight: '100%' }}>
                                <img
                                    ref={imageRef}
                                    src={activeImage.url}
                                    alt="工作区抓拍"
                                    className="block select-none cursor-crosshair pointer-events-auto"
                                    style={{ maxWidth: '100%', maxHeight: 'calc(100vh - 220px)', width: 'auto', height: 'auto' }}
                                    draggable="false"
                                    onMouseDown={handleMouseDown}
                                // mouseMove and Up handled at top root wrapper
                                />

                                {/* 已生成的坐标覆盖层 */}
                                {annotations.map((anno, idx) => (
                                    <div
                                        key={anno.id}
                                        className={`absolute group pointer-events-auto ${hoveredAnnoId === anno.id ? 'z-30' : 'z-10'}`}
                                        style={{
                                            left: `${anno.rect.x * 100}%`,
                                            top: `${anno.rect.y * 100}%`,
                                            width: `${anno.rect.w * 100}%`,
                                            height: `${anno.rect.h * 100}%`
                                        }}
                                        onMouseEnter={() => setHoveredAnnoId(anno.id)}
                                        onMouseLeave={() => setHoveredAnnoId(null)}
                                        // 拦截在图形上的点击，防止触发底图的新建画框并触发拖拽
                                        onMouseDown={(e) => {
                                            e.stopPropagation();
                                            if (e.button === 0) {
                                                setMovingId(anno.id);
                                                setMoveStart(getRatioPos(e));
                                            }
                                        }}
                                    >
                                        {/* 真实视觉渲染层：将形态剥离在内部，使得外部方形包围盒始终能包裹住按钮 */}
                                        <div className={`w-full h-full border-[3px] transition-all pointer-events-none
                                            ${hoveredAnnoId === anno.id ? 'border-red-400 bg-red-400/40 shadow-[0_0_15px_rgba(239,68,68,0.6)]' : 'border-red-500 bg-red-500/20 group-hover:bg-red-500/30 group-hover:border-red-400'}
                                            ${anno.shape === 'circle' ? 'rounded-[50%]' : 'rounded-sm'}`}
                                        />

                                        {/* 底部悬浮标签文本 (隐患 #1) */}
                                        <div className={`absolute -bottom-6 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded shadow-sm text-[10px] font-bold whitespace-nowrap pointer-events-none transition-colors
                                            ${hoveredAnnoId === anno.id ? 'bg-red-500 text-white shadow-md scale-110 z-20' : 'bg-red-600/90 text-white/90 z-10'}`}>
                                            隐患 #{idx + 1}
                                        </div>

                                        {/* 右上角删除靶标 */}
                                        <button
                                            type="button"
                                            className="absolute -top-3 -right-3 bg-white text-red-600 rounded-full border border-red-200 hidden group-hover:block hover:scale-110 shadow-lg z-30 p-0.5 cursor-pointer"
                                            onMouseDown={(e) => {
                                                e.stopPropagation();
                                                setAnnotations(prev => prev.filter(a => a.id !== anno.id));
                                            }}
                                        >
                                            <X className="w-5 h-5" />
                                        </button>

                                        {/* 右下角拖拉缩放触点热区 */}
                                        <div
                                            className={`absolute -bottom-2 -right-2 w-6 h-6 bg-white border-2 border-red-500 cursor-nwse-resize shadow hidden group-hover:flex items-center justify-center hover:bg-red-100 transition-transform ${anno.shape === 'circle' ? 'rounded-full' : 'rounded-sm'} z-30`}
                                            onMouseDown={(e) => {
                                                e.stopPropagation();
                                                e.preventDefault();
                                                setResizingId(anno.id);
                                                setResizeStart(getRatioPos(e));
                                            }}
                                        >
                                            <Scaling className="w-4 h-4 text-red-600" />
                                        </div>
                                    </div>
                                ))}

                                {/* 当前绘制中的阴影 */}
                                {isDrawing && currentRect && (
                                    <div
                                        className={`absolute border-2 border-dashed border-yellow-400 bg-yellow-400/20 pointer-events-none ${drawMode === 'circle' ? 'rounded-[50%]' : ''}`}
                                        style={{
                                            left: `${currentRect.x * 100}%`,
                                            top: `${currentRect.y * 100}%`,
                                            width: `${currentRect.w * 100}%`,
                                            height: `${currentRect.h * 100}%`
                                        }}
                                    />
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* 右侧隐患清单边栏 */}
            {activeImage && (
                <div className="w-80 bg-white border-l border-gray-200 p-4 flex flex-col h-full flex-shrink-0">
                    <h3 className="text-base font-bold text-gray-800 mb-4 pb-2 border-b">发现红线隐患 ({annotations.length})</h3>
                    <div className="overflow-y-auto space-y-3 flex-1 config-scrollbar">
                        {annotations.length === 0 ? (
                            <div className="text-xs text-gray-400 text-center mt-10">该巡检图暂无发现扣分项</div>
                        ) : (
                            annotations.map((anno, idx) => {
                                return (
                                    <div
                                        key={anno.id}
                                        className={`p-3 border rounded-lg group transition-colors cursor-pointer
                                            ${hoveredAnnoId === anno.id ? 'bg-red-100 border-red-400 shadow-md ring-2 ring-red-200' : 'bg-red-50 border-red-100 hover:border-red-300'}
                                        `}
                                        onMouseEnter={() => setHoveredAnnoId(anno.id)}
                                        onMouseLeave={() => setHoveredAnnoId(null)}
                                    >
                                        <div className="flex justify-between items-start mb-1">
                                            <span className={`text-xs font-black px-1.5 rounded transition-colors ${hoveredAnnoId === anno.id ? 'bg-red-500 text-white' : 'text-red-700 bg-red-100'}`}>隐患 #{idx + 1}</span>
                                            <span className="text-xs font-bold text-gray-500">权重: {anno.scoreWeight}</span>
                                        </div>
                                        <p className="text-sm font-semibold text-gray-800 mt-1 mb-1 leading-relaxed whitespace-pre-wrap">
                                            {anno.description || "未记录详细说明"}
                                        </p>
                                        <div className="text-[10px] text-gray-500 font-mono mt-2 pt-2 border-t border-red-100/50 space-y-1.5">
                                            <div><span className="text-red-400 font-bold">1. 场景:</span> {clauseMap[anno.clauseId]?.scene || '未知'}</div>
                                            <div><span className="text-red-400 font-bold">2. 大类:</span> {clauseMap[anno.clauseId]?.type || '未知'}</div>
                                            <div><span className="text-red-400 font-bold">3. 定性:</span> {clauseMap[anno.clauseId]?.desc || '未知'}</div>
                                            <div><span className="text-red-400 font-bold">4. 风险:</span> {getRiskLabel(clauseMap[anno.clauseId]?.likelihood_level, clauseMap[anno.clauseId]?.consequence_level)}</div>
                                            <div className="leading-relaxed"><span className="text-red-400 font-bold">5. 法则:</span> {clauseMap[anno.clauseId]?.clause || anno.clauseId}</div>
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>
            )}

            {/* 四级联动机关：隐患指纹模态框 */}
            {showModal && pendingAnnotation && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-[550px] transform transition-all">
                        <h3 className="text-xl font-bold mb-5 border-b pb-3 flex items-center">
                            <span className="w-3 h-3 rounded-full bg-red-500 mr-2 shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span>
                            定义隐患指纹
                        </h3>

                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">1. 业务场景分类</label>
                                    <select className="w-full border-gray-300 border rounded-lg p-2 bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none" value={mScene} onChange={e => onMSceneChange(e.target.value)}>
                                        <option value="" disabled>-- 请选择业务场景 --</option>
                                        {knowledgeTree.map(k => <option key={k.scene} value={k.scene}>{k.scene}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">2. 隐患问题大类</label>
                                    <select className="w-full border-gray-300 border rounded-lg p-2 bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none" value={mType} onChange={e => onMTypeChange(e.target.value)}>
                                        <option value="" disabled>-- 请选择隐患大类 --</option>
                                        {currentSceneData?.types.map(t => <option key={t.typeName} value={t.typeName}>{t.typeName}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">3. 具体特征或隐患说明 (定性)</label>
                                <select className="w-full border-gray-300 border-2 rounded-lg p-2 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={mItem} onChange={e => handleItemChange(e.target.value)}>
                                    <option value="" disabled>-- 请下拉选择符合该图元的隐患现象 --</option>
                                    {currentTypeData?.items.map(i => <option key={i.id} value={i.id}>{i.desc}</option>)}
                                </select>
                            </div>

                            <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                                <label className="block text-sm font-medium text-blue-800 mb-1">4. 强绑定的底线法规/条款</label>
                                <p className="text-sm text-blue-600 leading-relaxed font-mono">
                                    {currentItemData?.clause || '需先在上一步选择现象说明，系统自动匹配对应的法规红线...'}
                                </p>
                            </div>

                            <div className="bg-amber-50 p-4 rounded-lg border border-amber-100 flex flex-col space-y-3">
                                <label className="block text-sm font-medium text-amber-800">5. 风险动态评价 & 扣分定义</label>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-6">
                                        <div className="text-xs">
                                            <span className="text-gray-400 mr-1 italic">发生概率:</span>
                                            <span className="font-bold text-gray-700">{riskDict.find(d => d.id === currentItemData?.likelihood_level)?.level_name || '--'}</span>
                                        </div>
                                        <div className="text-xs">
                                            <span className="text-gray-400 mr-1 italic">后果严重:</span>
                                            <span className="font-bold text-gray-700">{riskDict.find(d => d.id === currentItemData?.consequence_level)?.level_name || '--'}</span>
                                        </div>
                                        <div className="text-[10px] text-amber-600 font-medium">
                                            (默认权重: <span className="font-black underline">{currentItemData?.weight || '--'}</span>)
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-3">
                                        <label className="text-sm text-amber-700 font-bold whitespace-nowrap">实际扣分权重</label>
                                        <input
                                            type="number"
                                            className="w-20 border-amber-200 border-2 rounded-lg px-2 py-1.5 text-sm font-black text-amber-900 focus:ring-2 focus:ring-amber-500 outline-none bg-white"
                                            value={pendingAnnotation.scoreWeight}
                                            onChange={(e) => setPendingAnnotation({ ...pendingAnnotation, scoreWeight: e.target.value === '' ? '' : parseInt(e.target.value) || 0 })}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end space-x-3 pt-4 border-t border-gray-100">
                            <button
                                onClick={() => { setShowModal(false); setPendingAnnotation(null); }}
                                className="px-5 py-2 text-gray-500 hover:bg-gray-100 rounded-lg transition font-medium"
                            >
                                废弃判定
                            </button>
                            <button
                                onClick={() => {
                                    if (!pendingAnnotation.clauseId) {
                                        showToast("缔结指纹失败：必须要指定具体的隐患类型并关联法条！", "error"); return;
                                    }
                                    setAnnotations([...annotations, pendingAnnotation]);
                                    setShowModal(false);
                                    setPendingAnnotation(null);
                                }}
                                className={`px-5 py-2 rounded-lg transition font-bold shadow-md ${!pendingAnnotation.clauseId ? 'bg-indigo-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-lg'}`}
                            >
                                缔结印记
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast 提示浮层 */}
            {toast.show && (
                <div className={`fixed bottom-10 left-1/2 transform -translate-x-1/2 z-[100] px-6 py-3 rounded-full shadow-2xl animate-in slide-in-from-bottom duration-300 flex items-center space-x-2 border
                    ${toast.type === 'success' ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-red-500 text-white border-red-400'}`}>
                    <span className="text-sm font-black tracking-wide">{toast.message}</span>
                </div>
            )}

            {/* 自定义确认模态框 */}
            {confirmBox.show && (
                <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center backdrop-blur-md p-4">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in duration-200">
                        <div className="p-8 text-center">
                            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Trash2 className="w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-black text-gray-900 mb-2">{confirmBox.title}</h3>
                            <p className="text-sm text-gray-500 leading-relaxed">{confirmBox.message}</p>
                        </div>
                        <div className="flex border-t border-gray-100">
                            <button
                                onClick={() => setConfirmBox({ ...confirmBox, show: false })}
                                className="flex-1 py-4 text-sm font-bold text-gray-400 hover:bg-gray-50 transition border-r border-gray-100"
                            >
                                取消
                            </button>
                            <button
                                onClick={confirmBox.onConfirm}
                                className="flex-1 py-4 text-sm font-black text-red-500 hover:bg-red-50 transition"
                            >
                                确认销毁
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
