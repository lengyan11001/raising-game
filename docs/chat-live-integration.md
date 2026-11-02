# Chat Live Integration Guide

This guide covers the Chat Live feature for real-time AI character conversations. The system uses Vidu's digital human rendering technology combined with our ASR/LLM/TTS pipeline for natural conversations.

## Base URL

```
https://your-domain.com
```

## Authentication

All API requests require a Bearer token from your account:

```http
Authorization: Bearer <user-token>
```

---

## Characters

### List Available Characters

```http
GET /api/chat-live/characters
```

Returns a list of characters configured for chat live conversations.

**Response:**

```json
{
  "characters": [
    {
      "id": "char-123",
      "name": "Alice",
      "persona": "A friendly virtual host...",
      "image": "https://example.com/avatar.jpg",
      "voiceType": "longanyang",
      "voiceProvider": "dashscope_cosyvoice",
      "language": "zh",
      "componentVoiceType": "longanyang"
    }
  ]
}
```

**Character Fields:**

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique character identifier |
| name | string | Character display name |
| persona | string | Character background description |
| image | string | Character avatar image URL |
| voiceType | string | TTS voice identifier |
| voiceProvider | string | Voice provider name |
| language | string | Primary language code (zh/en) |
| componentVoiceType | string | Component mode voice ID |
| ambientMusicUrl | string | (Optional) Background music URL for ambient atmosphere |

---

## Starting a Chat Session

### Create Session

```http
POST /api/chat-live/create
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "characterId": "char-123",
  "mode": "component"
}
```

**Request Fields:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| characterId | string | Yes | Character ID from /api/chat-live/characters |
| mode | string | No | Session mode: "component" (recommended) or "realtime" |
| region | string | No | Region code (default: cn) |

**Response:**

```json
{
  "ok": true,
  "sessionId": "sess-abc123",
  "liveId": "live-xyz789",
  "mode": "component",
  "rtc": {
    "provider": "artc",
    "appId": "your-app-id",
    "channelId": "aiyes-live-xxxxx",
    "userId": "aiyes-push-xxxxx",
    "token": "rtc-token-here"
  },
  "wsUrl": "wss://your-domain.com/ws/chat-live/stream?session=sess-abc123"
}
```

---

## WebSocket Protocol

Connect to the WebSocket URL returned from the session creation. The WebSocket is used for real-time audio streaming and signal exchange.

### WebSocket URL Format

```
wss://your-domain.com/ws/chat-live/stream?session=<sessionId>
```

### Signal Format

All signals are JSON messages with the following structure:

```json
{
  "type": 1,
  "live_id": "live-xyz789",
  "conn_id": "client-001",
  "seq_id": 1,
  "payload": {}
}
```

### Signal Types

| Type | Name | Direction | Description |
|------|------|----------|-------------|
| 1 | conn_init | Client → Server | Initialize connection |
| 2 | conn_init_ack | Server → Client | Connection acknowledgment |
| 5 | call_hangup | Client → Server | Client requests hangup |
| 6 | force_hangup | Server → Client | Server forces hangup |
| 7 | audio_interrupted | Client → Server | Audio input interrupted |
| 9 | input_transcription | Client → Server | User speech transcription |
| 10 | output_transcription | Server → Client | AI response text |
| 11 | prompt_operation | Client → Server | Switch appearance (clothes/background) |
| 12 | prompt_operation_ack | Server → Client | Operation result |

---

## Signal Details

### conn_init (type=1)

Initialize the WebSocket connection.

```json
{
  "type": 1,
  "live_id": "live-xyz789",
  "conn_id": "client-001",
  "seq_id": 1,
  "payload": {
    "conn_init": { "version": 1 }
  }
}
```

### conn_init_ack (type=2)

Server acknowledgment after connection.

```json
{
  "type": 2,
  "live_id": "live-xyz789",
  "conn_id": "client-001",
  "seq_id": 2,
  "payload": {
    "conn_init_ack": {
      "success": true,
      "error_code": "",
      "server_timestamp": 1700000000
    }
  }
}
```

### input_transcription (type=9)

Send user speech transcription to the server.

```json
{
  "type": 9,
  "live_id": "live-xyz789",
  "conn_id": "client-001",
  "seq_id": 10,
  "payload": {
    "text_msg": {
      "msg_id": "msg-001",
      "content": "Hello",
      "timestamp": 1700000000000
    }
  }
}
```

### output_transcription (type=10)

Server sends AI response text.

```json
{
  "type": 10,
  "live_id": "live-xyz789",
  "conn_id": "client-001",
  "seq_id": 11,
  "payload": {
    "text_msg": {
      "msg_id": "msg-002",
      "content": "Hi there!",
      "timestamp": 1700000001000
    }
  }
}
```

### prompt_operation (type=11)

Change the character's appearance (optional).

```json
{
  "type": 11,
  "live_id": "live-xyz789",
  "conn_id": "client-001",
  "seq_id": 12,
  "payload": {
    "prompt_operation": {
      "op_type": "switch",
      "images": [
        {
          "image_uri": "https://example.com/dress.jpg",
          "image_id": "dress-001",
          "kind": "garment"
        }
      ]
    }
  }
}
```

### prompt_operation_ack (type=12)

