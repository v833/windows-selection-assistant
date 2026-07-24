import {
  Activity,
  Bot,
  Check,
  ChevronRight,
  CircleHelp,
  Copy,
  Eye,
  EyeOff,
  Info,
  Languages,
  LoaderCircle,
  MonitorCog,
  Moon,
  Plus,
  Save,
  Settings2,
  Sparkles,
  Sun,
  Trash2,
  WandSparkles,
  Zap
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AppInfo, AppSettings, AssistantStatus, SelectionAction, ThemeMode } from '../../../shared/types'

type Section = 'general' | 'model' | 'actions' | 'about'

const navigation = [
  { id: 'general' as const, label: '常规', icon: Settings2 },
  { id: 'model' as const, label: '模型', icon: Bot },
  { id: 'actions' as const, label: '快捷动作', icon: WandSparkles },
  { id: 'about' as const, label: '关于', icon: Info }
]

export function MainApp() {
  const [section, setSection] = useState<Section>('general')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [status, setStatus] = useState<AssistantStatus>({ enabled: false, running: false })
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void Promise.all([window.selectionAPI.getSettings(), window.selectionAPI.getStatus(), window.selectionAPI.getAppInfo()]).then(
      ([nextSettings, nextStatus, nextAppInfo]) => {
        setSettings(nextSettings)
        setStatus(nextStatus)
        setAppInfo(nextAppInfo)
        applyTheme(nextSettings.theme)
      }
    )
    return window.selectionAPI.onStatusChanged(setStatus)
  }, [])

  async function save(patch: Partial<AppSettings>, showConfirmation = false) {
    const next = await window.selectionAPI.saveSettings(patch)
    setSettings(next)
    applyTheme(next.theme)
    if (showConfirmation) {
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1600)
    }
  }

  if (!settings) {
    return (
      <main className="boot-screen">
        <LoaderCircle className="spin" size={22} />
      </main>
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark"><Languages size={19} /></div>
          <div>
            <strong>划词助手</strong>
            <span>Selection Assistant</span>
          </div>
        </div>

        <nav className="side-nav" aria-label="设置导航">
          {navigation.map((item) => {
            const Icon = item.icon
            return (
              <button key={item.id} className={section === item.id ? 'active' : ''} onClick={() => setSection(item.id)}>
                <Icon size={17} />
                <span>{item.label}</span>
                {section === item.id && <ChevronRight size={15} />}
              </button>
            )
          })}
        </nav>

        <div className="sidebar-status">
          <span className={`status-dot ${status.running ? 'online' : ''}`} />
          <div>
            <strong>{status.running ? '正在监听' : '监听已暂停'}</strong>
            <span>{status.running ? '系统选区服务正常' : status.error ?? '可随时重新启用'}</span>
          </div>
        </div>
      </aside>

      <main className="settings-main">
        {section === 'general' && <GeneralSettings settings={settings} status={status} save={save} />}
        {section === 'model' && <ModelSettings settings={settings} save={save} saved={saved} />}
        {section === 'actions' && <ActionSettings settings={settings} save={save} />}
        {section === 'about' && <About appInfo={appInfo} />}
      </main>
    </div>
  )
}

function GeneralSettings({
  settings,
  status,
  save
}: {
  settings: AppSettings
  status: AssistantStatus
  save: (patch: Partial<AppSettings>) => Promise<void>
}) {
  return (
    <SettingsPage title="常规" subtitle="管理划词监听与应用行为">
      <section className="settings-section">
        <SectionTitle icon={Activity} title="运行状态" />
        <SettingRow title="划词监听" description={status.running ? '已连接 Windows 文本选区服务' : '当前不会显示划词工具条'}>
          <Switch checked={settings.enabled} onChange={(enabled) => void save({ enabled })} label="启用划词监听" />
        </SettingRow>
        <SettingRow title="开机启动" description="登录 Windows 后自动在托盘运行">
          <Switch checked={settings.launchAtLogin} onChange={(launchAtLogin) => void save({ launchAtLogin })} label="开机启动" />
        </SettingRow>
      </section>

      <section className="settings-section">
        <SectionTitle icon={MonitorCog} title="外观" />
        <div className="theme-grid" role="radiogroup" aria-label="界面主题">
          {([
            ['system', MonitorCog, '跟随系统'],
            ['light', Sun, '浅色'],
            ['dark', Moon, '深色']
          ] as const).map(([value, Icon, label]) => (
            <button
              key={value}
              role="radio"
              aria-checked={settings.theme === value}
              className={settings.theme === value ? 'theme-option active' : 'theme-option'}
              onClick={() => void save({ theme: value as ThemeMode })}>
              <Icon size={18} />
              <span>{label}</span>
              {settings.theme === value && <Check size={15} />}
            </button>
          ))}
        </div>
      </section>
    </SettingsPage>
  )
}

