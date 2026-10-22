# Vipeak AI Model Guide

Base URL: `https://123vips.com`

This guide covers the video and image generation APIs exposed by the Vipeak AI platform.

- Video: W3.0 (`w3.0-video`), W3.0-Pro (`w3.0-video-pro`), W3.0-Prime (`w3.0-video-prime`), W3.0-VSR-Prime (`w3.0-video-prime-pro`), Wan 2.7 spicy I2V (`wan2.7-i2v-spicy`)
- Image: Z-Image Spicy Pro, Qwen Image Edit Spicy, Qwen Image 3.0

Model serving is handled by the platform and routed to Mulerouter. Callers authenticate only with their Vipeak AI token and never need third-party credentials; the platform maps each request to the matching Mulerouter model on the server side.

## Authentication

All API requests require a Bearer token from your account page:

```http
Authorization: Bearer <user-token>
```

## Mulerouter Routing

Generation requests are fulfilled by Mulerouter. The platform keeps a stable public API surface and maps every request to the matching Mulerouter model slug, so callers only ever send their Vipeak AI token.

| Platform provider | `videoCapability` / Mulerouter node | Resolution | Result type |
|-------------------|-----------------------------------|------------|-------------|
| `wan30` | `w3.0-video` | `480p`, `720p`, `1080p` | W3.0 video |
| `wan30` | `w3.0-video-pro` | `1080p`, `2k`, `4k` | W3.0-Pro video |
| `wan30` | `w3.0-video-prime` | `480p`, `720p`, `1080p` | W3.0-Prime video |
| `wan30` | `w3.0-video-prime-pro` | `1080p`, `2k`, `4k` | W3.0-VSR-Prime video |
| `wan27` | `wan2.7-i2v-spicy` | `720p`, `1080p` | Wan 2.7 spicy image-to-video |
| — | `z-image-spicy-pro` | `1K`, `2K` | text-to-image |
| — | `qwen-image-edit-spicy` | `1K`, `2K` | image edit |

## Supported Models

| Model | Provider | Capability | Mulerouter slug | Create | Result |
|-------|----------|------------|-----------------|--------|--------|
| W3.0 | wan30 | w3.0-video | w3.0-video | POST /api/advanced/generate | GET /api/generation-records/<taskId> |
| W3.0-Pro | wan30 | w3.0-video-pro | w3.0-video-pro | POST /api/advanced/generate | GET /api/generation-records/<taskId> |
| W3.0-Prime | wan30 | w3.0-video-prime | w3.0-video-prime | POST /api/advanced/generate | GET /api/generation-records/<taskId> |
| W3.0-VSR-Prime | wan30 | w3.0-video-prime-pro | w3.0-video-prime-pro | POST /api/advanced/generate | GET /api/generation-records/<taskId> |
| Wan 2.7 spicy I2V | wan27 | wan2.7-i2v-spicy | wan2.7-i2v-spicy | POST /api/advanced/generate | GET /api/generation-records/<taskId> |
| Z-Image Spicy Pro | z-image-spicy-pro | text-to-image | z-image-spicy-pro | POST /api/wan27/image-edit | GET /api/generation-records/<taskId> |
| Qwen Image Edit Spicy | qwen-image-edit-spicy | image-edit | qwen-image-edit-spicy | POST /api/wan27/image-edit | GET /api/generation-records/<taskId> |
| Qwen Image 3.0 | qwen-image3 | qwen-image-3.0-pro / qwen-image-3.0 | platform compatibility route | POST /api/v3/images/generations | GET /api/v3/contents/generations/tasks/<taskId> |

## Quick Start

1. Upload media with `/api/user-assets` (Advanced route) or `/?Action=CreateAsset&Version=2024-01-01` (V3 route).
2. Create a task with the appropriate endpoint.
3. Poll the result endpoint until `status` is `succeeded` or `failed`.

---

## W3.0 (`w3.0-video`)

