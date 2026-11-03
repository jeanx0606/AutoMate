const MAX_WORKFLOW_STEPS = 8
const MAX_ACTIONS_PER_STEP = 12
const MAX_SELECTOR_LENGTH = 256

function validateSelector(value) {
  const selector = String(value || '').trim()
  if (!selector || selector.length > MAX_SELECTOR_LENGTH || /^(?:javascript:|data:)/i.test(selector)) {
    throw new Error('工作流包含无效 CSS 选择器')
  }
  return selector
}

function validatePlatformWorkflow(workflow) {
  if (workflow == null) return []
  if (!Array.isArray(workflow) || workflow.length > MAX_WORKFLOW_STEPS) {
    throw new Error('工作流步骤数量无效')
  }

  return workflow.map((step, stepIndex) => {
    const pathIncludes = String(step?.pathIncludes || '').trim()
    if (!pathIncludes.startsWith('/') || pathIncludes.startsWith('//') || pathIncludes.length > 160 || pathIncludes.includes('..')) {
      throw new Error('工作流页面路径必须是本站路径片段')
    }
    if (!Array.isArray(step.actions) || !step.actions.length || step.actions.length > MAX_ACTIONS_PER_STEP) {
      throw new Error('工作流操作数量无效')
    }

    const actions = step.actions.map(action => {
      if (action?.type === 'fill') {
        const selector = validateSelector(action.selector)
        if (['account', 'password'].includes(action.valueFrom)) {
          if (action.value !== undefined && action.value !== null && String(action.value).trim() !== '') {
            throw new Error('工作流填写不能同时指定凭据字段与固定值')
          }
          return { type: 'fill', selector, valueFrom: action.valueFrom }
        }
        if (action.valueFrom === 'literal') {
          const value = String(action.value || '').trim().slice(0, 160)
          if (!value) throw new Error('工作流填写内容不能为空')
          return { type: 'fill', selector, valueFrom: 'literal', value }
        }
      }
      if (action?.type === 'select') {
        const selector = validateSelector(action.selector)
        const value = String(action.value || '').trim().slice(0, 120)
        if (!value) throw new Error('工作流选项不能为空')
        return { type: 'select', selector, value }
      }
      if (action?.type === 'check' && typeof action.checked === 'boolean') {
        return { type: 'check', selector: validateSelector(action.selector), checked: action.checked }
      }
      if (action?.type === 'click') return { type: 'click', selector: validateSelector(action.selector) }
      if (action?.type === 'wait' && Number.isInteger(action.milliseconds) && action.milliseconds >= 100 && action.milliseconds <= 10000) {
        return { type: 'wait', milliseconds: action.milliseconds }
      }
      throw new Error('工作流包含未允许或无效的操作')
    })

    return { id: `step-${stepIndex + 1}`, pathIncludes, actions }
  })
}

module.exports = { validatePlatformWorkflow }