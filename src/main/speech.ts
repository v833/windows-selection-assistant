import { spawn, type ChildProcess } from 'node:child_process'
import type { SpeechCulture, SpeechLanguageMode, SpeechRate, SpeechStatus } from '../shared/types'
import { cleanSpeechText, detectSpeechCulture } from '../shared/speech'

export const MAX_SPEECH_CHARACTERS = 4000

const speechScript = [
  "$ErrorActionPreference = 'Stop'",
  'Add-Type -AssemblyName System.Speech',
  '$text = $env:SELECTION_ASSISTANT_SPEECH_TEXT',
  '$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer',
  '$synth.Rate = [int]$env:SELECTION_ASSISTANT_SPEECH_RATE',
  '$voice = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq $env:SELECTION_ASSISTANT_SPEECH_CULTURE } | Select-Object -First 1',
  'if ($voice) { $synth.SelectVoice($voice.VoiceInfo.Name) }',
  '$synth.Speak($text)',
  '$synth.Dispose()'
].join('; ')

export function prepareSpeechText(text: string): string {
  const normalized = cleanSpeechText(text)
  if (normalized.length <= MAX_SPEECH_CHARACTERS) return normalized
  return `${normalized.slice(0, MAX_SPEECH_CHARACTERS - 3)}...`
}

export function speechCulture(text: string, preferredCulture?: SpeechCulture): SpeechCulture {
  return preferredCulture ?? detectSpeechCulture(text)
}

function speechRateValue(rate: SpeechRate): number {
  if (rate === 'slow') return -2
  if (rate === 'fast') return 2
  return 0
}

export interface SpeechOptions {
  rate: SpeechRate
  languageMode: SpeechLanguageMode
  culture?: SpeechCulture
}

/** macOS `say` 内置语音，按语言文化映射；语音缺失时由 say 报错并回退默认语音。 */
const MAC_VOICES: Partial<Record<SpeechCulture, string>> = {
  'zh-CN': 'Tingting',
  'en-US': 'Samantha',
  'ja-JP': 'Kyoko',
  'ko-KR': 'Yuna'
}

/** macOS `say -r` 语速（每分钟词数），对应 slow / normal / fast。 */
const MAC_RATE_WPM: Record<SpeechRate, number> = { slow: 140, normal: 175, fast: 210 }

export class SpeechService {
  private child: ChildProcess | null = null
  private statusTimer: NodeJS.Timeout | null = null
  private currentStatus: SpeechStatus = { state: 'idle' }

  constructor(
    private readonly executable = process.platform === 'win32' ? 'powershell.exe' : 'say',
    private readonly onStatus: (status: SpeechStatus) => void = () => undefined
  ) {}

  status(): SpeechStatus {
    return this.currentStatus
  }

  speak(text: string, speechId: string, options: SpeechOptions): void {
    this.stop()
    if (process.platform === 'darwin') {
      this.speakDarwin(text, speechId, options)
      return
    }
    if (process.platform !== 'win32') {
      this.fail(speechId, '朗读暂不支持当前系统。')
      return
    }

    const prepared = prepareSpeechText(text)
    if (!prepared) return
    this.setStatus({ state: 'starting', speechId })

    let child: ChildProcess
    try {
      child = spawn(this.executable, [
        '-NoProfile',
        '-NonInteractive',
        '-WindowStyle',
        'Hidden',
        '-Command',
        speechScript
      ], {
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'ignore'],
        env: {
          ...process.env,
          SELECTION_ASSISTANT_SPEECH_TEXT: prepared,
          SELECTION_ASSISTANT_SPEECH_CULTURE: options.languageMode === 'auto' ? speechCulture(prepared, options.culture) : '',
          SELECTION_ASSISTANT_SPEECH_RATE: String(speechRateValue(options.rate))
        }
      })
    } catch (error) {
      console.error('启动 Windows 本地朗读失败', error)
      this.fail(speechId, '无法启动 Windows 语音引擎，请检查系统语音设置。')
      return
    }

    this.child = child
    this.setStatus({ state: 'speaking', speechId })
    const cleanup = () => {
      if (this.child === child) this.child = null
    }
    child.once('error', (error) => {
      console.error('Windows 本地朗读失败', error)
      cleanup()
      this.fail(speechId, 'Windows 语音引擎不可用，请在系统设置中安装语音。')
    })
    child.once('exit', (code) => {
      cleanup()
      if (code === 0) this.setStatus({ state: 'idle' })
      else this.fail(speechId, 'Windows 语音引擎未能完成朗读，请检查系统语音设置。')
    })
  }

  /** macOS 本地朗读：使用系统自带 `say` 命令，文本经 stdin 传入避免转义问题。 */
  private speakDarwin(text: string, speechId: string, options: SpeechOptions): void {
    const prepared = prepareSpeechText(text)
    if (!prepared) return
    this.setStatus({ state: 'starting', speechId })

    const args = ['-r', String(MAC_RATE_WPM[options.rate])]
    const culture = options.languageMode === 'auto' ? speechCulture(prepared, options.culture) : undefined
    const voice = culture ? MAC_VOICES[culture] : undefined
    if (voice) args.push('-v', voice)

    let child: ChildProcess
    try {
      child = spawn(this.executable, args, { stdio: ['pipe', 'ignore', 'ignore'] })
    } catch (error) {
      console.error('启动 macOS 本地朗读失败', error)
      this.fail(speechId, '无法启动 macOS 语音引擎。')
      return
    }

    const stdin = child.stdin
    if (!stdin) {
      this.fail(speechId, 'macOS 语音引擎未能开始朗读。')
      return
    }
    try {
      stdin.write(prepared)
      stdin.end()
    } catch (error) {
      console.error('写入 macOS 朗读文本失败', error)
      this.fail(speechId, 'macOS 语音引擎未能开始朗读。')
      return
    }

    this.child = child
    this.setStatus({ state: 'speaking', speechId })
    const cleanup = () => {
      if (this.child === child) this.child = null
    }
    child.once('error', (error) => {
      console.error('macOS 本地朗读失败', error)
      cleanup()
      this.fail(speechId, 'macOS 语音引擎不可用。')
    })
    child.once('exit', (code) => {
      cleanup()
      if (code === 0) this.setStatus({ state: 'idle' })
      else this.fail(speechId, 'macOS 语音引擎未能完成朗读，可尝试在系统设置中安装语音。')
    })
  }

  stop(): void {
    if (this.statusTimer) clearTimeout(this.statusTimer)
    this.statusTimer = null
    const child = this.child
    this.child = null
    child?.kill()
    if (this.currentStatus.state !== 'idle') this.setStatus({ state: 'idle' })
  }

  fail(speechId: string, message: string): void {
    this.stop()
    this.setStatus({ state: 'error', speechId, message })
    this.statusTimer = setTimeout(() => {
      this.statusTimer = null
      this.setStatus({ state: 'idle' })
    }, 2400)
  }

  private setStatus(status: SpeechStatus): void {
    this.currentStatus = status
    this.onStatus(status)
  }
}