```http
POST /api/advanced/generate
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "provider": "wan30",
  "videoCapability": "w3.0-video",
  "mediaMode": "multimodal",
  "prompt": "Use Image 1 as the character and Video 1 as the motion reference.",
  "referenceImages": [{"assetId": "uploaded-image-asset-id"}],
  "referenceVideos": [{"assetId": "uploaded-video-asset-id"}],
  "ratio": "9:16",
  "resolution": "720p",
  "duration": 8,
  "generateAudio": true
}
```

**Request fields and limits**

| Parameter | Type | Required | Description | Default |
|-----------|------|----------|-------------|---------|
| provider | string | Yes | Use `wan30`. | `wan30` |
| videoCapability | string | No | Use `w3.0-video`. | `w3.0-video` |
| prompt | string | Unless media is supplied | Video prompt, up to 5000 characters. When using references, name them in request order as Image 1, Video 1, Audio 1, etc. | - |
| mediaMode | enum | No | `multimodal` for reference media or `first_last_frame` for explicit first and last frames. These modes cannot be mixed. | `multimodal` |
| referenceImages | array | For image references | 0-10 images. Each item accepts assetId, url/imageUrl, or dataUrl plus optional fileName. | [] |
| referenceVideos | array | For video references | 0-5 videos. Each item accepts assetId, url/videoUrl, or dataUrl plus optional fileName. | [] |
| referenceAudios | array | For audio references | 0-5 audios. Each item accepts assetId, url/audioUrl, or dataUrl plus optional fileName. | [] |
| referenceFileAssetId / referenceFile | string/object | For document input | One PDF, Word, Excel, PowerPoint, TXT, or Markdown document, up to 100MB. It cannot be combined with other media inputs. | - |
| firstFrameUrl / firstFrameDataUrl / firstFrameAssetId | string | For first_last_frame | First-frame image. | - |
| lastFrameUrl / lastFrameDataUrl / lastFrameAssetId | string | For first_last_frame | Last-frame image. Both frame images are required. | - |
| resolution | enum | No | `480p`, `720p`, or `1080p`. | `1080p` |
| ratio | enum | No | `16:9`, `4:3`, `1:1`, `3:4`, `9:16`, or `adaptive`. | `adaptive` |
| duration | integer | No | Output duration from 2-30 seconds. Use `-1` for adaptive output duration. | `5` |
| generateAudio / generate_audio | boolean | No | Whether the output should include generated audio. | `true` |
| prompt_extend | boolean | No | Whether to rewrite and expand the prompt before generation. Disable it for strict professional prompt adherence; it is enabled by default. | `true` |
| seed | integer | No | Integer from 0 to 2147483647. | - |
| watermark | boolean | No | Whether to add a watermark. | `false` |

**Image input limits**: JPG/JPEG, PNG, BMP, or WebP; max 20MB; width and height 240-8000px; aspect ratio no wider than 8:1. PNG transparency is not supported.

**Video input limits**: MP4 or MOV; smaller than 100MB; width and height 240-4096px; aspect ratio no wider than 8:1; each video 1-15 seconds; all reference videos together at most 15 seconds.

**Audio input limits**: MP3 or WAV; smaller than 15MB; each audio 1-15 seconds; all reference audios together at most 15 seconds.

**Duration combination**: If duration is not `-1`, total input-video seconds plus output duration must not exceed 30 seconds.

---

## W3.0-Pro (`w3.0-video-pro`)

```http
POST /api/advanced/generate
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "provider": "wan30",
  "videoCapability": "w3.0-video-pro",
  "mediaMode": "multimodal",
  "prompt": "Create a high-detail cinematic product shot.",
  "referenceImages": [{"assetId": "uploaded-image-asset-id"}],
  "referenceVideos": [{"assetId": "uploaded-video-asset-id"}],
  "ratio": "16:9",
  "resolution": "2k",
  "duration": 8,
  "generateAudio": true
}
```

