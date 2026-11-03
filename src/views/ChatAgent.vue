<template>
  <div class="chat-agent-view">
    <div class="assistant-toolbar">
      <div class="mode-tabs" role="tablist" aria-label="助手模式">
        <button type="button" role="tab" :aria-selected="mode === 'chat'" :class="{ active: mode === 'chat' }" @click="mode = 'chat'">对话</button>
        <button type="button" role="tab" :aria-selected="mode === 'plan'" :class="{ active: mode === 'plan' }" @click="mode = 'plan'">登录动作草案</button>
        <button type="button" role="tab" :aria-selected="mode === 'platform'" :class="{ active: mode === 'platform' }" @click="mode = 'platform'">创建平台</button>
      </div>
      <span class="connection-state" title="服务在线不代表所选模型一定能加载" :class="ollamaStatus?.available ? 'online' : 'offline'">
        <span class="state-dot"></span>
        {{ statusLabel }}
      </span>
      <button class="help-toggle" type="button" :aria-expanded="showHelp" aria-label="本地助手设置帮助" title="本地助手设置帮助" @click="showHelp = !showHelp">?</button>
    </div>

    <section v-if="mode === 'chat'" class="chat-panel">
      <div v-if="showHelp" class="setup-help">
        <section class="agent-status">
          <div>
            <h2 class="section-title">本地 AI 助手</h2>
            <p class="status-copy">对话在本机运行；保存的账号密码不会发给模型。</p>
          </div>
          <div class="status-actions">
            <button class="icon-button" type="button" title="刷新 Ollama 状态" aria-label="刷新 Ollama 状态" :disabled="checking" @click="refreshStatus">
              <span :class="{ spinning: checking }">↻</span>
            </button>
          </div>
        </section>

        <section v-if="!ollamaStatus?.available" class="setup-panel">
      <h3>设置本地助手</h3>
      <ol class="install-steps">
        <li>AutoMate 下载并验证 Ollama 官方 Windows 安装程序。</li>
        <li>完成安装程序中的步骤和 Windows 权限提示。</li>
        <li>AutoMate 启动本地服务并下载所选模型（默认 {{ recommendedModel }}）。</li>
      </ol>
      <label class="model-input-label">模型
        <input v-model="modelInput" class="form-input" type="text" maxlength="128" placeholder="qwen2.5:3b" spellcheck="false" :disabled="installing" />
      </label>
      <div class="install-actions">
        <button class="btn btn-primary" type="button" :disabled="installing" @click="installOllamaAndModel">
          {{ installing ? setupProgressLabel : '安装 Ollama 并下载模型' }}
        </button>
        <button
          v-if="installing && setupProgress?.stage === 'download'"
          class="btn btn-secondary"
          type="button"
          :disabled="cancelingDownload"
          @click="cancelOllamaDownload"
        >{{ cancelingDownload ? '正在取消...' : '取消下载' }}</button>
        <button class="btn btn-secondary" type="button" @click="openOllamaDownload">手动下载</button>
        <button class="btn btn-secondary" type="button" @click="refreshStatus" :disabled="checking">检查连接</button>
      </div>
      <p class="install-location">Ollama 将安装到默认位置：用户目录下的 AppData\Local\Programs\Ollama。</p>
      <p v-if="setupProgress && (installing || setupProgress.stage === 'cancelled')" class="setup-progress">{{ setupProgressLabel }}</p>
      <progress
        v-if="setupProgress?.stage === 'download' && setupProgress.total"
        class="setup-progress-bar"
        :value="setupProgress.completed"
        :max="setupProgress.total"
        aria-label="Ollama 安装程序下载进度"
      />
      <p v-if="setupError" class="error-copy">{{ setupError }}</p>
      <p v-if="ollamaStatus?.message" class="error-copy">{{ ollamaStatus.message }}</p>
        </section>

        <section v-else class="model-row">
      <label for="chat-model">模型</label>
      <select id="chat-model" v-model="selectedModel" :disabled="ollamaStatus.models.length === 0">
        <option v-for="model in ollamaStatus.models" :key="model.name" :value="model.name">
          {{ model.name }} · {{ formatSize(model.size) }}
        </option>
      </select>
      <span v-if="ollamaStatus.models.length === 0" class="model-empty">尚未安装模型</span>
        </section>

        <section v-if="ollamaStatus?.available && !hasRecommendedModel" class="model-setup">
      <div>
        <h3>推荐模型：{{ recommendedModel }}</h3>
        <p>也可以输入其他模型名（如 llama3.2、qwen2.5:7b）再下载。</p>
      </div>
      <label class="model-input-label">模型
        <input v-model="modelInput" class="form-input" type="text" maxlength="128" placeholder="qwen2.5:3b" spellcheck="false" :disabled="pulling" />
      </label>
      <button class="btn btn-secondary" type="button" :disabled="pulling" @click="pullModel">
        {{ pulling ? pullProgressLabel : '下载模型' }}
      </button>
        </section>
      </div>
      <div class="conversation" aria-live="polite">
        <p v-if="messages.length === 0" class="empty-conversation">向本地助手询问平台配置、分组或 Wi-Fi 相关问题。</p>
        <article v-for="(message, index) in messages" :key="index" class="message" :class="message.role">
          <span v-if="message.role === 'assistant'" class="message-role">助手</span>
          <p>{{ message.content }}</p>
          <div v-if="message.role === 'assistant' && message.choices?.length" class="choice-list">
            <button v-for="choice in message.choices" :key="choice.value" class="choice-button" type="button" :disabled="sending" @click="sendChoice(choice)">
              {{ choice.label }}
            </button>
          </div>
        </article>
        <div v-if="sending" class="thinking-message" role="status" aria-live="polite">
          <span>正在思考</span><span class="thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span>
        </div>
        <div v-if="pendingAction" class="pending-action">
          <p>助手请求启动“{{ pendingAction.platformName }}”登录。确认后将在默认浏览器打开。</p>
          <div class="pending-action-buttons">
            <button class="btn btn-primary" type="button" :disabled="confirmingAction" @click="confirmPendingAction">
              {{ confirmingAction ? '正在启动...' : '确认启动' }}
            </button>
            <button class="btn btn-secondary" type="button" :disabled="confirmingAction" @click="cancelPendingAction">取消</button>
          </div>
        </div>
        <p v-if="chatError" class="error-copy">{{ chatError }}</p>
      </div>
      <form class="composer" @submit.prevent="sendMessage">
        <textarea
          v-model="draft"
          rows="3"
          maxlength="4000"
          placeholder="输入问题；不要粘贴密码、令牌或配对码。"
          :disabled="!canUseModel || sending"
          @keydown.enter="handleComposerKeydown"
        ></textarea>
        <button class="btn btn-primary" type="submit" :disabled="!canUseModel || sending || !draft.trim()">
          {{ sending ? '思考中...' : '发送' }}
        </button>
      </form>
    </section>

    <section v-else-if="mode === 'plan'" class="plan-panel">
      <form class="plan-form" @submit.prevent="generatePlan">
        <label for="plan-description">描述登录页面的字段和按钮位置，不要包含账号或密码。</label>
        <textarea id="plan-description" v-model="planDescription" rows="4" maxlength="4000" placeholder="例如：账号输入框 id 是 user，密码输入框 id 是 pass，提交按钮是 .sign-in"></textarea>
        <button class="btn btn-primary" type="submit" :disabled="!canUseModel || generating || !planDescription.trim()">
          {{ generating ? '生成中...' : '生成草案' }}
        </button>
      </form>
      <p v-if="planError" class="error-copy">{{ planError }}</p>
      <div v-if="plan" class="plan-preview">
        <div class="preview-heading">
          <h3>待审查草案</h3>
          <span>不会执行或修改平台</span>
        </div>
        <pre>{{ JSON.stringify(plan, null, 2) }}</pre>
        <button class="btn btn-secondary" type="button" @click="applyPlanToDraft">将选择器用于平台草案</button>
      </div>
    </section>

    <section v-else class="platform-panel">
      <form class="plan-form" @submit.prevent="generatePlatformDraft">
        <label for="platform-description">描述网页名称、登录网址及页面字段特征，不要提供账号、密码或令牌。</label>
        <textarea id="platform-description" v-model="platformDescription" rows="3" maxlength="4000" placeholder="例如：校园门户，登录网址 https://portal.example.edu/login，用户名输入框 #user，密码输入框 #pass，登录按钮 .submit"></textarea>
        <button class="btn btn-primary" type="submit" :disabled="!canUseModel || generatingPlatform || !platformDescription.trim()">
          {{ generatingPlatform ? '整理草案中...' : '生成平台草案' }}
        </button>
      </form>
      <p v-if="platformError" class="error-copy">{{ platformError }}</p>

      <div class="template-tools">
        <label for="saved-template">模板</label>
        <select id="saved-template" :value="selectedTemplateId" @change="loadTemplate($event.target.value)">
          <option value="">选择已保存模板</option>
          <option v-for="template in templates" :key="template.id" :value="template.id">{{ template.name }}</option>
        </select>
        <button v-if="selectedTemplateId" class="btn btn-secondary" type="button" title="删除所选模板" aria-label="删除所选模板" @click="deleteTemplate">删除模板</button>
      </div>

      <div class="draft-form">
        <div class="preview-heading">
          <h3>平台草案</h3>
          <span>生成内容仅填入此表单，不会自动执行</span>
        </div>
        <div class="draft-fields">
          <label>平台名称<input v-model="platformDraft.name" class="form-input" type="text" maxlength="100" autocomplete="off" required /></label>
          <label>登录网址<input v-model="platformDraft.url" class="form-input" type="url" placeholder="https://example.com/login" required /></label>
          <label>账号输入框选择器<input v-model="platformDraft.accountSelector" class="form-input" type="text" maxlength="256" placeholder="#username" /></label>
          <label>密码输入框选择器<input v-model="platformDraft.passwordSelector" class="form-input" type="text" maxlength="256" placeholder="#password" /></label>
          <label>提交按钮选择器<input v-model="platformDraft.submitSelector" class="form-input" type="text" maxlength="256" placeholder="button[type=submit]" /></label>
          <label>成功网址标识<input v-model="platformDraft.successUrl" class="form-input" type="text" maxlength="512" placeholder="/dashboard" /></label>
        </div>

        <form class="local-credentials" @submit.prevent="saveDraftPlatform">
          <h3>本机凭据</h3>
          <p>账号和密码只传给 AutoMate 保存，不会发送给 Ollama；保存时仍由 AutoMate 加密。</p>
          <div class="draft-fields credential-fields">
              <label>账号<input v-model="platformCredentials.account" class="form-input" type="text" autocomplete="off" required /></label>
              <label>密码<input v-model="platformCredentials.password" class="form-input" type="password" autocomplete="new-password" required /></label>
          </div>
          <div class="draft-actions">
            <label class="template-name">模板名称<input v-model="templateName" class="form-input" type="text" maxlength="80" placeholder="例如：校园统一认证" /></label>
            <button class="btn btn-secondary" type="button" :disabled="savingTemplate" @click="saveTemplate">{{ savingTemplate ? '保存中...' : '保存为模板' }}</button>
            <button class="btn btn-primary" type="submit" :disabled="savingPlatform || !canSavePlatformDraft">{{ savingPlatform ? '保存中...' : '保存网页平台' }}</button>
          </div>
        </form>
        <p v-if="draftMessage" class="draft-message" :class="draftError ? 'error-copy' : 'success-copy'">{{ draftMessage }}</p>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useStore } from '../store'

