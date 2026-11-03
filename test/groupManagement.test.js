const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { parse: parseSfc } = require('@vue/compiler-sfc')
const { NodeTypes, parse: parseTemplate } = require('@vue/compiler-dom')

const root = path.join(__dirname, '..')

function readComponent(relativePath) {
  const filename = path.join(root, relativePath)
  const source = fs.readFileSync(filename, 'utf8')
  const { descriptor, errors } = parseSfc(source, { filename })
  assert.deepEqual(errors, [])
  assert.ok(descriptor.template)
  const ast = parseTemplate(descriptor.template.content)
  return { source, ast }
}

function findInput(ast, refName) {
  const pending = [...ast.children]
  while (pending.length) {
    const node = pending.shift()
    if (node.type !== NodeTypes.ELEMENT) continue
    if (node.tag === 'input' && node.props.some(prop => prop.name === 'ref' && prop.value?.content === refName)) {
      return node
    }
    pending.push(...node.children)
  }
  return null
}

test('new group name input stays labeled, model-bound, and focused on open', () => {
  const { source, ast } = readComponent('src/views/GroupManagement.vue')
  const input = findInput(ast, 'groupNameInput')

  assert.ok(input)
  assert.ok(input.props.some(prop => prop.type === NodeTypes.DIRECTIVE && prop.name === 'model' && prop.exp.content === 'groupName'))
  assert.ok(input.props.some(prop => prop.name === 'bind' && prop.arg?.content === 'aria-label' && prop.exp?.content === "$t('common.groupNameLabel')"))
  assert.match(source, /nextTick\(\(\) => groupNameInput\.value\?\.focus\(\)\)/)
})

test('new login-system name input stays labeled, model-bound, and focused on open', () => {
  const { source, ast } = readComponent('src/views/LoginSystems.vue')
  const input = findInput(ast, 'systemNameInput')

  assert.ok(input)
  assert.ok(input.props.some(prop => prop.type === NodeTypes.DIRECTIVE && prop.name === 'model' && prop.exp.content === 'systemForm.name'))
  assert.ok(input.props.some(prop => prop.name === 'aria-label' && prop.value?.content === 'system name'))
  assert.match(source, /systemNameInput\.value\?\.focus\(\)/)
})