Server response to appearance change request.

```json
{
  "type": 12,
  "live_id": "live-xyz789",
  "conn_id": "client-001",
  "payload": {
    "prompt_operation_ack": {
      "success": true,
      "error_code": ""
    }
  }
}
```

### audio_interrupted (type=7)

Notify server that audio input was interrupted.

```json
{
  "type": 7,
  "live_id": "live-xyz789",
  "conn_id": "client-001",
  "seq_id": 15,
  "payload": {}
}
```

### force_hangup (type=6)

Server-initiated session termination.

```json
{
  "type": 6,
  "live_id": "live-xyz789",
  "conn_id": "client-001",
  "payload": {
    "hangup": { "hangup_reason": "timeout" }
  }
}
```

**op_type values:**
- `switch` - Add/replace an item
- `remove` - Remove an item

**kind values:**
- `garment` - Clothing
- `object` - Held item
- `background` - Background image

---

## Audio Streaming

### Audio Format

Send PCM audio data through the WebSocket binary channel:

- **Format:** PCM 16-bit signed little-endian
- **Sample Rate:** 24 kHz
- **Channels:** Mono (single channel, "mono")
- **Bytes per ms:** 48 bytes
- **Frame Size:** 960 bytes (20ms)
- **Max Frame:** 64 KiB

### Sending Audio

Send raw PCM bytes as binary WebSocket frames. The audio represents the AI's speech response. After sending the text via type=10 signal, stream the corresponding PCM audio.

---

## End Session

### Client-Initiated Hangup

```json
{
  "type": 5,
  "live_id": "live-xyz789",
  "conn_id": "client-001",
  "seq_id": 20,
  "payload": {
    "hangup": { "hangup_reason": "client_hangup" }
  }
}
```

**hangup_reason values:**
- `client_hangup` - User ended the call
- `timeout` - Session timeout

---

## RTC Integration

The session provides RTC (Real-Time Communication) credentials for video streaming.

### Joining the RTC Channel

Use the credentials from the session creation response:

```javascript
// Example with AliRTC SDK
const rtc = new AliRTC({
  appId: rtcInfo.appId,
  server: "your-domain.com"
});

rtc.joinChannel(
  rtcInfo.channelId,
  rtcInfo.userId,
  rtcInfo.token
);
```

### Video Element

The remote video stream should be rendered in your application:

```html
<video id="remoteVideo" autoplay playsinline></video>
```

```javascript
rtc.on('remote-video-published', (userId, videoTrack) => {
  videoTrack.play(document.getElementById('remoteVideo'));
});
```

---

## Features

### Idle Motion

When the character is not speaking, they perform subtle idle animations. The interval and behavior are controlled by the server.

### Extra Motion (Optional)

Extra motion can be enabled for more expressive characters. Contact support for configuration.

### Action Library

The character can perform actions during conversation based on the LLM response. Actions are automatically triggered based on the character's library configuration.

### Background Music

Characters can have ambient background music. Configure the ambientMusicUrl field in the character settings. The audio plays in a loop at low volume during the session.

---

## Error Codes

| Code | Description |
|------|-------------|
| CHAT_LIVE_INSUFFICIENT_CREDITS | Not enough credits to start session |
| CHARACTER_NOT_FOUND | Invalid character ID |
| SESSION_NOT_FOUND | Session ID not found or expired |
| NOT_COMPONENT_SESSION | Wrong session mode |
| PROMPT_OP_PARAM_INVALID | Invalid appearance change parameters |
| PROMPT_OP_LIVE_NOT_ACTIVE | Session no longer active |

---

## Best Practices

1. **Audio Buffering:** Send PCM frames in 20-100ms chunks for smooth playback
2. **Reconnection:** Implement reconnection logic for WebSocket disconnections
3. **User Input:** Send type=9 signals promptly when user speech is detected
4. **Session Cleanup:** Always send type=5 hangup when ending a session
5. **RTC Token:** RTC tokens expire; handle token refresh for long sessions

---

## Quick Start Example

```javascript
// 1. Get characters
const chars = await fetch('/api/chat-live/characters', {
  headers: { 'Authorization': 'Bearer ' + token }
}).then(r => r.json());

// 2. Create session
const session = await fetch('/api/chat-live/create', {
  method: 'POST',
  headers: { 
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ 
    characterId: chars.characters[0].id,
    mode: 'component'
  })
}).then(r => r.json());

// 3. Connect WebSocket
const ws = new WebSocket(session.wsUrl);

ws.onopen = () => {
  // Send connection init
  ws.send(JSON.stringify({
    type: 1,
    live_id: session.liveId,
    conn_id: 'my-client',
    seq_id: 1,
    payload: { conn_init: { version: 1 } }
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  
  if (msg.type === 2) {
    console.log('Connection ready!');
  } else if (msg.type === 10) {
    console.log('AI says:', msg.payload.text_msg.content);
  }
};

// 4. Send user input (after ASR)
function sendUserText(text) {
  ws.send(JSON.stringify({
    type: 9,
    live_id: session.liveId,
    conn_id: 'my-client',
    seq_id: ++seq,
    payload: { text_msg: { 
      msg_id: 'u-' + Date.now(), 
      content: text,
      timestamp: Date.now()
    }}
  }));
}
```