const store = useStore()
if (!Array.isArray(store.chatMessages)) store.chatMessages = []

const ollamaStatus = ref(null)
const selectedModel = ref('')
const checking = ref(false)
const pulling = ref(false)
const pullProgress = ref(null)
const installing = ref(false)
const cancelingDownload = ref(false)
const setupProgress = ref(null)
const modelInput = ref('qwen2.5:3b')
const sending = ref(false)
const showHelp = ref(false)
const generating = ref(false)
const mode = ref('chat')
const messages = computed(() => store.chatMessages)
const draft = ref('')
const chatError = ref('')
const pendingAction = ref(null)
const confirmingAction = ref(false)
const setupError = ref('')
const planDescription = ref('')
const plan = ref(null)
const planError = ref('')
const platformDescription = ref('')
const platformDraft = reactive({ name: '', url: '', accountSelector: '', passwordSelector: '', submitSelector: '', successUrl: '' })
const platformCredentials = reactive({ account: '', password: '' })
const platformError = ref('')
const generatingPlatform = ref(false)
const savingPlatform = ref(false)
const savingTemplate = ref(false)
const draftMessage = ref('')
const draftError = ref(false)
const templates = ref([])
const selectedTemplateId = ref('')
const templateName = ref('')
let removePullListener = null
let removeSetupListener = null

