import { useEffect, useMemo, useRef } from 'react';
import { computePhases } from '../components/GearCanvas';
import { GearIcon } from '../components/GearIcon';
import { CLASSIC_TRAINS } from '../game/classicTrains';
import { analyzeTrain } from '../game/engine';
import { getGearSpec } from '../game/gears';
import { getLevel, LEVELS } from '../game/levels';
import { drawBoard, drawGear, drawMeshLinks, makeView } from '../game/render';
import { actions, useAppState } from '../game/store';
import type { ClassicTrain } from '../game/types';

export function AnalysisPage() {
  const currentLevelId = useAppState((s) => s.currentLevelId);
  const builds = useAppState((s) => s.builds);
  const classicId = useAppState((s) => s.analysisClassicId);
  const classic = CLASSIC_TRAINS.find((t) => t.id === classicId) ?? null;
  const level = getLevel(currentLevelId);
  const gears = builds[currentLevelId] ?? [];

  const roles = useMemo(
    () => Object.fromEntries(level.holes.filter((h) => h.role).map((h) => [h.id, h.role!])),
    [level],
  );
  const workbenchAnalysis = useMemo(
    () =>
      analyzeTrain(gears, {
        roles,
        sourceSpeedRevPerHour: level.sourceSpeedRevPerHour,
        sourceTorqueNmm: level.sourceTorqueNmm,
        requiredEscapementTorqueNmm: level.requiredEscapementTorqueNmm ?? null,
        objectives: level.objectives,
      }),
    [gears, roles, level],
  );

  const classicRoles = useMemo(
    () => Object.fromEntries((classic?.holes ?? []).filter((h) => h.role).map((h) => [h.id, h.role!])),
    [classic],
  );
  const classicAnalysis = useMemo(
    () =>
      classic
        ? analyzeTrain(classic.gears, {
            roles: classicRoles,
            sourceSpeedRevPerHour: classic.sourceSpeedRevPerHour,
            sourceTorqueNmm: classic.sourceTorqueNmm,
          })
        : null,
    [classic, classicRoles],
  );

  const analysis = classic ? classicAnalysis! : workbenchAnalysis;
  const shownGears = classic ? classic.gears : gears;

  return (
    <div className="page analysis-page">
      <div className="page-heading">
        <div>
          <h1>轮系分析台</h1>
          <p>所有速比使用大整数分数保存与比较；界面小数只用于显示，不参与过关判定。</p>
        </div>
        <div className="analysis-switch">
          <select
            value={classic ? classic.id : `level:${currentLevelId}`}
            onChange={(e) => {
              const value = e.target.value;
              if (value.startsWith('classic:')) actions.setAnalysisClassic(value.slice(8));
              else {
                actions.setAnalysisClassic(null);
                actions.selectLevel(value.slice(6), 'analysis');
              }
            }}
          >
            <optgroup label="当前关卡工作台">
              {LEVELS.map((l) => (
                <option key={l.id} value={`level:${l.id}`}>
                  {l.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="经典轮系">
              {CLASSIC_TRAINS.map((t) => (
                <option key={t.id} value={`classic:${t.id}`}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          </select>
          {classic ? (
            <button className="btn primary" onClick={() => actions.setAnalysisClassic(null)}>
              返回我的轮系
            </button>
          ) : (
            <button className="btn primary" onClick={() => actions.navigate('workbench')}>
              回到工作台
            </button>
          )}
        </div>
      </div>

      {classic && (
        <div className="classic-banner panel">
          <div>
            <span className="eyebrow">{classic.category} · {classic.years}</span>
            <h2>{classic.name}</h2>
            <p>{classic.summary}</p>
            <ul>{classic.teach.map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
          <SchematicCanvas train={classic} />
        </div>
      )}

      <section className="stat-grid">
        <Stat label="齿轮/齿轴" value={String(shownGears.length)} hint="同轴零件分别计齿" />
        <Stat label="有效啮合" value={String(analysis.validMeshes.length)} hint={`${analysis.meshes.filter((m) => !m.ok).length} 处候选失败`} tone={analysis.meshes.some((m) => !m.ok) ? 'bad' : 'good'} />
        <Stat label="动力链效率" value={`${(analysis.efficiency * 100).toFixed(1)}%`} hint={`单级啮合 ${94}%，轴承 ${98.5}%`} />
        <Stat
          label="擒纵力矩"
          value={analysis.escapementTorque === null ? '—' : analysis.escapementTorque.toFixed(3)}
          hint={analysis.requiredEscapementTorque ? `阈值 ${analysis.requiredEscapementTorque.toFixed(3)} N·mm` : 'N·mm'}
          tone={analysis.running ? 'good' : 'bad'}
        />
      </section>

      {analysis.stopReason && (
        <div className="analysis-alert bad">
          <b>停摆/冲突：</b> {analysis.stopReason}
          {analysis.graphErrors.map((e) => <div key={e}>{e}</div>)}
        </div>
      )}

      <section className="panel">
        <div className="panel-title"><h2>精确转速比与连乘公式</h2></div>
        <div className="ratio-cards">
          {analysis.exactRatios.length === 0 && <p className="panel-hint">尚未形成有效啮合链。</p>}
          {analysis.exactRatios.map((r) => (
            <div className="ratio-card" key={r.label}>
              <span>{r.label}</span>
              <strong>{r.fraction.toFractionString()}</strong>
              <code>{r.formula}</code>
              <small>{r.decimal.toFixed(8)} 圈 / 参考轴一圈</small>
            </div>
          ))}
        </div>
      </section>

      {analysis.moon && (
        <section className={`panel moon-analysis grade-${analysis.moon.grade}`}>
          <div>
            <h2>月相误差（每年多少天）</h2>
            <p>
              输出周期分数 <b>{analysis.moon.periodFraction?.toFractionString()}</b> 天 = {analysis.moon.periodDays?.toFixed(8)} 天；
              真实朔望月 {analysis.moon.targetDays} 天。
            </p>
            <div className="moon-error-big">{analysis.moon.errorDaysPerYear?.toFixed(4)} <span>天/年</span></div>
            <p>
              每周期误差 {analysis.moon.errorPerCycleDays?.toFixed(6)} 天；换算公式：
              <code>(P − L) × 365.25 / L</code>
            </p>
          </div>
          <div className="moon-grade">{analysis.moon.grade.toUpperCase()}</div>
        </section>
      )}

      <section className="panel table-panel">
        <div className="panel-title"><h2>每个齿轮的转速与受力</h2><span>压力角20°；T按单动力路径估算，Fᵣ=Fₜtan20°</span></div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>齿轮</th><th>齿数/模数</th><th>轴/层</th><th>精确轴速比</th><th>转速 r/h</th>
                <th>力矩 N·mm</th><th>节圆半径</th><th>切向力 N</th><th>径向力 N</th><th>总齿面力 N</th>
              </tr>
            </thead>
            <tbody>
              {analysis.gearRows.map((row) => (
                <tr key={row.uid}>
                  <td><GearIcon spec={row.spec} size={34} /> {row.spec.name}</td>
                  <td>{row.spec.teeth}T / m{row.spec.module}</td>
                  <td>{row.role ?? row.axleId}<br /><small>第{row.layer + 1}层</small></td>
                  <td className="mono">{row.ratio?.toFractionString() ?? '—'}</td>
                  <td>{row.revPerHour === null ? '—' : row.revPerHour.toFixed(4)}</td>
                  <td>{row.torqueNmm === null ? '—' : row.torqueNmm.toFixed(3)}</td>
                  <td>{row.pitchRadiusMm.toFixed(2)} mm</td>
                  <td>{row.tangentialForceN?.toFixed(3) ?? '—'}</td>
                  <td>{row.radialForceN?.toFixed(3) ?? '—'}</td>
                  <td>{row.totalToothForceN?.toFixed(3) ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel table-panel">
        <div className="panel-title"><h2>啮合与中心距判定</h2></div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>齿轮对</th><th>实测中心距</th><th>理论中心距</th><th>偏差</th><th>判定</th></tr></thead>
            <tbody>
              {analysis.meshes.length === 0 && <tr><td colSpan={5} className="empty-cell">还没有距离足够近的齿轮对。</td></tr>}
              {analysis.meshes.map((m, i) => {
                const a = getGearSpec(gears.find((g) => g.uid === m.a)?.specId ?? classic?.gears.find((g) => g.uid === m.a)?.specId ?? 'z24-m1.5');
                const b = getGearSpec(gears.find((g) => g.uid === m.b)?.specId ?? classic?.gears.find((g) => g.uid === m.b)?.specId ?? 'z24-m1.5');
                return (
                  <tr key={i} className={m.ok ? '' : 'bad-row'}>
                    <td>{a.teeth}T m{a.module} × {b.teeth}T m{b.module}</td>
                    <td>{m.centerDistance.toFixed(2)} mm</td>
                    <td>{m.idealDistance === null ? '模数不同' : `${m.idealDistance.toFixed(2)} mm`}</td>
                    <td>{m.difference === null ? '—' : `${m.difference >= 0 ? '+' : ''}${m.difference.toFixed(2)} mm`}</td>
                    <td>{m.ok ? '啮合正确' : m.reasons.join('；')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className={`panel stat ${tone ?? ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}

function SchematicCanvas({ train }: { train: ClassicTrain }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const parent = canvas.parentElement!;
    const rect = parent.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = rect.width * dpr;
    canvas.height = 300 * dpr;
    canvas.style.width = '100%';
    canvas.style.height = '300px';
    const view = makeView(train.board, rect.width, 300);
    const roles = Object.fromEntries((train.holes ?? []).filter((h) => h.role).map((h) => [h.id, h.role!]));
    const analysis = analyzeTrain(train.gears, { roles, sourceSpeedRevPerHour: train.sourceSpeedRevPerHour, sourceTorqueNmm: train.sourceTorqueNmm });
    const phases = computePhases(train.gears, analysis.meshes);
    let raf = 0;
    let last = performance.now();
    const angles = new Map<string, number>();
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, 300);
      ctx.setTransform(dpr, 0, 0, dpr, view.offsetX * dpr, view.offsetY * dpr);
      ctx.scale(view.scale, view.scale);
      drawBoard(ctx, train);
      drawMeshLinks(ctx, analysis.meshes, new Map(train.gears.map((g) => [g.uid, g])));
      let maxRatio = 1;
      for (const a of analysis.axles) if (a.ratio) maxRatio = Math.max(maxRatio, Math.abs(a.ratio.toNumber()));
      for (const a of analysis.axles) {
        if (!a.ratio) continue;
        const prev = angles.get(a.id) ?? 0;
        angles.set(a.id, prev + dt * 0.12 * Math.min(1, 5 / maxRatio) * Math.PI * 2 * a.ratio.toNumber());
      }
      for (const g of train.gears) {
        const spec = getGearSpec(g.specId);
        drawGear(ctx, spec, g.x, g.y, (angles.get(g.axleId) ?? 0) + (phases.get(g.uid) ?? 0), view, dpr);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [train]);
  return <canvas ref={ref} className="schematic-canvas" />;
}
