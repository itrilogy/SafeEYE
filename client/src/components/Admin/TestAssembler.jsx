import React, { useState, useEffect } from 'react';
import { Layers, FilePlus2, Trash2 } from 'lucide-react';

export default function TestAssembler() {
    const [images, setImages] = useState([]);
    const [selectedImages, setSelectedImages] = useState([]);
    const [paperName, setPaperName] = useState("本月安全隐患排查测验");
    const [paperDesc, setPaperDesc] = useState("这是一场例行的安全测验，请仔细排查图中的所有隐患点。");

    useEffect(() => {
        fetchImages();
    }, []);

    const fetchImages = async () => {
        const res = await fetch('/api/assets');
        const data = await res.json();
        // 仅挑选已标注过的题库
        setImages((data.data || []).filter(img => img.isAnnotated));
    };

    const toggleSelect = (img) => {
        if (selectedImages.find(s => s.name === img.name)) {
            setSelectedImages(selectedImages.filter(s => s.name !== img.name));
        } else {
            setSelectedImages([...selectedImages, img]);
        }
    };

    const handlePublish = async () => {
        if (!paperName.trim()) {
            alert('请输入考卷明码名称！'); return;
        }
        if (selectedImages.length === 0) return;

        try {
            const payload = {
                examName: paperName.trim(),
                description: paperDesc.trim(),
                createdAt: Date.now(),
                slides: selectedImages.map(img => img.name)
            };

            const res = await fetch('/api/exams/publish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                alert(`组卷发行成功！共有 ${selectedImages.length} 处排查场景。用户端现在可以拉取最新考题。`);
                setSelectedImages([]); // 下发后清零
            } else {
                alert('试卷下发节点受阻');
            }
        } catch (err) {
            alert('网络传输错误');
        }
    };

    return (
        <div className="bg-white flex flex-col h-full border-r border-gray-200">
            <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
                <h2 className="text-lg font-bold flex items-center text-gray-800">
                    <Layers className="w-5 h-5 mr-2 text-blue-500" /> 组卷指挥官
                </h2>
            </div>

            <div className="p-4 flex-1 overflow-y-auto">
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">测试活动名称</label>
                    <input
                        className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                        value={paperName}
                        onChange={e => setPaperName(e.target.value)}
                    />
                </div>
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">试卷寄语/描述</label>
                    <textarea
                        className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 h-20 resize-none config-scrollbar"
                        value={paperDesc}
                        onChange={e => setPaperDesc(e.target.value)}
                    />
                </div>

                <div className="mb-2 flex justify-between items-end">
                    <span className="text-sm font-bold text-gray-600">从题库抽取考题照片 (共 {images.length} 份可用)</span>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">已选 {selectedImages.length} 题</span>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-6">
                    {images.map(img => {
                        const isSelected = !!selectedImages.find(s => s.name === img.name);
                        return (
                            <div
                                key={img.name}
                                onClick={() => toggleSelect(img)}
                                className={`border rounded p-2 text-sm cursor-pointer transition flex items-center justify-between
                                    ${isSelected ? 'border-blue-500 bg-blue-50/50 shadow-[0_0_0_2px_rgba(59,130,246,0.2)]' : 'hover:border-gray-400'}`}
                            >
                                <span className="truncate w-3/4">{img.name}</span>
                                {isSelected && <div className="w-3 h-3 bg-blue-500 rounded-full" />}
                            </div>
                        )
                    })}
                </div>
            </div>

            <div className="p-4 bg-gray-50 border-t mt-auto flex space-x-3">
                <button
                    disabled={selectedImages.length === 0}
                    onClick={handlePublish}
                    className="flex-1 bg-blue-600 disabled:bg-gray-400 text-white font-bold py-2 rounded shadow flex items-center justify-center transition"
                >
                    <FilePlus2 className="w-4 h-4 mr-2" /> 试卷发布
                </button>
            </div>
        </div>
    );
}
