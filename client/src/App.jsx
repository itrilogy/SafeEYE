import React, { useState } from 'react';
import AnnotationEngine from './components/Admin/AnnotationEngine';
import TestAssembler from './components/Admin/TestAssembler';
import InteractionJudge from './components/User/InteractionJudge';
import ScoreKeeper from './components/User/ScoreKeeper';
import ExamManager from './components/Admin/ExamManager';
import DBInspector from './components/Admin/DBInspector';
import { Fingerprint, ClipboardList, Zap, Database } from 'lucide-react';

function App() {
  const [currentTab, setCurrentTab] = useState('annotation');
  const [activeExamId, setActiveExamId] = useState(null);
  const [autoStartExamId, setAutoStartExamId] = useState(null);

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
              <div className="flex-shrink-0 flex items-center">
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
            <div className="w-1/2 border-r border-gray-200">
              <TestAssembler />
            </div>
            <div className="w-1/2">
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
    </div>
  );
}

export default App;
