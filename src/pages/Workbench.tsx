import { useEffect, useMemo, useRef, useState } from 'react';
import { GearCanvas } from '../components/GearCanvas';
import { ClockDial } from '../components/ClockDial';
import { GearIcon } from '../components/GearIcon';
import type { DragState } from '../components/dragTypes';
import { annualMoonError, analyzeMeshes, analyzeTrain, MESH_TOLERANCE_MM } from '../game/engine';
import { resolveDrop, type DropTarget } from '../game/geometry';
import { clientToMm, makeView } from '../game/render';
import { getGearSpec, idealCenterDistanceMm } from '../game/gears';
import { getLevel, LEVELS } from '../game/levels';
import { actions, newUid, useAppState } from '../game/store';
import type { PlacedGear } from '../game/types';
import { CalendarPuzzle } from './CalendarPuzzle';

interface Toast {
  id: number;
  tone: 'good' | 'bad' | 'info';
  text: string;
}

function inferLayerForNewGear(specId: string, x: number, y: number, gears: PlacedGear[]): number {
  const spec = getGearSpec(specId);
  for (const g of gears) {
    const other = getGearSpec(g.specId);
    const ideal = idealCenterDistanceMm(spec, other);
    if (ideal === null) continue;
    const cd = Math.hypot(g.x - x, g.y - y);
    if (Math.abs(cd - ideal) <= MESH_TOLERANCE_MM * 2.5) return g.layer;
  }
  return 0;
}

function applyMoveProjection(gears: PlacedGear[], axleId: string, target: DropTarget): PlacedGear[] {
  const mergeTo = target.snapped === 'axle' ? target.axleId : undefined;
  const targetId = mergeTo ?? axleId;
  return gears
    .filter((g) => g.axleId !== axleId)
    .map((g) => (mergeTo && g.axleId === mergeTo ? { ...g, x: target.x, y: target.y } : g))
    .concat(
      gears
        .filter((g) => g.axleId === axleId)
        .map((g) => ({ ...g, axleId: targetId, x: target.x, y: target.y })),
    );
}

