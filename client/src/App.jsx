import React, { useState } from 'react';
import AnnotationEngine from './components/Admin/AnnotationEngine';
import TestAssembler from './components/Admin/TestAssembler';
import InteractionJudge from './components/User/InteractionJudge';
import ScoreKeeper from './components/User/ScoreKeeper';
import ExamManager from './components/Admin/ExamManager';
import DBInspector from './components/Admin/DBInspector';
import KnowledgeManager from './components/Admin/KnowledgeManager';
import { Fingerprint, ClipboardList, Zap, Database, ShieldCheck, BookOpen } from 'lucide-react';

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
                  onClick={() => setCurrentTab('knowledge')}
                  className={`flex items-center px-6 py-2 rounded-xl text-sm font-bold transition-all ${currentTab === 'knowledge' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                  <BookOpen className="w-4 h-4 mr-2" /> 知识管理
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

        {currentTab === 'knowledge' && (
          <div className="w-full flex-1 shadow-2xl rounded-xl overflow-hidden border border-gray-200 bg-white">
            <KnowledgeManager />
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md transition-opacity">
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden max-w-md w-full mx-4 relative transform transition-all scale-100 flex flex-col">
            <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 p-8 text-center relative border-b-4 border-indigo-400">
              <button
                onClick={() => setShowCopyright(false)}
                className="absolute top-4 right-4 text-white/70 hover:text-white bg-black/10 hover:bg-black/20 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
                title="关闭"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              <div className="w-20 h-20 bg-white/10 backdrop-blur-sm flex items-center justify-center rounded-2xl mx-auto mb-4 border border-white/20 shadow-inner">
                <ShieldCheck className="w-12 h-12 text-white" />
              </div>
              <h3 className="text-3xl font-black text-white tracking-tight mb-2">SafeSpot</h3>
              <p className="text-indigo-100 text-sm font-medium tracking-wide">基于“找不同”机制的交互式安全合规平台</p>
            </div>

            <div className="p-8 pb-6 text-sm text-gray-600 space-y-4">
              <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100/50">
                <h4 className="font-bold text-gray-900 mb-2 flex items-center"><Zap className="w-4 h-4 mr-2 text-indigo-500" /> 视觉交互体验</h4>
                <p className="leading-relaxed">SafeSpot 抛弃传统 PPT 阅读，通过实景重构、知识关联与找茬博弈，让安全风险识别成为直觉记忆。</p>
              </div>

              <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 flex items-start">
                <Database className="w-5 h-5 mr-3 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-amber-900 mb-1">本地优先与数据防护</h4>
                  <p className="text-amber-800/80 leading-relaxed">系统采用底层 SQLite 驱动，维持轻配置特性。所有原始图片与考卷记录均实现断网级物理本地隔离，守护隐私安全。</p>
                </div>
              </div>
            </div>

            <div className="px-8 pb-8 text-center">
              <div className="text-xs text-gray-400 border-t border-gray-100 pt-6 space-y-2">
                <p>Copyright © {new Date().getFullYear()} SafeSpot Engineering.</p>
                <div className="flex items-center justify-center space-x-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                  <p className="font-bold text-gray-700 text-sm tracking-widest">鹿溪联合创新实验室</p>
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                </div>
                <p className="text-[10px] text-gray-300 uppercase tracking-widest mt-2 font-mono">Vibe Coding Philosophy</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