const recommendedModel = computed(() => ollamaStatus.value?.recommendedModel || 'qwen2.5:3b')
const hasRecommendedModel = computed(() => ollamaStatus.value?.models?.some(model => model.name === recommendedModel.value) || false)
const canUseModel = computed(() => !!selectedModel.value && hasRecommendedModel.value || !!selectedModel.value && ollamaStatus.value?.models?.some(model => model.name === selectedModel.value))
const canSavePlatformDraft = computed(() => {
  try {
    const url = new URL(platformDraft.url)
    return !!platformDraft.name.trim() && !!platformCredentials.account.trim() && !!platformCredentials.password && ['http:', 'https:'].includes(url.protocol)
  } catch (_) {
    return false
  }
})
const statusLabel = computed(() => {
  if (!ollamaStatus.value) return '正在检测'
  return ollamaStatus.value.available ? 'Ollama 服务在线' : 'Ollama 服务离线'
})
const pullProgressLabel = computed(() => {
  const progress = pullProgress.value
  if (!progress?.total) return '正在连接...'
  return `下载中 ${Math.floor(progress.completed / progress.total * 100)}%`
})
const setupProgressLabel = computed(() => {
  const progress = setupProgress.value
  if (!progress) return '正在准备...'
  if (progress.retrying) return `下载连接中断，正在自动续传；剩余重试 ${progress.retriesRemaining} 次`
  if (progress.stage === 'checking') return '正在检查 Ollama 安装状态...'
  if (progress.stage === 'checking-network') return '正在检查互联网连接...'
  if (progress.stage === 'download') {
    const downloadedMb = (progress.completed / 1024 ** 2).toFixed(1)
    if (!progress.total && progress.completed > 0) return `已下载 ${downloadedMb} MB，正在接收安装程序...`
    if (!progress.total) return '正在连接 Ollama 下载源...'
    const totalMb = (progress.total / 1024 ** 2).toFixed(1)
    const percent = (progress.completed / progress.total * 100).toFixed(1)
    return `下载 Ollama 安装程序 ${percent}%（${downloadedMb} / ${totalMb} MB）`
  }
  if (progress.stage === 'verify') return '正在验证 Ollama 安装程序数字签名...'
  if (progress.stage === 'cancelling') return '正在停止下载并清理临时文件...'
  if (progress.stage === 'cancelled') return '下载已取消，临时文件已清理。'
  if (progress.stage === 'install') return 'Ollama 安装程序已打开。请在安装窗口中继续；窗口关闭后 AutoMate 会验证安装。'
  if (progress.stage === 'starting') return '安装程序已结束，正在检查 Ollama 本地服务...'
  if (progress.stage === 'model') {
    const target = progress.model || modelInput.value || recommendedModel.value
    if (!progress.total) return `正在下载 ${target}...`
    return `下载 ${target} ${Math.floor(progress.completed / progress.total * 100)}%`
  }
  if (progress.stage === 'failed') return `安装失败：${progress.message || '未知错误'}`
  if (progress.stage === 'complete') return '本地助手已就绪'
  return '正在准备...'
})

