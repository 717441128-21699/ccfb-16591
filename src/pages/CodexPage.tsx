import { useMemo, useState } from 'react';
import { GearIcon } from '../components/GearIcon';
import { CLASSIC_TRAINS } from '../game/classicTrains';
import { analyzeTrain } from '../game/engine';
import { GEAR_SPECS } from '../game/gears';
import { actions } from '../game/store';

interface CodexEntry {
  id: string;
  name: string;
  era: string;
  icon: string;
  body: string;
  formula?: string;
  facts: string[];
}

const ENTRIES: CodexEntry[] = [
  {
    id: 'mesh',
    name: '啮合三条件',
    era: '基础',
    icon: '⚙',
    body: '两只渐开线齿轮要正确啮合，模数与压力角必须相同，且轴心距等于两节圆半径之和。游戏采用20°压力角，并把中心距容差设为0.45 mm。',
    formula: 'a = m(z₁+z₂)/2',
    facts: ['模数不同：齿距不同，会顶撞。', '中心距过大：齿侧间隙过大、无法连续传动。', '中心距过小：齿根与齿顶干涉，转起来会卡。'],
  },
  {
    id: 'coaxial',
    name: '同轴齿轮与轮系连乘',
    era: '基础',
    icon: '⊕',
    body: '固定在同一根轴上的轮片和齿轴角速度完全相同。外啮合一级转向相反，转速比等于主动齿数/从动齿数的反比。',
    formula: 'ω_out/ω_in = ∏(−z_driver/z_driven)',
    facts: ['分数使用大整数约分，因此12:1不会显示成模糊的0.0833。', '闭环轮系若两条路径给出的分数不同，游戏会报冲突。', '减少级数不只是简洁，也减少摩擦和力矩损失。'],
  },
  {
    id: 'moon',
    name: '月相盘的29.5306天',
    era: '天文复杂功能',
    icon: '☾',
    body: '朔望月平均为29.530588853天。常见59齿月相轮配合两个月相图案，在显示史上很经典；若要求“月相盘本身”的周期尽量接近29.5306天，可用945/32=29.53125的三级分数。',
    formula: 'E_year = (P−29.530588853)×365.25/29.530588853',
    facts: ['29.5天近似：约−0.3783天/年。', '29.53125天近似：约+0.00818天/年。', '更精密的万年历月相通常每一百多年才差一天。'],
  },
  {
    id: 'calendar',
    name: '大小月凸轮、闰年凸轮与杠杆',
    era: '万年历',
    icon: '📅',
    body: '31齿日历环每天被拨一齿。30天月末必须跳过第31位；平年二月要多跳3齿，闰年二月多跳2齿。轮廓凸轮记住月份长度，四年凸轮识别2月29日，杠杆把缺口变成瞬时跳齿。',
    formula: 'extra = 31 − D_month',
    facts: ['31天月：额外0跳。', '30天月：额外1跳。', '平年2月：额外3跳；闰年2月：额外2跳。'],
  },
  {
    id: 'torque',
    name: '发条力矩、摩擦与停摆',
    era: '动力链',
    icon: '🔑',
    body: '功率经过每一级啮合都会损失。游戏给每级齿轮啮合94%效率、每根轴轴承98.5%效率。升速轮系同时会按齿数比降低力矩，所以太长的无关轮系可能让擒纵端低于起步阈值。',
    formula: 'T_next = T_now × η_mesh × η_bearing × z_next/z_now',
    facts: ['切向力 Fₜ=T/r。', '径向分离力 Fᵣ=Fₜtan20°。', '总齿面法向力 Fₙ=Fₜ/cos20°。'],
  },
  {
    id: 'escapement',
    name: '擒纵与秒摆',
    era: '调速机构',
    icon: '⏱',
    body: '落地钟常以30齿擒纵轮配合秒摆。摆的来回一次产生两个节拍，使轮系速度被锁定。轮系比例再精确，若传到擒纵的力矩不足以冲过擒纵瓦和摩擦，钟仍然会停。',
    formula: 'T_escape ≥ T_start',
    facts: ['齿轮比决定“应该走多快”。', '擒纵决定“实际允许走多快”。', '润滑油、齿面粗糙度和轴孔磨损都会改变效率。'],
  },
];

