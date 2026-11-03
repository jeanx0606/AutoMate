const assert = require('node:assert/strict')
const test = require('node:test')
const { validatePlatformWorkflow } = require('../electron/platformWorkflow')

test('workflow accepts bounded declarative form and navigation actions', () => {
  assert.deepEqual(validatePlatformWorkflow([
    {
      pathIncludes: '/login',
      actions: [
        { type: 'fill', selector: '#user', valueFrom: 'account' },
        { type: 'click', selector: 'button.next' }
      ]
    },
    {
      pathIncludes: '/verify',
      actions: [
        { type: 'select', selector: '#method', value: 'email' },
        { type: 'check', selector: '#accept', checked: true },
        { type: 'wait', milliseconds: 500 },
        { type: 'click', selector: '#continue' }
      ]
    }
  ]), [
    {
      id: 'step-1',
      pathIncludes: '/login',
      actions: [
        { type: 'fill', selector: '#user', valueFrom: 'account' },
        { type: 'click', selector: 'button.next' }
      ]
    },
    {
      id: 'step-2',
      pathIncludes: '/verify',
      actions: [
        { type: 'select', selector: '#method', value: 'email' },
        { type: 'check', selector: '#accept', checked: true },
        { type: 'wait', milliseconds: 500 },
        { type: 'click', selector: '#continue' }
      ]
    }
  ])
})

test('workflow rejects executable, cross-origin, and unbounded instructions', () => {
  assert.throws(() => validatePlatformWorkflow([
    { pathIncludes: 'https://evil.example', actions: [{ type: 'click', selector: '#next' }] }
  ]))
  assert.throws(() => validatePlatformWorkflow([
    { pathIncludes: '/login', actions: [{ type: 'script', code: 'alert(1)' }] }
  ]))
  assert.throws(() => validatePlatformWorkflow([
    { pathIncludes: '/login', actions: [{ type: 'fill', selector: '#user', valueFrom: 'password', value: 'leak' }] }
  ]))
  assert.throws(() => validatePlatformWorkflow([
    { pathIncludes: '/login', actions: [{ type: 'wait', milliseconds: 60000 }] }
  ]))
})