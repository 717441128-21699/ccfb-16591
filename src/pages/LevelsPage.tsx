import { GearIcon } from '../components/GearIcon';
import { getGearSpec } from '../game/gears';
import { LEVELS } from '../game/levels';
import { actions, useAppState } from '../game/store';

export function LevelsPage() {
  const completed = useAppState((s) => s.progress.completed);
  const bestMoon = useAppState((s) => s.progress.bestMoonError);
  const doneCount = LEVELS.filter((l) => completed[l.id]).length;

  return (
    <div className="page levels-page">
      <div className="page-heading">
        <div>
          <h1>关卡选择</h1>
          <p>从学徒啮合到万年历与动力链。已修复 {doneCount}/{LEVELS.length} 个工作台。</p>
        </div>
        <div className="progress-ring" aria-label={`${doneCount}/${LEVELS.length}`}>
          <strong>{doneCount}</strong>
          <span>/{LEVELS.length}</span>
        </div>
      </div>

      <div className="level-grid">
        {LEVELS.map((level) => {
          const done = Boolean(completed[level.id]);
          const moonBest = bestMoon[level.id];
          const previewSpecs = level.inventory.slice(0, 5).map((i) => getGearSpec(i.specId));
          return (
            <article key={level.id} className={`level-card panel ${done ? 'completed' : ''}`} style={{ ['--accent' as string]: level.accent }}>
              <div className="level-card-top">
                <span className="level-number">{String(level.index + 1).padStart(2, '0')}</span>
                <span className="difficulty">{'★'.repeat(level.difficulty)}<i>{'★'.repeat(4 - level.difficulty)}</i></span>
                {done && <span className="done-badge">✓ 已修复</span>}
              </div>
              <div className="level-gears" aria-hidden>
                {previewSpecs.map((spec, i) => (
                  <span key={spec.id} style={{ transform: `rotate(${i * 17}deg) translateY(${i % 2 ? -4 : 3}px)` }}>
                    <GearIcon spec={spec} size={62 - i * 6} />
                  </span>
                ))}
              </div>
              <h2>{level.name}</h2>
              <p className="level-subtitle">{level.subtitle}</p>
              <p className="level-brief">{level.brief}</p>
              <div className="tag-row">
                {level.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}
              </div>
              {moonBest !== undefined && (
                <div className="best-moon">最佳月相误差：{moonBest.toFixed(4)} 天/年</div>
              )}
              <div className="level-card-footer">
                <span>约 {level.estimatedMinutes} 分钟</span>
                <button className="btn primary" onClick={() => actions.selectLevel(level.id)}>
                  {level.id === 'sandbox' ? '进入沙盒' : done ? '再次修复' : '开始修表'} →
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