export function Workbench() {
  const currentLevelId = useAppState((s) => s.currentLevelId);
  const level = getLevel(currentLevelId);
  const gears = useAppState((s) => s.builds[s.currentLevelId] ?? []);
  const calendar = useAppState((s) => s.calendar[s.currentLevelId]);
  const completed = useAppState((s) => Boolean(s.progress.completed[s.currentLevelId]));
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [exploded, setExploded] = useState(false);
  const [showForces, setShowForces] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const toastTimer = useRef<number | null>(null);

  const roles = useMemo(
    () => Object.fromEntries(level.holes.filter((h) => h.role).map((h) => [h.id, h.role!])),
    [level],
  );

  const analysis = useMemo(
    () =>
      analyzeTrain(gears, {
        roles,
        sourceSpeedRevPerHour: level.sourceSpeedRevPerHour,
        sourceTorqueNmm: level.sourceTorqueNmm,
        requiredEscapementTorqueNmm: level.requiredEscapementTorqueNmm ?? null,
        objectives: level.objectives,
        calendarPass: level.id === 'calendar-cams' ? Boolean(calendar && Object.values(calendar).every(Boolean)) : undefined,
        calendarDetail:
          level.id === 'calendar-cams'
            ? calendar && Object.values(calendar).every(Boolean)
              ? '五个机构均已安装，请运行测试'
              : '凸轮、杠杆或弹簧尚未装齐'
            : undefined,
      }),
    [gears, roles, level, calendar],
  );

  const allDone = analysis.objectives.length > 0 && analysis.objectives.every((o) => o.done);
  const initialUidSet = useMemo(() => new Set((level.initialGears ?? []).map((g) => g.uid)), [level]);

  useEffect(() => {
    setSelectedUid(null);
    setShowSuccess(false);
  }, [currentLevelId]);

  useEffect(() => {
    if (allDone && !completed && level.id !== 'calendar-cams') {
      actions.completeLevel(level.id, analysis.moon?.errorDaysPerYear ?? null);
      setShowSuccess(true);
    }
    if (allDone && completed) setShowSuccess(true);
  }, [allDone, completed, level.id, analysis.moon?.errorDaysPerYear]);

  function notify(text: string, tone: Toast['tone'] = 'info') {
    setToast({ id: Date.now(), text, tone });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4200);
  }

  function startNewDrag(e: React.PointerEvent, specId: string) {
    if (e.button !== 0) return;
    e.preventDefault();
    const drag: DragState = { kind: 'new', specId, x: 0, y: 0, inside: false };
    dragRef.current = drag;

    const onMove = (ev: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      drag.inside = ev.clientX >= rect.left && ev.clientX <= rect.right && ev.clientY >= rect.top && ev.clientY <= rect.bottom;
      if (drag.inside) {
        const view = makeView(level.board, rect.width, rect.height);
        const mm = clientToMm(ev.clientX, ev.clientY, rect, view);
        drag.x = mm.x;
        drag.y = mm.y;
      }
    };

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      if (!drag.inside) {
        dragRef.current = null;
        return;
      }
      const entry = level.inventory.find((i) => i.specId === specId);
      const used = gears.filter((g) => g.specId === specId && !initialUidSet.has(g.uid)).length;
      if (entry && used >= entry.count) {
        notify('这一规格的齿轮已经用完；可从画布删除后重新选择。', 'bad');
        dragRef.current = null;
        return;
      }

      const target = resolveDrop(drag.x, drag.y, level.id, level.holes, gears);
      const uid = newUid();
      const sameAxleGears = gears.filter((g) => g.axleId === target.axleId);
      const layer = sameAxleGears.length
        ? Math.max(...sameAxleGears.map((g) => g.layer)) + 1
        : inferLayerForNewGear(specId, target.x, target.y, gears);
      const newGear: PlacedGear = { uid, specId, axleId: target.axleId, x: target.x, y: target.y, layer };
      actions.addGear(level.id, newGear);

      const issues = analyzeMeshes([...gears, newGear]).filter((m) => !m.ok && (m.a === uid || m.b === uid));
      if (issues.length) notify(`放下即检测到啮合失败：${issues[0].reasons.join('；')}`, 'bad');
      else {
        const good = analyzeMeshes([...gears, newGear]).filter((m) => m.ok && (m.a === uid || m.b === uid));
        notify(good.length ? `啮合正确：理论中心距 ${good[0].idealDistance?.toFixed(2)} mm。` : '已建立新轴；把另一只齿轮拖到合适轴距即可啮合。', good.length ? 'good' : 'info');
      }
      dragRef.current = null;
      setSelectedUid(uid);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }

  function handleMoveRelease(axleId: string, target: DropTarget) {
    actions.moveAxle(level.id, axleId, target.x, target.y, target.snapped === 'axle' ? target.axleId : undefined);
    const projected = applyMoveProjection(gears, axleId, target);
    const movedAxle = target.snapped === 'axle' ? target.axleId : axleId;
    const issues = analyzeMeshes(projected).filter(
      (m) => !m.ok && (m.axleA === movedAxle || m.axleB === movedAxle || m.axleA === axleId || m.axleB === axleId),
    );
    if (issues.length) notify(`轴心位置不对：${issues[0].reasons.join('；')}`, 'bad');
    else notify('轴心已固定，啮合关系已重新计算。', 'good');
  }

  if (level.id === 'calendar-cams') {
    return (
      <div className="workbench-page">
        <LevelHeader levelId={level.id} onReset={() => actions.resetLevel(level.id)} />
        <CalendarPuzzle level={level} />
      </div>
    );
  }

  const selectedGear = gears.find((g) => g.uid === selectedUid) ?? null;
  const selectedRow = analysis.gearRows.find((r) => r.uid === selectedUid) ?? null;
  const nextLevel = LEVELS[level.index + 1];

  return (
    <div className="workbench-page">
      <LevelHeader levelId={level.id} onReset={() => actions.resetLevel(level.id)} />

      <div className="workbench-grid">
        <aside className="panel gear-pile">
          <div className="panel-title">
            <h3>齿轮堆</h3>
            <span>{level.inventory.reduce((n, i) => n + i.count, 0)} 件</span>
          </div>
          <p className="panel-hint">按住齿轮拖到 Canvas；靠近已有轴孔会自动同轴。</p>
          <div className="inventory-grid">
            {level.inventory.map((entry) => {
              const spec = getGearSpec(entry.specId);
              const used = gears.filter((g) => g.specId === entry.specId && !initialUidSet.has(g.uid)).length;
              const remaining = entry.count - used;
              return (
                <button
                  key={entry.specId}
                  className={`inventory-card ${remaining <= 0 ? 'depleted' : ''}`}
                  onPointerDown={(e) => startNewDrag(e, entry.specId)}
                  disabled={remaining <= 0}
                  title={spec.fact ?? spec.name}
                >
                  <GearIcon spec={spec} size={58} />
                  <strong>{spec.teeth}T</strong>
                  <span>m{spec.module}</span>
                  <em>
                    {used}/{entry.count}
                  </em>
                </button>
              );
            })}
          </div>
          <div className="formula-card">
            <b>啮合公式</b>
            <code>a = m(z₁+z₂)/2</code>
            <p>模数必须相同；中心距偏差超过 0.45 mm 会在放下时标红。</p>
          </div>
        </aside>

        <main className="canvas-column">
          <div className="canvas-toolbar panel">
            <button className={`tool-btn ${playing ? 'active' : ''}`} onClick={() => setPlaying((v) => !v)}>
              {playing ? '⏸ 暂停' : '▶ 转动'}
            </button>
            <label className="speed-control">
              观察速度
              <input type="range" min="0.2" max="3" step="0.1" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
              <span>{speed.toFixed(1)}×</span>
            </label>
            <button className={`tool-btn ${exploded ? 'active' : ''}`} onClick={() => setExploded((v) => !v)}>
              {exploded ? '合并视图' : '拆开同轴'}
            </button>
            <button className={`tool-btn ${showForces ? 'active' : ''}`} onClick={() => setShowForces((v) => !v)}>
              转速/受力标签
            </button>
          </div>

          <div className="canvas-shell panel">
            <GearCanvas
              level={level}
              gears={gears}
              analysis={analysis}
              selectedUid={selectedUid}
              playing={playing}
              speed={speed}
              exploded={exploded}
              showForces={showForces}
              dragRef={dragRef}
              canvasRef={canvasRef}
              onSelect={setSelectedUid}
              onMoveRelease={handleMoveRelease}
            />
            <ClockDial analysis={analysis} playing={playing} speed={speed} />
            {toast && (
              <div className={`drop-toast ${toast.tone}`} role="status">
                {toast.tone === 'bad' ? '⚠' : toast.tone === 'good' ? '✓' : 'ℹ'} {toast.text}
              </div>
            )}
            {analysis.stopReason && (
              <div className="stop-banner">
                <b>钟已停摆</b>
                <span>{analysis.stopReason}</span>
              </div>
            )}
            {showSuccess && allDone && (
              <div className="success-card">
                <div>
                  <h3>修复完成，走时声稳定了。</h3>
                  <p>所有传动比均由齿数分数精确计算，没有使用近似转速糊弄。</p>
                </div>
                <div className="success-actions">
                  <button className="btn secondary" onClick={() => actions.navigate('analysis')}>
                    查看轮系分析
                  </button>
                  {nextLevel && (
                    <button className="btn primary" onClick={() => actions.selectLevel(nextLevel.id)}>
                      下一关：{nextLevel.name.split('：')[0]} →
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>

        <aside className="panel inspector">
          <div className="panel-title">
            <h3>目标与检测</h3>
          </div>
          <div className="objective-list">
            {analysis.objectives.map((o) => (
              <div key={o.id} className={`objective ${o.done ? 'done' : ''} ${o.tone === 'bad' ? 'bad' : ''}`}>
                <span className="check">{o.done ? '✓' : o.tone === 'bad' ? '!' : '○'}</span>
                <div>
                  <b>{o.label}</b>
                  <p>{o.detail}</p>
                </div>
              </div>
            ))}
          </div>

          {analysis.moon && (
            <div className={`moon-card grade-${analysis.moon.grade}`}>
              <b>月相报告</b>
              <span>周期 {analysis.moon.periodFraction?.toFractionString()} 天</span>
              <span>
                年误差 <strong>{analysis.moon.errorDaysPerYear?.toFixed(4)}</strong> 天/年
              </span>
              <small>{analysis.moon.grade === 'gold' ? '金级：比常见59齿轮更精确' : analysis.moon.grade === 'bronze' ? '铜级：经典可用近似' : '继续优化齿数组合'}</small>
            </div>
          )}

          <div className="panel-title compact">
            <h3>选中零件</h3>
          </div>
          {selectedGear && selectedRow ? (
            <SelectedInspector
              uid={selectedGear.uid}
              specId={selectedGear.specId}
              x={selectedGear.x}
              y={selectedGear.y}
              layer={selectedGear.layer}
              axleCount={gears.filter((g) => g.axleId === selectedGear.axleId).length}
              ratio={selectedRow.ratio?.toFractionString() ?? '未接入动力'}
              revPerHour={selectedRow.revPerHour}
              torque={selectedRow.torqueNmm}
              force={selectedRow.tangentialForceN}
              totalForce={selectedRow.totalToothForceN}
              onNudge={(dx, dy) => actions.updateGear(level.id, selectedGear.uid, { x: selectedGear.x + dx, y: selectedGear.y + dy })}
              onLayer={(delta) => actions.updateGear(level.id, selectedGear.uid, { layer: Math.max(0, selectedGear.layer + delta) })}
              onDetach={() => {
                actions.detachGear(level.id, selectedGear.uid);
                notify('已拆到独立轴心，可拖到新的中心位置。', 'info');
              }}
              onRemove={() => {
                actions.removeGear(level.id, selectedGear.uid);
                setSelectedUid(null);
                notify('齿轮已放回齿轮堆。', 'info');
              }}
            />
          ) : (
            <p className="panel-hint">点选 Canvas 上的齿轮，可查看转速、力矩、切向力和轴心坐标，也可微调轴心。</p>
          )}

          <div className="panel-title compact">
            <h3>精确速比</h3>
          </div>
          <div className="ratio-list">
            {analysis.exactRatios.length === 0 && <p className="panel-hint">用有效啮合连接轴后，这里会显示不可约分的精确分数。</p>}
            {analysis.exactRatios.map((r) => (
              <div key={r.label} className="ratio-row">
                <span>{r.label}</span>
                <code>{r.fraction.toFractionString()}</code>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function LevelHeader({ levelId, onReset }: { levelId: string; onReset: () => void }) {
  const level = getLevel(levelId);
  const completed = useAppState((s) => Boolean(s.progress.completed[levelId]));
  return (
    <header className="level-header panel">
      <div>
        <div className="eyebrow">
          关卡 {level.index + 1} · {level.era} · 难度 {'★'.repeat(level.difficulty)}
          {completed && <span className="completed-pill">已修复</span>}
        </div>
        <h2>{level.name}</h2>
        <p>{level.brief}</p>
      </div>
      <div className="level-header-actions">
        <button className="btn ghost" onClick={() => actions.navigate('levels')}>
          关卡选择
        </button>
        <button className="btn secondary" onClick={onReset}>
          重置本关
        </button>
      </div>
    </header>
  );
}

function SelectedInspector(props: {
  uid: string;
  specId: string;
  x: number;
  y: number;
  layer: number;
  axleCount: number;
  ratio: string;
  revPerHour: number | null;
  torque: number | null;
  force: number | null;
  totalForce: number | null;
  onNudge: (dx: number, dy: number) => void;
  onLayer: (delta: number) => void;
  onDetach: () => void;
  onRemove: () => void;
}) {
  const spec = getGearSpec(props.specId);
  return (
    <div className="selected-inspector">
      <div className="selected-head">
        <GearIcon spec={spec} size={46} />
        <div>
          <b>{spec.name}</b>
          <span>
            轴心 ({props.x.toFixed(1)}, {props.y.toFixed(1)}) mm · 第 {props.layer + 1} 层
          </span>
        </div>
      </div>
      <dl className="data-grid">
        <div>
          <dt>轴速比</dt>
          <dd>{props.ratio}</dd>
        </div>
        <div>
          <dt>转速</dt>
          <dd>{props.revPerHour === null ? '—' : `${props.revPerHour.toFixed(3)} r/h`}</dd>
        </div>
        <div>
          <dt>轴力矩</dt>
          <dd>{props.torque === null ? '—' : `${props.torque.toFixed(3)} N·mm`}</dd>
        </div>
        <div>
          <dt>切向力 Fₜ</dt>
          <dd>{props.force === null ? '—' : `${props.force.toFixed(3)} N`}</dd>
        </div>
        <div>
          <dt>齿面总压力</dt>
          <dd>{props.totalForce === null ? '—' : `${props.totalForce.toFixed(3)} N`}</dd>
        </div>
      </dl>
      <div className="layer-control">
        <span>夹板层 {props.layer + 1}</span>
        <button className="btn small" onClick={() => props.onLayer(-1)}>
          降层
        </button>
        <button className="btn small" onClick={() => props.onLayer(1)}>
          升层
        </button>
      </div>
      <div className="nudge-grid">
        <button onClick={() => props.onNudge(0, 0.5)}>↑ 0.5</button>
        <button onClick={() => props.onNudge(-0.5, 0)}>← 0.5</button>
        <button onClick={() => props.onNudge(0.5, 0)}>0.5 →</button>
        <button onClick={() => props.onNudge(0, -0.5)}>↓ 0.5</button>
      </div>
      <div className="inspector-actions">
        {props.axleCount > 1 && (
          <button className="btn small secondary" onClick={props.onDetach}>
            拆出同轴
          </button>
        )}
        <button className="btn small danger" onClick={props.onRemove}>
          放回齿轮堆
        </button>
      </div>
    </div>
  );
}

// Keep annualMoonError referenced for console/debug and potential custom period inputs.
void annualMoonError;