onMounted(() => {
  refreshStatus()
  loadTemplates()
  removePullListener = window.autoMate.onChatAgentPullProgress(progress => {
    pullProgress.value = progress
  })
  removeSetupListener = window.autoMate.onChatAgentSetupProgress(progress => {
    setupProgress.value = progress
    if (progress.stage === 'complete' || progress.stage === 'failed') installing.value = false
    if (progress.stage === 'cancelled') {
      installing.value = false
      cancelingDownload.value = false
    }
  })
  window.autoMate.getChatAgentSetupStatus().then(status => {
    if (!status.progress) return
    setupProgress.value = status.progress
    installing.value = status.inProgress
    if (status.progress.stage === 'failed') setupError.value = status.progress.message || 'Ollama 安装失败'
  }).catch(() => {})
})

onUnmounted(() => {
  removePullListener?.()
  removeSetupListener?.()
})

function formatSize(size) {
  if (!size) return '大小未知'
  if (size >= 1024 ** 3) return `${(size / 1024 ** 3).toFixed(1)} GB`
  return `${(size / 1024 ** 2).toFixed(0)} MB`
}

async function refreshStatus() {
  checking.value = true
  try {
    ollamaStatus.value = await window.autoMate.getChatAgentStatus()
    const models = ollamaStatus.value.models || []
    selectedModel.value = models.some(model => model.name === recommendedModel.value)
      ? recommendedModel.value
      : models[0]?.name || ''
  } catch (err) {
    ollamaStatus.value = { available: false, models: [], message: err.message }
  } finally {
    checking.value = false
  }
}

