import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const footerSource = readFileSync(new URL('../src/components/Footer.jsx', import.meta.url), 'utf8')
const complianceSource = readFileSync(new URL('../src/pages/CompliancePage.jsx', import.meta.url), 'utf8')

test('shows the approved ICP record and links to the MIIT filing platform', () => {
  assert.match(footerSource, /粤ICP备2026085133号/)
  assert.match(footerSource, /https:\/\/beian\.miit\.gov\.cn\//)
})

test('does not publish placeholder filing numbers', () => {
  assert.doesNotMatch(footerSource, /XXXXXXXX/)
  assert.doesNotMatch(footerSource, /公网安备/)
})

test('discloses third-party AI service sources', () => {
  assert.match(complianceSource, /第三方云服务 API/)
  assert.match(complianceSource, /通义千问/)
  assert.match(complianceSource, /Kimi/)
})
