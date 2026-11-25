import { AnalysisPage } from './pages/AnalysisPage';
import { CodexPage } from './pages/CodexPage';
import { LevelsPage } from './pages/LevelsPage';
import { Workbench } from './pages/Workbench';
import { actions, useAppState, type Route } from './game/store';

const NAV: { id: Route; label: string; icon: string }[] = [
  { id: 'workbench', label: '工作台', icon: '🛠' },
  { id: 'analysis', label: '轮系分析', icon: '📐' },
  { id: 'levels', label: '关卡选择', icon: '🗺' },
  { id: 'codex', label: '钟表图鉴', icon: '📖' },
];

export function App() {
  const route = useAppState((s) => s.route);
  const completedCount = useAppState((s) => Object.keys(s.progress.completed).length);

  return (
    <div className="app-shell">
      <aside className="side-nav">
        <div className="brand" onClick={() => actions.navigate('levels')} role="button" tabIndex={0}>
          <div className="brand-mark">⏲</div>
          <div>
            <strong>钟表匠的轮系</strong>
            <span>CLOCKMAKER'S TRAIN</span>
          </div>
        </div>
        <nav>
          {NAV.map((item) => (
            <button
              key={item.id}
              className={route === item.id ? 'active' : ''}
              onClick={() => actions.navigate(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="nav-foot">
          <div className="tiny-gear">⚙</div>
          <p>已修复 {completedCount} 关</p>
          <small>精确分数传动 · Canvas 轮系</small>
        </div>
      </aside>
      <main className="app-main">
        {route === 'workbench' && <Workbench />}
        {route === 'analysis' && <AnalysisPage />}
        {route === 'levels' && <LevelsPage />}
        {route === 'codex' && <CodexPage />}
      </main>
    </div>
  );
}
