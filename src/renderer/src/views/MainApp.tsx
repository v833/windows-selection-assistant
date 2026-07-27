import {
  Activity,
  ArrowDown,
  ArrowUp,
  BrainCircuit,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  Code2,
  Copy,
  Eye,
  EyeOff,
  FileJson,
  FileText,
  FolderOpen,
  History,
  Info,
  Languages,
  LoaderCircle,
  ListFilter,
  MessageCircle,
  MonitorCog,
  Moon,
  Plus,
  PenLine,
  Pin,
  PinOff,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Sparkles,
  Sun,
  Trash2,
  WandSparkles,
  X,
  Zap
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { getUnknownPromptVariables, renderPromptTemplate } from '../../../shared/promptVariables'
import { MAX_OUTPUT_TOKENS, resolveRequestProfile } from '../../../shared/providers'
import { MAX_PINNED_ACTIONS, moveAction as moveActionInList, normalizeShortcut, validateActionShortcuts } from '../../../shared/toolbar'
import type {
  ActionRequestProfile,
  AppInfo,
  AppSettings,
  AssistantStatus,
  ConversationSession,
  ProviderProfile,
  SelectionAction,
  SessionStorageInfo,
  SettingsSection,
  ThemeMode
} from '../../../shared/types'

type SettingsPatch = Partial<AppSettings> | ((settings: AppSettings) => Partial<AppSettings>)
type SaveSettings = (patch: SettingsPatch, showConfirmation?: boolean) => Promise<string | null>

const navigation = [
  { id: 'general' as const, label: '常规', icon: Settings2 },
  { id: 'model' as const, label: '模型', icon: Bot },
  { id: 'actions' as const, label: '快捷动作', icon: WandSparkles },
  { id: 'history' as const, label: '历史记录', icon: History },
  { id: 'about' as const, label: '关于', icon: Info }
]

export function MainApp() {
  const [section, setSection] = useState<SettingsSection>('general')
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
    const unsubscribeStatus = window.selectionAPI.onStatusChanged(setStatus)
    const unsubscribeNavigation = window.selectionAPI.onSettingsNavigate(setSection)
    return () => {
      unsubscribeStatus()
      unsubscribeNavigation()
    }
  }, [])

  async function save(patchOrUpdater: SettingsPatch, showConfirmation = false) {
    const current = settingsRef.current
    if (!current) return null

    const patch = typeof patchOrUpdater === 'function' ? patchOrUpdater(current) : patchOrUpdater
    const optimistic = { ...current, ...patch }
    const revision = ++saveRevision.current
    settingsRef.current = optimistic
    setSettings(optimistic)
    applyTheme(optimistic.theme)

    try {
      const next = await window.selectionAPI.saveSettings(patch)
      if (revision !== saveRevision.current) return null
      settingsRef.current = next
      setSettings(next)
      applyTheme(next.theme)
      if (showConfirmation) {
        setSaved(true)
        window.setTimeout(() => setSaved(false), 1600)
      }
      return null
    } catch (error) {
      if (revision !== saveRevision.current) return null
      settingsRef.current = current
      setSettings(current)
      applyTheme(current.theme)
      return readableError(error)
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
              <button key={item.id} className={section === item.id ? 'active' : ''} onClick={() => setSection(item.id)} aria-label={item.label} title={item.label}>
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
        {section === 'history' && <HistorySettings settings={settings} save={save} />}
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
  const [selectedProviderId, setSelectedProviderId] = useState(settings.defaultProviderId)
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    setDraft(settings)
    setSelectedProviderId((current) => settings.providers.some((provider) => provider.id === current)
      ? current
      : settings.defaultProviderId)
  }, [settings])

  const selectedProvider = draft.providers.find((provider) => provider.id === selectedProviderId)
    ?? draft.providers[0]
  const referencedActions = selectedProvider
    ? draft.actions.filter((action) => action.requestProfile?.providerId === selectedProvider.id)
    : []

  function updateProvider(patch: Partial<ProviderProfile>) {
    if (!selectedProvider) return
    setDraft((current) => ({
      ...current,
      providers: current.providers.map((provider) => provider.id === selectedProvider.id
        ? { ...provider, ...patch }
        : provider)
    }))
    setTestResult(null)
  }

  function addProvider() {
    const provider: ProviderProfile = {
      id: crypto.randomUUID(),
      name: `Provider ${draft.providers.length + 1}`,
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      defaultModel: 'gpt-4.1-mini'
    }
    setDraft((current) => ({ ...current, providers: [...current.providers, provider] }))
    setSelectedProviderId(provider.id)
    setShowKey(false)
    setTestResult(null)
  }

  function removeProvider() {
    if (!selectedProvider || selectedProvider.id === draft.defaultProviderId || referencedActions.length) return
    if (!window.confirm(`确定删除 Provider“${selectedProvider.name}”吗？`)) return
    const providers = draft.providers.filter((provider) => provider.id !== selectedProvider.id)
    setDraft((current) => ({ ...current, providers }))
    setSelectedProviderId(draft.defaultProviderId)
    setShowKey(false)
    setTestResult(null)
  }

  async function test() {
    if (!selectedProvider) return
    setTesting(true)
    setTestResult(null)
    const result = await window.selectionAPI.testConnection(selectedProvider)
    setTestResult(result)
    setTesting(false)
  }

  async function saveModelSettings() {
    const error = await save({
      providers: draft.providers,
      defaultProviderId: draft.defaultProviderId,
      targetLanguage: draft.targetLanguage,
      maxInputCharacters: draft.maxInputCharacters
    }, true)
    if (error) setTestResult({ ok: false, message: error })
  }

  return (
    <SettingsPage title="模型" subtitle="管理 OpenAI 兼容 Provider 与默认请求参数">
      <section className="settings-section model-form">
        <div className="section-title-row">
          <SectionTitle icon={Zap} title="Provider 配置" />
          <button className="secondary-button compact" type="button" onClick={addProvider}><Plus size={15} />新增 Provider</button>
        </div>
        <div className="provider-layout">
          <div className="provider-list" role="tablist" aria-label="Provider 列表">
            {draft.providers.map((provider) => (
              <button
                key={provider.id}
                type="button"
                role="tab"
                aria-selected={provider.id === selectedProvider?.id}
                className={provider.id === selectedProvider?.id ? 'active' : ''}
                onClick={() => {
                  setSelectedProviderId(provider.id)
                  setShowKey(false)
                  setTestResult(null)
                }}>
                <strong>{provider.name || '未命名 Provider'}</strong>
                <span>{provider.defaultModel || '未设置模型'}</span>
                {provider.id === draft.defaultProviderId && <em>默认</em>}
              </button>
            ))}
          </div>
          {selectedProvider && (
            <div className="provider-editor">
              <div className="field-grid">
                <label className="field-label">
                  <span>名称</span>
                  <input value={selectedProvider.name} onChange={(event) => updateProvider({ name: event.target.value })} maxLength={40} />
                </label>
                <label className="field-label">
                  <span>默认模型</span>
                  <input value={selectedProvider.defaultModel} onChange={(event) => updateProvider({ defaultModel: event.target.value })} placeholder="gpt-4.1-mini" />
                </label>
              </div>
              <label className="field-label">
                <span>API 地址</span>
                <input value={selectedProvider.baseUrl} onChange={(event) => updateProvider({ baseUrl: event.target.value })} placeholder="https://api.openai.com/v1" />
              </label>
              <label className="field-label">
                <span>API Key</span>
                <div className="input-with-action">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={selectedProvider.apiKey}
                    onChange={(event) => updateProvider({ apiKey: event.target.value })}
                    placeholder="sk-..."
                  />
                  <button className="icon-button" type="button" onClick={() => setShowKey(!showKey)} aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}>
                    {showKey ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </label>
              <div className="field-grid">
                <label className="field-label">
                  <span>默认温度（留空使用兼容默认）</span>
                  <input
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    value={selectedProvider.defaultTemperature ?? ''}
                    onChange={(event) => updateProvider({ defaultTemperature: optionalNumber(event.target.value) })}
                    placeholder="问答 0.4，其他 0.2"
                  />
                </label>
                <label className="field-label">
                  <span>默认最大输出（留空由服务决定）</span>
                  <input
                    type="number"
                    min={1}
                    max={MAX_OUTPUT_TOKENS}
                    step={1}
                    value={selectedProvider.defaultMaxOutputTokens ?? ''}
                    onChange={(event) => updateProvider({ defaultMaxOutputTokens: optionalNumber(event.target.value) })}
                    placeholder="服务默认"
                  />
                </label>
              </div>
              <div className="provider-editor-actions">
                <div>
                  {referencedActions.length > 0 && <span>{referencedActions.length} 个动作正在使用此 Provider</span>}
                </div>
                {selectedProvider.id !== draft.defaultProviderId && (
                  <button className="secondary-button compact" type="button" onClick={() => setDraft({ ...draft, defaultProviderId: selectedProvider.id })}>设为默认</button>
                )}
                <button
                  className="secondary-button compact danger-text"
                  type="button"
                  onClick={removeProvider}
                  disabled={draft.providers.length <= 1 || selectedProvider.id === draft.defaultProviderId || referencedActions.length > 0}>
                  <Trash2 size={14} />删除
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="settings-section model-form">
        <SectionTitle icon={Languages} title="通用设置" />
        <div className="field-grid">
          <label className="field-label">
            <span>翻译目标语言</span>
            <input value={draft.targetLanguage} onChange={(event) => setDraft({ ...draft, targetLanguage: event.target.value })} placeholder="简体中文" />
          </label>
          <label className="field-label">
            <span>长文本提醒阈值（字符）</span>
            <input
              type="number"
              min={1000}
              max={200000}
              step={1000}
              value={draft.maxInputCharacters}
              onChange={(event) => setDraft({ ...draft, maxInputCharacters: Number(event.target.value) })}
            />
          </label>
        </div>
        <div className="form-actions">
          <div className={`connection-result ${testResult?.ok ? 'success' : 'error'}`} role="status" aria-live="polite">
            {testResult && <><span className="status-dot online" />{testResult.message}</>}
          </div>
          <button className="secondary-button" onClick={() => void test()} disabled={testing || !selectedProvider}>
            {testing ? <LoaderCircle className="spin" size={16} /> : <Activity size={16} />}
            测试当前 Provider
          </button>
          <button
            className="primary-button"
            onClick={() => void saveModelSettings()}>
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
  const [shortcutError, setShortcutError] = useState('')

  useEffect(() => setJsonSchema(settings.jsonExtractionSchema), [settings.jsonExtractionSchema])

  const builtIns = useMemo(() => settings.actions.filter((action) => action.kind !== 'custom'), [settings.actions])
  const custom = useMemo(() => settings.actions.filter((action) => action.kind === 'custom'), [settings.actions])
  const pinnedCount = useMemo(() => settings.actions.filter((action) => action.pinned).length, [settings.actions])
  const customPromptUnknown = getUnknownPromptVariables(prompt)

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
      const selected = current.actions.find((action) => action.id === id)
      if (!selected) return {}
      const sameGroup = current.actions.filter((action) => (action.kind === 'custom') === (selected.kind === 'custom'))
      const moved = moveActionInList(sameGroup, id, direction)
      if (moved === sameGroup) return {}
      let groupIndex = 0
      const actions = current.actions.map((action) =>
        (action.kind === 'custom') === (selected.kind === 'custom') ? moved[groupIndex++] : action
      )
      return { actions }
    })
  }

  function togglePinned(action: SelectionAction) {
    if (!action.pinned && pinnedCount >= MAX_PINNED_ACTIONS) {
      setShortcutError(`工具栏最多固定 ${MAX_PINNED_ACTIONS} 个动作，请先取消一个固定动作`)
      return
    }
    setShortcutError('')
    updateAction(action.id, { pinned: !action.pinned })
  }

  async function updateShortcut(actionId: string, shortcut: string) {
    const actions = settings.actions.map((action) =>
      action.id === actionId ? { ...action, shortcut: shortcut || undefined } : action
    )
    const validationError = validateActionShortcuts(actions)
    if (validationError) {
      setShortcutError(validationError)
      return
    }
    const error = await save({ actions })
    setShortcutError(error ?? '')
  }

  function addAction() {
    if (!label.trim() || !prompt.trim() || customPromptUnknown.length) return
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
    <SettingsPage title="快捷动作" subtitle="固定常用动作，并为全部动作配置顺序与快捷键">
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
        <SectionTitle icon={Pin} title="工具栏" />
        <SettingRow title="固定动作" description={`只在工具栏显示常用动作，其余动作收纳到“更多”；最多固定 ${MAX_PINNED_ACTIONS} 个`}>
          <code>{pinnedCount} / {MAX_PINNED_ACTIONS}</code>
        </SettingRow>
        <SettingRow title="最近使用" description="在“更多”菜单顶部显示最近执行的动作，不影响已固定动作">
          <Switch
            checked={settings.showRecentActions}
            onChange={(showRecentActions) => void save({ showRecentActions })}
            label="在更多菜单显示最近使用动作"
          />
        </SettingRow>
        {shortcutError && <div className="settings-error" role="alert"><CircleAlert size={15} />{shortcutError}</div>}
      </section>

      <section className="settings-section">
        <SectionTitle icon={Sparkles} title="内置动作" />
        <div className="action-list">
          {builtIns.map((action, index) => (
            <ActionRow
              key={action.id}
              action={action}
              settings={settings}
              onToggle={(enabled) => updateAction(action.id, { enabled })}
              onUpdate={(patch) => updateAction(action.id, patch)}
              onVariantToggle={(variantId, enabled) => updateVariant(action.id, variantId, enabled)}
              onPin={() => togglePinned(action)}
              pinDisabled={!action.pinned && pinnedCount >= MAX_PINNED_ACTIONS}
              onShortcutChange={(shortcut) => void updateShortcut(action.id, shortcut)}
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
            <PromptHelp prompt={prompt} settings={settings} />
            <div className="form-actions"><button className="primary-button" onClick={addAction} disabled={!label.trim() || !prompt.trim() || customPromptUnknown.length > 0}><Check size={16} />添加</button></div>
          </div>
        )}
        <div className="action-list">
          {custom.length === 0 && !adding && <div className="empty-row">暂无自定义动作</div>}
          {custom.map((action, index) => (
            <ActionRow
              key={action.id}
              action={action}
              settings={settings}
              onToggle={(enabled) => updateAction(action.id, { enabled })}
              onUpdate={(patch) => updateAction(action.id, patch)}
              onPin={() => togglePinned(action)}
              pinDisabled={!action.pinned && pinnedCount >= MAX_PINNED_ACTIONS}
              onShortcutChange={(shortcut) => void updateShortcut(action.id, shortcut)}
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

function HistorySettings({ settings, save }: { settings: AppSettings; save: SaveSettings }) {
  const [sessions, setSessions] = useState<ConversationSession[]>([])
  const [storageInfo, setStorageInfo] = useState<SessionStorageInfo | null>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    void refresh()
  }, [])

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return sessions
    return sessions.filter((session) => [
      session.title,
      session.selectedText,
      session.action.label,
      session.model,
      session.programName
    ].some((value) => value.toLocaleLowerCase().includes(normalized)))
  }, [query, sessions])

  async function refresh() {
    setLoading(true)
    setMessage('')
    setLoadError(false)
    try {
      const [nextSessions, nextStorageInfo] = await Promise.all([
        window.selectionAPI.listSessions(),
        window.selectionAPI.getSessionStorageInfo()
      ])
      setSessions(nextSessions)
      setStorageInfo(nextStorageInfo)
      return true
    } catch (error) {
      setSessions([])
      setLoadError(true)
      setMessage(`读取历史失败：${readableError(error)}`)
      return false
    } finally {
      setLoading(false)
    }
  }

  async function rename(session: ConversationSession) {
    const title = window.prompt('输入新的会话名称', session.title)
    if (title === null || !title.trim()) return
    setMessage('')
    try {
      const renamed = await window.selectionAPI.renameSession(session.id, title)
      if (!renamed) throw new Error('会话不存在或已被删除')
      if (await refresh()) setMessage('会话已重命名。')
    } catch (error) {
      setMessage(`重命名失败：${readableError(error)}`)
    }
  }

  async function remove(session: ConversationSession) {
    if (!window.confirm(`确定删除会话“${session.title}”吗？`)) return
    setMessage('')
    try {
      const deleted = await window.selectionAPI.deleteSession(session.id)
      if (!deleted) throw new Error('会话不存在或已被删除')
      if (await refresh()) setMessage('会话已删除。')
    } catch (error) {
      setMessage(`删除失败：${readableError(error)}`)
    }
  }

  async function removeAll() {
    if ((!sessions.length && !loadError) || !window.confirm('确定删除全部本地会话历史吗？此操作无法撤销。')) return
    setMessage('')
    try {
      await window.selectionAPI.deleteAllSessions()
      setSessions([])
      setLoadError(false)
      setMessage('全部会话历史已删除。')
    } catch (error) {
      setMessage(`全部删除失败：${readableError(error)}`)
    }
  }

  async function exportHistory(session: ConversationSession, format: 'markdown' | 'json') {
    setMessage('')
    try {
      const path = await window.selectionAPI.exportSession(session.id, format)
      if (path) setMessage(`已导出到 ${path}`)
    } catch (error) {
      setMessage(`导出失败：${readableError(error)}`)
    }
  }

  return (
    <SettingsPage title="历史记录" subtitle="管理可选的本地加密会话历史">
      <section className="settings-section">
        <SectionTitle icon={History} title="保存设置" />
        <SettingRow title="保存会话历史" description="默认关闭；开启后才会把选区、动作、模型和消息加密保存到本机">
          <Switch checked={settings.historyEnabled} onChange={(historyEnabled) => void save({ historyEnabled })} label="保存会话历史" />
        </SettingRow>
        <SettingRow title="最多保留" description="超过数量后自动删除最早更新的会话">
          <input
            className="history-retention-input"
            type="number"
            min={5}
            max={200}
            step={5}
            value={settings.historyRetentionLimit}
            onChange={(event) => void save({ historyRetentionLimit: Number(event.target.value) })}
          />
        </SettingRow>
        <SettingRow title="存储位置" description={storageInfo?.encrypted ? '内容使用 Windows 安全存储加密' : '尚未读取存储信息'}>
          <code className="history-path" title={storageInfo?.path}>{storageInfo?.path ?? '-'}</code>
        </SettingRow>
      </section>

      <section className="settings-section history-section">
        <div className="section-title-row">
          <SectionTitle icon={History} title={`已保存会话（${sessions.length}）`} />
          <div className="history-section-actions">
            <button className="secondary-button compact" type="button" onClick={() => void refresh()}><RefreshCw size={14} />刷新</button>
          </div>
        </div>
        <label className="history-search">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、选区、动作或模型" />
        </label>
        {message && <div className="history-message" role="status">{message}</div>}
        {loading ? (
          <div className="empty-row" role="status" aria-label="正在加载会话"><LoaderCircle className="spin" size={17} /></div>
        ) : filtered.length ? (
          <div className="history-list">
            {filtered.map((session) => (
              <article className="history-item" key={session.id}>
                <button className="history-open" type="button" onClick={() => window.selectionAPI.openSession(session.id)}>
                  <strong>{session.title}</strong>
                  <span>{session.action.label} · {session.model || '未记录模型'} · {formatSessionTime(session.updatedAt)}</span>
                  <p>{session.selectedText}</p>
                </button>
                <div className="history-item-actions">
                  <button className="icon-button" type="button" onClick={() => window.selectionAPI.openSession(session.id)} title="打开会话" aria-label="打开会话"><FolderOpen size={15} /></button>
                  <button className="icon-button" type="button" onClick={() => void rename(session)} title="重命名" aria-label="重命名"><PenLine size={15} /></button>
                  <button className="icon-button" type="button" onClick={() => void exportHistory(session, 'markdown')} title="导出 Markdown" aria-label="导出 Markdown"><FileText size={15} /></button>
                  <button className="icon-button" type="button" onClick={() => void exportHistory(session, 'json')} title="导出 JSON" aria-label="导出 JSON"><FileJson size={15} /></button>
                  <button className="icon-button danger" type="button" onClick={() => void remove(session)} title="删除" aria-label="删除会话"><Trash2 size={15} /></button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-row">{query ? '没有匹配的会话' : settings.historyEnabled ? '还没有保存的会话' : '历史记录默认关闭，开启后才会保存新会话'}</div>
        )}
        <div className="history-danger-zone">
          <div><strong>危险操作</strong><span>永久删除本机保存的全部会话，无法撤销</span></div>
          <button className="secondary-button compact danger-text" type="button" onClick={() => void removeAll()} disabled={!sessions.length && !loadError}><Trash2 size={14} />全部删除</button>
        </div>
      </section>
    </SettingsPage>
  )
}

function ActionRow({
  action,
  settings,
  onToggle,
  onUpdate,
  onVariantToggle,
  onPin,
  pinDisabled,
  onShortcutChange,
  onMoveUp,
  onMoveDown,
  onDelete
}: {
  action: SelectionAction
  settings: AppSettings
  onToggle: (enabled: boolean) => void
  onUpdate: (patch: Partial<SelectionAction>) => void
  onVariantToggle?: (variantId: string, enabled: boolean) => void
  onPin: () => void
  pinDisabled: boolean
  onShortcutChange: (shortcut: string) => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  onDelete?: () => void
}) {
  const [advanced, setAdvanced] = useState(false)

  return (
    <div className="action-group">
      <div className="action-row">
        <div className="action-row-main">
          <div className="action-icon">{actionIcon(action.kind)}</div>
          <div className="action-copy"><strong>{action.label}</strong><span>{action.prompt ?? actionDescription(action.kind)}</span></div>
        </div>
        <div className="action-row-controls">
          <div className="action-order">
            <button className="icon-button" onClick={onMoveUp} disabled={!onMoveUp} aria-label={`上移${action.label}`} title="上移">
              <ArrowUp size={15} />
            </button>
            <button className="icon-button" onClick={onMoveDown} disabled={!onMoveDown} aria-label={`下移${action.label}`} title="下移">
              <ArrowDown size={15} />
            </button>
          </div>
          <ShortcutInput action={action} onChange={onShortcutChange} />
          <button
            className={advanced ? 'icon-button pinned' : 'icon-button'}
            type="button"
            onClick={() => setAdvanced(!advanced)}
            aria-expanded={advanced}
            aria-label={`配置${action.label}的模型与提示词`}
            title="模型与提示词">
            {advanced ? <ChevronDown size={15} /> : <Settings2 size={15} />}
          </button>
          <button
            className={action.pinned ? 'icon-button pinned' : 'icon-button'}
            onClick={onPin}
            disabled={pinDisabled}
            aria-label={action.pinned ? `取消固定${action.label}` : `固定${action.label}`}
            aria-pressed={Boolean(action.pinned)}
            title={action.pinned ? '取消固定' : '固定到工具栏'}>
            {action.pinned ? <PinOff size={15} /> : <Pin size={15} />}
          </button>
          {onDelete && <button className="icon-button danger" onClick={onDelete} aria-label={`删除${action.label}`} title="删除动作"><Trash2 size={16} /></button>}
          <Switch checked={action.enabled} onChange={onToggle} label={`显示${action.label}`} />
        </div>
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
      {advanced && <ActionAdvancedEditor action={action} settings={settings} onSave={onUpdate} />}
    </div>
  )
}

function ActionAdvancedEditor({
  action,
  settings,
  onSave
}: {
  action: SelectionAction
  settings: AppSettings
  onSave: (patch: Partial<SelectionAction>) => void
}) {
  const [providerId, setProviderId] = useState(action.requestProfile?.providerId ?? '')
  const [model, setModel] = useState(action.requestProfile?.model ?? '')
  const [temperature, setTemperature] = useState<number | undefined>(action.requestProfile?.temperature)
  const [maxOutputTokens, setMaxOutputTokens] = useState<number | undefined>(action.requestProfile?.maxOutputTokens)
  const [prompt, setPrompt] = useState(action.prompt ?? '')

  useEffect(() => {
    setProviderId(action.requestProfile?.providerId ?? '')
    setModel(action.requestProfile?.model ?? '')
    setTemperature(action.requestProfile?.temperature)
    setMaxOutputTokens(action.requestProfile?.maxOutputTokens)
    setPrompt(action.prompt ?? '')
  }, [action])

  const requestProfile: ActionRequestProfile = {
    ...(providerId ? { providerId } : {}),
    ...(model.trim() ? { model: model.trim() } : {}),
    ...(temperature === undefined ? {} : { temperature }),
    ...(maxOutputTokens === undefined ? {} : { maxOutputTokens })
  }
  const draftAction: SelectionAction = {
    ...action,
    ...(prompt.trim() ? { prompt: prompt.trim() } : { prompt: undefined }),
    ...(Object.keys(requestProfile).length ? { requestProfile } : { requestProfile: undefined })
  }
  const unknownVariables = getUnknownPromptVariables(prompt)
  let profileSummary = ''
  let profileError = ''
  try {
    const profile = resolveRequestProfile(settings, draftAction)
    profileSummary = `${profile.providerName} · ${profile.model} · 温度 ${profile.temperature} · 最大输出 ${profile.maxOutputTokens ?? '服务默认'}`
  } catch (error) {
    profileError = readableError(error)
  }

  function saveAdvanced() {
    if (unknownVariables.length || profileError) return
    onSave({
      prompt: prompt.trim() || undefined,
      requestProfile: Object.keys(requestProfile).length ? requestProfile : undefined
    })
  }

  return (
    <div className="action-advanced">
      <div className="action-advanced-header">
        <strong>模型与提示词</strong>
        <span>留空即继承 Provider 默认配置</span>
      </div>
      <div className="field-grid">
        <label className="field-label">
          <span>Provider</span>
          <select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
            <option value="">继承默认 Provider</option>
            {settings.providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
          </select>
        </label>
        <label className="field-label">
          <span>模型覆盖</span>
          <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="继承 Provider 默认模型" />
        </label>
      </div>
      <div className="field-grid">
        <label className="field-label">
          <span>温度覆盖</span>
          <input
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={temperature ?? ''}
            onChange={(event) => setTemperature(optionalNumber(event.target.value))}
            placeholder="继承"
          />
        </label>
        <label className="field-label">
          <span>最大输出覆盖</span>
          <input
            type="number"
            min={1}
            max={MAX_OUTPUT_TOKENS}
            step={1}
            value={maxOutputTokens ?? ''}
            onChange={(event) => setMaxOutputTokens(optionalNumber(event.target.value))}
            placeholder="继承"
          />
        </label>
      </div>
      <label className="field-label">
        <span>{action.variants?.length ? '附加提示词（与二级动作要求组合）' : '提示词'}</span>
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={4} maxLength={2000} />
      </label>
      <PromptHelp prompt={prompt} settings={settings} />
      <div className="action-effective-profile">{profileError || profileSummary}</div>
      <div className="form-actions">
        <button className="secondary-button compact" type="button" onClick={saveAdvanced} disabled={unknownVariables.length > 0 || Boolean(profileError)}>
          <Save size={15} />保存高级配置
        </button>
      </div>
    </div>
  )
}

function PromptHelp({ prompt, settings }: { prompt: string; settings: AppSettings }) {
  const unknownVariables = getUnknownPromptVariables(prompt)
  const preview = prompt
    ? renderPromptTemplate(prompt, {
        text: '示例选中文本',
        language: settings.targetLanguage,
        program: '示例应用.exe',
        question: '请进一步说明。'
      })
    : ''

  return (
    <div className="prompt-help">
      <span>变量：{'{text}'}、{'{language}'}、{'{program}'}、{'{question}'}；使用 {'{{text}}'} 输出字面量。</span>
      {unknownVariables.length > 0 && (
        <strong role="alert">未知提示词变量：{unknownVariables.map((name) => `{${name}}`).join('、')}</strong>
      )}
      {preview && <pre>{preview}</pre>}
    </div>
  )
}

function ShortcutInput({ action, onChange }: { action: SelectionAction; onChange: (shortcut: string) => void }) {
  function capture(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Tab') return
    event.preventDefault()
    if (event.key === 'Backspace' || event.key === 'Delete') {
      onChange('')
      return
    }
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return

    const key = shortcutKey(event)
    if (!key) return
    const parts = [
      event.ctrlKey ? 'Ctrl' : '',
      event.altKey ? 'Alt' : '',
      event.shiftKey ? 'Shift' : '',
      event.metaKey ? 'Super' : '',
      key
    ].filter(Boolean)
    const shortcut = normalizeShortcut(parts.join('+'))
    if (shortcut) onChange(shortcut)
  }

  return (
    <div className="shortcut-control">
      <input
        value={action.shortcut ?? ''}
        onKeyDown={capture}
        onFocus={(event) => event.currentTarget.select()}
        readOnly
        placeholder="未设置"
        aria-label={`设置${action.label}快捷键`}
        title="点击后按下组合键"
      />
      {action.shortcut && (
        <button className="shortcut-clear" onClick={() => onChange('')} aria-label={`清除${action.label}快捷键`} title="清除快捷键">
          <X size={12} />
        </button>
      )}
    </div>
  )
}

function shortcutKey(event: ReactKeyboardEvent<HTMLInputElement>): string | null {
  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3)
  if (/^Digit\d$/.test(event.code)) return event.code.slice(5)
  if (/^F(?:[1-9]|1\d|2[0-4])$/.test(event.code)) return event.code
  const names: Record<string, string> = {
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    ArrowUp: 'Up',
    Enter: 'Enter',
    Escape: 'Esc',
    Home: 'Home',
    End: 'End',
    PageDown: 'PageDown',
    PageUp: 'PageUp',
    Space: 'Space'
  }
  return names[event.code] ?? null
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
  return <button className={`switch ${checked ? 'checked' : ''}`} type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}><span /></button>
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

function readableError(error: unknown): string {
  const message = error instanceof Error ? error.message : '保存失败'
  return message.replace(/^Error invoking remote method '[^']+': Error: /, '')
}

function formatSessionTime(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

function optionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}
