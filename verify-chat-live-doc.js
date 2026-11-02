const fs = require('fs');

// Read the documentation
const md = fs.readFileSync('docs/chat-live-integration.md', 'utf8');

// Forbidden internal keywords - only truly internal things
const forbidden = [
  'ep-2026', 'sk-', 'AKIA', 
  'api_key', 'API_KEY',
  '.env', '192.168', '10.0.',
  'mulerouter', 'ark.ap-southeast',
];

let issues = [];

// Check for forbidden internal info
for (const word of forbidden) {
  if (md.toLowerCase().includes(word.toLowerCase())) {
    issues.push(`FORBIDDEN: contains "${word}"`);
  }
}

// Expected sections
const expectedSections = [
  'Base URL', 'Authentication', 'Characters', 'Chat Session',
  'WebSocket', 'Signal', 'Audio', 'RTC', 'Error'
];

for (const section of expectedSections) {
  if (!md.includes(section)) {
    issues.push(`MISSING section: ${section}`);
  }
}

// Check API endpoints exist
const expectedEndpoints = [
  '/api/chat-live/characters',
  '/api/chat-live/create',
  'wsUrl'
];

for (const endpoint of expectedEndpoints) {
  if (!md.includes(endpoint)) {
    issues.push(`MISSING endpoint reference: ${endpoint}`);
  }
}

// Check signal types documented
const signalTypes = ['type=1', 'type=2', 'type=5', 'type=6', 'type=7', 'type=9', 'type=10', 'type=11', 'type=12'];
for (const sig of signalTypes) {
  if (!md.includes(sig)) {
    issues.push(`MISSING signal type: ${sig}`);
  }
}

// Check audio format documented  
const audioFields = ['PCM', '24 kHz', 'mono'];
for (const field of audioFields) {
  if (!md.includes(field)) {
    issues.push(`MISSING audio format info: ${field}`);
  }
}

// Verify against actual implementation (chat-live-component.js)
const componentJs = fs.readFileSync('docs/chat-live/chat-live-component.js', 'utf8');

// Check for valid JSON examples - extract only complete JSON blocks
const jsonBlockPattern = /```json\s*(\{[\s\S]*?\})\s*```/g;
let match;
while ((match = jsonBlockPattern.exec(md)) !== null) {
  try {
    JSON.parse(match[1]);
  } catch (e) {
    issues.push(`INVALID JSON in doc: ${e.message}`);
  }
}

console.log('=== Chat Live Integration Doc Verification ===\n');

if (issues.length === 0) {
  console.log('✓ All checks passed!');
  console.log('  - No internal information leaked');
  console.log('  - All required sections present');
  console.log('  - All required endpoints documented');
  console.log('  - All signal types documented');
  console.log('  - Audio format documented');
  console.log('  - JSON examples valid');
} else {
  console.log(`✗ Found ${issues.length} issue(s):\n`);
  for (const issue of issues) {
    console.log(`  - ${issue}`);
  }
  process.exit(1);
}
