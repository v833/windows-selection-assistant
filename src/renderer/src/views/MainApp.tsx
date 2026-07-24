import {
  Activity,
  ArrowDown,
  ArrowUp,
  BrainCircuit,
  Bot,
  Check,
  ChevronRight,
  CircleHelp,
  Code2,
  Copy,
  Eye,
  EyeOff,
  Info,
  Languages,
  LoaderCircle,
  ListFilter,
  MessageCircle,
  MonitorCog,
  Moon,
  Plus,
  PenLine,
  Save,
  Settings2,
  Sparkles,
  Sun,
  Trash2,
  WandSparkles,
  Zap
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AppInfo, AppSettings, AssistantStatus, SelectionAction, ThemeMode } from '../../../shared/types'

type Section = 'general' | 'model' | 'actions' | 'about'
type SettingsPatch = Partial<AppSettings> | ((settings: AppSettings) => Partial<AppSettings>)
type SaveSettings = (patch: SettingsPatch, showConfirmation?: boolean) => Promise<void>

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
  const settingsRef = useRef<AppSettings | null>(null)
  const saveRevision = useRef(0)

  useEffect(() => {
    void Promise.all([window.selectionAPI.getSettings(), window.selectionAPI.getStatus(), window.selectionAPI.getAppInfo()]).then(
      ([nextSettings, nextStatus, nextAppInfo]) => {
        settingsRef.current = nextSettings
        setSettings(nextSettings)
        setStatus(nextStatus)
        setAppInfo(nextAppInfo)
        applyTheme(nextSettings.theme)
      }
    )
    return window.selectionAPI.onStatusChanged(setStatus)
  }, [])

  async function save(patchOrUpdater: SettingsPatch, showConfirmation = false) {
    const current = settingsRef.current
    if (!current) return

    const patch = typeof patchOrUpdater === 'function' ? patchOrUpdater(current) : patchOrUpdater
    const optimistic = { ...current, ...patch }
    const revision = ++saveRevision.current
    settingsRef.current = optimistic
    setSettings(optimistic)
    applyTheme(optimistic.theme)

    try {
      const next = await window.selectionAPI.saveSettings(patch)
      if (revision !== saveRevision.current) return
      settingsRef.current = next
      setSettings(next)
      applyTheme(next.theme)
      if (showConfirmation) {
        setSaved(true)
        window.setTimeout(() => setSaved(false), 1600)
      }
    } catch {
      if (revision !== saveRevision.current) return
      settingsRef.current = current
      setSettings(current)
      applyTheme(current.theme)
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
  save: SaveSettings
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
  save: SaveSettings
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

function ActionSettings({ settings, save }: { settings: AppSettings; save: SaveSettings }) {
  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')
  const [prompt, setPrompt] = useState('')
  const [jsonSchema, setJsonSchema] = useState(settings.jsonExtractionSchema)

  useEffect(() => setJsonSchema(settings.jsonExtractionSchema), [settings.jsonExtractionSchema])

  const builtIns = useMemo(() => settings.actions.filter((action) => action.kind !== 'custom'), [settings.actions])
  const custom = useMemo(() => settings.actions.filter((action) => action.kind === 'custom'), [settings.actions])

  function updateAction(id: string, patch: Partial<SelectionAction>) {
    void save((current) => ({
      actions: current.actions.map((action) => (action.id === id ? { ...action, ...patch } : action))
    }))
  }

  function updateVariant(actionId: string, variantId: string, enabled: boolean) {
    void save((current) => ({
      actions: current.actions.map((action) =>
        action.id === actionId
          ? {
              ...action,
              variants: action.variants?.map((variant) => (variant.id === variantId ? { ...variant, enabled } : variant))
            }
          : action
      )
    }))
  }

  function moveAction(id: string, direction: -1 | 1) {
    void save((current) => {
      const sourceIndex = current.actions.findIndex((action) => action.id === id)
      if (sourceIndex < 0) return {}

      const isCustom = current.actions[sourceIndex].kind === 'custom'
      let targetIndex = sourceIndex + direction
      while (targetIndex >= 0 && targetIndex < current.actions.length) {
        if ((current.actions[targetIndex].kind === 'custom') === isCustom) break
        targetIndex += direction
      }
      if (targetIndex < 0 || targetIndex >= current.actions.length) return {}

      const actions = [...current.actions]
      ;[actions[sourceIndex], actions[targetIndex]] = [actions[targetIndex], actions[sourceIndex]]
      return { actions }
    })
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
    void save((current) => ({ actions: [...current.actions, action] }))
    setLabel('')
    setPrompt('')
    setAdding(false)
  }

  return (
    <SettingsPage title="快捷动作" subtitle="选择工具条中显示的处理方式">
      <section className="settings-section">
        <SectionTitle icon={CircleHelp} title="智能路由" />
        <SettingRow title="短词词典模式" description="执行“解释”时，短词优先返回定义、读音、例句和专业背景">
          <Switch checked={settings.autoDictionary} onChange={(autoDictionary) => void save({ autoDictionary })} label="启用短词词典模式" />
        </SettingRow>
        <div className="json-schema-setting">
          <label className="field-label">
            <span>JSON 字段 / Schema</span>
            <textarea
              value={jsonSchema}
              onChange={(event) => setJsonSchema(event.target.value)}
              placeholder={'例如：{"date":"string","tasks":["string"]}'}
              maxLength={2000}
              rows={3}
            />
          </label>
          <div className="form-actions">
            <button
              className="secondary-button compact"
              onClick={() => void save({ jsonExtractionSchema: jsonSchema.trim() })}
              disabled={jsonSchema.trim() === settings.jsonExtractionSchema}>
              <Save size={15} />保存结构
            </button>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <SectionTitle icon={Sparkles} title="内置动作" />
        <div className="action-list">
          {builtIns.map((action, index) => (
            <ActionRow
              key={action.id}
              action={action}
              onToggle={(enabled) => updateAction(action.id, { enabled })}
              onVariantToggle={(variantId, enabled) => updateVariant(action.id, variantId, enabled)}
              onMoveUp={index > 0 ? () => moveAction(action.id, -1) : undefined}
              onMoveDown={index < builtIns.length - 1 ? () => moveAction(action.id, 1) : undefined}
            />
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
          {custom.map((action, index) => (
            <ActionRow
              key={action.id}
              action={action}
              onToggle={(enabled) => updateAction(action.id, { enabled })}
              onMoveUp={index > 0 ? () => moveAction(action.id, -1) : undefined}
              onMoveDown={index < custom.length - 1 ? () => moveAction(action.id, 1) : undefined}
              onDelete={() => void save((current) => ({ actions: current.actions.filter((item) => item.id !== action.id) }))}
            />
          ))}
        </div>
      </section>
    </SettingsPage>
  )
}

function ActionRow({
  action,
  onToggle,
  onVariantToggle,
  onMoveUp,
  onMoveDown,
  onDelete
}: {
  action: SelectionAction
  onToggle: (enabled: boolean) => void
  onVariantToggle?: (variantId: string, enabled: boolean) => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  onDelete?: () => void
}) {
  return (
    <div className="action-group">
      <div className="action-row">
        <div className="action-icon">{actionIcon(action.kind)}</div>
        <div className="action-copy"><strong>{action.label}</strong><span>{action.prompt ?? actionDescription(action.kind)}</span></div>
        <div className="action-order">
          <button className="icon-button" onClick={onMoveUp} disabled={!onMoveUp} aria-label={`上移${action.label}`} title="上移">
            <ArrowUp size={15} />
          </button>
          <button className="icon-button" onClick={onMoveDown} disabled={!onMoveDown} aria-label={`下移${action.label}`} title="下移">
            <ArrowDown size={15} />
          </button>
        </div>
        {onDelete && <button className="icon-button danger" onClick={onDelete} aria-label={`删除${action.label}`}><Trash2 size={16} /></button>}
        <Switch checked={action.enabled} onChange={onToggle} label={`显示${action.label}`} />
      </div>
      {action.variants && action.variants.length > 0 && onVariantToggle && (
        <div className="action-variant-list" aria-label={`${action.label}的二级选项`}>
          {action.variants.map((variant) => (
            <div className="action-variant-row" key={variant.id}>
              <span>{variant.label}</span>
              <Switch
                checked={variant.enabled}
                onChange={(enabled) => onVariantToggle(variant.id, enabled)}
                label={`启用${variant.label}`}
              />
            </div>
          ))}
        </div>
      )}
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
  if (kind === 'chat') return <MessageCircle size={17} />
  if (kind === 'translate') return <Languages size={17} />
  if (kind === 'explain') return <CircleHelp size={17} />
  if (kind === 'summarize') return <Copy size={17} />
  if (kind === 'rewrite') return <Sparkles size={17} />
  if (kind === 'writing') return <PenLine size={17} />
  if (kind === 'extract') return <ListFilter size={17} />
  if (kind === 'analysis') return <BrainCircuit size={17} />
  if (kind === 'code') return <Code2 size={17} />
  return <WandSparkles size={17} />
}

function actionDescription(kind: SelectionAction['kind']) {
  const descriptions: Record<SelectionAction['kind'], string> = {
    chat: '围绕选中文本连续提问',
    translate: '直接翻译或反向翻译',
    explain: '解释含义与背景',
    summarize: '提炼核心信息',
    rewrite: '优化表达并保持原意',
    writing: '纠错、精简、扩写、语气、回复和标题生成',
    extract: '提取日期、人物、地址、待办、关键词或 JSON',
    analysis: '术语解释与观点分析',
    code: '解释、诊断、注释或转换代码',
    custom: ''
  }
  return descriptions[kind]
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme
}