function ModelSettings({
  settings,
  save,
  saved
}: {
  settings: AppSettings
  save: (patch: Partial<AppSettings>, showConfirmation?: boolean) => Promise<void>
  saved: boolean
}) {
  const [draft, setDraft] = useState(settings)
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => setDraft(settings), [settings])

  async function test() {
    setTesting(true)
    setTestResult(null)
    const result = await window.selectionAPI.testConnection(draft)
    setTestResult(result)
    setTesting(false)
  }

  return (
    <SettingsPage title="模型" subtitle="连接 OpenAI 兼容的模型服务">
      <section className="settings-section model-form">
        <SectionTitle icon={Zap} title="API 配置" />
        <label className="field-label">
          <span>API 地址</span>
          <input value={draft.baseUrl} onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })} placeholder="https://api.openai.com/v1" />
        </label>
        <label className="field-label">
          <span>API Key</span>
          <div className="input-with-action">
            <input
              type={showKey ? 'text' : 'password'}
              value={draft.apiKey}
              onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
              placeholder="sk-..."
            />
            <button className="icon-button" onClick={() => setShowKey(!showKey)} aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}>
              {showKey ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </label>
        <div className="field-grid">
          <label className="field-label">
            <span>模型名称</span>
            <input value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })} placeholder="gpt-4.1-mini" />
          </label>
          <label className="field-label">
            <span>翻译目标语言</span>
            <input value={draft.targetLanguage} onChange={(event) => setDraft({ ...draft, targetLanguage: event.target.value })} placeholder="简体中文" />
          </label>
        </div>
        <div className="form-actions">
          <div className={`connection-result ${testResult?.ok ? 'success' : 'error'}`}>
            {testResult && <><span className="status-dot online" />{testResult.message}</>}
          </div>
          <button className="secondary-button" onClick={() => void test()} disabled={testing}>
            {testing ? <LoaderCircle className="spin" size={16} /> : <Activity size={16} />}
            测试连接
          </button>
          <button
            className="primary-button"
            onClick={() => void save({ baseUrl: draft.baseUrl, apiKey: draft.apiKey, model: draft.model, targetLanguage: draft.targetLanguage }, true)}>
            {saved ? <Check size={16} /> : <Save size={16} />}
            {saved ? '已保存' : '保存'}
          </button>
        </div>
      </section>
    </SettingsPage>
  )
}