async function openOllamaDownload() {
  setupError.value = ''
  try {
    const result = await window.autoMate.openOllamaDownload()
    if (!result.success) throw new Error(result.error || '无法打开 Ollama 下载页')
  } catch (err) {
    setupError.value = err.message
  }
}

async function cancelOllamaDownload() {
  if (cancelingDownload.value) return
  if (typeof window.autoMate?.cancelChatAgentSetup !== 'function') {
    setupError.value = '取消功能尚未加载。请完全退出并重新启动 AutoMate 后再试。'
    return
  }
  cancelingDownload.value = true
  setupProgress.value = { stage: 'cancelling' }
  try {
    const result = await window.autoMate.cancelChatAgentSetup()
    if (!result.success) throw new Error(result.error || '无法取消当前步骤')
  } catch (error) {
    cancelingDownload.value = false
    setupError.value = error.message
  }
}

async function installOllamaAndModel() {
  let followingExistingSetup = false
  setupError.value = ''
  try {
    installing.value = true
    setupProgress.value = { stage: 'checking' }
    if (typeof window.autoMate?.installOllamaAndPullModel !== 'function') {
      throw new Error('AutoMate 后台组件版本过旧。请完全退出并重新启动 AutoMate 后再试。')
    }
    const result = await window.autoMate.installOllamaAndPullModel(modelInput.value.trim() || undefined)
    if (result.cancelled) {
      setupProgress.value = { stage: 'cancelled' }
      return
    }
    if (result.inProgress) {
      followingExistingSetup = true
      setupProgress.value = result.progress || setupProgress.value
      return
    }
    if (!result.success) throw new Error(result.error || 'Ollama 安装失败')
    setupProgress.value = { stage: 'complete' }
    await refreshStatus()
  } catch (error) {
    setupError.value = error.message
  } finally {
    if (!followingExistingSetup) installing.value = false
  }
}

async function pullModel() {
  pulling.value = true
  pullProgress.value = null
  chatError.value = ''
  try {
    const result = await window.autoMate.pullChatModel(modelInput.value.trim() || undefined)
    if (!result.success) throw new Error(result.error)
    await refreshStatus()
  } catch (err) {
    chatError.value = err.message
  } finally {
    pulling.value = false
  }
}

function handleComposerKeydown(event) {
  if (!event.shiftKey) {
    event.preventDefault()
    sendMessage()
  }
}

async function sendMessage() {
  const content = draft.value.trim()
  if (!content || sending.value) return
  pendingAction.value = null
  messages.value.push({ role: 'user', content })
  draft.value = ''
  chatError.value = ''
  sending.value = true
  try {
    const chatMessages = messages.value.map(({ role, content }) => ({ role, content }))
    const result = await window.autoMate.sendChatAgentMessage({ model: selectedModel.value, messages: chatMessages })
    if (!result.success) throw new Error(result.error)
    messages.value.push({ role: 'assistant', content: result.reply, choices: result.choices || [] })
    pendingAction.value = result.action || null
  } catch (err) {
    chatError.value = err.message
  } finally {
    sending.value = false
  }
}

function sendChoice(choice) {
  if (sending.value) return
  const sourceMessage = [...messages.value].reverse().find(message => message.role === 'assistant' && message.choices?.some(option => option.value === choice.value))
  if (sourceMessage) sourceMessage.choices = []
  draft.value = choice.value
  sendMessage()
}

async function confirmPendingAction() {
  if (!pendingAction.value || confirmingAction.value) return
  const action = pendingAction.value
  pendingAction.value = null
  confirmingAction.value = true
  chatError.value = ''
  try {
    const result = await window.autoMate.startAutoLogin(action.platformId)
    if (!result.success && !result.pending) {
      throw new Error(result.error || result.message || '无法启动登录')
    }
    messages.value.push({
      role: 'assistant',
      content: result.pending
        ? `已在默认浏览器打开“${action.platformName}”。请在浏览器中完成验证。`
        : `“${action.platformName}”登录已启动。`
    })
  } catch (error) {
    chatError.value = error.message
  } finally {
    confirmingAction.value = false
  }
}