**Request fields and limits**

| Parameter | Type | Required | Description | Default |
|-----------|------|----------|-------------|---------|
| provider | string | Yes | Use `wan30`. | `wan30` |
| videoCapability | string | No | Use `w3.0-video-pro`. | `w3.0-video-pro` |
| prompt | string | Unless media is supplied | Video prompt, up to 5000 characters. When using references, name them in request order as Image 1, Video 1, Audio 1, etc. | - |
| mediaMode | enum | No | `multimodal` for reference media or `first_last_frame` for explicit first and last frames. These modes cannot be mixed. | `multimodal` |
| referenceImages | array | For image references | 0-10 images. Each item accepts assetId, url/imageUrl, or dataUrl plus optional fileName. | [] |
| referenceVideos | array | For video references | 0-5 videos. Each item accepts assetId, url/videoUrl, or dataUrl plus optional fileName. | [] |
| referenceAudios | array | For audio references | 0-5 audios. Each item accepts assetId, url/audioUrl, or dataUrl plus optional fileName. | [] |
| referenceFileAssetId / referenceFile | string/object | For document input | One PDF, Word, Excel, PowerPoint, TXT, or Markdown document, up to 100MB. It cannot be combined with other media inputs. | - |
| firstFrameUrl / firstFrameDataUrl / firstFrameAssetId | string | For first_last_frame | First-frame image. | - |
| lastFrameUrl / lastFrameDataUrl / lastFrameAssetId | string | For first_last_frame | Last-frame image. Both frame images are required. | - |
| resolution | enum | No | `1080p`, `2k`, or `4k`. | `1080p` |
| ratio | enum | No | `16:9`, `4:3`, `1:1`, `3:4`, `9:16`, or `adaptive`. | `adaptive` |
| duration | integer | No | Output duration from 2-30 seconds. Use `-1` for adaptive output duration. | `5` |
| generateAudio / generate_audio | boolean | No | Whether the output should include generated audio. | `true` |
| prompt_extend | boolean | No | Whether to rewrite and expand the prompt before generation. Disable it for strict professional prompt adherence; it is enabled by default. | `true` |
| seed | integer | No | Integer from 0 to 2147483647. | - |
| watermark | boolean | No | Whether to add a watermark. | `false` |

**Image input limits**: JPG/JPEG, PNG, BMP, or WebP; max 20MB; width and height 240-8000px; aspect ratio no wider than 8:1. PNG transparency is not supported.

**Video input limits**: MP4 or MOV; smaller than 100MB; width and height 240-4096px; aspect ratio no wider than 8:1; each video 1-15 seconds; all reference videos together at most 15 seconds.

**Audio input limits**: MP3 or WAV; smaller than 15MB; each audio 1-15 seconds; all reference audios together at most 15 seconds.

**Duration combination**: If duration is not `-1`, total input-video seconds plus output duration must not exceed 30 seconds.

---

## W3.0-Prime (`w3.0-video-prime`)

```http
POST /api/advanced/generate
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "provider": "wan30",
  "videoCapability": "w3.0-video-prime",
  "mediaMode": "multimodal",
  "prompt": "Create a cinematic character performance with natural motion.",
  "referenceImages": [{"assetId": "uploaded-image-asset-id"}],
  "referenceVideos": [{"assetId": "uploaded-video-asset-id"}],
  "ratio": "9:16",
  "resolution": "1080p",
  "duration": 8,
  "generateAudio": true
}
```

**Request fields and limits**

