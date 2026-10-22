# Vipeak AI Aliyun Model Guide

Base URL: `https://123vips.com`

This guide covers the Aliyun (Alibaba Cloud) models available through the Vipeak AI platform. It includes video generation models (Wan 3.0, Wan2.7, HappyHorse, Wan Animate) and image models (Qwen Image 3.0, Wan2.7 Image).

## Authentication

All API requests require a Bearer token from your account page:

```http
Authorization: Bearer <user-token>
```

## Supported Models

| Model | Provider | Capability | Create | Result |
|-------|----------|------------|--------|--------|
| Wan 3.0 Video | wan30 | wan30-video | POST /api/advanced/generate | GET /api/generation-records/<taskId> |
| Wan 3.0 Video Prime | wan30 | wan30-video-prime | POST /api/advanced/generate | GET /api/generation-records/<taskId> |
| Wan2.7 Video | wan27 | wan27-t2v / wan27-i2v / wan27-r2v / wan27-video-edit | POST /api/advanced/generate | GET /api/generation-records/<taskId> |
| HappyHorse Video | happyhorse | happyhorse-t2v / happyhorse-i2v / happyhorse-r2v / happyhorse-video-edit | POST /api/advanced/generate | GET /api/generation-records/<taskId> |
| Wan Animate | wan27 | wan-animate-move / wan-animate-mix | POST /api/advanced/generate | GET /api/generation-records/<taskId> |
| Qwen Image 3.0 | qwen-image3 | qwen-image-3.0-pro / qwen-image-3.0 | POST /api/v3/images/generations | GET /api/v3/contents/generations/tasks/<taskId> |
| Wan2.7 Image | wan27-image | wan2.7-image-pro | POST /api/wan27/image-edit | GET /api/generation-records/<taskId> |

## Quick Start

1. Upload media with `/api/user-assets` (Advanced route) or `/?Action=CreateAsset&Version=2024-01-01` (V3 route).
2. Create a task with the appropriate endpoint.
3. Poll the result endpoint until `status` is `succeeded` or `failed`.

---

## Wan 3.0 Video