function cancelPendingAction() {
  pendingAction.value = null
  messages.value.push({ role: 'assistant', content: '已取消，没有启动登录。' })
}

async function generatePlan() {
  if (generating.value) return
  generating.value = true
  plan.value = null
  planError.value = ''
  try {
    const result = await window.autoMate.generateChatAgentPlan({
      model: selectedModel.value,
      description: planDescription.value.trim()
    })
    if (!result.success) throw new Error(result.error)
    plan.value = result.plan
  } catch (err) {
    planError.value = err.message
  } finally {
    generating.value = false
  }
}

function applyPlanToDraft() {
  if (!plan.value) return
  platformDraft.accountSelector = plan.value.actions.find(action => action.type === 'fill' && action.valueFrom === 'account')?.selector || platformDraft.accountSelector
  platformDraft.passwordSelector = plan.value.actions.find(action => action.type === 'fill' && action.valueFrom === 'password')?.selector || platformDraft.passwordSelector
  platformDraft.submitSelector = plan.value.actions.find(action => action.type === 'click')?.selector || platformDraft.submitSelector
  mode.value = 'platform'
  draftMessage.value = '已复制选择器。检查名称和网址后，再决定保存平台。'
  draftError.value = false
}

async function generatePlatformDraft() {
  if (generatingPlatform.value) return
  generatingPlatform.value = true
  platformError.value = ''
  draftMessage.value = ''
  try {
    const result = await window.autoMate.generateChatAgentPlatformDraft({
      model: selectedModel.value,
      description: platformDescription.value.trim()
    })
    if (!result.success) throw new Error(result.error || '无法生成平台草案')
    Object.assign(platformDraft, result.draft)
    selectedTemplateId.value = ''
    templateName.value = platformDraft.name
  } catch (error) {
    platformError.value = error.message
  } finally {
    generatingPlatform.value = false
  }
}

async function loadTemplates() {
  try {
    templates.value = await window.autoMate.getChatAgentTemplates()
  } catch (_) {
    templates.value = []
  }
}

function loadTemplate(templateId) {
  selectedTemplateId.value = templateId
  const template = templates.value.find(item => item.id === templateId)
  if (!template) return
  Object.assign(platformDraft, template.draft)
  templateName.value = template.name
  platformCredentials.account = ''
  platformCredentials.password = ''
  draftMessage.value = '模板已载入。请在本机填写凭据并检查配置。'
  draftError.value = false
}

async function saveTemplate() {
  savingTemplate.value = true
  draftMessage.value = ''
  try {
    const result = await window.autoMate.saveChatAgentTemplate({
      id: selectedTemplateId.value || undefined,
      name: templateName.value,
      draft: { ...platformDraft }
    })
    if (!result.success) throw new Error(result.error || '模板保存失败')
    await loadTemplates()
    selectedTemplateId.value = result.template.id
    draftMessage.value = '模板已保存，不包含账号或密码。'
    draftError.value = false
  } catch (error) {
    draftMessage.value = error.message
    draftError.value = true
  } finally {
    savingTemplate.value = false
  }
}

async function deleteTemplate() {
  const result = await window.autoMate.deleteChatAgentTemplate(selectedTemplateId.value)
  if (!result.success) {
    draftMessage.value = result.error || '模板删除失败'
    draftError.value = true
    return
  }
  selectedTemplateId.value = ''
  await loadTemplates()
  draftMessage.value = '模板已删除。'
  draftError.value = false
}

async function saveDraftPlatform() {
  savingPlatform.value = true
  draftMessage.value = ''
  try {
    const result = await store.savePlatform({
      ...platformDraft,
      type: 'web',
      accountSource: 'custom',
      account: platformCredentials.account,
      password: platformCredentials.password,
      groupId: null,
      scheduleDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      autoConnect: false
    })
    if (!result.success) throw new Error(result.error || '平台保存失败')
    platformCredentials.account = ''
    platformCredentials.password = ''
    draftMessage.value = '网页平台已保存。'
    draftError.value = false
  } catch (error) {
    draftMessage.value = error.message
    draftError.value = true
  } finally {
    savingPlatform.value = false
  }
}
</script>

