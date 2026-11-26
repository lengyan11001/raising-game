(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PlatformErrorCatalog = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SUPPORTED_LANGS = Object.freeze(["en", "zh", "vi", "ja", "ko", "id"]);

  function normalizeErrorLang(value = "", fallback = "") {
    const raw = String(value || "").trim().toLowerCase().replace(/_/g, "-");
    if (!raw) return fallback;
    if (raw === "zh" || raw.startsWith("zh-")) return "zh";
    if (raw === "en" || raw.startsWith("en-")) return "en";
    if (raw === "vi" || raw.startsWith("vi-")) return "vi";
    if (raw === "ja" || raw.startsWith("ja-") || raw === "jp") return "ja";
    if (raw === "ko" || raw.startsWith("ko-") || raw === "kr") return "ko";
    if (raw === "id" || raw.startsWith("id-") || raw === "in") return "id";
    return fallback;
  }

  function detectRequestLang(req = null, fallback = "") {
    try {
      if (!req || typeof req !== "object") return fallback;
      const headers = req.headers || {};
      const explicit = normalizeErrorLang(headers["x-lang"] || headers["x-locale"] || "", "");
      if (explicit) return explicit;
      const rawUrl = String(req.url || "");
      const queryMatch = rawUrl.match(/[?&](?:lang|locale)=([a-zA-Z_-]+)/);
      if (queryMatch) {
        const fromQuery = normalizeErrorLang(queryMatch[1], "");
        if (fromQuery) return fromQuery;
      }
      const accept = String(headers["accept-language"] || "");
      if (accept) {
        for (const part of accept.split(",")) {
          const token = String(part || "").split(";")[0].trim();
          const parsed = normalizeErrorLang(token, "");
          if (parsed) return parsed;
        }
      }
    } catch {
      // Never throw on malformed headers/URLs.
    }
    return fallback;
  }

  const SLOT_LABELS = Object.freeze({
    prompt: Object.freeze({
      en: "Prompt",
      zh: "提示词",
      vi: "Prompt",
      ja: "プロンプト",
      ko: "프롬프트",
      id: "Prompt",
    }),
    first_frame: Object.freeze({
      en: "First frame image",
      zh: "首帧图",
      vi: "Ảnh khung đầu",
      ja: "開始フレーム画像",
      ko: "첫 프레임 이미지",
      id: "Gambar frame awal",
    }),
    last_frame: Object.freeze({
      en: "Last frame image",
      zh: "尾帧图",
      vi: "Ảnh khung cuối",
      ja: "終了フレーム画像",
      ko: "마지막 프레임 이미지",
      id: "Gambar frame akhir",
    }),
    reference_image: Object.freeze({
      en: "Reference image",
      zh: "参考图",
      vi: "Ảnh tham chiếu",
      ja: "参考画像",
      ko: "참고 이미지",
      id: "Gambar referensi",
    }),
    reference_video: Object.freeze({
      en: "Reference video",
      zh: "参考视频",
      vi: "Video tham chiếu",
      ja: "参考動画",
      ko: "참고 영상",
      id: "Video referensi",
    }),
    reference_audio: Object.freeze({
      en: "Reference audio",
      zh: "参考音频",
      vi: "Âm thanh tham chiếu",
      ja: "参考音声",
      ko: "참고 오디오",
      id: "Audio referensi",
    }),
    reference_file: Object.freeze({
      en: "Reference file",
      zh: "参考文件",
      vi: "Tệp tham chiếu",
      ja: "参考ファイル",
      ko: "참고 파일",
      id: "File referensi",
    }),
  });

  function sanitizeDisplayFileName(value = "") {
    const raw = String(value || "")
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/^.*[\\/]/, "")
      .replace(/[\r\n\t]+/g, " ")
      .trim();
    if (!raw || /^(?:upload|image|video|audio|file)$/i.test(raw)) return "";
    return raw.length > 40 ? `${raw.slice(0, 37)}...` : raw;
  }

  function formatMediaTarget(target = null, lang = "en") {
    if (!target || typeof target !== "object") return "";
    const resolvedLang = normalizeErrorLang(lang, "en");
    const slot = String(target.slot || "").trim().toLowerCase();
    const index = Number(target.index || 0);
    const mention = String(target.mention || "").trim();
    const fileName = sanitizeDisplayFileName(target.fileName || target.name || "");
    const slotLabels = SLOT_LABELS[slot];
    let base = "";
    if (slot === "prompt" || slot === "first_frame" || slot === "last_frame") {
      base = (slotLabels && slotLabels[resolvedLang]) || (slotLabels && slotLabels.en) || "";
    } else if (mention) {
      base = mention;
    } else if (slotLabels) {
      const label = slotLabels[resolvedLang] || slotLabels.en;
      base = Number.isInteger(index) && index > 0 ? `${label} ${index}` : label;
    } else if (fileName) {
      return fileName;
    }
    if (!base) return fileName;
    if (!fileName) return base;
    return (resolvedLang === "zh" || resolvedLang === "ja")
      ? `${base}（${fileName}）`
      : `${base} (${fileName})`;
  }

  function interpolateTemplate(template = "", vars = {}) {
    return String(template || "").replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => {
      const value = vars[key];
      return value === undefined || value === null ? "" : String(value);
    }).replace(/\s{2,}/g, " ").trim();
  }

    const ERROR_CATALOG = {
    MODERATION_INPUT_TEXT: {
      category: "moderation",
      general: {
        en: "The prompt did not pass content moderation. Please adjust your prompt and try again.",
        zh: "输入的提示词未通过内容审核，请调整提示词后重试。",
        vi: "Prompt không vượt qua kiểm duyệt nội dung. Vui lòng điều chỉnh prompt và thử lại.",
        ja: "入力したプロンプトがコンテンツ審査を通過しませんでした。プロンプトを調整して再試行してください。",
        ko: "입력한 프롬프트가 콘텐츠 심사를 통과하지 못했습니다. 프롬프트를 수정한 후 다시 시도해 주세요.",
        id: "Prompt tidak lolos moderasi konten. Silakan ubah prompt dan coba lagi.",
      },
    },
    MODERATION_INPUT_MEDIA: {
      category: "moderation",
      withTarget: {
        en: "Input media {target} did not pass content moderation. Please replace it and try again.",
        zh: "参考素材 {target} 未通过内容审核，请更换该素材后重试。",
        vi: "Tài nguyên {target} không vượt qua kiểm duyệt nội dung. Vui lòng thay thế và thử lại.",
        ja: "素材 {target} がコンテンツ審査を通過しませんでした。別の素材に差し替えて再試行してください。",
        ko: "소재 {target}이(가) 콘텐츠 심사를 통과하지 못했습니다. 해당 소재를 교체한 후 다시 시도해 주세요.",
        id: "Media {target} tidak lolos moderasi konten. Silakan ganti media tersebut dan coba lagi.",
      },
      general: {
        en: "An input media asset did not pass content moderation. Please replace the reference media and try again.",
        zh: "上传的参考素材未通过内容审核，请更换参考素材后重试。",
        vi: "Tài nguyên tham chiếu không vượt qua kiểm duyệt nội dung. Vui lòng thay tài nguyên và thử lại.",
        ja: "入力素材がコンテンツ審査を通過しませんでした。参考素材を変更して再試行してください。",
        ko: "업로드한 참고 소재가 콘텐츠 심사를 통과하지 못했습니다. 참고 소재를 교체한 후 다시 시도해 주세요.",
        id: "Media referensi tidak lolos moderasi konten. Silakan ganti media referensi dan coba lagi.",
      },
    },
    MODERATION_INPUT_REAL_FACE: {
      category: "moderation",
      withTarget: {
        en: "Input media {target} is suspected of containing a real human face, which is not permitted by this model. Please replace it.",
        zh: "参考素材 {target} 疑似包含真人人脸，当前模型不支持此类素材，请更换后重试。",
        vi: "Tài nguyên {target} có thể chứa khuôn mặt người thật và không được mô hình hỗ trợ. Vui lòng thay thế.",
        ja: "素材 {target} に実在の人物の顔が含まれている可能性があるため使用できません。別の素材に変更してください。",
        ko: "소재 {target}에 실제 인물 얼굴이 포함된 것으로 감지되어 사용할 수 없습니다. 다른 소재로 교체해 주세요.",
        id: "Media {target} diduga mengandung wajah manusia asli yang tidak diizinkan model ini. Silakan ganti.",
      },
      general: {
        en: "The input media is suspected of containing a real human face, which is not permitted by this model. Please replace the reference media.",
        zh: "参考素材疑似包含真人人脸，当前模型不支持此类素材，请更换素材后重试。",
        vi: "Tài nguyên đầu vào có thể chứa khuôn mặt người thật và không được hỗ trợ. Vui lòng thay tài nguyên khác.",
        ja: "入力素材に実在の人物の顔が含まれている可能性があるため使用できません。素材を変更して再試行してください。",
        ko: "입력 소재에 실제 인물 얼굴이 포함된 것으로 감지되어 사용할 수 없습니다. 소재를 교체해 주세요.",
        id: "Media input diduga mengandung wajah manusia asli yang tidak diizinkan. Silakan ganti media referensi.",
      },
    },
    MODERATION_OUTPUT_VIDEO: {
      category: "moderation",
      general: {
        en: "The generated video did not pass safety review. Credits have been refunded if charged. Please adjust your prompt or reference media and try again.",
        zh: "生成的视频结果未通过内容安全审核（如已扣积分会自动退回），请调整提示词或参考素材后重试。",
        vi: "Video tạo ra không vượt qua kiểm duyệt an toàn (điểm đã trừ sẽ được hoàn lại). Vui lòng điều chỉnh prompt hoặc tài nguyên và thử lại.",
        ja: "生成された動画が安全審査を通過しませんでした（消費済みクレジットは自動返還されます）。プロンプトや素材を調整して再試行してください。",
        ko: "생성된 영상이 안전 심사를 통과하지 못했습니다(차감된 크레딧은 자동 환불됩니다). 프롬프트나 참고 소재를 조정해 다시 시도해 주세요.",
        id: "Video hasil generasi tidak lolos pemeriksaan keamanan (kredit yang terpotong akan dikembalikan otomatis). Silakan ubah prompt atau media lalu coba lagi.",
      },
    },
    MODERATION_OUTPUT_IMAGE: {
      category: "moderation",
      general: {
        en: "The generated image did not pass safety review. Credits have been refunded if charged. Please adjust your prompt or reference media and try again.",
        zh: "生成的图片结果未通过内容安全审核（如已扣积分会自动退回），请调整提示词或参考素材后重试。",
        vi: "Hình ảnh tạo ra không vượt qua kiểm duyệt an toàn (điểm đã trừ sẽ được hoàn lại). Vui lòng điều chỉnh prompt hoặc tài nguyên và thử lại.",
        ja: "生成された画像が安全審査を通過しませんでした（消費済みクレジットは自動返還されます）。プロンプトや素材を調整して再試行してください。",
        ko: "생성된 이미지가 안전 심사를 통과하지 못했습니다(차감된 크레딧은 자동 환불됩니다). 프롬프트나 참고 소재를 조정해 다시 시도해 주세요.",
        id: "Gambar hasil generasi tidak lolos pemeriksaan keamanan (kredit yang terpotong akan dikembalikan otomatis). Silakan ubah prompt atau media lalu coba lagi.",
      },
    },
    MODERATION_GENERAL: {
      category: "moderation",
      general: {
        en: "Content moderation did not pass. Please adjust your prompt or reference media and try again.",
        zh: "内容审核未通过，请调整提示词或参考素材后重试。",
        vi: "Nội dung không vượt qua kiểm duyệt. Vui lòng điều chỉnh prompt hoặc tài nguyên tham chiếu và thử lại.",
        ja: "コンテンツ審査を通過しませんでした。プロンプトまたは参考素材を調整して再試行してください。",
        ko: "콘텐츠 심사를 통과하지 못했습니다. 프롬프트 또는 참고 소재를 조정한 후 다시 시도해 주세요.",
        id: "Moderasi konten tidak lolos. Silakan sesuaikan prompt atau media referensi dan coba lagi.",
      },
    },
    COPYRIGHT_OUTPUT_AUDIO: {
      category: "copyright",
      general: {
        en: "The generated audio triggered copyright restrictions, usually caused by auto-generated background music (BGM). Please regenerate; if it fails again, disable Generate Audio and retry.",
        zh: "生成结果中的音频触发版权限制，通常是自动生成的背景音乐（BGM）导致。平台已加入禁止生成 BGM 的约束，请重新生成；如仍失败，请关闭“生成音频”后再试。",
        vi: "Âm thanh tạo ra vướng hạn chế bản quyền, thường do nhạc nền (BGM) tự động. Vui lòng tạo lại; nếu vẫn lỗi, hãy tắt tạo âm thanh và thử lại.",
        ja: "生成された音声が著作権制限に該当しました（自動生成されたBGMが原因の場合が多いです）。再生成するか、音声生成をオフにしてお試しください。",
        ko: "생성된 오디오가 저작권 제한에 걸렸습니다(자동 생성된 배경음악이 원인인 경우가 많습니다). 다시 생성하거나 오디오 생성을 끄고 시도해 주세요.",
        id: "Audio hasil generasi terkena pembatasan hak cipta, biasanya akibat musik latar (BGM) otomatis. Silakan buat ulang atau matikan pembuatan audio lalu coba lagi.",
      },
    },
    COPYRIGHT_OUTPUT_VIDEO: {
      category: "copyright",
      general: {
        en: "The generated video output triggered copyright restrictions (not necessarily your uploaded media). Credits have been refunded if charged. Please regenerate or adjust the prompt.",
        zh: "生成的视频结果触发了版权限制（通常是生成画面中的元素或音乐引起，如已扣积分会自动退回）。请调整提示词或重新生成。",
        vi: "Video đầu ra vướng hạn chế bản quyền (điểm đã trừ sẽ được hoàn lại). Vui lòng điều chỉnh prompt hoặc tạo lại.",
        ja: "生成された動画出力が著作権制限に該当しました（消費済みクレジットは自動返還されます）。プロンプトを調整するか再生成してください。",
        ko: "생성된 영상 결과가 저작권 제한에 걸렸습니다(차감된 크레딧은 자동 환불됩니다). 프롬프트를 조정하거나 다시 생성해 주세요.",
        id: "Video hasil generasi terkena pembatasan hak cipta (kredit yang terpotong akan dikembalikan otomatis). Silakan ubah prompt atau buat ulang.",
      },
    },
    COPYRIGHT_OUTPUT_IMAGE: {
      category: "copyright",
      general: {
        en: "The generated image output triggered copyright restrictions. Credits have been refunded if charged. Please adjust your prompt and regenerate.",
        zh: "生成的图片结果触发了版权限制（如已扣积分会自动退回），请调整提示词后重新生成。",
        vi: "Hình ảnh đầu ra vướng hạn chế bản quyền (điểm đã trừ sẽ được hoàn lại). Vui lòng điều chỉnh prompt và tạo lại.",
        ja: "生成された画像出力が著作権制限に該当しました（消費済みクレジットは自動返還されます）。プロンプトを調整して再生成してください。",
        ko: "생성된 이미지 결과가 저작권 제한에 걸렸습니다(차감된 크레딧은 자동 환불됩니다). 프롬프트를 조정한 후 다시 생성해 주세요.",
        id: "Gambar hasil generasi terkena pembatasan hak cipta (kredit yang terpotong akan dikembalikan otomatis). Silakan ubah prompt dan buat ulang.",
      },
    },
    COPYRIGHT_INPUT_MEDIA: {
      category: "copyright",
      withTarget: {
        en: "Reference media {target} may involve copyright restrictions. Please replace it and try again.",
        zh: "参考素材 {target} 可能涉及版权限制，请更换该素材后重试。",
        vi: "Tài nguyên {target} có thể liên quan đến bản quyền. Vui lòng thay thế và thử lại.",
        ja: "参考素材 {target} が著作権制限に該当する可能性があります。別の素材に変更して再試行してください。",
        ko: "참고 소재 {target}이(가) 저작권 제한에 해당할 수 있습니다. 해당 소재를 교체한 후 다시 시도해 주세요.",
        id: "Media referensi {target} mungkin melanggar hak cipta. Silakan ganti media tersebut dan coba lagi.",
      },
      general: {
        en: "Reference media may involve copyright restrictions. Please replace the media and try again.",
        zh: "参考素材可能涉及版权限制，请更换素材后重试。",
        vi: "Tài nguyên tham chiếu có thể liên quan đến bản quyền. Vui lòng thay tài nguyên và thử lại.",
        ja: "参考素材が著作権制限に該当する可能性があります。素材を変更して再試行してください。",
        ko: "참고 소재가 저작권 제한에 해당할 수 있습니다. 소재를 교체한 후 다시 시도해 주세요.",
        id: "Media referensi mungkin terkait pembatasan hak cipta. Silakan ganti media dan coba lagi.",
      },
    },
        MEDIA_NOT_FOUND: {
      category: "media",
      withTarget: {
        en: "Media {target} was not found or has expired. Please re-upload or re-select it and try again.",
        zh: "素材 {target} 不存在或已失效，请重新上传或重新选择后重试。",
        vi: "Không tìm thấy hoặc tài nguyên {target} đã hết hạn. Vui lòng tải lại hoặc chọn lại.",
        ja: "素材 {target} が見つからないか期限切れです。再アップロードまたは再選択してお試しください。",
        ko: "소재 {target}을(를) 찾을 수 없거나 만료되었습니다. 다시 업로드하거나 선택해 주세요.",
        id: "Media {target} tidak ditemukan atau telah kedaluwarsa. Silakan unggah atau pilih ulang.",
      },
      general: {
        en: "Reference media was not found or has expired. Please re-upload or re-select it and try again.",
        zh: "参考素材不存在或已失效，请重新上传或重新选择后重试。",
        vi: "Không tìm thấy hoặc tài nguyên tham chiếu đã hết hạn. Vui lòng tải lại hoặc chọn lại.",
        ja: "参考素材が見つからないか期限切れです。再アップロードまたは再選択してお試しください。",
        ko: "참고 소재를 찾을 수 없거나 만료되었습니다. 다시 업로드하거나 선택해 주세요.",
        id: "Media referensi tidak ditemukan atau telah kedaluwarsa. Silakan unggah atau pilih ulang.",
      },
    },
    MEDIA_DOWNLOAD_FAILED: {
      category: "media",
      retryable: true,
      withTarget: {
        en: "Failed to download media {target} from storage. Please retry or re-upload this file.",
        zh: "素材 {target} 下载失败或超时，请稍后重试或重新上传该素材。",
        vi: "Không thể tải xuống tài nguyên {target} (lỗi hoặc quá thời gian). Vui lòng thử lại hoặc tải lên lại.",
        ja: "素材 {target} のダウンロードに失敗またはタイムアウトしました。再試行するか再アップロードしてください。",
        ko: "소재 {target} 다운로드에 실패했거나 시간 초과되었습니다. 다시 시도하거나 재업로드해 주세요.",
        id: "Gagal mengunduh media {target} atau waktu habis. Silakan coba lagi atau unggah ulang file ini.",
      },
      general: {
        en: "Failed to download reference media. Please retry or re-upload the media.",
        zh: "参考素材下载失败或超时，请稍后重试或重新上传素材。",
        vi: "Không thể tải xuống tài nguyên tham chiếu. Vui lòng thử lại hoặc tải lên lại.",
        ja: "参考素材のダウンロードに失敗しました。再試行するか素材を再アップロードしてください。",
        ko: "참고 소재 다운로드에 실패했습니다. 다시 시도하거나 소재를 재업로드해 주세요.",
        id: "Gagal mengunduh media referensi. Silakan coba lagi atau unggah ulang media.",
      },
    },
    MEDIA_DIMENSIONS_INVALID: {
      category: "media",
      withTarget: {
        en: "Media {target} dimensions are out of range{actualSuffix}{rangeSuffix}. Please resize or replace it.",
        zh: "素材 {target} 尺寸不合规{actualSuffix}{rangeSuffix}，请调整尺寸或更换素材。",
        vi: "Kích thước của {target} không hợp lệ{actualSuffix}{rangeSuffix}. Vui lòng thay đổi kích thước hoặc thay tệp khác.",
        ja: "素材 {target} の解像度が範囲外です{actualSuffix}{rangeSuffix}。サイズを調整するか差し替えてください。",
        ko: "소재 {target}의 해상도가 허용 범위를 벗어났습니다{actualSuffix}{rangeSuffix}. 크기를 조정하거나 교체해 주세요.",
        id: "Dimensi media {target} di luar batas{actualSuffix}{rangeSuffix}. Silakan ubah ukuran atau ganti file.",
      },
      general: {
        en: "Reference media dimensions are out of range{actualSuffix}{rangeSuffix}. Please resize or replace the media.",
        zh: "参考素材尺寸不合规{actualSuffix}{rangeSuffix}，请调整尺寸或更换素材。",
        vi: "Kích thước tài nguyên tham chiếu không hợp lệ{actualSuffix}{rangeSuffix}. Vui lòng điều chỉnh hoặc thay tệp khác.",
        ja: "参考素材の解像度が範囲外です{actualSuffix}{rangeSuffix}。サイズを調整するか素材を変更してください。",
        ko: "참고 소재의 해상도가 허용 범위를 벗어났습니다{actualSuffix}{rangeSuffix}. 크기를 조정하거나 교체해 주세요.",
        id: "Dimensi media referensi di luar batas{actualSuffix}{rangeSuffix}. Silakan ubah ukuran atau ganti media.",
      },
    },
    MEDIA_DIMENSIONS_UNREADABLE: {
      category: "media",
      withTarget: {
        en: "Could not read dimensions of media {target}. The file may be corrupted or unsupported. Please re-export and re-upload.",
        zh: "无法读取素材 {target} 的尺寸信息，文件可能损坏或格式不受支持，请重新导出后上传。",
        vi: "Không thể đọc kích thước của {target}. Tệp có thể bị hỏng hoặc không hỗ trợ, vui lòng xuất lại và tải lên.",
        ja: "素材 {target} のサイズを読み取れませんでした。破損または未対応形式の可能性があります。再書き出ししてアップロードしてください。",
        ko: "소재 {target}의 크기를 읽을 수 없습니다. 파일이 손상되었거나 지원되지 않는 형식일 수 있습니다.",
        id: "Tidak dapat membaca dimensi media {target}. File mungkin rusak atau tidak didukung, silakan unggah ulang.",
      },
      general: {
        en: "Could not read reference media dimensions. The file may be corrupted or unsupported.",
        zh: "无法读取参考素材的尺寸信息，文件可能损坏或格式不受支持，请重新上传。",
        vi: "Không thể đọc kích thước tài nguyên tham chiếu. Tệp có thể bị hỏng hoặc không được hỗ trợ.",
        ja: "参考素材のサイズを読み取れませんでした。破損または未対応形式の可能性があります。",
        ko: "참고 소재의 크기를 읽을 수 없습니다. 파일이 손상되었거나 지원되지 않는 형식입니다.",
        id: "Tidak dapat membaca dimensi media referensi. File mungkin rusak atau tidak didukung.",
      },
    },
    MEDIA_NORMALIZE_FAILED: {
      category: "media",
      withTarget: {
        en: "Media {target} could not be prepared for generation. Please try another file or re-export as standard PNG/JPG/MP4.",
        zh: "素材 {target} 预处理失败，请更换文件或重新导出为标准 PNG/JPG/MP4 后重试。",
        vi: "Không thể xử lý tài nguyên {target} cho việc tạo. Vui lòng thử tệp khác hoặc xuất lại sang PNG/JPG/MP4 chuẩn.",
        ja: "素材 {target} の前処理に失敗しました。標準的なPNG/JPG/MP4で再書き出しするか別のファイルをお試しください。",
        ko: "소재 {target} 전처리에 실패했습니다. 표준 PNG/JPG/MP4 형식으로 다시 내보내거나 다른 파일을 사용해 주세요.",
        id: "Media {target} gagal diproses untuk generasi. Silakan coba file lain atau ekspor ulang ke PNG/JPG/MP4 standar.",
      },
      general: {
        en: "Reference media could not be prepared for generation. Please re-upload in a standard format.",
        zh: "参考素材预处理失败，请重新导出为标准格式后重试。",
        vi: "Không thể xử lý tài nguyên tham chiếu. Vui lòng tải lên lại ở định dạng chuẩn.",
        ja: "参考素材の前処理に失敗しました。標準形式で再アップロードしてお試しください。",
        ko: "참고 소재 전처리에 실패했습니다. 표준 형식으로 다시 업로드해 주세요.",
        id: "Media referensi gagal diproses. Silakan unggah ulang dalam format standar.",
      },
    },
    MEDIA_ASPECT_RATIO_INVALID: {
      category: "media",
      withTarget: {
        en: "Media {target} aspect ratio is unsupported{actualSuffix}. Please crop or replace this file.",
        zh: "素材 {target} 的宽高比不受支持{actualSuffix}，请裁剪或更换该素材。",
        vi: "Tỷ lệ khung hình của {target} không được hỗ trợ{actualSuffix}. Vui lòng cắt hoặc thay thế tệp này.",
        ja: "素材 {target} のアスペクト比は未対応です{actualSuffix}。トリミングするか差し替えてください。",
        ko: "소재 {target}의 화면 비율이 지원되지 않습니다{actualSuffix}. 자르거나 교체해 주세요.",
        id: "Rasio aspek media {target} tidak didukung{actualSuffix}. Silakan potong atau ganti file ini.",
      },
      general: {
        en: "Reference media aspect ratio is unsupported. Please crop or replace the media.",
        zh: "参考素材宽高比不受支持，请裁剪或更换素材。",
        vi: "Tỷ lệ khung hình tài nguyên tham chiếu không được hỗ trợ. Vui lòng cắt hoặc thay thế.",
        ja: "参考素材のアスペクト比が未対応です。トリミングまたは差し替えをお試しください。",
        ko: "참고 소재의 화면 비율이 지원되지 않습니다. 자르거나 교체해 주세요.",
        id: "Rasio aspek media referensi tidak didukung. Silakan potong atau ganti media.",
      },
    },
    MEDIA_FORMAT_INVALID: {
      category: "media",
      withTarget: {
        en: "Media {target} format is not supported by this model. Please convert or replace it.",
        zh: "素材 {target} 的格式不受当前模型支持，请转换格式或更换素材。",
        vi: "Định dạng của {target} không được mô hình này hỗ trợ. Vui lòng chuyển đổi hoặc thay thế.",
        ja: "素材 {target} の形式はこのモデルで未対応です。変換するか差し替えてください。",
        ko: "소재 {target}의 형식이 이 모델에서 지원되지 않습니다. 변환하거나 교체해 주세요.",
        id: "Format media {target} tidak didukung model ini. Silakan konversi atau ganti file.",
      },
      general: {
        en: "Reference media format is not supported by this model. Please convert or replace the media.",
        zh: "参考素材格式不受当前模型支持，请转换格式或更换素材。",
        vi: "Định dạng tài nguyên tham chiếu không được hỗ trợ. Vui lòng chuyển đổi hoặc thay thế.",
        ja: "参考素材の形式がこのモデルで未対応です。変換するか素材を変更してください。",
        ko: "참고 소재의 형식이 이 모델에서 지원되지 않습니다. 변환하거나 교체해 주세요.",
        id: "Format media referensi tidak didukung model ini. Silakan konversi atau ganti media.",
      },
    },
    MEDIA_DURATION_INVALID: {
      category: "media",
      withTarget: {
        en: "Media {target} duration is out of the allowed range{durationRangeSuffix}.",
        zh: "素材 {target} 的时长超出限制{durationRangeSuffix}。",
        vi: "Thời lượng của {target} nằm ngoài giới hạn cho phép{durationRangeSuffix}.",
        ja: "素材 {target} の長さが許容範囲外です{durationRangeSuffix}。",
        ko: "소재 {target}의 길이가 허용 범위를 벗어났습니다{durationRangeSuffix}.",
        id: "Durasi media {target} di luar batas yang diizinkan{durationRangeSuffix}.",
      },
      general: {
        en: "Reference media duration exceeds the allowed limit{durationRangeSuffix}.",
        zh: "参考素材时长超出限制{durationRangeSuffix}。",
        vi: "Thời lượng tài nguyên tham chiếu vượt quá giới hạn{durationRangeSuffix}.",
        ja: "参考素材の長さが制限を超えています{durationRangeSuffix}。",
        ko: "참고 소재 길이가 허용 제한을 초과했습니다{durationRangeSuffix}.",
        id: "Durasi media referensi melebihi batas yang diizinkan{durationRangeSuffix}.",
      },
    },
    MEDIA_DURATION_REQUIRED: {
      category: "media",
      withTarget: {
        en: "Could not read duration of media {target}. Please re-upload a standard media file.",
        zh: "无法读取素材 {target} 的时长，请重新上传标准格式的音视频文件。",
        vi: "Không thể đọc thời lượng của {target}. Vui lòng tải lại tệp chuẩn.",
        ja: "素材 {target} の長さを読み取れませんでした。標準形式のファイルを再アップロードしてください。",
        ko: "소재 {target}의 길이를 읽을 수 없습니다. 표준 형식 파일로 다시 업로드해 주세요.",
        id: "Tidak dapat membaca durasi media {target}. Silakan unggah ulang file media standar.",
      },
      general: {
        en: "Each reference video or audio must have a readable duration.",
        zh: "无法读取参考音视频的时长，请重新上传标准格式文件。",
        vi: "Mỗi video hoặc âm thanh tham chiếu phải có thời lượng đọc được.",
        ja: "参考動画・音声の長さを読み取れませんでした。",
        ko: "참고 영상 또는 오디오의 길이를 읽을 수 있어야 합니다.",
        id: "Setiap video atau audio referensi harus memiliki durasi yang dapat dibaca.",
      },
    },
    MEDIA_URL_REQUIRED: {
      category: "media",
      withTarget: {
        en: "Media {target} requires a valid public HTTP(S) URL. Please re-upload it.",
        zh: "素材 {target} 需要有效的公网链接，请重新上传该素材。",
        vi: "Tài nguyên {target} yêu cầu URL công khai hợp lệ. Vui lòng tải lên lại.",
        ja: "素材 {target} には有効な公開URLが必要です。再アップロードしてください。",
        ko: "소재 {target}에는 유효한 공개 URL이 필요합니다. 다시 업로드해 주세요.",
        id: "Media {target} memerlukan URL publik yang valid. Silakan unggah ulang.",
      },
      general: {
        en: "Reference media requires a valid public HTTP(S) URL. Please re-upload.",
        zh: "参考素材需要有效的公网链接，请重新上传。",
        vi: "Tài nguyên tham chiếu yêu cầu URL HTTP(S) công khai hợp lệ.",
        ja: "参考素材には有効な公開URLが必要です。",
        ko: "참고 소재에는 유효한 공개 HTTP(S) URL이 필요합니다.",
        id: "Media referensi memerlukan URL HTTP(S) publik yang valid.",
      },
    },
    MEDIA_COUNT_EXCEEDED: {
      category: "media",
      general: {
        en: "The number of reference media files exceeds this model's limit.",
        zh: "参考素材数量超出当前模型上限，请减少素材数量后重试。",
        vi: "Số lượng tài nguyên tham chiếu vượt quá giới hạn của mô hình này.",
        ja: "参考素材の数がこのモデルの上限を超えています。数を減らして再試行してください。",
        ko: "참고 소재 개수가 이 모델의 한도를 초과했습니다. 소재 수를 줄여 다시 시도해 주세요.",
        id: "Jumlah media referensi melebihi batas model ini.",
      },
    },
    MEDIA_TOO_LARGE: {
      category: "media",
      withTarget: {
        en: "Media {target} exceeds the maximum file size limit.",
        zh: "素材 {target} 体积超出大小限制，请压缩后重新上传。",
        vi: "Tài nguyên {target} vượt quá dung lượng tối đa cho phép.",
        ja: "素材 {target} のファイルサイズが上限を超えています。圧縮して再アップロードしてください。",
        ko: "소재 {target}의 파일 크기가 최대 한도를 초과했습니다.",
        id: "Ukuran media {target} melebihi batas maksimum.",
      },
      general: {
        en: "The uploaded file exceeds the maximum file size limit.",
        zh: "上传文件体积超出大小限制，请压缩后重试。",
        vi: "Tệp tải lên vượt quá dung lượng tối đa cho phép.",
        ja: "アップロードされたファイルがサイズ上限を超えています。",
        ko: "업로드한 파일이 최대 크기 한도를 초과했습니다.",
        id: "File yang diunggah melebihi batas ukuran maksimum.",
      },
    },
    MEDIA_STILL_PREPARING: {
      category: "media",
      retryable: true,
      withTarget: {
        en: "Media {target} is still being prepared. Please wait a moment and try again.",
        zh: "素材 {target} 仍在准备中，请稍等片刻后重试。",
        vi: "Tài nguyên {target} đang được chuẩn bị. Vui lòng đợi giây lát rồi thử lại.",
        ja: "素材 {target} を準備中です。しばらく待ってから再試行してください。",
        ko: "소재 {target}을(를) 준비 중입니다. 잠시 후 다시 시도해 주세요.",
        id: "Media {target} masih disiapkan. Silakan tunggu sebentar lalu coba lagi.",
      },
      general: {
        en: "Reference media is still being prepared. Please try again shortly.",
        zh: "参考素材仍在准备中，请稍后重试。",
        vi: "Tài nguyên tham chiếu đang được chuẩn bị. Vui lòng thử lại sau ít phút.",
        ja: "参考素材を準備中です。しばらくしてから再試行してください。",
        ko: "참고 소재를 준비 중입니다. 잠시 후 다시 시도해 주세요.",
        id: "Media referensi masih disiapkan. Silakan coba lagi sebentar lagi.",
      },
    },
    MEDIA_COMBINATION_INVALID: {
      category: "media",
      general: {
        en: "The selected media combination is not supported for this mode. Please check your frame or reference inputs.",
        zh: "当前模式的素材组合不受支持，请检查首帧/尾帧或参考素材后重试。",
        vi: "Tổ hợp tài nguyên đã chọn không được hỗ trợ ở chế độ này. Vui lòng kiểm tra lại.",
        ja: "選択した素材の組み合わせはこのモードで未対応です。フレームや参考素材を確認してください。",
        ko: "선택한 소재 조합은 이 모드에서 지원되지 않습니다. 프레임 또는 참고 소재를 확인해 주세요.",
        id: "Kombinasi media yang dipilih tidak didukung untuk mode ini. Silakan periksa input Anda.",
      },
    },
        SEEDANCE_EDIT_CONSTRAINT: {
      category: "parameter",
      general: {
        en: "Seedance detected this prompt as a video-editing task. Set aspect ratio to adaptive and duration to follow the input video, or adjust the prompt.",
        zh: "Seedance 将当前提示词识别为视频编辑任务，比例需选择自适应（adaptive）且时长需跟随输入视频，请调整设置或提示词后重试。",
        vi: "Seedance nhận diện đây là tác vụ chỉnh sửa video. Hãy đặt tỷ lệ khung hình là adaptive và thời lượng theo video đầu vào, hoặc điều chỉnh prompt.",
        ja: "Seedanceがこのプロンプトを動画編集タスクと判定しました。比率をadaptiveにし、長さを入力動画に合わせるかプロンプトを調整してください。",
        ko: "Seedance가 이 프롬프트를 영상 편집 작업으로 인식했습니다. 비율을 adaptive로 설정하고 길이를 입력 영상에 맞추거나 프롬프트를 조정해 주세요.",
        id: "Seedance mengenali prompt ini sebagai tugas edit video. Atur rasio ke adaptive dan durasi mengikuti video input, atau ubah prompt.",
      },
    },
    INVALID_DURATION: {
      category: "parameter",
      general: {
        en: "The selected duration is not supported by this model{durationRangeSuffix}.",
        zh: "当前模型不支持所选时长{durationRangeSuffix}，请重新选择时长。",
        vi: "Thời lượng đã chọn không được mô hình hỗ trợ{durationRangeSuffix}.",
        ja: "選択した長さはこのモデルで未対応です{durationRangeSuffix}。",
        ko: "선택한 길이는 이 모델에서 지원되지 않습니다{durationRangeSuffix}.",
        id: "Durasi yang dipilih tidak didukung model ini{durationRangeSuffix}.",
      },
    },
    INVALID_RATIO: {
      category: "parameter",
      general: {
        en: "The selected aspect ratio is not supported by this model.",
        zh: "当前模型不支持所选画面比例，请切换比例后重试。",
        vi: "Tỷ lệ khung hình đã chọn không được mô hình hỗ trợ.",
        ja: "選択したアスペクト比はこのモデルで未対応です。",
        ko: "선택한 화면 비율은 이 모델에서 지원되지 않습니다.",
        id: "Rasio aspek yang dipilih tidak didukung model ini.",
      },
    },
    INVALID_RESOLUTION: {
      category: "parameter",
      general: {
        en: "The selected resolution is not supported by this model.",
        zh: "当前模型不支持所选分辨率，请切换分辨率后重试。",
        vi: "Độ phân giải đã chọn không được mô hình hỗ trợ.",
        ja: "選択した解像度はこのモデルで未対応です。",
        ko: "선택한 해상도는 이 모델에서 지원되지 않습니다.",
        id: "Resolusi yang dipilih tidak didukung model ini.",
      },
    },
    PROMPT_REQUIRED: {
      category: "parameter",
      general: {
        en: "Please enter a prompt before generating.",
        zh: "请输入提示词后再生成。",
        vi: "Vui lòng nhập prompt trước khi tạo.",
        ja: "生成する前にプロンプトを入力してください。",
        ko: "생성하기 전에 프롬프트를 입력해 주세요.",
        id: "Silakan masukkan prompt sebelum membuat.",
      },
    },
    PROMPT_TOO_LONG: {
      category: "parameter",
      general: {
        en: "The prompt exceeds the maximum length{maxCharsSuffix}. Please shorten it and try again.",
        zh: "提示词超过最大长度限制{maxCharsSuffix}，请精简后重试。",
        vi: "Prompt vượt quá độ dài tối đa{maxCharsSuffix}. Vui lòng rút gọn và thử lại.",
        ja: "プロンプトが最大文字数を超えています{maxCharsSuffix}。短くして再試行してください。",
        ko: "프롬프트가 최대 길이를 초과했습니다{maxCharsSuffix}. 줄여서 다시 시도해 주세요.",
        id: "Prompt melebihi panjang maksimum{maxCharsSuffix}. Silakan perpendek dan coba lagi.",
      },
    },
    MODEL_RETIRED: {
      category: "parameter",
      general: {
        en: "This model has been retired. Please select an available model and try again.",
        zh: "该模型已下线，请切换其他可用模型后重试。",
        vi: "Mô hình này đã ngừng hoạt động. Vui lòng chọn mô hình khác.",
        ja: "このモデルは提供終了しました。利用可能な別モデルを選択してください。",
        ko: "이 모델은 종료되었습니다. 사용 가능한 다른 모델을 선택해 주세요.",
        id: "Model ini sudah dihentikan. Silakan pilih model lain yang tersedia.",
      },
    },
    INVALID_PARAMETERS: {
      category: "parameter",
      general: {
        en: "Unsupported generation parameters. Please adjust the model, duration, aspect ratio, or reference media and try again.",
        zh: "生成参数不受支持，请调整模型、时长、比例或素材后重试。",
        vi: "Tham số tạo không được hỗ trợ. Vui lòng điều chỉnh mô hình, thời lượng, tỷ lệ hoặc tài nguyên và thử lại.",
        ja: "生成パラメータが未対応です。モデル・長さ・比率・素材を調整して再試行してください。",
        ko: "지원되지 않는 생성 파라미터입니다. 모델, 길이, 비율 또는 소재를 조정해 다시 시도해 주세요.",
        id: "Parameter generasi tidak didukung. Silakan sesuaikan model, durasi, rasio, atau media referensi lalu coba lagi.",
      },
    },
    GENERATION_SUBMIT_TIMEOUT: {
      category: "network",
      retryable: true,
      general: {
        en: "Generation submission timed out before the upstream task started. Pre-deducted credits have been refunded automatically. Please try again.",
        zh: "生成任务提交超时，本次预扣积分已自动退回，请稍后重试。",
        vi: "Gửi tác vụ quá thời gian. Điểm tạm trừ đã được hoàn lại tự động, vui lòng thử lại.",
        ja: "生成リクエストの送信がタイムアウトしました。仮引き落としされたクレジットは自動返還済みです。再試行してください。",
        ko: "생성 요청 제출 시간이 초과되었습니다. 선차감된 크레딧은 자동 환불되었으니 다시 시도해 주세요.",
        id: "Pengiriman tugas kehabisan waktu. Kredit yang dipotong sementara telah dikembalikan otomatis. Silakan coba lagi.",
      },
    },
    UPSTREAM_RATE_LIMITED: {
      category: "network",
      retryable: true,
      general: {
        en: "The generation service is currently busy. Please try again shortly.",
        zh: "当前生成请求较多，请稍后再试。",
        vi: "Hệ thống đang bận do nhiều yêu cầu. Vui lòng thử lại sau ít phút.",
        ja: "現在リクエストが集中しています。しばらくしてから再試行してください。",
        ko: "현재 생성 요청이 많습니다. 잠시 후 다시 시도해 주세요.",
        id: "Layanan generasi sedang sibuk. Silakan coba lagi sebentar lagi.",
      },
    },
    UPSTREAM_NETWORK_ERROR: {
      category: "network",
      retryable: true,
      general: {
        en: "Generation service connection failed temporarily. Credits have been refunded if charged. Please try again shortly.",
        zh: "生成服务暂时连接失败，本次如已扣积分会自动退回，请稍后重试。",
        vi: "Kết nối dịch vụ tạo tạm thời gián đoạn. Điểm đã trừ (nếu có) sẽ được hoàn lại tự động, vui lòng thử lại.",
        ja: "生成サービスへの接続が一時的に失敗しました。消費済みクレジットは自動返還されます。しばらくしてから再試行してください。",
        ko: "생성 서비스 연결에 일시적으로 실패했습니다. 차감된 크레딧은 자동 환불되니 잠시 후 다시 시도해 주세요.",
        id: "Koneksi layanan generasi gagal sementara. Kredit yang terpotong akan dikembalikan otomatis. Silakan coba lagi.",
      },
    },
    UPSTREAM_AUTH_ERROR: {
      category: "network",
      retryable: true,
      general: {
        en: "Generation service connection issue. Credits have been refunded if charged. Please try again shortly.",
        zh: "生成服务连接异常，本次如已扣积分会自动退回，请稍后重试。",
        vi: "Dịch vụ tạo gặp sự cố kết nối. Điểm đã trừ (nếu có) sẽ được hoàn lại tự động, vui lòng thử lại.",
        ja: "生成サービスで接続エラーが発生しました。消費済みクレジットは自動返還されます。しばらくしてから再試行してください。",
        ko: "생성 서비스 연결 오류가 발생했습니다. 차감된 크레딧은 자동 환불되니 잠시 후 다시 시도해 주세요.",
        id: "Terjadi gangguan koneksi layanan generasi. Kredit yang terpotong akan dikembalikan otomatis. Silakan coba lagi.",
      },
    },
    INSUFFICIENT_CREDITS: {
      category: "billing",
      general: {
        en: "Insufficient credits. Please top up or try again later.",
        zh: "生成额度不足，请充值或稍后再试。",
        vi: "Không đủ điểm. Vui lòng nạp thêm hoặc thử lại sau.",
        ja: "クレジットが不足しています。チャージしてから再試行してください。",
        ko: "크레딧이 부족합니다. 충전 후 다시 시도해 주세요.",
        id: "Kredit tidak mencukupi. Silakan isi ulang atau coba lagi nanti.",
      },
    },
    SUBTOKEN_QUOTA_UNAVAILABLE: {
      category: "billing",
      general: {
        en: "Sub-token quota is insufficient for this request.",
        zh: "当前子 Token 额度不足，无法发起本次生成。",
        vi: "Hạn mức sub-token không đủ cho yêu cầu này.",
        ja: "サブトークンの利用枠が不足しています。",
        ko: "서브 토큰 할당량이 부족합니다.",
        id: "Kuota sub-token tidak mencukupi untuk permintaan ini.",
      },
    },
    MODEL_PRICING_UNAVAILABLE: {
      category: "billing",
      general: {
        en: "Pricing for this model configuration is currently unavailable.",
        zh: "当前模型规格暂未配置价格，无法发起生成。",
        vi: "Cấu hình mô hình này hiện chưa có bảng giá.",
        ja: "このモデル構成の料金設定が現在利用できません。",
        ko: "현재 이 모델 구성의 요금 설정을 사용할 수 없습니다.",
        id: "Harga untuk konfigurasi model ini saat ini tidak tersedia.",
      },
    },
    LOGIN_REQUIRED: {
      category: "auth",
      general: {
        en: "Please log in to continue.",
        zh: "请先登录后再操作。",
        vi: "Vui lòng đăng nhập để tiếp tục.",
        ja: "続行するにはログインしてください。",
        ko: "계속하려면 로그인해 주세요.",
        id: "Silakan masuk untuk melanjutkan.",
      },
    },
    SESSION_REPLACED: {
      category: "auth",
      general: {
        en: "Your account was signed in elsewhere. Please log in again.",
        zh: "账号已在其他设备登录，请重新登录。",
        vi: "Tài khoản đã đăng nhập ở nơi khác. Vui lòng đăng nhập lại.",
        ja: "他の端末でログインされたためセッションが終了しました。再度ログインしてください。",
        ko: "다른 기기에서 로그인되어 세션이 종료되었습니다. 다시 로그인해 주세요.",
        id: "Akun Anda masuk di perangkat lain. Silakan masuk kembali.",
      },
    },
    ACCOUNT_QUARANTINED: {
      category: "auth",
      general: {
        en: "This account is currently restricted. Please contact support.",
        zh: "当前账号已被限制使用，请联系客服处理。",
        vi: "Tài khoản hiện đang bị hạn chế. Vui lòng liên hệ hỗ trợ.",
        ja: "このアカウントは現在制限されています。サポートへお問い合わせください。",
        ko: "현재 계정이 제한되어 있습니다. 고객센터에 문의해 주세요.",
        id: "Akun ini sedang dibatasi. Silakan hubungi dukungan.",
      },
    },
    MEMBERSHIP_REQUIRED: {
      category: "auth",
      general: {
        en: "An active membership is required for this feature.",
        zh: "该功能需要开通会员后使用。",
        vi: "Tính năng này yêu cầu gói hội viên đang hoạt động.",
        ja: "この機能を利用するには有効なメンバーシップが必要です。",
        ko: "이 기능을 사용하려면 활성 멤버십이 필요합니다.",
        id: "Fitur ini memerlukan keanggotaan aktif.",
      },
    },
    DATABASE_UNAVAILABLE: {
      category: "system",
      retryable: true,
      general: {
        en: "Service storage is temporarily unavailable. Please try again shortly.",
        zh: "服务暂时不可用，请稍后重试。",
        vi: "Dịch vụ lưu trữ tạm thời gián đoạn. Vui lòng thử lại sau.",
        ja: "サービスが一時的に利用できません。しばらくしてから再試行してください。",
        ko: "서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
        id: "Layanan sementara tidak tersedia. Silakan coba lagi sebentar lagi.",
      },
    },
    FIRST_FRAME_REQUIRED: {
      category: "media",
      general: {
        en: "First frame image is required.",
        zh: "请上传首帧图。",
        vi: "Cần có ảnh khung đầu.",
        ja: "開始フレーム画像が必要です。",
        ko: "첫 프레임 이미지가 필요합니다.",
        id: "Gambar frame awal diperlukan.",
      },
    },
    LAST_FRAME_REQUIRED: {
      category: "media",
      general: {
        en: "Last frame image is required.",
        zh: "请上传尾帧图。",
        vi: "Cần có ảnh khung cuối.",
        ja: "終了フレーム画像が必要です。",
        ko: "마지막 프레임 이미지가 필요합니다.",
        id: "Gambar frame akhir diperlukan.",
      },
    },
    AUDIO_REQUIRED: {
      category: "media",
      general: {
        en: "Reference audio is required.",
        zh: "请上传参考音频。",
        vi: "Cần có âm thanh tham chiếu.",
        ja: "参考音声が必要です。",
        ko: "참고 오디오가 필요합니다.",
        id: "Audio referensi diperlukan.",
      },
    },
    SOURCE_VIDEO_REQUIRED: {
      category: "media",
      general: {
        en: "A source video is required.",
        zh: "请上传参考视频。",
        vi: "Cần có video nguồn.",
        ja: "参照動画が必要です。",
        ko: "원본 영상이 필요합니다.",
        id: "Video sumber diperlukan.",
      },
    },
    IMAGE_REQUIRED: {
      category: "media",
      general: {
        en: "An image is required.",
        zh: "请上传参考图片。",
        vi: "Cần có hình ảnh.",
        ja: "画像が必要です。",
        ko: "이미지가 필요합니다.",
        id: "Gambar diperlukan.",
      },
    },
    REFERENCE_MEDIA_REQUIRED: {
      category: "media",
      general: {
        en: "Add at least one reference image, video, or audio.",
        zh: "请至少添加一个参考图片、视频或音频。",
        vi: "Vui lòng thêm ít nhất một ảnh, video hoặc âm thanh tham chiếu.",
        ja: "参考画像・動画・音声を少なくとも1つ追加してください。",
        ko: "참고 이미지, 영상 또는 오디오를 하나 이상 추가해 주세요.",
        id: "Tambahkan minimal satu gambar, video, atau audio referensi.",
      },
    },
    PROMPT_OR_MEDIA_REQUIRED: {
      category: "parameter",
      general: {
        en: "Please enter a prompt or add reference media.",
        zh: "请输入提示词或添加参考素材。",
        vi: "Vui lòng nhập prompt hoặc thêm tài nguyên tham chiếu.",
        ja: "プロンプトを入力するか参考素材を追加してください。",
        ko: "프롬프트를 입력하거나 참고 소재를 추가해 주세요.",
        id: "Silakan masukkan prompt atau tambahkan media referensi.",
      },
    },
    AUDIO_REQUIRES_VISUAL_MEDIA: {
      category: "media",
      general: {
        en: "Reference audio must be paired with at least one image or video reference.",
        zh: "参考音频必须搭配至少一张图片或一段视频素材。",
        vi: "Âm thanh tham chiếu phải đi kèm ít nhất một ảnh hoặc video.",
        ja: "参考音声は画像または動画素材を1つ以上併用する必要があります。",
        ko: "참고 오디오는 이미지 또는 영상 소재와 함께 사용해야 합니다.",
        id: "Audio referensi harus dipasangkan dengan minimal satu gambar atau video.",
      },
    },
    DOCUMENT_ALONE_ONLY: {
      category: "media",
      general: {
        en: "Document references cannot be combined with other media inputs.",
        zh: "参考文档不能与其他媒体素材同时使用。",
        vi: "Tài liệu tham chiếu không thể dùng chung với các tệp phương tiện khác.",
        ja: "ドキュメント参照は他のメディア素材と併用できません。",
        ko: "문서 참고 자료는 다른 미디어 입력과 함께 사용할 수 없습니다.",
        id: "Dokumen referensi tidak dapat digabungkan dengan input media lain.",
      },
    },
    VIDEO_PLUS_OUTPUT_DURATION_EXCEEDED: {
      category: "media",
      general: {
        en: "Input video duration plus output duration must not exceed {maxSec}s.",
        zh: "参考视频时长与生成时长之和不能超过 {maxSec} 秒。",
        vi: "Tổng thời lượng video đầu vào và đầu ra không được vượt quá {maxSec} giây.",
        ja: "入力動画と出力動画の合計時間は{maxSec}秒以内にしてください。",
        ko: "입력 영상 길이와 출력 길이의 합은 {maxSec}초를 초과할 수 없습니다.",
        id: "Total durasi video input dan output tidak boleh melebihi {maxSec} detik.",
      },
    },
    VIDEO_EDIT_SINGLE_SOURCE_REQUIRED: {
      category: "media",
      general: {
        en: "Video edit or extend requires exactly one source video.",
        zh: "视频编辑或续写需要且仅支持一段参考视频。",
        vi: "Chỉnh sửa hoặc mở rộng video yêu cầu đúng một video nguồn.",
        ja: "動画の編集・延長には参照動画が1本必要です。",
        ko: "영상 편집 또는 연장에는 원본 영상 1개가 필요합니다.",
        id: "Edit atau perpanjang video memerlukan tepat satu video sumber.",
      },
    },
    ADAPTIVE_RATIO_REQUIRED: {
      category: "parameter",
      general: {
        en: "This mode requires the adaptive aspect ratio.",
        zh: "当前模式需要选择自适应（adaptive）画面比例。",
        vi: "Chế độ này yêu cầu tỷ lệ khung hình adaptive.",
        ja: "このモードでは比率にadaptiveを選択する必要があります。",
        ko: "이 모드에서는 화면 비율을 adaptive로 선택해야 합니다.",
        id: "Mode ini memerlukan rasio aspek adaptive.",
      },
    },
    DRAFT_TASK_ID_REQUIRED: {
      category: "parameter",
      general: {
        en: "Draft to Final requires the upstream draft task ID.",
        zh: "草稿转成片需要提供上游草稿任务 ID。",
        vi: "Chế độ từ bản nháp sang bản hoàn chỉnh cần ID tác vụ nháp.",
        ja: "ドラフトから本生成するにはドラフトタスクIDが必要です。",
        ko: "초안에서 최종 생성하려면 초안 작업 ID가 필요합니다.",
        id: "Draft ke Final memerlukan ID tugas draft.",
      },
    },
    DRAFT_RESOLUTION_480P_REQUIRED: {
      category: "parameter",
      general: {
        en: "Draft generation requires 480P resolution.",
        zh: "草稿模式仅支持 480P 分辨率。",
        vi: "Tạo bản nháp yêu cầu độ phân giải 480P.",
        ja: "ドラフト生成は480P解像度のみ対応しています。",
        ko: "초안 생성은 480P 해상도만 지원합니다.",
        id: "Generasi draft memerlukan resolusi 480P.",
      },
    },
    Z_IMAGE_REFERENCE_UNSUPPORTED: {
      category: "parameter",
      general: {
        en: "Z-Image Spicy Pro only supports text-to-image. Switch to Qwen Image Edit Spicy for image editing.",
        zh: "Z-Image Spicy Pro 仅支持文生图；如需参考图编辑，请切换到 Qwen Image Edit Spicy。",
        vi: "Z-Image Spicy Pro chỉ hỗ trợ tạo ảnh từ văn bản. Hãy chọn Qwen Image Edit Spicy để chỉnh sửa ảnh.",
        ja: "Z-Image Spicy Proはテキストからの画像生成専用です。画像編集にはQwen Image Edit Spicyを選択してください。",
        ko: "Z-Image Spicy Pro는 텍스트 이미지 생성만 지원합니다. 이미지 편집은 Qwen Image Edit Spicy를 선택해 주세요.",
        id: "Z-Image Spicy Pro hanya mendukung teks-ke-gambar. Pilih Qwen Image Edit Spicy untuk mengedit gambar.",
      },
    },
    WAN27_IMAGE_4K_TEXT_ONLY: {
      category: "parameter",
      general: {
        en: "Wan 2.7 Image 4K is only available for text-to-image without reference images.",
        zh: "Wan 2.7 Image 4K 仅支持无参考图的文生图。",
        vi: "Wan 2.7 Image 4K chỉ khả dụng cho tạo ảnh không có ảnh tham chiếu.",
        ja: "Wan 2.7 Imageの4Kは参考画像なしのテキスト生成のみ対応しています。",
        ko: "Wan 2.7 Image 4K는 참고 이미지 없는 텍스트 생성에서만 사용할 수 있습니다.",
        id: "Wan 2.7 Image 4K hanya tersedia untuk teks-ke-gambar tanpa gambar referensi.",
      },
    },
    MEDIA_TARGET_INVALID: {
      category: "media",
      general: {
        en: "Choose a valid media target first.",
        zh: "请先选择有效的素材槽位。",
        vi: "Vui lòng chọn mục tài nguyên hợp lệ trước.",
        ja: "有効な素材スロットを先に選択してください。",
        ko: "먼저 유효한 소재 슬롯을 선택해 주세요.",
        id: "Silakan pilih target media yang valid terlebih dahulu.",
      },
    },
    MEDIA_WRONG_TYPE: {
      category: "media",
      general: {
        en: "This file type does not match the selected media target.",
        zh: "该文件类型与当前选择的素材槽位不匹配。",
        vi: "Loại tệp không khớp với mục tài nguyên đã chọn.",
        ja: "選択した素材スロットにファイル形式が一致しません。",
        ko: "선택한 소재 슬롯과 파일 유형이 일치하지 않습니다.",
        id: "Jenis file tidak cocok dengan target media yang dipilih.",
      },
    },
    MODEL_NOT_CONFIGURED: {
      category: "system",
      general: {
        en: "This model service is temporarily unavailable. Please try another model.",
        zh: "当前模型服务暂未就绪，请切换其他模型或稍后再试。",
        vi: "Dịch vụ mô hình này tạm thời không khả dụng. Vui lòng thử mô hình khác.",
        ja: "このモデルサービスは現在利用できません。他のモデルをお試しください。",
        ko: "이 모델 서비스는 현재 사용할 수 없습니다. 다른 모델을 선택해 주세요.",
        id: "Layanan model ini sementara tidak tersedia. Silakan coba model lain.",
      },
    },
        FORBIDDEN: {
      category: "auth",
      general: {
        en: "You do not have permission to perform this action.",
        zh: "您没有权限执行此操作。",
        vi: "Bạn không có quyền thực hiện thao tác này.",
        ja: "この操作を実行する権限がありません。",
        ko: "이 작업을 수행할 권한이 없습니다.",
        id: "Anda tidak memiliki izin untuk melakukan tindakan ini.",
      },
    },
    API_NOT_FOUND: {
      category: "system",
      general: {
        en: "The requested API endpoint was not found.",
        zh: "请求的接口不存在。",
        vi: "Không tìm thấy đường dẫn API được yêu cầu.",
        ja: "リクエストされたAPIエンドポイントが見つかりません。",
        ko: "요청한 API 경로를 찾을 수 없습니다.",
        id: "Endpoint API yang diminta tidak ditemukan.",
      },
    },
    INVALID_EMAIL: {
      category: "auth",
      general: {
        en: "Please enter a valid email address.",
        zh: "请输入有效的邮箱地址。",
        vi: "Vui lòng nhập địa chỉ email hợp lệ.",
        ja: "有効なメールアドレスを入力してください。",
        ko: "유효한 이메일 주소를 입력해 주세요.",
        id: "Silakan masukkan alamat email yang valid.",
      },
    },
    INVALID_VERIFICATION_CODE: {
      category: "auth",
      general: {
        en: "The verification code is invalid or expired.",
        zh: "验证码无效或已过期，请重新获取。",
        vi: "Mã xác minh không hợp lệ hoặc đã hết hạn.",
        ja: "認証コードが無効または期限切れです。",
        ko: "인증 코드가 잘못되었거나 만료되었습니다.",
        id: "Kode verifikasi tidak valid atau sudah kedaluwarsa.",
      },
    },
    EMAIL_IDENTITY_CONFLICT: {
      category: "auth",
      general: {
        en: "This email is already linked to another account. Please sign in with that account.",
        zh: "该邮箱已绑定其他账号，请直接使用原账号登录。",
        vi: "Email này đã được liên kết với tài khoản khác. Vui lòng đăng nhập bằng tài khoản đó.",
        ja: "このメールアドレスは別のアカウントに連携されています。そのアカウントでログインしてください。",
        ko: "이 이메일은 이미 다른 계정에 연결되어 있습니다. 해당 계정으로 로그인해 주세요.",
        id: "Email ini sudah terhubung dengan akun lain. Silakan masuk menggunakan akun tersebut.",
      },
    },
    INVALID_CREDENTIALS: {
      category: "auth",
      general: {
        en: "Invalid username or password.",
        zh: "账号或密码错误，请重试。",
        vi: "Tên đăng nhập hoặc mật khẩu không đúng.",
        ja: "ユーザー名またはパスワードが正しくありません。",
        ko: "아이디 또는 비밀번호가 올바르지 않습니다.",
        id: "Nama pengguna atau kata sandi salah.",
      },
    },
    PAYMENT_NOT_CONFIGURED: {
      category: "billing",
      general: {
        en: "This payment method is currently unavailable. Please choose another payment option.",
        zh: "当前支付方式暂未开放，请选择其他支付方式。",
        vi: "Phương thức thanh toán này hiện chưa khả dụng. Vui lòng chọn phương thức khác.",
        ja: "この支払い方法は現在利用できません。別の支払い方法を選択してください。",
        ko: "이 결제 수단은 현재 사용할 수 없습니다. 다른 결제 수단을 선택해 주세요.",
        id: "Metode pembayaran ini sedang tidak tersedia. Silakan pilih metode lain.",
      },
    },
    CHECKOUT_NOT_FOUND: {
      category: "billing",
      general: {
        en: "Payment checkout session was not found or has expired.",
        zh: "支付会话不存在或已过期，请重新发起支付。",
        vi: "Không tìm thấy phiên thanh toán hoặc phiên đã hết hạn.",
        ja: "決済セッションが見つからないか期限切れです。",
        ko: "결제 세션을 찾을 수 없거나 만료되었습니다.",
        id: "Sesi pembayaran tidak ditemukan atau telah kedaluwarsa.",
      },
    },
    ORDER_NOT_FOUND: {
      category: "billing",
      general: {
        en: "Payment order was not found.",
        zh: "支付订单不存在。",
        vi: "Không tìm thấy đơn hàng thanh toán.",
        ja: "決済注文が見つかりません。",
        ko: "결제 주문을 찾을 수 없습니다.",
        id: "Pesanan pembayaran tidak ditemukan.",
      },
    },
    PAYMENT_AMOUNT_INVALID: {
      category: "billing",
      general: {
        en: "The payment amount is outside the allowed range.",
        zh: "支付金额不在允许范围内，请重新确认金额。",
        vi: "Số tiền thanh toán nằm ngoài phạm vi cho phép.",
        ja: "支払い金額が許容範囲外です。",
        ko: "결제 금액이 허용 범위를 벗어났습니다.",
        id: "Jumlah pembayaran di luar batas yang diizinkan.",
      },
    },
    PROMO_CHECKOUT_BUSY: {
      category: "billing",
      retryable: true,
      general: {
        en: "A previous payment is still being processed. Please try again in a moment.",
        zh: "正在处理上一笔支付，请稍后再试。",
        vi: "Giao dịch trước đó đang được xử lý. Vui lòng thử lại sau giây lát.",
        ja: "前の決済を処理中です。しばらくしてから再試行してください。",
        ko: "이전 결제를 처리 중입니다. 잠시 후 다시 시도해 주세요.",
        id: "Pembayaran sebelumnya masih diproses. Silakan coba lagi sebentar lagi.",
      },
    },
    MEMBERSHIP_ALREADY_ACTIVE: {
      category: "billing",
      general: {
        en: "Your membership is already active.",
        zh: "您的会员当前已在生效中，无需重复开通。",
        vi: "Gói hội viên của bạn hiện đang hoạt động.",
        ja: "メンバーシップはすでに有効です。",
        ko: "멤버십이 이미 활성화되어 있습니다.",
        id: "Keanggotaan Anda sudah aktif.",
      },
    },
    INVALID_TRANSACTION_HASH: {
      category: "billing",
      general: {
        en: "Please enter a valid transaction hash.",
        zh: "请输入有效的交易哈希（TxHash）。",
        vi: "Vui lòng nhập mã giao dịch (TxHash) hợp lệ.",
        ja: "有効なトランザクションハッシュを入力してください。",
        ko: "유효한 트랜잭션 해시를 입력해 주세요.",
        id: "Silakan masukkan hash transaksi yang valid.",
      },
    },
    RESULT_LOCKED: {
      category: "billing",
      general: {
        en: "Please unlock this result first.",
        zh: "请先解锁该结果后再查看或下载。",
        vi: "Vui lòng mở khóa kết quả này trước.",
        ja: "先にこの結果をロック解除してください。",
        ko: "먼저 이 결과를 잠금 해제해 주세요.",
        id: "Silakan buka kunci hasil ini terlebih dahulu.",
      },
    },
    UNLOCK_GENERATING: {
      category: "system",
      retryable: true,
      general: {
        en: "The unlocked video is still generating. Please check back shortly.",
        zh: "解锁视频仍在生成中，请稍候查看。",
        vi: "Video mở khóa vẫn đang được tạo. Vui lòng quay lại sau giây lát.",
        ja: "アンロック動画は生成中です。しばらくしてからご確認ください。",
        ko: "잠금 해제 영상이 아직 생성 중입니다. 잠시 후 확인해 주세요.",
        id: "Video yang dibuka kuncinya masih dibuat. Silakan cek kembali sebentar lagi.",
      },
    },
    GENERATION_RECORD_NOT_FOUND: {
      category: "system",
      general: {
        en: "Generation record was not found.",
        zh: "未找到该生成记录。",
        vi: "Không tìm thấy bản ghi tạo.",
        ja: "生成履歴が見つかりません。",
        ko: "생성 기록을 찾을 수 없습니다.",
        id: "Catatan generasi tidak ditemukan.",
      },
    },
    RECORD_CANNOT_REGENERATE: {
      category: "parameter",
      general: {
        en: "This record cannot be regenerated yet.",
        zh: "该记录暂不支持重新生成。",
        vi: "Bản ghi này hiện chưa thể tạo lại.",
        ja: "この履歴はまだ再生成できません。",
        ko: "이 기록은 아직 다시 생성할 수 없습니다.",
        id: "Catatan ini belum dapat dibuat ulang.",
      },
    },
    RECORD_NO_VIDEO_RESULT: {
      category: "parameter",
      general: {
        en: "This record does not have a video result.",
        zh: "该记录没有可用的视频结果。",
        vi: "Bản ghi này không có kết quả video.",
        ja: "この履歴には動画結果がありません。",
        ko: "이 기록에는 영상 결과가 없습니다.",
        id: "Catatan ini tidak memiliki hasil video.",
      },
    },
    ASSET_NOT_FOUND: {
      category: "media",
      general: {
        en: "Asset was not found.",
        zh: "素材不存在或已被删除。",
        vi: "Không tìm thấy tài nguyên.",
        ja: "素材が見つかりません。",
        ko: "소재를 찾을 수 없습니다.",
        id: "Aset tidak ditemukan.",
      },
    },
        CHARACTER_NOT_FOUND: {
      category: "system",
      general: {
        en: "Character was not found or is unavailable.",
        zh: "角色不存在或暂不可用。",
        vi: "Không tìm thấy nhân vật hoặc nhân vật không khả dụng.",
        ja: "キャラクターが見つからないか利用できません。",
        ko: "캐릭터를 찾을 수 없거나 사용할 수 없습니다.",
        id: "Karakter tidak ditemukan atau tidak tersedia.",
      },
    },
    CHAT_NOT_FOUND: {
      category: "system",
      general: {
        en: "Conversation was not found.",
        zh: "会话不存在或已关闭。",
        vi: "Không tìm thấy cuộc trò chuyện hoặc đã đóng.",
        ja: "会話が見つからないか終了しています。",
        ko: "대화를 찾을 수 없거나 종료되었습니다.",
        id: "Percakapan tidak ditemukan atau telah ditutup.",
      },
    },
    CHAT_SESSION_ENDED: {
      category: "system",
      general: {
        en: "This chat session has already ended.",
        zh: "当前会话已经结束。",
        vi: "Phiên trò chuyện này đã kết thúc.",
        ja: "このチャットセッションはすでに終了しています。",
        ko: "이 채팅 세션은 이미 종료되었습니다.",
        id: "Sesi obrolan ini sudah berakhir.",
      },
    },
    CHAT_LIVE_DISABLED: {
      category: "system",
      general: {
        en: "Live chat is currently unavailable.",
        zh: "在线聊天暂未开放。",
        vi: "Trò chuyện trực tuyến hiện chưa mở.",
        ja: "ライブチャットは現在利用できません。",
        ko: "실시간 채팅은 현재 이용할 수 없습니다.",
        id: "Obrolan langsung saat ini belum tersedia.",
      },
    },
    CHAT_MESSAGE_REQUIRED: {
      category: "parameter",
      general: {
        en: "Message content cannot be empty.",
        zh: "消息内容不能为空。",
        vi: "Nội dung tin nhắn không được để trống.",
        ja: "メッセージ内容を入力してください。",
        ko: "메시지 내용은 비워 둘 수 없습니다.",
        id: "Isi pesan tidak boleh kosong.",
      },
    },
    GIFT_UNAVAILABLE: {
      category: "system",
      general: {
        en: "This gift is currently unavailable.",
        zh: "该礼物不存在或暂不可用。",
        vi: "Món quà này hiện không khả dụng.",
        ja: "このギフトは現在利用できません。",
        ko: "이 선물은 현재 사용할 수 없습니다.",
        id: "Hadiah ini sedang tidak tersedia.",
      },
    },
    GIFT_SEND_FAILED_REFUNDED: {
      category: "network",
      retryable: true,
      general: {
        en: "Gift delivery failed temporarily. Your credits have been refunded.",
        zh: "礼物暂时没有送出，积分已自动退回。",
        vi: "Gửi quà thất bại tạm thời. Điểm của bạn đã được hoàn lại.",
        ja: "ギフトの送信に失敗しました。クレジットは返還されました。",
        ko: "선물 전송에 일시적으로 실패했습니다. 크레딧은 환불되었습니다.",
        id: "Pengiriman hadiah gagal sementara. Kredit Anda telah dikembalikan.",
      },
    },
    SUPPORT_TICKET_NOT_FOUND: {
      category: "system",
      general: {
        en: "Support ticket was not found.",
        zh: "工单不存在。",
        vi: "Không tìm thấy phiếu hỗ trợ.",
        ja: "サポートチケットが見つかりません。",
        ko: "지원 티켓을 찾을 수 없습니다.",
        id: "Tiket dukungan tidak ditemukan.",
      },
    },
    SUPPORT_MESSAGE_REQUIRED: {
      category: "parameter",
      general: {
        en: "Please enter a support message.",
        zh: "请输入留言内容后再提交。",
        vi: "Vui lòng nhập nội dung hỗ trợ.",
        ja: "お問い合わせ内容を入力してください。",
        ko: "문의 내용을 입력해 주세요.",
        id: "Silakan masukkan pesan dukungan.",
      },
    },
    WORKFLOW_CANVAS_NOT_FOUND: {
      category: "system",
      general: {
        en: "Workflow canvas was not found.",
        zh: "未找到该画布项目。",
        vi: "Không tìm thấy dự án canvas.",
        ja: "ワークフローキャンバスが見つかりません。",
        ko: "워크플로우 캔버스를 찾을 수 없습니다.",
        id: "Kanvas alur kerja tidak ditemukan.",
      },
    },
    STORY_PROJECT_NOT_FOUND: {
      category: "system",
      general: {
        en: "Story project was not found.",
        zh: "剧集项目不存在。",
        vi: "Không tìm thấy dự án truyện.",
        ja: "ストーリープロジェクトが見つかりません。",
        ko: "스토리 프로젝트를 찾을 수 없습니다.",
        id: "Proyek cerita tidak ditemukan.",
      },
    },
    STORY_EPISODE_NOT_FOUND: {
      category: "system",
      general: {
        en: "Episode was not found.",
        zh: "分集不存在。",
        vi: "Không tìm thấy tập phim.",
        ja: "エピソードが見つかりません。",
        ko: "에피소드를 찾을 수 없습니다.",
        id: "Episode tidak ditemukan.",
      },
    },
    STORY_ASSET_NOT_FOUND: {
      category: "system",
      general: {
        en: "Story asset was not found.",
        zh: "剧集资产不存在。",
        vi: "Không tìm thấy tài nguyên truyện.",
        ja: "ストーリー素材が見つかりません。",
        ko: "스토리 자산을 찾을 수 없습니다.",
        id: "Aset cerita tidak ditemukan.",
      },
    },
    STORY_SHOT_NOT_FOUND: {
      category: "system",
      general: {
        en: "Shot was not found.",
        zh: "镜头不存在。",
        vi: "Không tìm thấy cảnh quay.",
        ja: "ショットが見つかりません。",
        ko: "샷을 찾을 수 없습니다.",
        id: "Adegan tidak ditemukan.",
      },
    },
    STORY_SOURCE_SCRIPT_REQUIRED: {
      category: "parameter",
      general: {
        en: "Please select a source script before creating an episode.",
        zh: "新增分集前请先选择所属剧本和录入段。",
        vi: "Vui lòng chọn kịch bản nguồn trước khi thêm tập.",
        ja: "エピソードを作成する前に元となる脚本を選択してください。",
        ko: "에피소드를 추가하기 전에 원본 대본을 먼저 선택해 주세요.",
        id: "Silakan pilih naskah sumber sebelum membuat episode.",
      },
    },
    SUBTOKEN_NOT_FOUND: {
      category: "system",
      general: {
        en: "API sub-token was not found.",
        zh: "未找到该子 Token。",
        vi: "Không tìm thấy sub-token API.",
        ja: "APIサブトークンが見つかりません。",
        ko: "API 서브 토큰을 찾을 수 없습니다.",
        id: "Sub-token API tidak ditemukan.",
      },
    },
    NOTIFICATION_NOT_FOUND: {
      category: "system",
      general: {
        en: "Notification was not found.",
        zh: "通知不存在。",
        vi: "Không tìm thấy thông báo.",
        ja: "通知が見つかりません。",
        ko: "알림을 찾을 수 없습니다.",
        id: "Notifikasi tidak ditemukan.",
      },
    },
    TEMPLATE_NOT_GENERATABLE: {
      category: "parameter",
      general: {
        en: "This item is a gallery shortcut and cannot be generated directly.",
        zh: "该条目为展示快捷入口，暂不支持直接发起生成。",
        vi: "Mục này là lối tắt trưng bày và không thể tạo trực tiếp.",
        ja: "この項目はギャラリーショートカットのため直接生成できません。",
        ko: "이 항목은 갤러리 바로가기로 직접 생성할 수 없습니다.",
        id: "Item ini adalah pintasan galeri dan tidak dapat dibuat langsung.",
      },
    },
    SCENE_NOT_FOUND: {
      category: "system",
      general: {
        en: "Scene was not found.",
        zh: "场景不存在。",
        vi: "Không tìm thấy cảnh.",
        ja: "シーンが見つかりません。",
        ko: "장면을 찾을 수 없습니다.",
        id: "Adegan tidak ditemukan.",
      },
    },
    USER_NOT_FOUND: {
      category: "system",
      general: {
        en: "User was not found.",
        zh: "用户不存在。",
        vi: "Không tìm thấy người dùng.",
        ja: "ユーザーが見つかりません。",
        ko: "사용자를 찾을 수 없습니다.",
        id: "Pengguna tidak ditemukan.",
      },
    },
    ADMIN_MINIMUM_REQUIRED: {
      category: "parameter",
      general: {
        en: "At least one administrator account must be retained.",
        zh: "至少需要保留一名管理员账号。",
        vi: "Phải giữ lại ít nhất một tài khoản quản trị viên.",
        ja: "少なくとも1人の管理者アカウントを残す必要があります。",
        ko: "최소 한 명의 관리자 계정은 유지해야 합니다.",
        id: "Minimal satu akun administrator harus dipertahankan.",
      },
    },
    COMMUNITY_CHARACTER_ADMIN_READONLY: {
      category: "parameter",
      general: {
        en: "User-created characters should be managed on the Create page.",
        zh: "用户创作角色请在「创作」页维护。",
        vi: "Nhân vật do người dùng tạo nên được quản lý ở trang Sáng tạo.",
        ja: "ユーザー作成キャラクターは「作成」ページで管理してください。",
        ko: "사용자 생성 캐릭터는 만들기 페이지에서 관리해 주세요.",
        id: "Karakter buatan pengguna dikelola di halaman Buat.",
      },
    },
    AUTH_LOCKED: {
      category: "auth",
      retryable: true,
      general: {
        en: "Too many failed sign-in attempts. Please try again later.",
        zh: "登录失败次数过多，请稍后再试。",
        vi: "Quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau.",
        ja: "ログイン失敗回数が上限に達しました。しばらくしてから再試行してください。",
        ko: "로그인 실패 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        id: "Terlalu banyak percobaan masuk yang gagal. Silakan coba lagi nanti.",
      },
    },
    ACTIVATION_CODE_INVALID: {
      category: "billing",
      general: {
        en: "Please enter a valid activation code.",
        zh: "请输入有效的激活码。",
        vi: "Vui lòng nhập mã kích hoạt hợp lệ.",
        ja: "有効なアクティベーションコードを入力してください。",
        ko: "유효한 활성화 코드를 입력해 주세요.",
        id: "Silakan masukkan kode aktivasi yang valid.",
      },
    },
    ACTIVATION_CODE_NOT_FOUND: {
      category: "billing",
      general: {
        en: "Activation code was not found or has already been used.",
        zh: "激活码不存在或已被使用。",
        vi: "Không tìm thấy mã kích hoạt hoặc mã đã được sử dụng.",
        ja: "アクティベーションコードが見つからないか使用済みです。",
        ko: "활성화 코드를 찾을 수 없거나 이미 사용되었습니다.",
        id: "Kode aktivasi tidak ditemukan atau sudah digunakan.",
      },
    },
    MEMBERSHIP_DISABLED: {
      category: "billing",
      general: {
        en: "Membership purchases are not currently available on this site.",
        zh: "当前站点暂未开放会员购买。",
        vi: "Tính năng mua hội viên hiện không khả dụng trên trang này.",
        ja: "このサイトでは現在メンバーシップ購入を利用できません。",
        ko: "이 사이트에서는 현재 멤버십 구매를 이용할 수 없습니다.",
        id: "Pembelian keanggotaan saat ini tidak tersedia di situs ini.",
      },
    },
    BILLING_PLAN_NOT_FOUND: {
      category: "billing",
      general: {
        en: "The selected subscription plan was not found.",
        zh: "未找到所选订阅套餐。",
        vi: "Không tìm thấy gói đăng ký đã chọn.",
        ja: "選択したプランが見つかりません。",
        ko: "선택한 구독 플랜을 찾을 수 없습니다.",
        id: "Paket langganan yang dipilih tidak ditemukan.",
      },
    },
    PAYPAL_CHECKOUT_REQUIRED: {
      category: "billing",
      general: {
        en: "Please start this payment from the secure checkout page.",
        zh: "请从安全结账页面发起此支付。",
        vi: "Vui lòng bắt đầu thanh toán từ trang thanh toán an toàn.",
        ja: "安全なチェックアウトページから支払いを開始してください。",
        ko: "보안 결제 페이지에서 결제를 시작해 주세요.",
        id: "Silakan mulai pembayaran ini dari halaman checkout aman.",
      },
    },
    MEDIA_LINK_EXPIRED: {
      category: "media",
      retryable: true,
      general: {
        en: "This media link has expired. Please refresh the page and try again.",
        zh: "媒体访问链接已过期，请刷新页面后重试。",
        vi: "Liên kết phương tiện đã hết hạn. Vui lòng tải lại trang và thử lại.",
        ja: "メディアリンクの有効期限が切れました。ページを更新して再試行してください。",
        ko: "미디어 링크가 만료되었습니다. 페이지를 새로고침한 후 다시 시도해 주세요.",
        id: "Tautan media telah kedaluwarsa. Silakan muat ulang halaman dan coba lagi.",
      },
    },
    DOCUMENT_WAN30_ONLY: {
      category: "media",
      general: {
        en: "Document assets are only supported for Wan 3.0.",
        zh: "文档类素材目前仅支持 Wan 3.0 模型。",
        vi: "Tài liệu chỉ được hỗ trợ cho mô hình Wan 3.0.",
        ja: "ドキュメント素材はWan 3.0モデルのみ対応しています。",
        ko: "문서 소재는 Wan 3.0 모델에서만 지원됩니다.",
        id: "Aset dokumen hanya didukung untuk model Wan 3.0.",
      },
    },
    WORKFLOW_CANVAS_LIMIT: {
      category: "parameter",
      general: {
        en: "You have reached the maximum number of saved workflows.",
        zh: "已达到可保存的画布数量上限，请删除不需要的画布后重试。",
        vi: "Bạn đã đạt đến số lượng canvas tối đa có thể lưu.",
        ja: "保存できるワークフローの上限に達しました。",
        ko: "저장 가능한 워크플로우 최대 개수에 도달했습니다.",
        id: "Anda telah mencapai batas maksimum kanvas yang dapat disimpan.",
      },
    },
    WORKFLOW_CANVAS_BUSY: {
      category: "system",
      retryable: true,
      general: {
        en: "A workflow save is already in progress. Please wait a moment.",
        zh: "画布正在保存中，请稍候再试。",
        vi: "Đang lưu canvas. Vui lòng đợi giây lát.",
        ja: "ワークフローを保存中です。しばらくお待ちください。",
        ko: "워크플로우 저장이 진행 중입니다. 잠시 후 다시 시도해 주세요.",
        id: "Penyimpanan kanvas sedang berlangsung. Silakan tunggu sebentar.",
      },
    },
    VOICE_REQUIRED: {
      category: "parameter",
      general: {
        en: "Please select a character voice.",
        zh: "请选择一个角色声音。",
        vi: "Vui lòng chọn giọng nói cho nhân vật.",
        ja: "キャラクターの音声を選択してください。",
        ko: "캐릭터 음성을 선택해 주세요.",
        id: "Silakan pilih suara karakter.",
      },
    },
    VOICE_UNAVAILABLE: {
      category: "parameter",
      general: {
        en: "The selected character voice is unavailable. Please choose another one.",
        zh: "该角色声音暂不可用，请重新选择。",
        vi: "Giọng nói đã chọn không khả dụng. Vui lòng chọn giọng khác.",
        ja: "選択した音声は利用できません。別の音声を選択してください。",
        ko: "선택한 음성을 사용할 수 없습니다. 다른 음성을 선택해 주세요.",
        id: "Suara yang dipilih tidak tersedia. Silakan pilih suara lain.",
      },
    },
    STORY_CONTENT_REQUIRED: {
      category: "parameter",
      general: {
        en: "Please enter the script or story text first.",
        zh: "请先输入剧本或小说文本。",
        vi: "Vui lòng nhập nội dung kịch bản hoặc truyện trước.",
        ja: "先に脚本または小説テキストを入力してください。",
        ko: "먼저 대본 또는 소설 텍스트를 입력해 주세요.",
        id: "Silakan masukkan teks naskah atau cerita terlebih dahulu.",
      },
    },
    STORY_OUTLINE_NOT_LOCKED: {
      category: "parameter",
      general: {
        en: "Please lock the episode outline before generating shots.",
        zh: "请先锁定本集大纲，再拆分镜头。",
        vi: "Vui lòng khóa dàn ý tập phim trước khi chia cảnh.",
        ja: "ショットを生成する前にエピソード構成をロックしてください。",
        ko: "샷을 생성하기 전에 에피소드 개요를 먼저 확정해 주세요.",
        id: "Silakan kunci kerangka episode sebelum membuat adegan.",
      },
    },
    METHOD_NOT_ALLOWED: {
      category: "system",
      general: {
        en: "This HTTP method is not allowed.",
        zh: "不支持当前请求方式。",
        vi: "Phương thức yêu cầu này không được phép.",
        ja: "このHTTPメソッドは許可されていません。",
        ko: "허용되지 않은 요청 방식입니다.",
        id: "Metode permintaan ini tidak diizinkan.",
      },
    },
    RESOURCE_NOT_FOUND: {
      category: "system",
      general: {
        en: "The requested resource was not found.",
        zh: "请求的资源不存在或已被删除。",
        vi: "Không tìm thấy tài nguyên được yêu cầu.",
        ja: "リクエストされたリソースが見つかりません。",
        ko: "요청한 리소스를 찾을 수 없습니다.",
        id: "Sumber daya yang diminta tidak ditemukan.",
      },
    },
    CONFLICT: {
      category: "parameter",
      general: {
        en: "The request could not be completed due to a state conflict. Please refresh and try again.",
        zh: "当前状态存在冲突，请刷新后重试。",
        vi: "Không thể hoàn tất do xung đột trạng thái. Vui lòng tải lại và thử lại.",
        ja: "状態の競合により処理できませんでした。更新してから再試行してください。",
        ko: "상태 충돌로 요청을 완료할 수 없습니다. 새로고침 후 다시 시도해 주세요.",
        id: "Permintaan tidak dapat diselesaikan karena konflik status. Silakan muat ulang dan coba lagi.",
      },
    },
    SERVICE_UNAVAILABLE: {
      category: "system",
      retryable: true,
      general: {
        en: "This service is temporarily unavailable. Please try again shortly.",
        zh: "服务暂时不可用，请稍后重试。",
        vi: "Dịch vụ tạm thời không khả dụng. Vui lòng thử lại sau ít phút.",
        ja: "サービスが一時的に利用できません。しばらくしてから再試行してください。",
        ko: "서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
        id: "Layanan sementara tidak tersedia. Silakan coba lagi sebentar lagi.",
      },
    },
    REQUEST_INVALID: {
      category: "parameter",
      general: {
        en: "The request parameters are invalid. Please check your input and try again.",
        zh: "请求参数有误，请检查输入后重试。",
        vi: "Tham số yêu cầu không hợp lệ. Vui lòng kiểm tra lại và thử lại.",
        ja: "リクエストパラメータが無効です。入力内容を確認して再試行してください。",
        ko: "요청 파라미터가 올바르지 않습니다. 입력을 확인한 후 다시 시도해 주세요.",
        id: "Parameter permintaan tidak valid. Silakan periksa input Anda lalu coba lagi.",
      },
    },
    SERVER_ERROR: {
      category: "system",
      retryable: true,
      general: {
        en: "Unexpected server error. Please try again later.",
        zh: "服务器处理异常，请稍后重试。",
        vi: "Lỗi máy chủ không mong muốn. Vui lòng thử lại sau.",
        ja: "サーバーエラーが発生しました。しばらくしてから再試行してください。",
        ko: "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
        id: "Terjadi kesalahan server. Silakan coba lagi nanti.",
      },
    },
    GENERATION_FAILED: {
      category: "unknown",
      retryable: true,
      general: {
        en: "Generation failed. Credits have been refunded if charged. Please adjust your prompt or reference media and try again, or contact support.",
        zh: "生成失败，本次如已扣积分会自动退回。请调整提示词或参考素材后重试，仍有问题请联系客服。",
        vi: "Tạo thất bại (điểm đã trừ sẽ được hoàn lại). Vui lòng điều chỉnh prompt hoặc tài nguyên tham chiếu rồi thử lại, hoặc liên hệ hỗ trợ.",
        ja: "生成に失敗しました（消費済みクレジットは自動返還されます）。プロンプトや参考素材を調整して再試行するか、サポートまでご連絡ください。",
        ko: "생성에 실패했습니다(차감된 크레딧은 자동 환불됩니다). 프롬프트나 참고 소재를 조정해 다시 시도하거나 고객센터에 문의해 주세요.",
        id: "Generasi gagal (kredit yang terpotong akan dikembalikan otomatis). Silakan ubah prompt atau media lalu coba lagi, atau hubungi dukungan.",
      },
    },
  };

    function buildSuffixVars(params = {}, lang = "en") {
    const resolvedLang = normalizeErrorLang(lang, "en");
    const isZh = resolvedLang === "zh";
    const isJa = resolvedLang === "ja";
    const vars = { ...params };
    const actual = String(params.actual || "").trim();
    if (actual) {
      vars.actualSuffix = isZh
        ? `（当前 ${actual}）`
        : isJa
          ? `（現在 ${actual}）`
          : ` (${actual})`;
    } else {
      vars.actualSuffix = "";
    }
    const minPx = Number(params.minPx || 0);
    const maxPx = Number(params.maxPx || 0);
    if (minPx > 0 && maxPx > 0) {
      vars.rangeSuffix = isZh
        ? `（要求 ${minPx}–${maxPx}px）`
        : isJa
          ? `（許容範囲 ${minPx}〜${maxPx}px）`
          : ` (allowed ${minPx}-${maxPx}px)`;
    } else {
      vars.rangeSuffix = "";
    }
    const minSec = Number(params.minSec || 0);
    const maxSec = Number(params.maxSec || 0);
    if (minSec > 0 && maxSec > 0) {
      vars.durationRangeSuffix = isZh
        ? `（要求 ${minSec}–${maxSec} 秒）`
        : isJa
          ? `（${minSec}〜${maxSec}秒）`
          : ` (${minSec}-${maxSec}s)`;
    } else if (maxSec > 0) {
      vars.durationRangeSuffix = isZh
        ? `（不超过 ${maxSec} 秒）`
        : isJa
          ? `（最大 ${maxSec}秒）`
          : ` (max ${maxSec}s)`;
    } else {
      vars.durationRangeSuffix = "";
    }
    const maxChars = Number(params.maxChars || 0);
    if (maxChars > 0) {
      vars.maxCharsSuffix = isZh
        ? `（最多 ${maxChars} 字符）`
        : isJa
          ? `（最大 ${maxChars}文字）`
          : ` (max ${maxChars} chars)`;
    } else {
      vars.maxCharsSuffix = "";
    }
    return vars;
  }

  function formatErrorInfo(errorInfo = null, lang = "en") {
    try {
      if (!errorInfo || typeof errorInfo !== "object") return "";
      const code = String(errorInfo.code || "").trim();
      const entry = ERROR_CATALOG[code];
      if (!entry) return "";
      const resolvedLang = normalizeErrorLang(lang, "en");
      const targetText = formatMediaTarget(errorInfo.target, resolvedLang);
      const templates = targetText && entry.withTarget ? entry.withTarget : entry.general;
      if (!templates) return "";
      const template = templates[resolvedLang] || templates.en || templates.zh || "";
      if (!template) return "";
      const vars = buildSuffixVars(errorInfo.params || {}, resolvedLang);
      vars.target = targetText;
      return interpolateTemplate(template, vars);
    } catch {
      return "";
    }
  }

  function catalogCategory(code = "") {
    return ERROR_CATALOG[String(code || "").trim()]?.category || "unknown";
  }

  function catalogRetryable(code = "") {
    return Boolean(ERROR_CATALOG[String(code || "").trim()]?.retryable);
  }

  function hasCatalogCode(code = "") {
    return Object.prototype.hasOwnProperty.call(ERROR_CATALOG, String(code || "").trim());
  }

  return Object.freeze({
    SUPPORTED_LANGS,
    ERROR_CATALOG,
    normalizeErrorLang,
    detectRequestLang,
    formatMediaTarget,
    formatErrorInfo,
    catalogCategory,
    catalogRetryable,
    hasCatalogCode,
  });
});
