const fs = require('fs');
const src = fs.readFileSync('server.js', 'utf8');

// Extract parameter field functions
const extractFunc = (name) => {
  const re = new RegExp('function ' + name + '\\([^)]*\\) *{([^]*?)\\n}\\n');
  const m = src.match(re);
  return m ? m[1] : null;
};

const funcs = [
  'wan30VideoParameterFields',
  'wan27VideoParameterFields',
  'zImageSpicyProParameterFields',
  'qwenImageEditSpicyParameterFields',
  'qwenImage3ParameterFields',
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
  { section: 'W3.0 (`w3.0-video`)', fields: ['provider', 'videoCapability', 'prompt', 'referenceImages', 'referenceVideos', 'referenceAudios', 'resolution', 'ratio', 'duration', 'generateAudio', 'watermark'] },
  { section: 'W3.0-Pro (`w3.0-video-pro`)', fields: ['provider', 'videoCapability', 'w3.0-video-pro', 'prompt', 'referenceImages', 'referenceVideos', 'referenceAudios', 'resolution', 'ratio', 'duration', 'generateAudio', 'watermark'] },
  { section: 'W3.0-Prime (`w3.0-video-prime`)', fields: ['provider', 'videoCapability', 'w3.0-video-prime', 'prompt', 'referenceImages', 'referenceVideos', 'referenceAudios', 'resolution', 'ratio', 'duration', 'generateAudio', 'watermark'] },
  { section: 'W3.0-VSR-Prime (`w3.0-video-prime-pro`)', fields: ['provider', 'videoCapability', 'w3.0-video-prime-pro', 'prompt', 'referenceImages', 'referenceVideos', 'referenceAudios', 'resolution', 'ratio', 'duration', 'generateAudio', 'watermark'] },
  { section: 'Wan 2.7 spicy I2V (`wan2.7-i2v-spicy`)', fields: ['provider', 'videoCapability', 'wan2.7-i2v-spicy', 'prompt', 'firstFrameUrl', 'drivingAudioUrl', 'negative_prompt', 'resolution', 'duration', 'generateAudio', 'seed', 'prompt_extend', 'watermark'] },
  { section: 'Z-Image Spicy Pro', fields: ['/api/wan27/image-edit', 'prompt', 'imageUrls', 'ratio', 'resolution', 'model', 'n', 'prompt_extend', 'seed', 'watermark'] },
  { section: 'Qwen Image Edit Spicy', fields: ['/api/wan27/image-edit', 'prompt', 'imageUrls', 'ratio', 'resolution', 'model', 'n', 'seed', 'watermark'] },
  { section: 'Qwen Image 3.0', fields: ['model', 'prompt', 'image', 'size', 'n', 'negative_prompt', 'prompt_extend', 'watermark'] },
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

// Check no internal info or retired public model names leaked.
const forbidden = ['ep-2026', 'sk-', 'AKIA', 'maas.aliyuncs', 'api_key', 'API_KEY', 'api-key', 'upstream', 'dashscope-intl', 'Wan2.7 Video', 'wan27-t2v', 'wan27-r2v', 'wan27-video-edit', 'wan30-video', 'wan27-i2v', 'HappyHorse', 'Wan Animate', 'Vidu'];
for (const word of forbidden) {
  if (md.toLowerCase().includes(word.toLowerCase())) {
    console.log('POTENTIAL LEAK:', word);
    ok = false;
  }
}

if (ok) console.log('\nALL CHECKS PASSED');
else {
  console.log('\nSOME CHECKS FAILED');
  process.exitCode = 1;
}