| Parameter | Type | Required | Description | Default |
|-----------|------|----------|-------------|---------|
| provider | string | Yes | Use `wan30`. | `wan30` |
| videoCapability | string | No | Use `w3.0-video-prime`. | `w3.0-video-prime` |
| prompt | string | Unless media is supplied | Video prompt, up to 5000 characters. When using references, name them in request order as Image 1, Video 1, Audio 1, etc. | - |
| mediaMode | enum | No | `multimodal` for reference media or `first_last_frame` for explicit first and last frames. These modes cannot be mixed. | `multimodal` |
| referenceImages | array | For image references | 0-10 images. Each item accepts assetId, url/imageUrl, or dataUrl plus optional fileName. | [] |
| referenceVideos | array | For video references | 0-5 videos. Each item accepts assetId, url/videoUrl, or dataUrl plus optional fileName. | [] |
| referenceAudios | array | For audio references | 0-5 audios. Each item accepts assetId, url/audioUrl, or dataUrl plus optional fileName. | [] |
| referenceFileAssetId / referenceFile | string/object | For document input | One PDF, Word, Excel, PowerPoint, TXT, or Markdown document, up to 100MB. It cannot be combined with other media inputs. | - |
| firstFrameUrl / firstFrameDataUrl / firstFrameAssetId | string | For first_last_frame | First-frame image. | - |
| lastFrameUrl / lastFrameDataUrl / lastFrameAssetId | string | For first_last_frame | Last-frame image. Both frame images are required. | - |
| resolution | enum | No | `480p`, `720p`, or `1080p`. | `1080p` |
| ratio | enum | No | `16:9`, `4:3`, `1:1`, `3:4`, `9:16`, or `adaptive`. | `adaptive` |
| duration | integer | No | Output duration from 2-30 seconds. Use `-1` for adaptive output duration. | `5` |
| generateAudio / generate_audio | boolean | No | Whether the output should include generated audio. | `true` |
| prompt_extend | boolean | No | Whether to rewrite and expand the prompt before generation. Disable it for strict professional prompt adherence; it is enabled by default. | `true` |
| seed | integer | No | Integer from 0 to 2147483647. | - |
| watermark | boolean | No | Whether to add a watermark. | `false` |

**Image input limits**: JPG/JPEG, PNG, BMP, or WebP; max 20MB; width and height 240-8000px; aspect ratio no wider than 8:1. PNG transparency is not supported.

**Video input limits**: MP4 or MOV; smaller than 100MB; width and height 240-4096px; aspect ratio no wider than 8:1; each video 1-15 seconds; all reference videos together at most 15 seconds.

**Audio input limits**: MP3 or WAV; smaller than 15MB; each audio 1-15 seconds; all reference audios together at most 15 seconds.

**Duration combination**: If duration is not `-1`, total input-video seconds plus output duration must not exceed 30 seconds.

---

## W3.0-VSR-Prime (`w3.0-video-prime-pro`)

```http
POST /api/advanced/generate
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "provider": "wan30",
  "videoCapability": "w3.0-video-prime-pro",
  "mediaMode": "multimodal",
  "prompt": "Create a premium cinematic shot with precise identity and motion.",
  "referenceImages": [{"assetId": "uploaded-image-asset-id"}],
  "referenceVideos": [{"assetId": "uploaded-video-asset-id"}],
  "ratio": "16:9",
  "resolution": "2k",
  "duration": 8,
  "generateAudio": true
}
```

**Request fields and limits**