```http
POST /api/advanced/generate
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "provider": "wan30",
  "videoCapability": "wan30-video",
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
| videoCapability | enum | No | `wan30-video` or `wan30-video-prime`. | `wan30-video` |
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

## Wan2.7 Video

```http
POST /api/advanced/generate
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "provider": "wan27",
  "videoCapability": "wan27-r2v",
  "prompt": "Use Image 1 as the subject and Video 1 as the motion reference.",
  "referenceImages": [{"assetId": "uploaded-image-asset-id"}],
  "referenceVideos": [{"assetId": "uploaded-video-asset-id"}],
  "resolution": "720p",
  "duration": 5,
  "prompt_extend": false,
  "watermark": false
}
```

**Request fields and limits**

| Parameter | Type | Required | Description | Default |
|-----------|------|----------|-------------|---------|
| provider | string | Yes | Use `wan27`. | `wan27` |
| videoCapability | enum | Yes | `wan27-t2v`, `wan27-i2v`, `wan27-r2v`, or `wan27-video-edit`. | `wan27-i2v` |
| prompt | string | Yes | Non-empty video prompt or edit instruction. | - |
| mediaMode | enum | For wan27-i2v | `first_frame`, `first_last_frame`, `first_frame_audio`, `first_last_frame_audio`, `first_clip`, or `first_clip_last_frame`. | `first_frame` |
| firstFrameUrl / firstFrameDataUrl / firstFrameAssetId | string | For first-frame modes; optional for r2v | First-frame image. Use public URL, supported data URL, or uploaded asset id. Images max 20MB. | - |
| lastFrameUrl / lastFrameDataUrl / lastFrameAssetId | string | For last-frame modes | Last-frame image. Use public URL, supported data URL, or uploaded asset id. Images max 20MB. | - |
| firstClipUrl / firstClipDataUrl / firstClipAssetId | string | For first_clip modes | Source video clip. Use public URL, supported data URL, or uploaded asset id. Uploaded video max 30MB. | - |
| drivingAudioUrl / drivingAudioDataUrl / drivingAudioAssetId | string | For audio modes | Driving audio. Use public URL, supported data URL, or uploaded asset id. Uploaded audio max 30MB. | - |
| referenceImages / referenceVideos | array | For wan27-r2v | Reference generation requires 1-5 reference images/videos in total. Each item accepts assetId, URL, or dataUrl. One optional first frame may also be supplied. | [] |
| videoUrl / videoDataUrl / videoAssetId | string | For wan27-video-edit | Exactly one source video. Video edit also accepts 0-4 reference images. | - |
| resolution | string | No | Supported values: `720p`, `1080p`. | `720p` |
| duration | integer | No | Video duration in seconds, integer 2-15. Reference generation with a video and video edit are limited to 2-10 seconds. | `5` |
| followInputDuration | boolean | No | For wan27-video-edit, set true to use the source-video duration, capped at 10 seconds. | `false` |
| generateAudio / generate_audio | boolean | No | Whether generated audio should be requested when supported by the selected capability. | `true` |
| seed | integer | No | Optional deterministic seed when supported by the model. | - |
| prompt_extend / promptExtend | boolean | No | Whether to enable prompt extension. | `false` |
| watermark | boolean | No | Whether to add a watermark. | `false` |

---

## HappyHorse Video

```http
POST /api/advanced/generate
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "provider": "happyhorse",
  "videoCapability": "happyhorse-video-edit",
  "prompt": "Keep the source timing and replace the subject using Image 1.",
  "videoAssetId": "uploaded-video-asset-id",
  "referenceImages": [{"assetId": "uploaded-image-asset-id"}],
  "resolution": "720p",
  "duration": 5
}
```

**Request fields and limits**

| Parameter | Type | Required | Description | Default |
|-----------|------|----------|-------------|---------|
| provider | string | Yes | Use `happyhorse`. | `happyhorse` |
| videoCapability | enum | Yes | `happyhorse-t2v`, `happyhorse-i2v`, `happyhorse-r2v`, or `happyhorse-video-edit`. | `happyhorse-i2v` |
| prompt | string | Yes | Non-empty video prompt or edit instruction. | - |
| firstFrameUrl / firstFrameDataUrl / firstFrameAssetId | string | For happyhorse-i2v | Exactly one first-frame image. | - |
| referenceImages | array | For happyhorse-r2v | Reference generation requires 1-9 images. Video edit accepts 0-5 reference images. Each item accepts assetId, url/imageUrl, or dataUrl. | [] |
| videoUrl / videoDataUrl / videoAssetId | string | For happyhorse-video-edit | Exactly one source video. | - |
| resolution | enum | No | `720p` or `1080p`. | `720p` |
| duration | integer | No | Integer 3-15 seconds. | `5` |
| seed | integer | No | Optional deterministic seed when supported. | - |
| prompt_extend / promptExtend | boolean | No | Whether to enable prompt extension. | `false` |
| watermark | boolean | No | Whether to add a watermark. | `false` |

---

## Wan Animate

```http
POST /api/advanced/generate
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "provider": "wan27",
  "videoCapability": "wan-animate-mix",
  "prompt": "Replace the source-video character with the person in the image.",
  "firstFrameAssetId": "uploaded-image-asset-id",
  "videoAssetId": "uploaded-video-asset-id",
  "parameters": {
    "mode": "wan-pro"
  }
}
```

**Request fields and limits**

| Parameter | Type | Required | Description | Default |
|-----------|------|----------|-------------|---------|
| provider | string | Yes | Use `wan27`. | `wan27` |
| videoCapability | enum | Yes | `wan-animate-move` for image animation or `wan-animate-mix` for character replacement. | `wan-animate-move` |
| prompt | string | Yes | Non-empty animation or replacement instruction. | - |
| firstFrameUrl / firstFrameDataUrl / firstFrameAssetId | string | Yes | Exactly one source/reference image. | - |
| videoUrl / videoDataUrl / videoAssetId | string | Yes | Exactly one motion/source video. | - |
| parameters.mode | enum | No | `wan-std` or `wan-pro`. | `wan-std` |
| duration | integer | No | Omit this field. Output duration follows the source video; supported source duration is 2-30 seconds. | source video duration |
| watermark | boolean | No | Whether to add a watermark. | `false` |

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

## Wan2.7 Image Generation and Edit

```http
POST /api/wan27/image-edit
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "prompt": "Edit the reference image into a cinematic portrait while preserving identity.",
  "imageUrls": ["https://example.com/reference.png"],
  "ratio": "9:16",
  "resolution": "2K",
  "watermark": false
}
```

**Request fields and limits**

| Parameter | Type | Required | Description | Default |
|-----------|------|----------|-------------|---------|
| /api/wan27/image-edit | endpoint | Yes | Wan2.7 image generation/edit endpoint. | - |
| prompt | string | Yes | Non-empty image prompt or edit instruction. | - |
| imageUrls / imageAssetIds | array | No | 0-9 reference images. Use public image URLs or uploaded image asset ids. Images max 20MB. | [] |
| imageUrl / imageAssetId | string | No | Single reference image URL or uploaded image asset id. | - |
| ratio | string | No | `1:1`, `3:4`, `4:3`, `9:16`, or `16:9`. | `9:16` |
| resolution | string | No | `1K`, `2K`, or `4K`. 4K is text-to-image only; reference-image generation supports `1K` or `2K`. | `2K` |
| model | string | No | Wan image model id when explicitly supplied. | `wan2.7-image-pro` |
| watermark | boolean | No | Pass-through watermark flag. | `false` |
| async / asyncResponse / returnImmediately | boolean | No | Return immediately with task info instead of waiting for the image result. | `false` |

---

## Advanced Task Polling

Advanced video tasks return `taskId`. Poll the generation record until its status is `succeeded` or `failed`.

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