export function CodexPage() {
  const [active, setActive] = useState<string>(ENTRIES[0].id);
  const entry = ENTRIES.find((e) => e.id === active)!;

  return (
    <div className="page codex-page">
      <div className="page-heading">
        <div>
          <h1>钟表图鉴与轮系档案</h1>
          <p>把齿轮齿数、模数、轴心距和真实钟表机构放在同一套数学里。以下经典轮系均为本游戏编订的教学化参数。</p>
        </div>
      </div>

      <section className="codex-train-grid">
        {CLASSIC_TRAINS.map((train) => (
          <ClassicCard key={train.id} train={train} />
        ))}
      </section>

      <section className="codex-layout">
        <nav className="codex-nav panel">
          {ENTRIES.map((e) => (
            <button key={e.id} className={active === e.id ? 'active' : ''} onClick={() => setActive(e.id)}>
              <span>{e.icon}</span>
              {e.name}
            </button>
          ))}
        </nav>
        <article className="codex-detail panel">
          <span className="eyebrow">{entry.era}</span>
          <h2>{entry.icon} {entry.name}</h2>
          <p className="codex-body">{entry.body}</p>
          {entry.formula && <div className="formula-hero">{entry.formula}</div>}
          <ul className="fact-list">
            {entry.facts.map((f) => <li key={f}>{f}</li>)}
          </ul>
        </article>
      </section>

      <section className="panel">
        <div className="panel-title"><h2>本工作台齿轮规格库</h2><span>{GEAR_SPECS.length} 种</span></div>
        <div className="codex-gear-grid">
          {GEAR_SPECS.map((spec) => (
            <div className="codex-gear" key={spec.id} title={spec.fact}>
              <GearIcon spec={spec} size={64} />
              <b>{spec.teeth} 齿</b>
              <span>模数 {spec.module}</span>
              <small>{spec.material === 'brass' ? '黄铜' : spec.material === 'steel' ? '淬硬钢齿轴' : '发蓝钢'}</small>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ClassicCard({ train }: { train: (typeof CLASSIC_TRAINS)[number] }) {
  const roles = useMemo(
    () => Object.fromEntries((train.holes ?? []).filter((h) => h.role).map((h) => [h.id, h.role!])),
    [train],
  );
  const analysis = useMemo(() => analyzeTrain(train.gears, { roles, sourceSpeedRevPerHour: train.sourceSpeedRevPerHour, sourceTorqueNmm: train.sourceTorqueNmm }), [train, roles]);
  return (
    <article className="panel classic-card">
      <div className="classic-card-head">
        <span className="eyebrow">{train.years}</span>
        <h2>{train.name}</h2>
        <p>{train.origin} · {train.category}</p>
      </div>
      <p className="classic-summary">{train.summary}</p>
      <div className="classic-outputs">
        {train.outputLabels.map((o) => {
          const axle = analysis.axles.find((a) => a.role === o.role);
          return (
            <div key={o.role}>
              <span>{o.label}</span>
              <b>{o.want}</b>
              <code>轴速比 {axle?.ratio?.toFractionString() ?? '—'}</code>
            </div>
          );
        })}
      </div>
      <ul>{train.teach.map((t) => <li key={t}>{t}</li>)}</ul>
      <div className="classic-actions">
        <button className="btn primary" onClick={() => actions.setAnalysisClassic(train.id)}>
          在分析台拆开看
        </button>
        {train.id === 'grandfather-going-train' && (
          <button className="btn secondary" onClick={() => actions.selectLevel('mainspring-torque')}>
            去复原动力链
          </button>
        )}
        {train.id === 'precision-moon-train' && (
          <button className="btn secondary" onClick={() => actions.selectLevel('moon-phase')}>
            去拼月相
          </button>
        )}
      </div>
    </article>
  );
}