| Parameter | Type | Required | Description | Default |
|-----------|------|----------|-------------|---------|
| provider | string | Yes | Use `wan30`. | `wan30` |
| videoCapability | string | No | Use `w3.0-video-prime-pro`. | `w3.0-video-prime-pro` |
| prompt | string | Unless media is supplied | Video prompt, up to 5000 characters. When using references, name them in request order as Image 1, Video 1, Audio 1, etc. | - |
| mediaMode | enum | No | `multimodal` for reference media or `first_last_frame` for explicit first and last frames. These modes cannot be mixed. | `multimodal` |
| referenceImages | array | For image references | 0-10 images. Each item accepts assetId, url/imageUrl, or dataUrl plus optional fileName. | [] |
| referenceVideos | array | For video references | 0-5 videos. Each item accepts assetId, url/videoUrl, or dataUrl plus optional fileName. | [] |
| referenceAudios | array | For audio references | 0-5 audios. Each item accepts assetId, url/audioUrl, or dataUrl plus optional fileName. | [] |
| referenceFileAssetId / referenceFile | string/object | For document input | One PDF, Word, Excel, PowerPoint, TXT, or Markdown document, up to 100MB. It cannot be combined with other media inputs. | - |
| firstFrameUrl / firstFrameDataUrl / firstFrameAssetId | string | For first_last_frame | First-frame image. | - |
| lastFrameUrl / lastFrameDataUrl / lastFrameAssetId | string | For first_last_frame | Last-frame image. Both frame images are required. | - |
| resolution | enum | No | `1080p`, `2k`, or `4k`. | `1080p` |
| ratio | enum | No | `16:9`, `4:3`, `1:1`, `3:4`, `9:16`, or `adaptive`. | `adaptive` |
| duration | integer | No | Output duration from 2-30 seconds. Use `-1` for adaptive output duration. | `5` |
| generateAudio / generate_audio | boolean | No | Whether the output should include generated audio. | `true` |
| prompt_extend | boolean | No | Whether to rewrite and expand the prompt before generation. Disable it for strict professional prompt adherence; it is enabled by default. | `true` |
| seed | integer | No | Integer from 0 to 2147483647. | - |
| watermark | boolean | No | Whether to add a watermark. | `false` |

**Image input limits**: JPG/JPEG, PNG, BMP, or WebP; max 20MB; width and height 240-8000px; aspect ratio no wider than 8:1. PNG transparency is not supported.

**Video input limits**: MP4 or MOV; smaller than 100MB; width and height 240-4096px; aspect ratio no wider than 8:1; each video 1-15 seconds; all reference videos together at most 15 seconds.

**Audio input limits**: MP3 or WAV; smaller than 15MB; each audio 1-15 seconds; all reference audios together at most 15 seconds.

**Duration combination**: If duration is not `-1`, total input-video seconds plus output duration must not exceed 30 seconds.

---

## Wan 2.7 spicy I2V (`wan2.7-i2v-spicy`)

```http
POST /api/advanced/generate
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "provider": "wan27",
  "videoCapability": "wan2.7-i2v-spicy",
  "prompt": "Create a cinematic shot that follows the first-frame image and the driving audio.",
  "firstFrameAssetId": "uploaded-image-asset-id",
  "drivingAudioAssetId": "uploaded-audio-asset-id",
  "resolution": "720p",
  "duration": 5,
  "prompt_extend": true,
  "watermark": false
}
```

**Request fields and limits**

| Parameter | Type | Required | Description | Default |
|-----------|------|----------|-------------|---------|
| provider | string | Yes | Use `wan27`. | `wan27` |
| videoCapability | string | Yes | Use the Mulerouter node `wan2.7-i2v-spicy`. | `wan2.7-i2v-spicy` |
| prompt | string | Yes | Non-empty video prompt. | - |
| firstFrameUrl / firstFrameDataUrl / firstFrameAssetId | string | Yes | First-frame image. Use a public URL, supported data URL, or uploaded asset id. Images max 20MB. | - |
| drivingAudioUrl / drivingAudioDataUrl / drivingAudioAssetId | string | No | Optional driving audio. Use a public URL, supported data URL, or uploaded asset id. Uploaded audio max 30MB. | - |
| negative_prompt / negativePrompt | string | No | Optional negative prompt passed to the Mulerouter node. | - |
| resolution | string | No | `720p` or `1080p`. | `720p` |
| duration | integer | No | Output duration in seconds, integer 2-15. | `5` |
| generateAudio / generate_audio / audio | boolean | No | Whether the output should include an audio track when supported. | `true` |
| seed | integer | No | Integer from 0 to 2147483647. | - |
| prompt_extend / promptExtend | boolean | No | Whether to enable prompt extension. | `true` |
| watermark | boolean | No | Whether to add a watermark. | `false` |

