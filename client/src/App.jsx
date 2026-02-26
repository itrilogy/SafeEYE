import React, { useState } from 'react';
import AnnotationEngine from './components/Admin/AnnotationEngine';
import TestAssembler from './components/Admin/TestAssembler';
import InteractionJudge from './components/User/InteractionJudge';
import ScoreKeeper from './components/User/ScoreKeeper';
import ExamManager from './components/Admin/ExamManager';
import DBInspector from './components/Admin/DBInspector';
import { Fingerprint, ClipboardList, Zap, Database, ShieldCheck } from 'lucide-react';

function App() {
  const [currentTab, setCurrentTab] = useState('annotation');
  const [activeExamId, setActiveExamId] = useState(null);
  const [autoStartExamId, setAutoStartExamId] = useState(null);
  const [showCopyright, setShowCopyright] = useState(false);

  const jumpToTest = (examId) => {
    setAutoStartExamId(examId);
    setCurrentTab('test');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-800">
      {/* 顶部导航条 */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div
                className="flex-shrink-0 flex items-center cursor-pointer hover:opacity-80 transition"
                onClick={() => setShowCopyright(true)}
                title="点击查看版权信息"
              >
                <ShieldCheck className="w-8 h-8 mr-2 text-indigo-600" />
                <span className="text-2xl font-black text-indigo-600 tracking-tighter">SafeSpot<span className="text-gray-900">.</span></span>
              </div>
              <div className="hidden sm:ml-8 sm:flex sm:space-x-8">
                <button
                  onClick={() => setCurrentTab('annotation')}
                  className={`flex items-center px-6 py-2 rounded-xl text-sm font-bold transition-all ${currentTab === 'annotation' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                  <Fingerprint className="w-4 h-4 mr-2" /> 指纹标注
                </button>
                <button
                  onClick={() => setCurrentTab('exams')}
                  className={`flex items-center px-6 py-2 rounded-xl text-sm font-bold transition-all ${currentTab === 'exams' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                  <ClipboardList className="w-4 h-4 mr-2" /> 组卷发行
                </button>
                <button
                  onClick={() => setCurrentTab('test')}
                  className={`flex items-center px-6 py-2 rounded-xl text-sm font-bold transition-all ${currentTab === 'test' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                  <Zap className="w-4 h-4 mr-2" /> 大决战
                </button>

                <div className="w-px h-6 bg-gray-200 mx-2"></div>

                <button
                  onClick={() => setCurrentTab('inspector')}
                  className={`flex items-center px-6 py-2 rounded-xl text-sm font-bold transition-all ${currentTab === 'inspector' ? 'bg-amber-600 text-white shadow-lg shadow-amber-200' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                  <Database className="w-4 h-4 mr-2" /> 数据对账
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 主工作区路由分发 */}
      <main className="flex-1 w-full mx-auto p-4 sm:p-6 flex flex-col h-[calc(100vh-4rem)]">
        {currentTab === 'annotation' && (
          <div className="w-full flex-1 bg-white shadow-xl rounded-xl overflow-hidden border border-gray-200">
            <AnnotationEngine />
          </div>
        )}

        {currentTab === 'exams' && (
          <div className="w-full flex-1 flex bg-white shadow-xl rounded-xl overflow-hidden border border-gray-200">
            <div className="flex-1 border-r border-gray-200">
              <TestAssembler />
            </div>
            <div className="w-[350px] bg-gray-50">
              <ExamManager onEnterExam={jumpToTest} />
            </div>
          </div>
        )}

        {currentTab === 'test' && (
          <div className="w-full flex-1 flex gap-4">
            <div className="flex-1 shadow-2xl rounded-xl overflow-hidden border border-gray-800 bg-gray-950 flex flex-col">
              <InteractionJudge
                onExamStart={setActiveExamId}
                onExamChange={setActiveExamId}
                autoStartExamId={autoStartExamId}
                onAutoStartConsumed={() => setAutoStartExamId(null)}
              />
            </div>
            {/* 这里的宽与 InteractionJudge 内部右侧面板保持 350px 一致 */}
            <div className="w-[350px] shadow-2xl rounded-xl overflow-hidden border border-gray-800 bg-gray-900">
              <ScoreKeeper activeExamId={activeExamId} />
            </div>
          </div>
        )}

        {currentTab === 'inspector' && (
          <div className="w-full flex-1 shadow-2xl rounded-xl overflow-hidden border border-gray-200 bg-white">
            <DBInspector />
          </div>
        )}
      </main>

      {/* 版权信息 Modal */}
      {showCopyright && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 relative transform transition-all scale-100">
            <button onClick={() => setShowCopyright(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-full w-8 h-8 flex items-center justify-center transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div className="text-center pt-2">
              <div className="w-16 h-16 bg-indigo-50 flex items-center justify-center rounded-2xl mx-auto mb-4">
                <ShieldCheck className="w-10 h-10 text-indigo-600" />
              </div>
              <h3 className="text-xl font-black text-gray-900 mb-2">SafeSpot<span className="text-indigo-600">.</span></h3>
              <p className="text-sm text-gray-500 mb-6 px-4">下一代防爆测勘与全场景隐患排查沙盘模拟系统</p>
              <div className="text-xs text-gray-400 border-t border-gray-100 pt-5 space-y-1">
                <p>版权所有 © {new Date().getFullYear()}</p>
                <p className="font-bold text-gray-600 text-sm">鹿溪联合创新实验室</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