<style scoped>
.chat-agent-view {
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.assistant-toolbar { display: flex; align-items: center; gap: 12px; min-width: 0; }
.assistant-toolbar > .connection-state { flex: 0 0 auto; }
.mode-tabs { flex: 1 1 auto; min-width: 0; }
.help-toggle { position: static; z-index: 6; display: grid; place-items: center; flex: 0 0 30px; width: 30px; height: 30px; border: 1px solid var(--color-border); border-radius: 50%; background: var(--accent-sky); color: var(--accent-sky-ink); font-size: 16px; font-weight: 700; }
.help-toggle:hover { background: var(--accent-lavender); color: var(--accent-lavender-ink); }
.setup-help { position: absolute; top: 50px; right: 12px; z-index: 5; display: grid; gap: 10px; width: min(460px, calc(100% - 24px)); max-height: min(70vh, 620px); overflow-y: auto; padding: 12px; border: 1px solid var(--color-border); border-radius: var(--radius); background: linear-gradient(135deg, var(--accent-sky) 0%, var(--accent-lavender) 100%); box-shadow: var(--shadow-md); }

.agent-status,
.model-row,
.model-setup,
.setup-panel,
.chat-panel,
.plan-panel,
.platform-panel {
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  padding: 16px 18px;
}

.agent-status,
.model-row,
.model-setup,
.status-actions,
.data-actions,
.preview-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-title,
.model-setup h3,
.setup-panel h3,
.preview-heading h3 {
  margin: 0;
  font-size: 16px;
  color: var(--color-text);
}

.status-copy,
.model-setup p,
.setup-panel p,
.preview-heading span {
  margin: 5px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.connection-state {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  white-space: nowrap;
}

.state-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--status-idle);
}

.connection-state.online .state-dot { background: var(--status-success); }
.connection-state.offline .state-dot { background: var(--status-failed); }

.icon-button {
  width: 34px;
  height: 34px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
  font-size: 20px;
}

