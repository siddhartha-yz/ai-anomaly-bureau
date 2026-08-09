import { FEATURE_META } from '../ml/features'
import type { FeatureKey } from '../ml/types'

const DETAIL: Record<FeatureKey, string> = {
  warmth: '颜色偏暖还是偏冷。橘猫和烤过的面包都可能很暖，所以它并不总可靠。',
  roundness: '轮廓更圆还是更长。猫脸常偏圆，但圆面包也会混进来。',
  texture: '表面是毛发感还是面包表皮感。之后修复时会解锁。',
  aspect: '物体看起来更扁、更长还是更接近方形。之后修复时会解锁。',
}

export function SensorIntro({
  features,
  read,
  onRead,
  mode = 'current',
}: {
  features: [FeatureKey, FeatureKey]
  read: FeatureKey[]
  onRead: (feature: FeatureKey) => void
  mode?: 'current' | 'repair'
}) {
  const repair = mode === 'repair'
  return (
    <section className={`sensor-intro ${repair ? 'repair-sensor-intro' : ''}`} aria-label={repair ? '读取备用观察通道' : '读取机器人当前观察通道'}>
      <div className="sensor-intro-head">
        <span>{repair ? 'SENSOR CACHE // RECOVERED MODULES' : 'SENSOR DIAGNOSTIC // CURRENT EYES'}</span>
        <h2>{repair ? '技术组找到了两个备用观察通道' : '机器人现在只看这两件事'}</h2>
        <p>{repair ? '别急着装。先读完这两个新模块，想想它们能补上刚才的盲区吗？' : '依次点开两个通道。先弄清它“看见”的世界，再决定怎么修。'}</p>
      </div>
      <div className="sensor-intro-grid">
        {features.map((feature, index) => {
          const opened = read.includes(feature)
          return (
            <button
              type="button"
              key={feature}
              className={`sensor-intro-card ${opened ? 'read' : ''}`}
              onClick={() => onRead(feature)}
              aria-pressed={opened}
            >
              <b>{index === 0 ? 'X' : 'Y'}</b><strong>{FEATURE_META[feature].label}</strong>
              <small>{opened ? 'READOUT OPEN' : '▶ 点击读取'}</small>
              <span>{opened ? DETAIL[feature] : '这不是图片本身，而是一项被压缩出来的信息。'}</span>
            </button>
          )
        })}
      </div>
      <div className="sensor-intro-progress">
        &gt; CHANNEL READ: <strong>{read.length}/2</strong> {read.length === 2 ? '// CURRENT VIEW UNDERSTOOD' : '// WAITING'}
      </div>
    </section>
  )
}