**Notes**: One input image is required. Optional driving audio can be supplied with the first frame.

---

## Z-Image Spicy Pro

Text-to-image engine. It shares the dedicated image endpoint with Qwen Image Edit Spicy; send no input image to request text-to-image output.

```http
POST /api/wan27/image-edit
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "prompt": "A cinematic portrait of a traveler in a rain-soaked neon city, ultra detailed.",
  "ratio": "9:16",
  "resolution": "2K",
  "prompt_extend": true,
  "seed": 123456,
  "watermark": false,
  "async": true
}
```

**Request fields and limits**

| Parameter | Type | Required | Description | Default |
|-----------|------|----------|-------------|---------|
| /api/wan27/image-edit | endpoint | Yes | Create a Z-Image Spicy Pro text-to-image task. | - |
| prompt | string | Yes | Non-empty image prompt. | - |
| imageUrls / imageAssetIds | array | No | Leave empty for text-to-image. Supplying one or more images switches the request to image editing; use `qwen-image-edit-spicy` for that. | [] |
| imageUrl / imageAssetId | string | No | Leave empty for text-to-image. | - |
| ratio | string | No | `1:1`, `3:4`, `4:3`, `9:16`, or `16:9`. | `9:16` |
| resolution | string | No | `1K` or `2K`. | `2K` |
| size | string | No | Explicit output size as `width*height`, for example `1440*2560`. When omitted, the platform derives it from `resolution` and `ratio`. | derived from resolution + ratio |
| model | string | No | Optional explicit model id. The platform normally chooses the serving model from the request shape, so most callers omit this field. | - |
| n | integer | No | Number of output images. Keep it at `1`; single-image output is the supported shape for this engine. | `1` |
| prompt_extend | boolean | No | Whether to expand the prompt before generation. Pass it explicitly to control prompt rewriting. | `true` |
| seed | integer | No | Integer from 0 to 2147483647. | random |
| watermark | boolean | No | Whether to add a watermark. | `false` |
| async / asyncResponse / returnImmediately | boolean | No | Return immediately with task info instead of waiting for the image result. | `false` |

**Resolution presets**

| Resolution / ratio | 1:1 | 3:4 | 4:3 | 9:16 | 16:9 |
|--------------------|-----|-----|-----|------|------|
| `1K` | 1024*1024 | 768*1024 | 1024*768 | 720*1280 | 1280*720 |
| `2K` | 2048*2048 | 1536*2048 | 2048*1536 | 1440*2560 | 2560*1440 |

**Notes**: Width and height must each stay within 256-2560px, which is why `2K` is the practical upper tier for this engine. Only single-image output is supported.

---

## Qwen Image Edit Spicy

Reference-image editing engine. It shares the dedicated image endpoint with Z-Image Spicy Pro.

```http
POST /api/wan27/image-edit
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "prompt": "Turn the subject into a cinematic portrait while preserving identity.",
  "imageUrls": ["https://example.com/reference.png"],
  "ratio": "9:16",
  "resolution": "2K",
  "seed": 42,
  "watermark": false,
  "async": true
}
```

**Request fields and limits**

| Parameter | Type | Required | Description | Default |
|-----------|------|----------|-------------|---------|
| /api/wan27/image-edit | endpoint | Yes | Create a Qwen Image Edit Spicy image-editing task. | - |
| prompt | string | Yes | Non-empty edit instruction. | - |
| imageUrls / imageAssetIds | array | Yes | 1-3 images. The first image is the picture being edited; the remaining ones are optional references. Use public image URLs or uploaded image asset ids. Images max 20MB. | [] |
| imageUrl / imageAssetId | string | Yes | Single input image URL or uploaded image asset id. | - |
| ratio | string | No | `1:1`, `3:4`, `4:3`, `9:16`, or `16:9`. The output size also follows the input image. | `9:16` |
| resolution | string | No | `1K` or `2K`. | `2K` |
| size | string | No | Explicit output size as `width*height`. When omitted, the platform derives it from `resolution` and `ratio`. | derived from resolution + ratio |
| model | string | No | Optional explicit model id. The platform normally chooses the serving model from the request shape, so most callers omit this field. | - |
| n | integer | No | Number of output images. Keep it at `1`; single-image output is the supported shape for this engine. | `1` |
| seed | integer | No | Integer from 0 to 2147483647. | random |
| watermark | boolean | No | Whether to add a watermark. | `false` |
| async / asyncResponse / returnImmediately | boolean | No | Return immediately with task info instead of waiting for the image result. | `false` |

