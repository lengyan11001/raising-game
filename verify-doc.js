const fs = require('fs');
const src = fs.readFileSync('server.js', 'utf8');

// Extract parameter field functions
const extractFunc = (name) => {
  const re = new RegExp('function ' + name + '\\(\\) *{([^]*?)\\n}\\n');
  const m = src.match(re);
  return m ? m[1] : null;
};

const funcs = [
  'wan30VideoParameterFields',
  'wan27VideoParameterFields',
  'happyhorseVideoParameterFields',
  'wanAnimateVideoParameterFields',
  'qwenImage3ParameterFields',
  'wan27ImageParameterFields',
];

const results = {};
for (const fn of funcs) {
  const body = extractFunc(fn);
  if (!body) {
    console.log('MISSING:', fn);
    continue;
  }
  const names = [];
  const nameRe = /name:\s*"([^"]+)"/g;
  let match;
  while ((match = nameRe.exec(body)) !== null) {
    names.push(match[1]);
  }
  results[fn] = names;
  console.log(fn + ':', names.length, 'fields');
}

// Read MD doc
const md = fs.readFileSync('docs/aliyun-models.md', 'utf8');

// Check each model section has expected fields
const checks = [
  { section: 'Wan 3.0 Video', fields: ['provider', 'videoCapability', 'prompt', 'referenceImages', 'referenceVideos', 'referenceAudios', 'resolution', 'ratio', 'duration', 'generateAudio', 'watermark'] },
  { section: 'Wan2.7 Video', fields: ['provider', 'videoCapability', 'prompt', 'mediaMode', 'firstFrameUrl', 'lastFrameUrl', 'firstClipUrl', 'drivingAudioUrl', 'referenceImages', 'videoUrl', 'resolution', 'duration', 'followInputDuration', 'generateAudio', 'watermark'] },
  { section: 'HappyHorse Video', fields: ['provider', 'videoCapability', 'prompt', 'firstFrameUrl', 'referenceImages', 'videoUrl', 'resolution', 'duration', 'watermark'] },
  { section: 'Wan Animate', fields: ['provider', 'videoCapability', 'prompt', 'firstFrameUrl', 'videoUrl', 'parameters.mode', 'duration', 'watermark'] },
  { section: 'Qwen Image 3.0', fields: ['model', 'prompt', 'image', 'size', 'n', 'negative_prompt', 'prompt_extend', 'watermark'] },
  { section: 'Wan2.7 Image Generation', fields: ['prompt', 'imageUrls', 'ratio', 'resolution', 'model', 'watermark'] },
];

let ok = true;
for (const check of checks) {
  const section = md.split('## ').find(s => s.startsWith(check.section));
  if (!section) {
    console.log('MISSING SECTION:', check.section);
    ok = false;
    continue;
  }
  for (const field of check.fields) {
    if (!section.includes(field)) {
      console.log('MISSING FIELD in', check.section, ':', field);
      ok = false;
    }
  }
}

// Check no internal info leaked
const forbidden = ['ep-2026', 'sk-', 'AKIA', 'maas.aliyuncs', 'api_key', 'API_KEY', 'api-key', 'upstream', 'dashscope-intl'];
for (const word of forbidden) {
  if (md.toLowerCase().includes(word.toLowerCase())) {
    console.log('POTENTIAL LEAK:', word);
    ok = false;
  }
}

if (ok) console.log('\nALL CHECKS PASSED');
else console.log('\nSOME CHECKS FAILED');
