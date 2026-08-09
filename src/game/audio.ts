export type GameSound = 'ui' | 'select' | 'train' | 'audit' | 'evidence' | 'hint' | 'success' | 'warning'
export type GameMusicPhase = 1 | 2 | 3 | 4

type AudioContextCtor = typeof AudioContext

const NOTE = {
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  G4: 392.0,
  A4: 440.0,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  G5: 783.99,
} as const

const MUSIC: Record<GameMusicPhase, { melody: number[]; bass: number[] }> = {
  1: {
    melody: [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.E5, NOTE.D5, NOTE.G5, NOTE.E5, NOTE.D5],
    bass: [NOTE.C4, NOTE.C4, NOTE.A4 / 2, NOTE.A4 / 2, NOTE.G4 / 2, NOTE.G4 / 2, NOTE.D4, NOTE.G4 / 2],
  },
  2: {
    melody: [NOTE.A4, NOTE.C5, NOTE.E5, NOTE.D5, NOTE.A4, NOTE.D5, NOTE.C5, NOTE.E5],
    bass: [NOTE.A4 / 2, NOTE.A4 / 2, NOTE.E4 / 2, NOTE.E4 / 2, NOTE.D4, NOTE.D4, NOTE.E4 / 2, NOTE.E4 / 2],
  },
  3: {
    melody: [NOTE.C5, NOTE.G5, NOTE.E5, NOTE.G5, NOTE.D5, NOTE.G5, NOTE.E5, NOTE.C5],
    bass: [NOTE.C4, NOTE.G4 / 2, NOTE.C4, NOTE.G4 / 2, NOTE.D4, NOTE.G4 / 2, NOTE.E4, NOTE.G4 / 2],
  },
  4: {
    melody: [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C5 * 2, NOTE.G5, NOTE.E5, NOTE.D5, NOTE.C5],
    bass: [NOTE.C4, NOTE.C4, NOTE.G4 / 2, NOTE.C4, NOTE.G4 / 2, NOTE.E4 / 2, NOTE.D4, NOTE.C4],
  },
}

export class GameAudio {
  private context?: AudioContext
  private master?: GainNode
  private bgmTimer?: number
  private beat = 0
  private enabled = true
  private musicPhase: GameMusicPhase = 1

  constructor(enabled = true) {
    this.enabled = enabled
  }

  setPhase(phase: GameMusicPhase) {
    if (this.musicPhase === phase) return
    this.musicPhase = phase
    this.beat = 0
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled
    if (!enabled) {
      this.stopBgm()
      this.master?.gain.setTargetAtTime(0.0001, this.context?.currentTime ?? 0, 0.03)
      return
    }
    void this.ensureStarted().then(() => {
      if (this.master && this.context) this.master.gain.setTargetAtTime(0.9, this.context.currentTime, 0.03)
      this.startBgm()
      this.play('ui')
    }).catch(() => undefined)
  }

  async ensureStarted() {
    if (!this.enabled || typeof window === 'undefined') return
    if (!this.context) {
      const Ctor = (window.AudioContext || (window as typeof window & { webkitAudioContext?: AudioContextCtor }).webkitAudioContext)
      if (!Ctor) return
      this.context = new Ctor()
      this.master = this.context.createGain()
      this.master.gain.value = 0.9
      this.master.connect(this.context.destination)
    }
    if (this.context.state === 'suspended') await this.context.resume()
    this.startBgm()
  }

  play(sound: GameSound) {
    if (!this.enabled) return
    void this.ensureStarted().then(() => {
      if (!this.context || !this.master) return
      const now = this.context.currentTime
      const sequences: Record<GameSound, Array<[number, number, number]>> = {
        ui: [[NOTE.C5, 0, .045]],
        select: [[NOTE.E5, 0, .045], [NOTE.G5, .055, .055]],
        train: [[NOTE.C4, 0, .07], [NOTE.E4, .08, .07], [NOTE.G4, .16, .09], [NOTE.C5, .27, .11]],
        audit: [[NOTE.G4, 0, .06], [NOTE.D5, .09, .06], [NOTE.G5, .18, .08]],
        evidence: [[NOTE.D5, 0, .05], [NOTE.C5, .07, .08]],
        hint: [[NOTE.E5, 0, .05], [NOTE.D5, .07, .05], [NOTE.C5, .14, .08]],
        success: [[NOTE.C5, 0, .08], [NOTE.E5, .09, .08], [NOTE.G5, .18, .08], [NOTE.C5 * 2, .29, .16]],
        warning: [[NOTE.A4, 0, .07], [NOTE.E4, .09, .07], [NOTE.A4, .18, .1]],
      }
      sequences[sound].forEach(([frequency, offset, duration]) => {
        this.tone(frequency, now + offset, duration, sound === 'warning' ? .065 : .05)
      })
    }).catch(() => undefined)
  }

  dispose() {
    this.stopBgm()
    void this.context?.close()
    this.context = undefined
    this.master = undefined
  }

  private startBgm() {
    if (!this.enabled || this.bgmTimer || !this.context || !this.master) return
    this.beat = 0
    this.scheduleBgmBeat()
    this.bgmTimer = window.setInterval(() => this.scheduleBgmBeat(), 210)
  }

  private stopBgm() {
    if (this.bgmTimer) window.clearInterval(this.bgmTimer)
    this.bgmTimer = undefined
  }

  private scheduleBgmBeat() {
    if (!this.context || !this.master || !this.enabled) return
    const pattern = MUSIC[this.musicPhase]
    const index = this.beat % pattern.melody.length
    const now = this.context.currentTime
    this.tone(pattern.melody[index], now, .075, .012)
    if (index % 2 === 0) this.tone(pattern.bass[index], now, .12, .009, 'square')
    if (index === 3 || index === 7) this.tone(NOTE.C5 * 2, now + .08, .025, .006)
    this.beat += 1
  }

  private tone(
    frequency: number,
    start: number,
    duration: number,
    volume: number,
    type: OscillatorType = 'square',
  ) {
    if (!this.context || !this.master) return
    const oscillator = this.context.createOscillator()
    const gain = this.context.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, start)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(volume, start + .008)
    gain.gain.setValueAtTime(volume, Math.max(start + .009, start + duration - .018))
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    oscillator.connect(gain)
    gain.connect(this.master)
    oscillator.start(start)
    oscillator.stop(start + duration + .02)
  }
}