**Notes**: At least one input image is required, and at most three images may be supplied per request (the picture being edited plus up to two references). Supported image uploads are JPG/JPEG, PNG, BMP, or WebP up to 20MB.

---

## Qwen Image 3.0

```http
POST /api/v3/images/generations
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "model": "qwen-image-3.0-pro",
  "prompt": "Keep the subject identity and create a clean studio campaign image.",
  "image": ["asset://asset-id-from-upload"],
  "size": "2K",
  "n": 1,
  "prompt_extend": true,
  "prompt_extend_mode": "direct",
  "watermark": false
}
```

**Request fields and limits**

| Parameter | Type | Required | Description | Default |
|-----------|------|----------|-------------|---------|
| /api/v3/images/generations | endpoint | Yes | Create an asynchronous Qwen Image 3.0 task. | - |
| /api/v3/contents/generations/tasks/<taskId> | endpoint | Yes | Query progress and final content.image_url, content.image_urls, or data[].url. | - |
| model | enum | Yes | `qwen-image-3.0-pro` or `qwen-image-3.0`. | `qwen-image-3.0-pro` |
| prompt | string | Yes | Non-empty image prompt or edit instruction. | - |
| image | string or array | No | Optional 1-3 reference images. Use public image URLs, supported image data URLs, or asset:// ids returned by upload. | - |
| size | string | No | Use `1K`, `2K`, or `width*height`. Pixel area must be 512*512 through 2048*2048 and aspect ratio must be 1:8 through 8:1. | `2K` |
| n | integer | No | Number of output images, integer 1-6. | `1` |
| negative_prompt | string | No | Optional negative prompt supplied by the caller. | - |
| prompt_extend | boolean | No | Enable prompt extension. | `true` |
| prompt_extend_mode | enum | No | `direct`; `agent` is accepted only for text-to-image without reference images. | `direct` |
| seed | integer | No | Integer 0-2147483647. | - |
| watermark | boolean | No | Whether to add a watermark. | `false` |
| image input limits | rule | For image | JPG/JPEG, PNG, BMP, TIFF, WebP, or GIF; max 10MB per image. Recommended width and height are 384-2048px. | - |

---

## Advanced Task Polling

Advanced video tasks and the image engines on `/api/wan27/image-edit` return `taskId`. Poll the generation record until its status is `succeeded` or `failed`.

```http
GET /api/generation-records/<taskId>
Authorization: Bearer <user-token>
```

## V3 Image Task Polling

Qwen Image 3.0 tasks return `id`/`task_id`. Poll the V3 task endpoint.

```http
GET /api/v3/contents/generations/tasks/<taskId>
Authorization: Bearer <user-token>
```

## Billing

Credits are deducted according to the selected model, resolution, duration, and your account pricing.

## Endpoints

```json
{
  "baseUrl": "https://123vips.com",
  "advancedGenerate": "/api/advanced/generate",
  "generationRecordDetail": "/api/generation-records/<taskId>",
  "qwenImage3Generate": "/api/v3/images/generations",
  "qwenImage3TaskDetail": "/api/v3/contents/generations/tasks/<taskId>",
  "wan27ImageEdit": "/api/wan27/image-edit",
  "userAssets": "/api/user-assets"
}
```