function ActionSettings({ settings, save }: { settings: AppSettings; save: (patch: Partial<AppSettings>) => Promise<void> }) {
  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')
  const [prompt, setPrompt] = useState('')

  const builtIns = useMemo(() => settings.actions.filter((action) => action.kind !== 'custom'), [settings.actions])
  const custom = useMemo(() => settings.actions.filter((action) => action.kind === 'custom'), [settings.actions])

  function updateAction(id: string, patch: Partial<SelectionAction>) {
    void save({ actions: settings.actions.map((action) => (action.id === id ? { ...action, ...patch } : action)) })
  }

  function addAction() {
    if (!label.trim() || !prompt.trim()) return
    const action: SelectionAction = {
      id: `custom-${Date.now()}`,
      label: label.trim(),
      prompt: prompt.trim(),
      kind: 'custom',
      enabled: true
    }
    void save({ actions: [...settings.actions, action] })
    setLabel('')
    setPrompt('')
    setAdding(false)
  }

  return (
    <SettingsPage title="快捷动作" subtitle="选择工具条中显示的处理方式">
      <section className="settings-section">
        <SectionTitle icon={Sparkles} title="内置动作" />
        <div className="action-list">
          {builtIns.map((action) => (
            <ActionRow key={action.id} action={action} onToggle={(enabled) => updateAction(action.id, { enabled })} />
          ))}
        </div>
      </section>

      <section className="settings-section">
        <div className="section-title-row">
          <SectionTitle icon={CircleHelp} title="自定义动作" />
          <button className="secondary-button compact" onClick={() => setAdding(!adding)}><Plus size={15} />新建</button>
        </div>
        {adding && (
          <div className="action-editor">
            <label className="field-label"><span>名称</span><input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={20} /></label>
            <label className="field-label"><span>提示词</span><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={4} /></label>
            <div className="form-actions"><button className="primary-button" onClick={addAction} disabled={!label.trim() || !prompt.trim()}><Check size={16} />添加</button></div>
          </div>
        )}
        <div className="action-list">
          {custom.length === 0 && !adding && <div className="empty-row">暂无自定义动作</div>}
          {custom.map((action) => (
            <ActionRow
              key={action.id}
              action={action}
              onToggle={(enabled) => updateAction(action.id, { enabled })}
              onDelete={() => void save({ actions: settings.actions.filter((item) => item.id !== action.id) })}
            />
          ))}
        </div>
      </section>
    </SettingsPage>
  )
}

function ActionRow({ action, onToggle, onDelete }: { action: SelectionAction; onToggle: (enabled: boolean) => void; onDelete?: () => void }) {
  return (
    <div className="action-row">
      <div className="action-icon">{actionIcon(action.kind)}</div>
      <div className="action-copy"><strong>{action.label}</strong><span>{action.prompt ?? actionDescription(action.kind)}</span></div>
      {onDelete && <button className="icon-button danger" onClick={onDelete} aria-label={`删除${action.label}`}><Trash2 size={16} /></button>}
      <Switch checked={action.enabled} onChange={onToggle} label={`显示${action.label}`} />
    </div>
  )
}

function About({ appInfo }: { appInfo: AppInfo | null }) {
  return (
    <SettingsPage title="关于" subtitle="版本与运行环境">
      <section className="about-panel">
        <div className="about-mark"><Languages size={30} /></div>
        <div><h2>划词助手</h2><p>独立的 Windows AI 文本处理工具</p></div>
      </section>
      <section className="settings-section version-list">
        <SettingRow title="应用版本" description="当前安装版本"><code>{appInfo?.version ?? '-'}</code></SettingRow>
        <SettingRow title="Electron" description="桌面运行时"><code>{appInfo?.electron ?? '-'}</code></SettingRow>
        <SettingRow title="Chromium" description="界面渲染引擎"><code>{appInfo?.chrome ?? '-'}</code></SettingRow>
        <SettingRow title="选区引擎" description="selection-hook"><code>2.0.2</code></SettingRow>
      </section>
    </SettingsPage>
  )
}

function SettingsPage({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <div className="settings-page"><header className="page-header"><h1>{title}</h1><p>{subtitle}</p></header>{children}</div>
}

function SectionTitle({ icon: Icon, title }: { icon: typeof Activity; title: string }) {
  return <div className="section-title"><Icon size={17} /><h2>{title}</h2></div>
}

function SettingRow({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <div className="setting-row"><div><strong>{title}</strong><span>{description}</span></div>{children}</div>
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return <button className={`switch ${checked ? 'checked' : ''}`} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}><span /></button>
}

function actionIcon(kind: SelectionAction['kind']) {
  if (kind === 'translate') return <Languages size={17} />
  if (kind === 'explain') return <CircleHelp size={17} />
  if (kind === 'summarize') return <Copy size={17} />
  if (kind === 'rewrite') return <Sparkles size={17} />
  return <WandSparkles size={17} />
}

function actionDescription(kind: SelectionAction['kind']) {
  return { translate: '翻译为目标语言', explain: '解释含义与背景', summarize: '提炼核心信息', rewrite: '优化表达并保持原意', custom: '' }[kind]
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme
}