.spinning { display: inline-block; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.setup-panel { border-left: 3px solid var(--status-failed); }
.setup-progress { margin-top: 10px; color: var(--color-primary); font-size: 13px; }
.setup-progress-bar { width: 100%; height: 8px; margin-top: 8px; accent-color: var(--color-primary); }
.install-location { margin-top: 10px; color: var(--text-secondary); font-size: 12px; overflow-wrap: anywhere; }
.install-steps { padding-left: 20px; color: var(--text-secondary); font-size: 13px; line-height: 1.7; }
.install-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.model-input-label { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 12px; font-weight: 600; color: var(--color-text); }
.model-input-label input { min-width: 180px; height: 34px; padding: 0 8px; border: 1px solid var(--color-border); border-radius: 4px; background: var(--color-surface); color: var(--color-text); font: inherit; font-weight: 400; }
.error-copy { color: var(--status-failed); font-size: 13px; }

.model-row label { font-size: 13px; font-weight: 600; }
.model-row select {
  min-width: 220px;
  max-width: 65%;
  height: 36px;
  padding: 0 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
}
.model-empty { margin-left: auto; color: var(--text-secondary); font-size: 12px; }
.model-setup { border-left: 3px solid var(--status-logging); }
.model-setup code { color: var(--color-text); }

.mode-tabs { display: flex; gap: 6px; border-bottom: 1px solid var(--color-border); }
.mode-tabs button {
  padding: 9px 12px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
}
.mode-tabs button.active { color: var(--color-primary); border-bottom-color: var(--color-primary); }
.mode-tabs button:nth-child(1).active { color: var(--accent-sky-ink); background: var(--accent-sky); border-bottom-color: var(--accent-sky-ink); }
.mode-tabs button:nth-child(2).active { color: var(--accent-peach-ink); background: var(--accent-peach); border-bottom-color: var(--accent-peach-ink); }
.mode-tabs button:nth-child(3).active { color: var(--accent-lavender-ink); background: var(--accent-lavender); border-bottom-color: var(--accent-lavender-ink); }

.chat-panel,
.plan-panel { border: 1px solid var(--color-border); border-radius: var(--radius); }
.chat-panel { position: relative; }
.conversation { min-height: 240px; max-height: 420px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.empty-conversation { color: var(--text-secondary); font-size: 13px; }
.message { max-width: 88%; padding: 10px 12px; background: var(--accent-lavender); border-radius: 6px; }
.message.user { align-self: flex-end; background: var(--accent-sky); }
.message.assistant { align-self: flex-start; }
.message-role { font-size: 11px; color: var(--text-tertiary); }
.message p { margin: 4px 0 0; font-size: 13px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
.message.user p { margin-top: 0; }
.choice-list { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 10px; }
.choice-button { padding: 6px 11px; border: 1px solid var(--accent-lavender-ink); border-radius: 16px; background: var(--color-surface); color: var(--accent-lavender-ink); font-size: 12px; }
.choice-button:hover:not(:disabled) { background: var(--accent-lavender-ink); color: #fff; }
.thinking-message { display: flex; align-items: center; align-self: flex-start; gap: 8px; width: fit-content; padding: 10px 12px; border-radius: 6px; background: var(--accent-lavender); color: var(--accent-lavender-ink); font-size: 13px; }
.thinking-dots { display: inline-flex; align-items: center; gap: 3px; height: 12px; }
.thinking-dots i { width: 4px; height: 4px; border-radius: 50%; background: currentColor; animation: think-bounce 0.9s infinite ease-in-out; }
.thinking-dots i:nth-child(2) { animation-delay: 0.15s; }
.thinking-dots i:nth-child(3) { animation-delay: 0.3s; }
@keyframes think-bounce { 0%, 60%, 100% { opacity: 0.35; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-3px); } }
.pending-action { align-self: flex-start; max-width: 88%; padding: 12px; background: var(--accent-peach); border: 1px solid #ecd8ca; border-left: 3px solid var(--accent-peach-ink); }
.pending-action p { margin: 0; font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }
.pending-action-buttons { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }

.composer,
.plan-form { display: flex; flex-direction: column; align-items: flex-end; gap: 10px; margin-top: 14px; }
.composer textarea,
.plan-form textarea {
  width: 100%;
  resize: vertical;
  box-sizing: border-box;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text);
  font: inherit;
}
.plan-form { align-items: stretch; }
.plan-form label { font-size: 13px; color: var(--color-text); }
.plan-preview { margin-top: 18px; }
.plan-preview pre { max-height: 320px; overflow: auto; padding: 12px; background: var(--color-surface-muted); font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
.plan-preview .btn { margin-top: 10px; }
.template-tools { display: flex; align-items: center; gap: 8px; margin: 18px 0; }
.template-tools label { font-size: 13px; font-weight: 600; }
.template-tools select { min-width: 200px; height: 36px; padding: 0 8px; border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text); }
.draft-form { padding-top: 16px; border-top: 1px solid var(--color-border); }
.draft-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 14px; }
.draft-fields label, .template-name { display: grid; gap: 6px; min-width: 0; font-size: 12px; font-weight: 600; color: var(--color-text); }
.draft-fields .form-input { width: 100%; min-height: 38px; padding: 8px 10px; border: 1px solid var(--color-border); border-radius: 4px; background: var(--color-surface); color: var(--color-text); font: inherit; font-weight: 400; }
.draft-fields .form-input:focus, .template-name .form-input:focus { border-color: var(--color-primary); box-shadow: 0 0 0 3px var(--color-primary-light); }
.local-credentials { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--color-border); }
.local-credentials h3 { margin: 0; font-size: 14px; }
.local-credentials p { margin-top: 5px; color: var(--text-secondary); font-size: 12px; line-height: 1.5; }
.draft-actions { display: grid; grid-template-columns: minmax(140px, 1fr) auto auto; align-items: end; gap: 8px; margin-top: 14px; }
.success-copy { color: var(--status-success); font-size: 13px; }
.draft-message { margin-top: 12px; }

@media (max-width: 640px) {
  .assistant-toolbar { flex-wrap: wrap; }
  .assistant-toolbar .mode-tabs { flex: 1 1 100%; overflow-x: auto; }
  .agent-status,
  .model-setup { align-items: flex-start; flex-direction: column; }
  .status-actions { width: 100%; justify-content: flex-start; }
  .model-row { flex-wrap: wrap; }
  .model-row select { max-width: 100%; flex: 1 1 100%; }
  .message { max-width: 100%; }
  .thinking-message { max-width: 100%; }
  .pending-action { max-width: 100%; }
  .draft-fields { grid-template-columns: 1fr; }
  .draft-actions { grid-template-columns: 1fr; }
  .template-tools { align-items: stretch; flex-wrap: wrap; }
  .template-tools select { flex: 1 1 100%; }
}

@media (prefers-reduced-motion: reduce) {
  .thinking-dots i { animation: none; opacity: 0.65; }
}
</style>
