import { spawn, type ChildProcess } from 'node:child_process'
import type { SpeechLanguageMode, SpeechRate, SpeechStatus } from '../shared/types'
import { cleanSpeechText } from '../shared/speech'

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

export function speechCulture(text: string): 'zh-CN' | 'en-US' {
  return /[\u3400-\u9fff]/.test(text) ? 'zh-CN' : 'en-US'
}

function speechRateValue(rate: SpeechRate): number {
  if (rate === 'slow') return -2
  if (rate === 'fast') return 2
  return 0
}

export interface SpeechOptions {
  rate: SpeechRate
  languageMode: SpeechLanguageMode
}

export class SpeechService {
  private child: ChildProcess | null = null
  private statusTimer: NodeJS.Timeout | null = null
  private currentStatus: SpeechStatus = { state: 'idle' }

  constructor(
    private readonly executable = 'powershell.exe',
    private readonly onStatus: (status: SpeechStatus) => void = () => undefined
  ) {}

  status(): SpeechStatus {
    return this.currentStatus
  }

  speak(text: string, speechId: string, options: SpeechOptions): void {
    this.stop()
    if (process.platform !== 'win32') {
      this.fail(speechId, '朗读仅支持 Windows 系统。')
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
          SELECTION_ASSISTANT_SPEECH_CULTURE: options.languageMode === 'auto' ? speechCulture(prepared) : '',
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
