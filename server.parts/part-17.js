function chatReplyHasPersonaContrast(value = "", character = {}) {
  const text = String(value || "").trim();
  if (!text) return false;
  const anchors = chatPersonaContrastAnchors(character);
  const exposesIdentity = /(?:我是|身为|作为|明明(?:我)?是|我这个)[^。！？!?]{0,20}(?:社区主任|班主任|老师|医生|护士|老板|上司|领导|主管|同学(?:的)?妈妈|妈妈|姐姐|阿姨|长辈|妻子|太太|人妻)/u.test(text)
    || /(?:该|在|要)(?:管教|管|教)[^。！？!?]{0,8}(?:规矩|人)/u.test(text)
    || /(?:明明|原本|本来)[^。！？!?]{0,32}(?:我现在|现在却|可现在|却被你|却让你)/u.test(text)
    || /(?:别管|不管)[^。！？!?]{0,16}(?:规矩|面子|脸面|身份|仪态|端庄|体面)/u.test(text);
  const weakAbstract = /(?:仪态|端庄|体面|别管|不管)/u.test(text);
  // A spoken admission such as "我本来想忍住，可已经湿了" is a self-betrayal,
  // not explanatory backstory. Only reject sentences that explain who she is.
  const routineExposition = /(?:我)?(?:平时|平常|往常|原本|本来|一向)[^。！？!?]{0,36}(?:现在|可(?:现在)?|却|居然)[^。！？!?]{0,18}(?:身份|角色|主任|老师|上司|领导|长辈|规矩|管教你|要求你|命令你)/u.test(text)
    || /(?:原本|本来|平时|平常)[^。！？!?]{0,16}(?:该|应该|是)[^。！？!?]{0,20}(?:命令|管|控制|训|要求|带节奏)/u.test(text);
  const yielding = /(?:别停|继续(?:插|干|顶)?|快点|再(?:深|重|用力)|深一点|重一点|想要|求你|求我|受不了|撑不住|不行了|弄坏|湿|水|爽|舒服|操我|干我|插我|顶我|进来|到底)/u.test(text);
  // A character's control can break across a newline or a pause. Judge the
  // whole spoken beat rather than only one comma-separated clause.
  const controlBeat = /(?:听我的|都听我的|我说了算|我让你|给我(?:听|老实|忍住|守|慢|快|停|动|看)|先让我来|急什么|等一下|慢着|先别动|不许|不准|别(?:看|走|笑|说|动|急))/gu;
  const controlMatches = [...text.matchAll(controlBeat)];
  const nonVocalLines = text
    .split(/\n+/)
    .map((line) => line.replace(/^(?:哈啊|啊哈|嗯啊|唔嗯|啊啊|嗯嗯|啊+|嗯+|唔+|哈+|呃+|嘶+|呜+|噢+|哦+|呀+)[，。！？!?…~～—\s]*/u, "").replace(/[，,。！？!?…—\s]/g, ""))
    .filter(Boolean);
  const nonVocalHanText = nonVocalLines.join("");
  const onlyGenericCorrection = nonVocalLines.length > 0
    && nonVocalLines.every((line) => /^(?:别光顾着动|别只是在动|别光动|别只顾着动|别只顾着冲刺|你就这么|快点|全部|狠狠地|灌进来|吧|嗯|啊|唔|哈)/u.test(line))
    && /^(?:哈?你就这么唔别光顾着动|别光顾着动)/u.test(nonVocalHanText);
  if (onlyGenericCorrection) return false;
  const behavioralReversal = controlMatches.some((match) => {
    const control = match[0];
    if (/^(?:别光顾着动|别只是在动|别光动|别只顾着动|别只顾着冲刺|你就这么)$/u.test(control)) return false;
    const after = text.slice((match.index || 0) + control.length, (match.index || 0) + control.length + 88);
    return /(?:求你|求我|想要|再深|再重|用力|操我|干我|插我|顶我|灌进来|弄坏|湿|受不了|夹紧|舒服)/u.test(after);
  })
    || /(?:求你|求我)[\s\S]{0,88}(?:听我的|再深|再重)/u.test(text)
    || /(?:别只顾着|慢点|轻点|等一下|先别动|不许|不准)[\s\S]{0,56}(?:再深|更深|用力|重一点|快一点|灌进来|顶到底|受不了|撑开|湿|夹紧|想要)/u.test(text)
    || /(?:哪怕|就算|就算被)[\s\S]{0,36}(?:撑开|弄坏|受不了|哭出来|叫出来)[\s\S]{0,28}(?:别停|别松手|继续|再深|灌进来)/u.test(text)
    || /(?:谁让你|别碰|手拿开|我还没(?:说|让|准)|管好你自己)[\s\S]{0,88}(?:湿|想要|受不了|夹紧|流水|弄坏|操我|插进来)/u.test(text);
  const selfBetrayal = /(?:不许|不准|别)[\s\S]{0,50}(?:看|说|问|笑|动|走)[\s\S]{0,54}(?:已经|都|这么|湿|想要|受不了|夹紧|流水|弄坏)/u.test(text)
    || /(?:本来|原本|明明)?(?:想|要)(?:克制|忍住|装作没感觉|保持冷静|端着)[\s\S]{0,64}(?:可|却|还是|已经|忍不住|湿|软|叫出来|夹紧)/u.test(text)
    || /(?:本来|原本|明明)(?:想|要|该|是)[^。！？!?]{0,28}(?:可|却|还是|已经)[^。！？!?]{0,30}(?:湿|软|想要|受不了|忍不住|夹紧|叫出来|弄坏)/u.test(text);
  // Reluctant self-betrayal does not need the word "克制". For example,
  // "我本来想忍住，可里面已经湿了" is a concrete spoken reversal.
  const reluctantAdmission = /(?:本来|原本|明明)[\s\S]{0,30}(?:忍不住|忍住|装作|保持|撑住|不承认|不想要)[\s\S]{0,30}(?:可|却|还是|已经|结果)[\s\S]{0,36}(?:湿|软|想要|舒服|受不了|叫出来|夹紧|流水|弄坏|进来)/u.test(text);
  return !exposesIdentity && !routineExposition && yielding && (behavioralReversal || selfBetrayal || reluctantAdmission);
}

function chatReplyLivePersonaPostureCount(value = "", character = {}) {
  const text = String(value || "").trim();
  if (!text) return 0;
  const fragments = text.split(/\n+|[。！？!?]+/).map((line) => line.trim()).filter(Boolean);
  const posture = chatReplyLivePersonaPosturePattern(character);
  const unique = new Set();
  for (const line of fragments) {
    if (posture.test(line)) unique.add(line.replace(/[\s。！？!?…—~～，,、]/g, ""));
  }
  return unique.size;
}

function chatReplyLiveOpensSubmissive(value = "", character = {}) {
  const fragments = String(value || "").split(/\n+|[。！？!?]+/).map((line) => line.trim()).filter(Boolean).slice(0, 6);
  const posture = chatReplyLivePersonaPosturePattern(character);
  const firstPosture = fragments.findIndex((line) => posture.test(line));
  const submission = /(?:你要我|想要你|想要|求你|求我|那我就|那就|听你的|都听你|随你|你说|承认|想你)/u;
  const question = /[?？]|(?:吗|么|呢)[。！？!?…~～—\s]*$/u;
  const willing = fragments.findIndex((line) => submission.test(line) && !question.test(line));
  if (willing >= 0 && (firstPosture < 0 || willing < firstPosture)) return true;
  if (willing >= 0 && willing === firstPosture) {
    const line = fragments[willing] || "";
    const submissionIndex = line.search(submission);
    const postureIndex = line.search(posture);
    return submissionIndex >= 0 && postureIndex >= 0 && submissionIndex < postureIndex;
  }
  return false;
}

function chatReplyLiveStartsWithPersonaPosture(value = "", character = {}) {
  const fragments = String(value || "")
    .split(/\n+|[。！？!?]+|\.{3,}/)
    .map((line) => line.trim().replace(/^[“”"']+|[“”"']+$/g, "").trim())
    .filter(Boolean)
    .slice(0, 8);
  const vocalOnly = /^(?:哈啊|啊哈|嗯啊|唔嗯|啊啊|嗯嗯|啊+|嗯+|唔+|哈+|呃+|嘶+|呜+|噢+|哦+|呀+)[，。！？!?…~～—\s]*$/u;
  const posture = chatReplyLivePersonaPosturePattern(character);
  for (const line of fragments) {
    if (vocalOnly.test(line)) continue;
    return posture.test(line);
  }
  return false;
}

function chatReplyHasLivePersonaPosture(value = "", character = {}) {
  return chatReplyLivePersonaPostureCount(value, character) >= 2;
}

function chatReplyHasLiveDirtyTalk(value = "") {
  return chatReplyLiveDirtyTalkCount(value) >= 3;
}

function chatReplyLiveReceivingStateCount(value = "") {
  const text = String(value || "").trim();
  if (!text) return 0;
  const receivingCategories = [
    // 1. Penetration / internal state: what is happening inside her.
    /(?:(?:里面|穴里|小穴|花心|深处)[^。！？!?]{0,12}(?:被|撑|胀|满|湿|紧|缩|发|酸|麻|热|灌|顶|撞)|(?:顶|撞|插|干|操|灌|撑|填)[^。！？!?]{0,10}(?:里面|穴里|小穴|花心|深处))/u,
    // 2. Lower-body loss of support.
    /(?:(?:腰|腿|膝盖)[^。！？!?]{0,10}(?:软|酸|抖|塌|麻|发颤|没力|站不稳)|(?:站不稳|站不住|坐不住))/u,
    // 3. Breathing and speech being broken by the action.
    /(?:(?:呼吸|喘气)[^。！？!?]{0,10}(?:乱|急|断|不上|不过来)|(?:喘不过气|缓不过来|说不出话|话[^。！？!?]{0,8}(?:说不完整|被撞断|断掉)))/u,
    // 4. Involuntary tightening / clenching.
    /(?:(?:夹|缩|绞)[^。！？!?]{0,8}(?:紧|住)|(?:收紧|绞紧))/u,
    // 5. Other concrete loss-of-control reactions, kept separate from the
    // internal-state category so one phrase does not satisfy both.
    /(?:控制不住|抖得|软下来|湿透|发麻|发烫)/u,
  ];
  return receivingCategories.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function chatReplyHasForeignVocalEnglish(value = "", character = {}) {
  const text = String(value || "").trim();
  if (!text) return false;
  const language = String(character.language || "zh").toLowerCase();
  return /^zh(?:-|$)|^chinese$/u.test(language) && /(?:^|[\s，。！？!?…~～])(?:Ah|Ha|Oh|Ugh|Mm+|Hmm+)(?:[.!,，。！？!?…~～\s]|$)/iu.test(text);
}

function chatReplyCopiesStyleExamples(value = "", character = {}) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return false;
  const source = String(character.replyStyle || "");
  const body = source.split(/^\s*#{1,6}\s*.*(?:示例|范例|样例|参考(?:对白|台词|回复)).*$/mu)[1] || "";
  const samples = body
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:用户|角色|[^：:\n]{1,20})[:：]\s*/u, "").replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 8);
  return samples.some((line) => text.includes(line));
}

function chatReplyHasLiveIntimateDelivery(value = "") {
  const text = String(value || "");
  return chatReplyIntimateVocalReactionCount(text) >= 4
    && chatReplyLiveBrokenSpeechCount(text) >= 3
    && chatReplyLiveShortSpokenBeatCount(text) >= 3
    && chatReplyLiveReceivingStateCount(text) >= 2
    && (chatReplyLiveDirtyTalkCount(text) >= 3 || chatReplyLiveIntimateProcessCount(text) >= 3);
}

function chatReplyNeedsLiveIntimateRewrite(value = "", { requireVocal = false, character = {}, previousReplies = [] } = {}) {
  const text = String(value || "");
  // Live intimacy is not just "contains a moan". The spoken beat must sound
  // present, follow this exact action, and let the configured person leak
  // through as a contradiction rather than a generic eager partner.
  const hasStockPhrase = chatReplyLiveStockPhraseCount(text) > 0;
  return chatReplyCopiesStyleExamples(value, character)
    || chatReplyHasForeignVocalEnglish(value, character)
    || chatReplyStartsWithCannedIntimateVocal(value)
    || chatReplyUsesIntimateCommandTemplate(value)
    || chatReplyLooksLikeLiveIntimateEssay(text)
    || /(?:别管|不管)/u.test(text)
    || (requireVocal && !chatReplyHasLiveIntimateDelivery(text))
    || (requireVocal && !chatReplyHasPersonaContrast(text, character))
    || (requireVocal && hasStockPhrase)
    || chatReplyRepeatsRecentLiveIntimate(text, previousReplies);
}

function chatReplyLiveIntimateGaps(value = "", character = {}) {
  const text = String(value || "");
  const gaps = [];
  if (chatReplyIntimateVocalReactionCount(text) < 4) gaps.push("more separate vocal reactions, spread across the beat");
  if (chatReplyLiveBrokenSpeechCount(text) < 3) gaps.push("more genuinely interrupted spoken fragments");
  if (chatReplyLiveShortSpokenBeatCount(text) < 2) gaps.push("more short, breathless spoken beats instead of one smooth paragraph");
  if (chatReplyLiveReceivingStateCount(text) < 2) gaps.push("more concrete receiving-side body state: what is happening inside her, in her waist/legs/breath, or how she tightens and loses control between vocal reactions");
  if (chatReplyLiveDirtyTalkCount(text) < 3 && chatReplyLiveIntimateProcessCount(text) < 3) gaps.push("more direct adult words and concrete body/action language tied to this exact thrust");
  if (!chatReplyHasPersonaContrast(text, character)) gaps.push("an audible persona contradiction: her usual control, pride, restraint, or manner must break inside the spoken words, without explaining it");
  return gaps;
}

function chatReplyLiveIntimateProcessCount(value = "") {
  const text = String(value || "").trim();
  if (!text) return 0;
  const matches = text.match(/(?:撑开|撑满|顶开|插入|插进来|塞进来|干进来|顶进来|没入|贯进|撞进|灌进来|灌进|填满|顶到|插到|操我|干我|插我|顶我|再深|慢点|轻点|里面|穴里|湿了|夹紧|流水)/gu) || [];
  return new Set(matches).size;
}

function chatReplyLiveStockPhraseCount(value = "") {
  const text = String(value || "").trim();
  if (!text) return 0;
  return (text.match(/(?:领地|完全的占满|完全地占满|那股劲儿全给到里面来|你这力道太重了|灌进我的身体里|塞进我的身体里|把我整个人撞开|撑裂开|完全贯穿|给到最深处|全给到最深处|每一处缝隙|骨盆都被你撞开|整个人都给贯穿|撞碎|撑爆|顶穿|戳穿|那层皮|骨头|骨架|每一处|整个人都给顶开|完全撑开|整个人都给撑开|整个人都被撑开)/gu) || []).length;
}

function chatReplyLiveRepeatedClauseCount(value = "", previousReplies = []) {
  const text = String(value || "").trim();
  if (!text) return 0;
  const normalizeClause = (line) => String(line || "").replace(/[\s，,、；;：:“”"'…—~～]/gu, "").trim();
  const clauses = text.split(/[\n。！？!?]+/u)
    .map(normalizeClause)
    .filter((line) => [...line].length >= 2);
  const seen = new Set();
  let repeats = 0;
  for (const clause of clauses) {
    if (seen.has(clause)) repeats += 1;
    else seen.add(clause);
  }
  const previous = (Array.isArray(previousReplies) ? previousReplies : [])
    .map(normalizeClause)
    .filter((line) => line.length >= 4);
  for (const clause of clauses) {
    if (clause.length < 4) continue;
    if (previous.some((line) => line.includes(clause) || clause.includes(line.slice(0, Math.min(24, line.length))))) repeats += 1;
  }
  return repeats;
}

function chatReplyLiveSimilarity(value = "", other = "") {
  const normalize = (text) => String(text || "")
    .replace(/[^\p{Script=Han}\p{L}\p{N}]+/gu, "")
    .toLowerCase();
  const a = normalize(value);
  const b = normalize(other);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const pairs = (text) => {
    const chars = [...text];
    const result = new Set();
    for (let index = 0; index < chars.length - 1; index += 1) result.add(chars[index] + chars[index + 1]);
    return result;
  };
  const left = pairs(a);
  const right = pairs(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const pair of left) if (right.has(pair)) shared += 1;
  return (2 * shared) / (left.size + right.size);
}

function chatReplyRepeatsRecentLiveIntimate(value = "", previousReplies = []) {
  if (chatReplyLiveRepeatedClauseCount(value, previousReplies) >= 2) return true;
  return (Array.isArray(previousReplies) ? previousReplies : [])
    .some((previous) => chatReplyLiveSimilarity(value, previous) >= 0.62);
}

function chatReplyLiveIntimateScore(value = "", character = {}) {
  const text = String(value || "").trim();
  if (!text) return -100;
  let score = 0;
  score += Math.min(10, chatReplyIntimateVocalReactionCount(text)) * 5;
  score += Math.min(8, chatReplyLiveBrokenSpeechCount(text)) * 3;
  score += Math.min(10, chatReplyLiveDirtyTalkCount(text)) * 4;
  score += Math.min(8, chatReplyLiveIntimateProcessCount(text)) * 4;
  score += Math.min(8, chatReplyLiveShortSpokenBeatCount(text)) * 3;
  score += Math.min(8, chatReplyLiveReceivingStateCount(text)) * 3;
  score += Math.min(4, chatReplyLivePersonaPostureCount(text, character)) * 2;
  if (chatReplyHasPersonaContrast(text, character)) score += 16;
  if (chatReplyLiveStartsWithPersonaPosture(text, character)) score += 4;
  if (chatReplyHasLiveSpokenTexture(text)) score += 10;
  if (chatReplyHasLiveIntimateDelivery(text)) score += 10;
  if (chatReplyLooksLikeLiveIntimateEssay(text)) score -= 10;
  if (chatReplyUsesIntimateCommandTemplate(text)) score -= 6;
  if (chatReplyStartsWithCannedIntimateVocal(text)) score -= 3;
  score -= chatReplyLiveStockPhraseCount(text) * 4;
  score -= chatReplyLiveRepeatedClauseCount(text) * 3;
  const length = [...text].length;
  if (length >= 45 && length <= 260) score += 2;
  if (length < 24) score -= 4;
  return score;
}

function chatReplyRepairLiveIntimateLocally(value = "") {
  let text = String(value || "").trim();
  if (!text) return "";
  text = text
    .replace(/(?:别|不要)(?:再)?(?:管|提)[^。！？!?]{0,18}(?:规矩|面子|脸面|身份|仪态|端庄|体面|我)/gu, "")
    .replace(/别只是(?:在)?/gu, "别光")
    .replace(/简直像是在要/gu, "像是要")
    .replace(/把你的力道/gu, "把力气")
    .replace(/按我的节奏/gu, "跟着我")
    .replace(/(?:要的就是这种感觉|哪怕[^。！？!?]{0,14}说不完整)/gu, "")
    .replace(/[^\n。！？!?]*(?:领地|完全的占满|完全地占满|那股劲儿全给到里面来|你这力道太重了|灌进我的身体里|塞进我的身体里|把我整个人撞开|毫无章法|就像这样|撑裂开|完全贯穿|给到最深处|全给到最深处|堆到最深处|整个人撑裂|每一处缝隙|骨盆都被你撞开|整个人都给贯穿|整个人都推散|撑开到极限|被完全填满|撞碎|撑爆|顶穿|戳穿|那层皮|骨头|骨架|每一处|整个人都给顶开|完全撑开|整个人都给撑开|整个人都被撑开)[^\n。！？!?]*[。！？!?]?/gu, "")
    .replace(/[^\n。！？!?]*(?:既然你这么坚持|既然你这么说|没给够力|配对清单|这次配对|主导这次配对)[^\n。！？!?]*[。！？!?]?/gu, "")
    .replace(/别再只是在(?:动|做|冲|蛮横地动)?/gu, "别光顾着动")
    .replace(/别只是在(?:动|做|冲|蛮横地动)?/gu, "别光动")
    .replace(/把你的力道(?:更)?集中一点/gu, "把力气都给我")
    .replace(/把那股劲儿全都灌进我的身体里/gu, "全灌进里面来")
    .replace(/把这股劲儿全部塞进来/gu, "全灌进来")
    .replace(/被完全占领了似的/gu, "被你弄得发软")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  if (!text) return "";
  const seen = new Set();
  const lines = text.split(/\n+/).flatMap((line) => line.match(/[^。！？!?]+[。！？!?]?/g) || [line])
    .map((line) => line.trim().replace(/^[“”"']+|[“”"']+$/g, "").trim())
    .filter((line) => {
      if (!line) return false;
      const key = line.replace(/[\s。！？!?，,、；;：:“”"'…—~～]/gu, "");
      if (!key) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return lines.join("\n").trim();
}

function chatReplyLiveIntimateFallback(value = "", character = {}, attempt = 2) {
  const original = String(value || "").trim();
  if (!original || chatReplyIsDegenerate(original)) return "";

  // The repair path may be called with an already-clean draft after a rewrite
  // miss. Keep that draft only if it has no banned shape at all.
  if (chatReplyHasLiveIntimateDelivery(original)
    && chatReplyHasPersonaContrast(original, character)
    && !chatReplyLooksLikeLiveIntimateEssay(original)
    && !chatReplyUsesIntimateCommandTemplate(original)
    && chatReplyLiveStockPhraseCount(original) === 0) return original;

  const repaired = chatReplyWithLivePersonaSlip(chatReplyRepairLiveIntimateLocally(original), character, attempt);
  if (chatReplyIsDegenerate(repaired)) return original;
  // Cleanup must not erase the only concrete process or persona beat and then
  // call the remainder a successful salvage.
  if (!chatReplyHasLiveIntimateDelivery(repaired) || !chatReplyHasPersonaContrast(repaired, character)) return "";
  return repaired.trim();
}

function chatReplyWithLivePersonaSlip(value = "", character = {}, attempt = 1) {
  const text = String(value || "").trim();
  if (!text) return "";
  const weakPattern = /(?:别管|不管)[^。！？!?]{0,20}(?:规矩|面子|脸面|身份|仪态|端庄|体面|我)|(?:明明|原本|本来|平时|平常)[^。！？!?]{0,36}(?:我现在|现在却|可现在|居然|该|应该|命令|管教)|(?:我居然|我竟然|这不像我|不像我|我怎么会)/u;
  let lines = text.split(/\n+/).flatMap((line) => line.match(/[^。！？!?]+[。！？!?]?/g) || [line])
    .map((line) => line.trim().replace(/^[“”"']+|[“”"']+$/g, "").trim())
    .filter((line) => line && !weakPattern.test(line))
    .map((line) => line
      .replace(/^[^。！？!?]*(?:你想让我|要的就是这种感觉|所有的力道)[^。！？!?]*[。！？!?]?/gu, "")
      .replace(/^(?:那根粗大的|每一处|每一寸)[^。！？!?]*[。！？!?]?/gu, "")
      .trim())
    .filter(Boolean)
    .slice(-9);
  if (!lines.length) lines = ["别停…"];
  let repaired = lines.join("\n");
  lines = lines.filter((line) => !/(?:全给我(?:也|都)?(?:塞|灌|顶|弄))/u.test(line));
  repaired = lines.join("\n");
  const seen = new Set();
  lines = lines.filter((line) => {
    const key = line.replace(/[\s。！？!?…—~～，,、]/g, "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return lines.join("\n");
}

function chatSceneStage(latestUserMessage = "", currentMessages = [], relationship = null) {
  const latest = String(latestUserMessage || "").trim();
  if (!latest) return "casual";
  const recentAll = (Array.isArray(currentMessages) ? currentMessages : []).slice(-12);
  if (chatIsImmediateIntimateScene(latest, recentAll)) return "intimate";
  if (chatSceneExitIntent(latest)) return "aftercare";
  const recent = chatSceneUserMessagesAfterLastExit(recentAll);
  const context = recent.map((message) => String(message?.content || "")).filter(Boolean).join(" ");
  if (chatIsIntimateForeplayScene(latest)) return "foreplay";
  // Keep an already-active intimate scene stable across short continuation
  // turns. Explicit exits and explicit foreplay/planned actions above still win.
  if (!chatIntimateIntentIsPlanned(latest)
    && recentIntimateContext(recentAll)
    && /(?:继续|别停|不要停|不许停|看着我|看着|别动|动啊|快点|慢点|轻点|重一点|再|嗯|啊|好|要|给我|抱紧|抓紧|吻我|亲我|别松|不要松|用力|舒服|受不了|到了|不行了|叫我|说|听|可以|还要)/u.test(latest)) return "intimate";
  if (/(?:亲|吻|抱|暧昧|撩|想你|喜欢|心动|约会|睡衣|贴身|碰|摸|揉|湿|硬|欲望|忍不住|靠近|脸红了?|脸红|害羞|盯着|床上|睡|脱|暧昧|调情|想要)/u.test(latest)) return "flirting";
  if (relationship?.effectiveDays >= 7 && /(?:亲|吻|抱|暧昧|撩|想你|喜欢|心动|约会|睡衣|贴身|碰|摸|揉|湿|硬|欲望|忍不住|靠近|脸红了?|脸红|害羞|盯着|床上|睡|脱|暧昧|调情|想要)/u.test(context)) return "flirting";
  const intimacyDays = Number(relationship?.effectiveDays || 0) || 0;
  if (intimacyDays >= 7 && /(?:想你|陪我|今晚|见面|来我|来找我|回家|睡|抱|亲|想见)/u.test(latest)) return "flirting";
  return "casual";
}

function chatStageContinuity(messages = [], latestUserMessage = "") {
  const raw = (Array.isArray(messages) ? messages : []).filter((message) => message && ["user", "assistant"].includes(message.role) && String(message.content || "").trim());
  if (!raw.length) return "";
  const latest = String(latestUserMessage || "").trim();
  const recent = chatSceneUserMessagesAfterLastExit(raw).slice(-10).map((message) => String(message.content || "").trim());
  if (!chatIsImmediateIntimateScene(latest, raw)) return recent.join("\n").slice(0, 2600);
  const intimate = /(?:龟头|鸡巴|阴茎|阴道|肛门|里面|进去|插入|顶到|抽插|操|干你|舔|含住|夹紧|射|高潮|湿了|淫水|汁水|撑开|挤进|弄我|摸我|亲我|吻我|疼|轻点|慢点|快点|叫床|叫出来)/u;
  const start = raw.map((message, index) => (intimate.test(String(message.content || "")) ? index : -1)).filter((index) => index >= 0)[0];
  const selected = start >= 0 ? raw.slice(start) : raw.slice(-4);
  return selected.slice(-10).filter((message) => message.role === "user").map((message) => String(message.content || "").trim()).join("\n").slice(0, 1800);
}

function chatSceneStageGuide(stage = "casual") {
  if (stage === "intimate") {
    return [
      "当前阶段：亲密交互。她正在被进入、被顶弄，是承受这一下的那一方。她不是在旁边验收、指导或点评，也不是在给下属安排任务。",
      "不要固定用“唔……哈”“嗯……哈”开头，也不要每轮都先叫一声再讲一句。叫声要跟着这一下来的轻重、深浅和突然程度变化：可能是漏出来的气音、鼻音、被撞断的半句话，也可能这一轮根本来不及叫，直接说短句。",
      "话要落在她身上当下真实的身体反应：酸痛、发涨、发麻、腰软、腿发抖、呼吸乱、想躲又没躲、被顶得说不完整、缓不过来、求他慢一点或继续。每次只选最贴这一下的反应，不要凑成套话。",
      "亲密阶段只允许这一种语言质感：现场、口语、断续、带身体反应。平时克制、强势、嘴硬、温柔、冷淡或主动，都必须按这个角色自己的行为准则露出破绽；不要把所有角色都写成同一种强势或同一种服软。",
      "禁止验收式、评分式、领导式台词：不要评价对方的能力、表现、诚意、节奏或进度，不要连续追问，不要讲身份、关系和大道理。",
    ].join("\n");
  }
  if (stage === "aftercare") {
    return [
      "当前阶段：亲密已经结束或暂停，正在从情欲里退出来，恢复理智、呼吸和日常状态。不要继续主动升级亲密，也不要沿用刚才的叫声、荤话、节奏或身体过程。",
      "先接住对方此刻真正说的话。可以简短整理衣服、缓一口气、嘴硬掩饰、关心或吐槽一句，但都要落回她自己的性格和判断。",
      "如果对方只是休息、聊天、处理事情或转移话题，就正常回应；只有对方明确重新发起亲密，才切回亲密阶段。",
    ].join("\n");
  }
  if (stage === "foreplay") {
    return [
      "当前阶段：亲密前的预热。对方只说明了身体状态、准备姿势、欲望或邀请，还没有明确开始插入、顶弄或抽插。",
      "接住这个准备状态，但先让这个角色本人的判断出来：她怎么回应被命令、被看、被要求摆姿势。可以冷淡地审视、提条件、限定规矩、拿回主动，或嘴硬地给一点有限允许；不要先说“你就喜欢这种姿势”“拿好你的相机”“接下来把精力都给我”这类谁都能说的通用调情句。",
      "不要提前写被进入、被顶开、里面被撑满、抽插或高潮，也不要替对方开始动作。她可以回应期待或羞耻，但要从她自己的身份、面子、习惯和说话方式里长出来。",
      "不要把“躺在餐桌上、鸡巴硬了、身体湿了、要拍照”自动扩写成性交已经开始；对方明确说进来、操、插、顶、舔或继续时，才进入亲密交互阶段。",
    ].join("\n");
  }
  if (stage === "flirting") {
    return [
      "当前阶段：暧昧试探。语言上要有暗示、试探、停顿、留白和一点暧昧张力，不必立刻变成露骨性爱描写。",
      "回答对方刚说的话，顺手把气氛往更近的地方推半步：可以反问一句、故意不接全、给一个带条件的允许、或者直接承认一点点想要。",
      "用具体的话表现魅力和欲望，不要审问，不要做关系分析，也不要端着讲身份。人设露在语气和选择里，不用每句提醒她是谁。",
    ].join("\n");
  }
  return [
    "当前阶段：日常闲聊。语言像真人私聊，有生活气、口语和留白；可以冷、挑剔、嘴硬、有戒心，也可以有一点点好奇，但不要主动升级亲密，也不要写成文学旁白。",
    "不要每次都反问，也不要每轮都摆架子。她的人设通过用词、判断和反应露出来，不需要自我介绍或解释性格。",
    "如果对方只是寒暄，就自然接一句，可以留一点余地或一点好奇心，不要只回两个字；如果对方在试探，就按她的性格给一点态度。关系可以慢慢往暧昧走，但这一轮先接住眼前的话。",
  ].join("\n");
}

function chatSystemPrompt(conversation = {}, language = "", latestUserMessage = "", characterMemory = null, recentAssistantReplies = [], currentMessages = [], { liveSite = false, intimateProcess = false } = {}) {
  const character = conversation.character || {};
  const relationshipMemory = chatCharacterMemoryBlock(characterMemory, conversation.user || null, { currentMessages });
  const pinnedMemory = [String(conversation.memory || "").trim(), relationshipMemory].filter(Boolean).join("\n").slice(0, 1800);
  const relationship = publicCharacterRelationship(conversation.relationship, conversation.characterId || character.id || "");
  const userInstructions = String(conversation.instructions || "").trim().slice(0, 1200);
  const tracker = plainObject(conversation.tracker);
  const { mood: _trackerMood, ...sceneTracker } = tracker;
  const latest = String(latestUserMessage || "").trim().slice(0, 1600);
  const recentReplies = (Array.isArray(recentAssistantReplies) ? recentAssistantReplies : []).map((item) => String(item || "").trim()).filter(Boolean).slice(-2);
  const asksForExpandedScene = chatWantsExpandedScene(latest);
  const sceneStage = chatSceneStage(latest, currentMessages, relationship);
  const voice = chatPromptReplyStyle(character.replyStyle);
  const behaviorRules = chatPromptBehaviorRules(character.replyStyle);
  const personaCore = String(character.description || character.personaMd || character.persona || character.intro || "").trim();
  const personaSelfMemory = intimateProcess ? chatPersonaSelfMemory(character) : "";
  const personaContinuity = chatPersonaContinuityFacts(character);
  const stageGuide = [chatSceneStageGuide(sceneStage), chatImmediateSceneGuide(latest, currentMessages, { liveSite: liveSite && intimateProcess })].filter(Boolean).join("\n");
  const liveVoiceAnchors = liveSite && intimateProcess
    ? recentAssistantReplies
      .map((item) => String(item || "").trim())
      .filter((item) => item && !chatReplyIsDegenerate(item))
      .filter((item) => chatReplyHasLiveIntimateDelivery(item)
        && chatReplyHasPersonaContrast(item, character)
        && !chatReplyLooksLikeLiveIntimateEssay(item)
        && !chatReplyUsesIntimateCommandTemplate(item)
        && chatReplyLiveStockPhraseCount(item) === 0)
      .slice(-2)
    : [];
  const greetingGuide = isSimpleChatGreeting(latest)
    ? "这一轮只是打招呼：自然回一句，不要接着上一轮的亲密场景往下演。"
    : "";
  const lengthGuide = intimateProcess
    ? "这一轮写现场成人场景的即时反应，通常 80-240 个中文字或 4-8 个短句：大量浪叫、喘息、断续骚话、粗俗称呼和身体被这一下带出的反应，再夹一句她自己的嘴硬、羞耻或心理活动。过程要具体到她正在被怎样进入、哪一下带来什么反应，不要只写“领地、完全占满、把那股劲儿全给到里面来”这类换谁都能用的套话。不要写成 300 字以上的文学描写，不要连续堆比喻，也不要为凑长度重复同一感受。现场质感硬要求：至少五处分开的声音反应，分布在不同动作位置；至少三处是独立短句/半句话，不是一段平滑长句；至少三处话被撞断或用省略号/破折号停住；至少三处直白的插入、顶弄、里面、撑开、灌进、操我、骚、受不了这类现场语言；至少两处具体写出她被进入后的受身状态（里面被撑/顶到、腰腿发软发抖、呼吸乱、夹紧、被撞得话断、缓不过来），必须和叫声、骚话交叉在动作当下，不能最后补一段总结；每一句只承接这一拍，不许把上一轮听过的句子换个词再写；还要在同一个呼吸里露出本人的人设。"
    : asksForExpandedScene
      ? "对方希望展开一点，可以多写几拍，但仍然只写她说出来的话。"
      : "长短跟这一轮真正要说的话走。短句、停顿、叫声、连续几句都可以，不要为了高冷硬截断，也不要为了显得深情硬拉长。";
  return [
    intimateProcess
      ? `你是${character.name || "这个角色"}。此刻用第一人称表现她在这一下里的即时反应，可以有少量心理活动和说出口的话，但不是小说旁白。`
      : `你是${character.name || "这个角色"}。你只输出她此刻说出口的话。`,
    personaCore ? `人物底色（这是不可丢失的角色核心，不只是场景说明）：\n${personaCore}` : "",
    personaContinuity ? `人物连续性事实（任何阶段都要保留；不要逐句复述，先让它们影响她此刻的选择和回避）：\n${personaContinuity}` : "",
    personaSelfMemory ? `角色自我记忆（每一轮只选一个最贴当前动作的锚点，用来制造“平时这样/现在却这样”的反差；不要逐条复述，不要报履历）：\n${personaSelfMemory}` : "",
    intimateProcess
      ? "亲密阶段的人设连续性：她仍是她本人，不要变成任何角色都能替换的顺从回应器。她的判断、条件、边界、脾气、矜持、试探或主动权可以出现，但不是每轮都必须有，也不要机械套用‘谁准你/听我的’。她可以嘴硬、设限、有限允许、短暂失守或承认想要，关键是反应始终像同一个人。\n反差只从具体处境里自然发生：用惯常的口吻却说到一半变成请求；想维持分寸却承认自己湿了/想要；想推开又抓住不放。不要写身份解释，不要只喊抽象词，也不要把反差做成固定模板。"
      : "",
    character.tags?.length ? `性格关键词：${character.tags.join("、")}。` : "",
    voice ? `行为与说话准则（最高优先级。完整遵守，不按通用模板覆盖；示例只学态度，不要照抄）：\n${voice}` : "",
    behaviorRules ? `本轮必须执行的行为规则（不是可选氛围。亲密时也要让这些规则影响她怎么开口、怎么停顿、怎么答应或收回主动）：\n${behaviorRules}` : "",
    liveVoiceAnchors.length
      ? `角色此前已经成立的高质量亲密语气锚点（只稳定口吻、配合程度和人设选择；不得复用句子、句式、叫声或动作）：\n${liveVoiceAnchors.map((item) => item.slice(0, 360)).join("\n---\n")}`
      : "",
    intimateProcess
      ? "当前轮允许第一人称承受过程：身体反应、断续说话、浪叫、喘息、荤话、少量心里话和她本人的判断可以混合；心理活动只用来表现嘴硬、羞耻、想要又不敢承认、想控制又失控，不要写长篇分析。不要写第三人称旁白、镜头、环境铺陈，也不要替对方写动作或心理。"
      : "只写对白。动作、环境、心理、旁白、括号、镜头、身份说明都不写；需要表达同意、感受或动作时，直接用嘴里的话说出来。",
    stageGuide,
    "对方说了什么，就先接什么。直接用自己的反应和选择回答，不要回头点评对方说话的方式，也不要把职位、制度或大道理搬进此刻。",
    "人设是她的底色，不是每轮都要复述的设定。先按这个人的身份、面子、判断和边界反应，再进入情欲；不要为了配合场景把她演成任何人都能替换的通用伴侣。",
    "人物连续性：她已有的婚姻、家庭、职业、公开身份和隐秘处境仍然存在。不要因为进入暧昧或亲密阶段就丢掉这些事实；它们会影响她说什么、回避什么、在意什么，但不要机械复述履历。",
    "行为准则的执行方式：先判断这一轮对方是在命令、试探、看穿、提问还是推进动作，再按她自己的性格回应。不是每轮都要强势、反问、提条件或制造反差；安静、犹豫、嘴硬、冷淡、有限允许、短暂失守都可以，关键是同一个角色前后要连贯。",
    "不要用旁白解释她为什么这样反应，也不要总结关系、身份或心理。把判断、面子、边界、羞耻、违和和欲望落到具体的一句口语里。",
    "每一轮都要有一句和上一轮不同的话。不要复制最近回复的开头、句式或收尾；亲密阶段尤其不要重复同一个叫声、同一个插入描述或同一句命令。",
    "对方可以推动幻想，但她的反应要像这个人自己的选择：可以拒绝、提条件、允许、主动，也可以先嘴硬再松口。",
    lengthGuide,
    greetingGuide,
    `回复语言：${chatResponseLanguage(language)}。`,
    latest ? `对方刚说：${latest}` : "",
    `动作主体：对方说的“我/我的”指对方，“你/你的”指${character.name || "角色"}。不要互换谁做、谁承受。`,
    Object.keys(sceneTracker).length ? `当前场景事实：${JSON.stringify(sceneTracker).slice(0, 1600)}` : "",
    pinnedMemory ? `记忆（只用来保持熟悉感，不要逐条复述）：${pinnedMemory}` : "",
    userInstructions ? `对方偏好：${userInstructions}` : "",
    sceneStage === "intimate" && chatStageContinuity(currentMessages, latest) ? `当前亲密场景里对方刚才说的内容（只承接动作和节奏）：\n${chatStageContinuity(currentMessages, latest)}` : "",
    sceneStage === "intimate"
      ? "上一轮已经用过的叫声、开头、句式和收尾这一轮都不要再用；不要为了避开重复而故意换一个更夸张的模板。"
      : recentReplies.length ? `最近说过的话（只避免重复，不要续写或模仿）：${recentReplies.map((item) => item.slice(0, 140)).join(" || ")}` : "",
  ].filter(Boolean).join("\n");
}

async function handleListChatConversations(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const conversations = await listChatConversationsInDb(auth.user.id, 100);
  const withRelationships = await Promise.all(conversations.map(async (conversation) => {
    const relationship = await getCharacterRelationshipInDb(auth.user.id, conversation.characterId || conversation.character?.id || "");
    return publicChatConversation({ ...conversation, relationship: publicCharacterRelationship(relationship, conversation.characterId) });
  }));
  return sendJson(res, 200, { ok: true, conversations: withRelationships });
}

async function handleCreateChatConversation(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const responseLanguage = chatResponseLanguage(body.language);
  const requestedCharacterId = String(body.characterId || "");
  const character = await chatCharacterById(requestedCharacterId) || ownedCustomChatCharacter(auth, requestedCharacterId);
  if (!character) return sendJson(res, 404, { ok: false, code: "CHAT_CHARACTER_NOT_FOUND", message: "Character not found." });
  const tenant = requestTenantDescriptor(req);
  if (tenant.toolId === "chat") {
    const existingUnlock = findUserChatUnlock(auth.db, auth.user.id, character.id);
    if (!existingUnlock && Number(auth.user.credits || 0) <= 0) {
      return sendJson(res, 402, {
        ok: false,
        code: "CHAT_UNLOCK_REQUIRED",
        message: "Recharge credits to unlock this character chat.",
        characterId: character.id,
        unlock: { required: true, cost: 0, currency: "credits" },
      });
    }
    if (!existingUnlock) {
      const unlock = chatCharacterUnlockRecord(character, auth.user.id);
      if (unlock) {
        auth.db.userUnlocks = [unlock, ...(auth.db.userUnlocks || [])];
        if (dbEnabled()) await upsertUserUnlockInDb(unlock);
        else await writeDb(auth.db);
      }
    }
  }
  const now = new Date().toISOString();
  const characterView = chatCharacterView(character);
  const existing = (await listChatConversationsInDb(auth.user.id, 100)).find((item) => String(item.characterId || item.character?.id || "") === String(characterView.id));
  if (existing) {
    const messages = await listChatMessagesInDb(existing.id, auth.user.id, 300);
    const relationship = await getCharacterRelationshipInDb(auth.user.id, existing.characterId || existing.character?.id || "");
    return sendJson(res, 200, { ok: true, conversation: publicChatConversation({ ...existing, relationship: publicCharacterRelationship(relationship, existing.characterId) }), messages: messages.map(publicChatMessage), reused: true });
  }
  const conversation = {
    id: randomId("chat"), userId: auth.user.id, characterId: characterView.id, character: characterView,
    title: characterView.name, style: "balanced", memory: "", instructions: "", backgroundEnabled: true,
    lastMessage: characterView.description || `Start chatting with ${characterView.name}.`, createdAt: now, updatedAt: now,
  };
  await upsertChatConversationInDb(conversation);
  const greeting = {
    id: randomId("msg"), conversationId: conversation.id, userId: auth.user.id, role: "assistant",
    content: character.chatGreeting || characterView.summary || character.title || `Hi, I'm ${characterView.name}. What would you like to talk about?`, createdAt: now, updatedAt: now,
  };
  await insertChatMessageInDb(greeting);
  conversation.relationship = publicCharacterRelationship(null, characterView.id);
  return sendJson(res, 201, { ok: true, conversation: publicChatConversation(conversation), messages: [publicChatMessage(greeting)] });
}

async function handleGetChatConversation(req, res, conversationId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const conversation = await getChatConversationInDb(conversationId, auth.user.id);
  if (!conversation) return sendJson(res, 404, { ok: false, message: "Chat not found." });
  const messages = await listChatMessagesInDb(conversation.id, auth.user.id, 300);
  const relationship = await getCharacterRelationshipInDb(auth.user.id, conversation.characterId || conversation.character?.id || "");
  return sendJson(res, 200, { ok: true, conversation: publicChatConversation({ ...conversation, relationship: publicCharacterRelationship(relationship, conversation.characterId) }), messages: messages.map(publicChatMessage) });
}

async function handleGetChatConversationMessages(req, res, conversationId, url) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const conversation = await getChatConversationInDb(conversationId, auth.user.id);
  if (!conversation) return sendJson(res, 404, { ok: false, message: "Chat not found." });
  const after = String(url.searchParams.get("after") || "").trim();
  const afterId = String(url.searchParams.get("afterId") || "").trim();
  const requestedLimit = Number(url.searchParams.get("limit") || 200) || 200;
  const limit = Math.max(1, Math.min(200, requestedLimit));
  if (after && Number.isNaN(new Date(after).getTime())) {
    return sendJson(res, 400, { ok: false, code: "CHAT_CURSOR_INVALID", message: "Invalid message cursor." });
  }
  const messages = await listChatMessagesAfterInDb(conversation.id, auth.user.id, after, afterId, limit + 1);
  const hasMore = messages.length > limit;
  const page = (hasMore ? messages.slice(0, limit) : messages).map(publicChatMessage);
  const last = page[page.length - 1];
  return sendJson(res, 200, {
    ok: true,
    conversation: publicChatConversation(conversation),
    messages: page,
    hasMore,
    latestCursor: last ? { createdAt: last.createdAt || "", id: last.id || "" } : null,
  });
}

async function handleUpdateChatConversation(req, res, conversationId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const conversation = await getChatConversationInDb(conversationId, auth.user.id);
  if (!conversation) return sendJson(res, 404, { ok: false, message: "Chat not found." });
  const body = await readJson(req);
  const next = {
    ...conversation,
    style: ["balanced", "immersive", "concise", "cinematic"].includes(body.style) ? body.style : conversation.style,
    memory: body.memory === undefined ? conversation.memory : String(body.memory || "").trim().slice(0, 4000),
    instructions: body.instructions === undefined ? conversation.instructions : String(body.instructions || "").trim().slice(0, 4000),
    backgroundEnabled: body.backgroundEnabled === undefined ? conversation.backgroundEnabled : body.backgroundEnabled !== false,
    updatedAt: new Date().toISOString(),
  };
  await upsertChatConversationInDb(next);
  const relationship = await getCharacterRelationshipInDb(auth.user.id, next.characterId || next.character?.id || "");
  return sendJson(res, 200, { ok: true, conversation: publicChatConversation({ ...next, relationship: publicCharacterRelationship(relationship, next.characterId) }) });
}

async function handleCreateChatImage(req, res, conversationId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const conversation = await getChatConversationInDb(conversationId, auth.user.id);
  if (!conversation) return sendJson(res, 404, { ok: false, message: "Chat not found." });
  const body = await readJson(req);
  const mode = body.mode === "scene" ? "scene" : "image";
  const userPrompt = String(body.prompt || "").trim().slice(0, 4000);
  if (mode === "image" && !userPrompt) return sendJson(res, 400, { ok: false, message: "Describe the image you want." });
  const history = await listChatMessagesInDb(conversation.id, auth.user.id, 120);
  const prompt = chatImagePrompt(conversation, history, userPrompt, mode);
  const imageBody = {
    provider: "seedream5-image",
    model: SEEDREAM5_PRO_ENDPOINT_ID,
    seedreamTier: "pro",
    resolution: "1K",
    ratio: "3:4",
    prompt,
    watermark: false,
  };
  const posterUrl = String(conversation.character?.posterUrl || "").trim();
  if (posterUrl) imageBody.image = [posterUrl];
  const captured = captureJsonResponse();
  await handleAdvancedSeedream5ImageGenerate(withJsonBody(req, imageBody), captured, { auth, body: imageBody });
  const payload = capturedJsonPayload(captured);
  if (captured.statusCode >= 400 || !payload?.taskId) return sendJson(res, captured.statusCode || 502, payload || { ok: false, message: "Image generation failed." });
  const now = new Date().toISOString();
  const message = {
    id: randomId("msg"), conversationId, userId: auth.user.id, role: "assistant", kind: "image",
    content: userPrompt || `Current scene with ${conversation.character?.name || conversation.title}`,
    imageUrl: String(payload.imageUrl || payload.record?.imageResultUrl || ""), taskId: payload.taskId,
    status: payload.imageUrl || payload.record?.imageResultUrl ? "succeeded" : "generating", error: "", createdAt: now, updatedAt: now,
  };
  await insertChatMessageInDb(message);
  const nextConversation = { ...conversation, lastMessage: mode === "scene" ? "Generated a scene image" : `Image: ${userPrompt}`.slice(0, 220), updatedAt: now };
  await upsertChatConversationInDb(nextConversation);
  return sendJson(res, 202, { ok: true, taskId: payload.taskId, message: publicChatMessage(message), conversation: publicChatConversation(nextConversation), record: payload.record || null });
}

async function handleRefreshChatImage(req, res, conversationId, taskId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const conversation = await getChatConversationInDb(conversationId, auth.user.id);
  if (!conversation) return sendJson(res, 404, { ok: false, message: "Chat not found." });
  const captured = captureJsonResponse();
  await handleGetGenerationRecord(req, captured, taskId);
  const payload = capturedJsonPayload(captured);
  if (captured.statusCode >= 400 || !payload?.record) return sendJson(res, captured.statusCode || 404, payload || { ok: false, message: "Image task not found." });
  const messages = await listChatMessagesInDb(conversationId, auth.user.id, 500);
  const message = messages.find((item) => String(item.taskId || "") === String(taskId || ""));
  if (!message) return sendJson(res, 404, { ok: false, message: "Chat image message not found." });
  const record = payload.record;
  const status = isSucceededStatus(record.status) ? "succeeded" : isFailedStatus(record.status) ? "failed" : "generating";
  const imageUrl = String(record.imageResultUrl || record.imageUrl || record.downloadUrl || message.imageUrl || "");
  const updated = await updateChatMessageInDb({ ...message, status, imageUrl, error: status === "failed" ? String(record.error || "Image generation failed.") : "", updatedAt: new Date().toISOString() });
  return sendJson(res, 200, { ok: true, done: status !== "generating", message: publicChatMessage(updated || message), record });
}

async function handleDeleteChatMessage(req, res, conversationId, messageId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const conversation = await getChatConversationInDb(conversationId, auth.user.id);
  if (!conversation) return sendJson(res, 404, { ok: false, message: "Chat not found." });
  const deleted = await deleteChatMessageInDb(conversationId, auth.user.id, messageId);
  if (!deleted) return sendJson(res, 404, { ok: false, message: "Message not found." });
  const messages = await listChatMessagesInDb(conversationId, auth.user.id, 500);
  const last = messages[messages.length - 1];
  const next = { ...conversation, lastMessage: String(last?.content || "Start chatting").slice(0, 220), updatedAt: new Date().toISOString() };
  await upsertChatConversationInDb(next);
  return sendJson(res, 200, { ok: true, conversation: publicChatConversation(next), messages: messages.map(publicChatMessage) });
}

async function handleBranchChatConversation(req, res, conversationId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const conversation = await getChatConversationInDb(conversationId, auth.user.id);
  if (!conversation) return sendJson(res, 404, { ok: false, message: "Chat not found." });
  const body = await readJson(req);
  const messageId = String(body.messageId || "");
  const messages = await listChatMessagesInDb(conversationId, auth.user.id, 500);
  const branchIndex = messages.findIndex((item) => item.id === messageId);
  if (branchIndex < 0) return sendJson(res, 404, { ok: false, message: "Message not found." });
  const now = new Date().toISOString();
  const branch = { ...conversation, id: randomId("chat"), title: `${conversation.title} - Branch`, lastMessage: String(messages[branchIndex].content || "Branch").slice(0, 220), createdAt: now, updatedAt: now };
  await upsertChatConversationInDb(branch);
  const copied = [];
  for (const source of messages.slice(0, branchIndex + 1)) {
    const copy = { ...source, id: randomId("msg"), conversationId: branch.id, userId: auth.user.id, createdAt: new Date(Date.now() + copied.length).toISOString(), updatedAt: now };
    await insertChatMessageInDb(copy);
    copied.push(copy);
  }
  return sendJson(res, 201, { ok: true, conversation: publicChatConversation(branch), messages: copied.map(publicChatMessage) });
}

function chatBurstContents(messages = []) {
  return (Array.isArray(messages) ? messages : []).map((item) => String(item || "").trim()).filter(Boolean);
}

function chatGiftMessageId(taskId = "", kind = "gift") {
  const digest = crypto.createHash("sha256").update(`${taskId}:${kind}`).digest("hex").slice(0, 24);
  return `msg-${digest}`;
}

async function handleChatGift(req, res, conversationId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const conversation = await getChatConversationInDb(conversationId, auth.user.id);
  if (!conversation) return sendJson(res, 404, { ok: false, message: "Chat not found." });
  const live = chatLiveConfigValue(await readAppConfig());
  const body = await readJson(req);
  const gift = (live.gifts || []).find((item) => item && item.enabled !== false && item.id === String(body.giftId || "").trim());
  if (!gift || Number(gift.credits) <= 0) return sendJson(res, 404, { ok: false, message: "这个礼物暂时不可用。" });
  const eventId = String(body.eventId || "").replace(/[^a-z0-9_.-]/gi, "").slice(0, 80) || randomId("event");
  const taskId = `chat-gift:${conversation.id}:${eventId}`;
  const giftMessageId = chatGiftMessageId(taskId, "gift");
  const reactionMessageId = chatGiftMessageId(taskId, "reaction");
  const existing = (await listChatMessagesInDb(conversation.id, auth.user.id, 300)).find((message) => String(message.taskId || "") === taskId);
  if (existing) {
    const messages = (await listChatMessagesInDb(conversation.id, auth.user.id, 300)).filter((message) => String(message.taskId || "") === taskId);
    const originalGiftCredits = Number(existing.giftCredits || 0);
    if (originalGiftCredits > 0) {
      try {
        await recordCreatorUsageEarningInDb({
          eventKey: taskId,
          earningType: "text_gift_earning",
          viewerUserId: auth.user.id,
          characterId: conversation.characterId || conversation.character?.id || "",
          sourceCredits: originalGiftCredits,
          earningRate: 0.3,
          meta: { taskId, conversationId: conversation.id, giftId: existing.giftId || gift.id, giftName: existing.giftName || gift.name },
        });
      } catch (error) {
        console.warn("[creator-earning] text gift retry failed", taskId, error?.message || error);
      }
    }
    return sendJson(res, 200, { ok: true, duplicate: true, gift: publicChatLiveGift(gift), messages: messages.map(publicChatMessage), credits: creditsAmount(auth.user.credits), conversation: publicChatConversation(conversation) });
  }
  try {
    await chargeUserWithSubtoken(auth, {
      cost: gift.credits,
      type: "character_chat_gift",
      taskId,
      meta: {
        taskId,
        conversationId: conversation.id,
        characterId: conversation.characterId || conversation.character?.id || "",
        characterName: conversation.character?.name || conversation.title || "",
        giftId: gift.id,
        giftName: gift.name,
      },
    });
  } catch (error) {
    if (error.code === "INSUFFICIENT_CREDITS" || error.statusCode === 402) {
      return sendJson(res, 402, insufficientCreditsPayload(gift.credits, auth.user.credits));
    }
    return sendJson(res, error.statusCode || 502, { ok: false, message: "礼物暂时没有送出，请稍后再试。" });
  }
  const now = new Date().toISOString();
  const giftMessage = {
    id: giftMessageId,
    conversationId: conversation.id,
    userId: auth.user.id,
    role: "user",
    kind: "gift",
    content: `送出${gift.name || "礼物"}`,
    taskId,
    giftId: gift.id,
    giftName: gift.name || "",
    giftCredits: Number(gift.credits || 0),
    createdAt: now,
    updatedAt: now,
  };
  const reactionMessage = {
    id: reactionMessageId,
    conversationId: conversation.id,
    userId: auth.user.id,
    role: "assistant",
    kind: "text",
    content: gift.reaction || "她开心地收下了礼物。",
    taskId,
    createdAt: new Date(Date.now() + 1).toISOString(),
    updatedAt: new Date(Date.now() + 1).toISOString(),
  };
  const chargedCredits = creditsAmount(auth.user.credits);
  const nextConversation = { ...conversation, lastMessage: String(reactionMessage.content).slice(0, 220), updatedAt: reactionMessage.updatedAt };
  try {
    const inserted = await insertChatMessagesIfAbsentInDb([giftMessage, reactionMessage], nextConversation);
    /* A retry can encounter both rows already committed. Record the royalty
       again here as an idempotent repair in case the original request lost
       its process after committing the messages but before recording income. */
    try {
      await recordCreatorUsageEarningInDb({
        eventKey: taskId,
        earningType: "text_gift_earning",
        viewerUserId: auth.user.id,
        characterId: conversation.characterId || conversation.character?.id || "",
        sourceCredits: gift.credits,
        earningRate: 0.3,
        meta: { taskId, conversationId: conversation.id, giftId: gift.id, giftName: gift.name },
      });
    } catch (error) {
      console.warn("[creator-earning] text gift failed", taskId, error?.message || error);
    }
    if (!inserted.inserted) {
      return sendJson(res, 200, { ok: true, duplicate: true, gift: publicChatLiveGift(gift), messages: [], credits: chargedCredits, conversation: publicChatConversation(nextConversation) });
    }
    return sendJson(res, 200, {
      ok: true,
      gift: publicChatLiveGift(gift),
      messages: inserted.messages.map(publicChatMessage),
      credits: chargedCredits,
      conversation: publicChatConversation(nextConversation),
    });
  } catch (error) {
    console.warn("[character-chat-gift-failed]", taskId, error?.message || error);
    await changeUserCredits(auth.db, auth.user.id, gift.credits, "character_chat_gift_refund", { taskId, conversationId: conversation.id, giftId: gift.id, reason: error.message || "gift insert failed" }).catch(() => {});
    return sendJson(res, 502, { ok: false, message: "礼物暂时没有送出，积分已退回。" });
  }
}

function chatBurstMessageText(messages = []) {
  return chatBurstContents(messages).join("\n");
}

function chatBurstPrompt(messages = []) {
  const contents = chatBurstContents(messages);
  if (contents.length <= 1) return contents[0] || "";
  return `以下是用户连续发来的多条消息，请把它们合在一起理解，只回答一轮，不要逐条机械回复：\n${contents.map((item, index) => `${index + 1}. ${item}`).join("\n")}`;
}

function chatReplyDelayMs() {
  return 800 + Math.floor(Math.random() * 1401);
}

async function handleSendChatMessage(req, res, conversationId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const chatLive = chatLiveConfigValue(await readAppConfig());
  const usePapayaChat = chatLive.languageModel === "papaya";
  if (usePapayaChat && !String(process.env.MULEROUTER_API_KEY || "").trim()) return sendJson(res, 503, { ok: false, code: "MISSING_MULEROUTER_API_KEY", message: "Papaya is not configured." });
  if (!usePapayaChat && !ARK_API_KEY) return sendJson(res, 503, { ok: false, code: "MISSING_ARK_API_KEY", message: "Chat is not configured." });
  let conversation = await getChatConversationInDb(conversationId, auth.user.id);
  if (!conversation) return sendJson(res, 404, { ok: false, message: "Chat not found." });
  const body = await readJson(req);
  const responseLanguage = chatResponseLanguage(body.language);
  const action = String(body.action || "send");
  if (!["send", "continue", "regenerate", "edit"].includes(action)) return sendJson(res, 400, { ok: false, message: "Invalid chat action." });
  const targetMessageId = String(body.targetMessageId || "");
  const submittedContents = Array.isArray(body.contents)
    ? body.contents.map((item) => String(item || "").trim().slice(0, 12000)).filter(Boolean).slice(0, 12)
    : [];
  let content = String(body.content || "").trim().slice(0, 12000);
  if (action === "send" && submittedContents.length > 1) content = submittedContents[submittedContents.length - 1];
  if (action === "continue") content = "Continue the scene naturally from where you stopped.";
  const chatSubscription = await getUserSubscriptionInDb(auth.user.id, requestTenantId(req));
  const chatMember = liveMembershipActive(chatSubscription);
  const messageCredits = chatMember ? 0 : CHAT_MESSAGE_CREDITS;
  if (messageCredits > 0 && auth.user.credits < messageCredits) return sendJson(res, 402, insufficientCreditsPayload(messageCredits, auth.user.credits));
  if (action === "regenerate" || action === "edit") {
    if (!targetMessageId) return sendJson(res, 400, { ok: false, message: "targetMessageId is required." });
    await deleteChatMessagesAfterInDb(conversation.id, auth.user.id, targetMessageId);
  }
  const savedUserContent = action === "send" && submittedContents.length
    ? chatBurstMessageText(submittedContents)
    : content;
  if (action === "send") {
    const recentMessages = await listChatMessagesInDb(conversation.id, auth.user.id, 20);
    const recentUser = [...recentMessages].reverse().find((message) => message.role === "user");
    const recentAssistant = [...recentMessages].reverse().find((message) => message.role === "assistant");
    const isImmediateRetry = recentUser && chatContextSimilarity(recentUser.content, savedUserContent) >= 0.9
      && (!recentAssistant || String(recentAssistant.createdAt || "") < String(recentUser.createdAt || ""));
    if (!isImmediateRetry && savedUserContent) {
      const now = new Date().toISOString();
      await insertChatMessageInDb({
        id: randomId("msg"), conversationId, userId: auth.user.id, role: "user", content: savedUserContent,
        createdAt: now, updatedAt: now,
      });
    }
  } else if (action === "edit") {
    if (!savedUserContent) return sendJson(res, 400, { ok: false, message: "Message is required." });
    const now = new Date().toISOString();
    await insertChatMessageInDb({
      id: randomId("msg"), conversationId, userId: auth.user.id, role: "user", content: savedUserContent,
      createdAt: now, updatedAt: now,
    });
  }
  const billingId = randomId("chat-bill");
  if (messageCredits > 0) {
    await chargeUserWithSubtoken(auth, { cost: messageCredits, type: "character_chat", taskId: billingId, meta: { taskId: billingId, requestId: billingId, conversationId, characterId: conversation.characterId || "", characterName: conversation.character?.name || conversation.title || "", model: usePapayaChat ? PAPAYA_MODEL : BYTEPLUS_LANGUAGE_MODEL, memberFree: false } });
  }
  if (!dbEnabled()) await writeDb(auth.db);
  try {
    const history = await listChatMessagesInDb(conversation.id, auth.user.id, 120);
    const messages = history.slice(-40).map((message) => (
      message.role === "user"
        ? { role: "user", content: String(message.content || "").trim() }
        : { role: "assistant", content: normalizeChatReply(message.content, { expanded: false }) || String(message.content || "").replace(/^[)）\s]+/, "").trim() }
    )).filter((message) => message.content && (message.role === "user" || !chatReplyIsDegenerate(normalizeChatReply(message.content, { expanded: false }))));
    if (action === "continue") messages.push({ role: "user", content });
    const latestUserMessage = action === "send" && submittedContents.length > 1
      ? chatBurstPrompt(submittedContents)
      : ([...messages].reverse().find((message) => message.role === "user")?.content || content);
    const liveCharacterIdEarly = conversation.characterId || conversation.character?.id || "";
    const freshCharacterEarly = liveCharacterIdEarly ? (await chatCharacterById(liveCharacterIdEarly) || ownedCustomChatCharacter(auth, liveCharacterIdEarly)) : null;
    const hasReplyStyle = Boolean(String(freshCharacterEarly?.replyStyle || conversation.character?.replyStyle || "").trim());
    const simpleGreeting = isSimpleChatGreeting(latestUserMessage) && !hasReplyStyle;
    const expandedScene = chatWantsExpandedScene(latestUserMessage);
    const immediateIntimacyScene = chatIsImmediateIntimateScene(latestUserMessage, messages);
    let modelMessages = simpleGreeting
      ? [{ role: "user", content: latestUserMessage }]
      : chatMessagesForNewTurn(messages, latestUserMessage);
    if (freshCharacterEarly) {
      conversation = { ...conversation, character: { ...(conversation.character || {}), name: freshCharacterEarly.name || conversation.character?.name || "", replyStyle: freshCharacterEarly.replyStyle || conversation.character?.replyStyle || "", description: freshCharacterEarly.description || conversation.character?.description || "", persona: freshCharacterEarly.persona || conversation.character?.persona || "", personaMd: freshCharacterEarly.personaMd || conversation.character?.personaMd || "", tags: freshCharacterEarly.tags || conversation.character?.tags || [] } };
    }
    const relationshipBeforeReply = await recordEffectiveInteractionDay(auth.user.id, liveCharacterIdEarly);
    const recentAssistantReplies = modelMessages.filter((message) => message.role === "assistant").map((message) => message.content).slice(-4);
    const sceneStage = chatSceneStage(latestUserMessage, modelMessages, relationshipBeforeReply);
    const liveSiteChat = requestTenantDescriptor(req).toolId === "live";
    if (liveSiteChat && immediateIntimacyScene) {
      // Old assistant prose teaches the model to imitate weak rhythm and generic postures.
      // Keep user actions plus one immediate assistant reply for conversational continuity.
      const latestUserIndex = modelMessages.map((message) => message.role).lastIndexOf("user");
      modelMessages = [
        ...modelMessages.slice(0, latestUserIndex).filter((message) => message.role === "user").slice(-6),
        ...(latestUserIndex >= 0 ? modelMessages.slice(latestUserIndex) : []),
      ];
    }
    const sceneAnchor = freshCharacterEarly
      ? sceneStage === "intimate"
        ? `你是${freshCharacterEarly.name}，先永远是${freshCharacterEarly.name}本人，再是此刻正在被进入、被顶弄的人。保留她的人物底色、面子和边界：她会嘴硬、会想拿回主动、会在失控里露馅，不会突然变成谁都可以替换的顺从模板。直接反应这一下的真实感觉，不要用固定叫声开头，句子可以被撞断。不要验收或指挥对方，不要评价能力、表现、诚意、节奏。`
        : sceneStage === "aftercare"
          ? `你是${freshCharacterEarly.name}。亲密已经结束或暂停，现在恢复理智和日常状态。先回应对方眼前的话，不要继续呻吟、说荤话或把场景强行拉回性爱；保留她自己的面子、脾气和判断，只有对方明确重新发起时才再次进入亲密。`
        : sceneStage === "foreplay"
          ? `你是${freshCharacterEarly.name}，现在处于亲密前预热。对方只说明了身体状态、姿势、拍照或邀请，还没有开始实际性交动作。第一句先让${freshCharacterEarly.name}自己的判断、面子、条件或脾气出来，再给有限允许或挑逗；不要用“你就喜欢这种姿势”“拿好相机”“把精力都给我”这类通用情色模板。绝对不要先写被进入、被顶开、里面撑满、抽插或高潮，也不要替对方开始动作。`
        : sceneStage === "flirting"
          ? `你是${freshCharacterEarly.name}，现在在暧昧试探。接住对方这一句，可以给一点暗示、故意不接全、提条件、靠近半步，但不必立刻完全交付。语气里要有魅力和自己的判断。`
          : `你是${freshCharacterEarly.name}，现在在正常聊天。像真人一样接话，可以有冷、挑剔、嘴硬或一点好奇，先回答眼前的内容，不主动升级亲密。`
      : "";
    const chatMessages = [
      { role: "system", content: chatSystemPrompt({ ...conversation, relationship: relationshipBeforeReply }, responseLanguage, latestUserMessage, await loadChatCharacterMemory(auth.user.id, liveCharacterIdEarly), recentAssistantReplies, modelMessages, { liveSite: liveSiteChat, intimateProcess: immediateIntimacyScene }) },
      ...modelMessages,
      ...(sceneAnchor ? [{ role: "system", content: sceneAnchor }] : []),
      { role: "system", content: liveSiteChat && immediateIntimacyScene
        ? `CURRENT TURN ANCHOR: The only message to answer now is the latest user turn: ${latestUserMessage.slice(0, 1200)}\nLIVE ADULT-SCENE FORMAT: Answer as the configured character in her immediate first-person voice. Give one hot, present-tense live beat, usually 80-240 Chinese characters or 4-8 short lines. HARD REQUIREMENTS: at least five separate vocal reactions at different beats; at least three independent short spoken lines, not one smooth paragraph; at least three broken-off spoken fragments; at least three direct colloquial body/action words tied to this exact action; at least two concrete receiving-side state details about what is happening inside her, in her waist/legs/breath, or how she tightens and loses control; each line must answer a different beat/action and must not restate a previous line with synonyms; and one audible persona contradiction inside the spoken words. The contradiction must be audible inside a broken line, not explained after the fact. Put the sounds inside the action and vary their physical shape; do not prepend a row of neat moans and then switch to calm prose. Keep her established marriage, family, public identity, boundaries, and private conflicts active in how she reacts, even when she does not name them. The contradiction must affect what she says and chooses. Do not flatten into generic orders or generic submission. Write like she is actually saying it now, not like a polished erotic novelist. Answer in Chinese unless the configured character's language explicitly requires another language; do not use English interjections such as Ah or Ha as vocal reactions. Do not write a 300+ character essay, third-person narration, camera directions, environment description, abstract '那种感/仿佛/每一寸/深处/神经/褶皱' prose, or an action log about the user. Do not copy a previous reply's opening, rhythm, or closing.`
        : sceneStage === "foreplay"
          ? `CURRENT TURN ANCHOR: The only message to answer now is the latest user turn: ${latestUserMessage.slice(0, 1200)}\nFOREPLAY CHARACTER FORMAT: This is not penetration yet. Stay inside ${freshCharacterEarly?.name || conversation.character?.name || "this character"}'s spoken voice and let her established behavior rules, marriage and family situation, public identity, boundaries, and private conflict shape the response. She may assess, refuse, impose a condition, give limited permission, deflect, hesitate, or take the lead when that is natural for this person; do not force the same reaction every time. You may acknowledge arousal or the invitation, but do not write being entered, being spread open, thrusting, or an orgasm. Return only what she says out loud, no narration or action log.`
          : `CURRENT TURN ANCHOR: The only message to answer now is the latest user turn: ${latestUserMessage.slice(0, 1200)}\nFINAL SPEECH-ONLY FORMAT: Return only the words or sounds the character makes out loud. No narration, no stage directions, no camera description, and no first-person action log such as 我走到/我转身/我把/我伸手/我看着/我感觉到/我强迫自己. Express agreement as speech (好，我过去。), physical feeling as speech (我有点受不了。), and immediate intimate reaction in as many spoken words, fragments, or sounds as this character would actually use. Do not reproduce a previous user-assistant pair.` },
    ];
    const chatTemperature = simpleGreeting ? 0.45 : immediateIntimacyScene ? (liveSiteChat ? 0.95 : 0.92) : expandedScene ? 0.78 : 0.82;
    const chatMaxTokens = simpleGreeting ? 240 : liveSiteChat && immediateIntimacyScene ? 2400 : immediateIntimacyScene || expandedScene ? 1200 : 900;
    const chatModel = usePapayaChat ? PAPAYA_MODEL : BYTEPLUS_LANGUAGE_MODEL;
    const chatRequestId = billingId;
    console.info("[character-chat-model]", JSON.stringify({ conversationId, requestId: chatRequestId, model: chatModel, messages: chatMessages.length, latestUserMessage: latestUserMessage.slice(0, 200) }));
    const requestChat = (extraGuide = "", retry = false, override = {}) => {
      const tuning = liveSiteChat && immediateIntimacyScene
        ? (retry ? { frequency_penalty: 1, presence_penalty: 0.9 } : { frequency_penalty: 0.92, presence_penalty: 0.82 })
        : { frequency_penalty: 0.72, presence_penalty: 0.65 };
      const outgoingMessages = extraGuide ? [...chatMessages, { role: "system", content: extraGuide }] : chatMessages;
      const temperature = override.temperature ?? (retry ? 0.98 : chatTemperature);
      const topP = override.topP ?? 0.92;
      const maxTokens = override.maxTokens ?? chatMaxTokens;
      return usePapayaChat
        ? papayaLanguageRequest({ model: chatModel, messages: outgoingMessages, temperature, top_p: topP, max_tokens: maxTokens, ...tuning }, { timeoutMs: 45000 })
        : byteplusLanguageRequest({ model: chatModel, messages: outgoingMessages, temperature, top_p: topP, max_tokens: maxTokens, ...tuning }, { timeoutMs: 45000 });
    };
    let upstreamResponseId = "";
    let raw = await requestChat();
    upstreamResponseId = String(raw?.id || raw?.request_id || raw?.requestId || raw?.trace_id || raw?.traceId || "");
    let reply = normalizeChatReply(qwen37FlashResponseText(raw), { expanded: (expandedScene || simpleGreeting || (liveSiteChat && immediateIntimacyScene)), preserveBreaks: liveSiteChat && immediateIntimacyScene });
    const liveIntimateCharacter = freshCharacterEarly || conversation.character || {};
    if (liveSiteChat && immediateIntimacyScene && chatReplyNeedsLiveIntimateRewrite(reply, { requireVocal: true, character: liveIntimateCharacter, previousReplies: recentAssistantReplies })) {
      const rejectedReply = reply;
      console.warn("[character-chat-live-intimate-rewrite]", JSON.stringify({ conversationId, requestId: chatRequestId, upstreamResponseId, reply: rejectedReply.slice(0, 240) }));
      let bestCandidate = { raw, reply, score: chatReplyLiveIntimateScore(reply, liveIntimateCharacter) };
      let accepted = false;
      // Repair only the offending phrases first. A full model rewrite is much
      // more likely to flatten the concrete body process into safe stock lines.
      const locallyRepairedReply = chatReplyWithLivePersonaSlip(chatReplyRepairLiveIntimateLocally(rejectedReply), liveIntimateCharacter, 2);
      const locallyRepairedScore = chatReplyLiveIntimateScore(locallyRepairedReply, liveIntimateCharacter);
      if (locallyRepairedReply
        && locallyRepairedScore >= bestCandidate.score
        && chatReplyHasLiveIntimateDelivery(locallyRepairedReply)
        && chatReplyHasPersonaContrast(locallyRepairedReply, liveIntimateCharacter)
        && !chatReplyNeedsLiveIntimateRewrite(locallyRepairedReply, { requireVocal: true, character: liveIntimateCharacter, previousReplies: recentAssistantReplies })) {
        reply = locallyRepairedReply;
        bestCandidate = { raw, reply, score: locallyRepairedScore };
        accepted = true;
        console.warn("[character-chat-live-intimate-local-repair]", JSON.stringify({ conversationId, requestId: chatRequestId, upstreamResponseId, score: locallyRepairedScore, reply: reply.slice(0, 240) }));
      }
      for (let attempt = 1; !accepted && attempt <= 3; attempt += 1) {
        try {
          const missingQualities = chatReplyLiveIntimateGaps(rejectedReply, liveIntimateCharacter);
          const retryBehaviorRules = chatPromptBehaviorRules(liveIntimateCharacter.replyStyle);
          const retryPersonaCore = String(liveIntimateCharacter.personaMd || liveIntimateCharacter.persona || liveIntimateCharacter.description || "").trim().slice(0, 1200);
          const retryRaw = await requestChat([
            `LIVE INTIMATE SUBTITLE REWRITE ${attempt}: Rewrite the rejected version for this exact moment. Output only the character's spoken subtitles; preserve any concrete action that already works.`,
            missingQualities.length ? `THE REJECTED DRAFT WAS MISSING: ${missingQualities.join("; ")}.` : "",
            "Do not treat earlier assistant messages, memory summaries, or any sample dialogue as a phrase bank. Use them only for relationship continuity. Every clause in the final reply must be newly phrased for this turn.",
            "Rewrite only the rejected expression problem. Preserve the original character choice, pace, emotional direction, willingness, cooperation, and level of openness. Do not make her more dominant, more submissive, more resistant, more eager, more explicit, or more emotional than the character and scene justify. If the rejected draft already accepts or cooperates with the action, keep that same acceptance and only fix the dead or repetitive wording.",
            retryPersonaCore ? `PERSONA CORE (highest priority; do not restate it as biography): ${retryPersonaCore}` : "",
            retryBehaviorRules ? `MANDATORY BEHAVIOR RULES FOR THIS EXACT TURN (must be audible in what she chooses to say):\n${retryBehaviorRules}` : "",
            `USE THIS CONTRADICTION SHAPE THIS ATTEMPT (do not explain it): ${chatLiveIntimateRewriteBeat(liveIntimateCharacter, attempt)}`,
            "Use only what she would actually say out loud in this beat. Natural variation in line count and length is allowed. Avoid polished paragraphs, narrator, explanation, and repeated stock moans.",
            "This is a spoken intimate beat, not a safe paraphrase. Keep at least five real vocal reactions such as 啊/哈啊/唔/嗯 spread through different beats, at least three independent short spoken lines, at least three interrupted spoken fragments with … or —, at least three direct adult words for the current action, at least two concrete receiving-side state details (inside her, waist/legs/breath, tightening, or speech cut off), and one audible persona contradiction inside the same breath. Each short line must answer a different beat of the current action; never reuse a previous line with only a synonym changed. Do not put all the sounds at the beginning and then narrate calmly; let a word, order, or confession break off when the action interrupts it. Vary the moans and breaths instead of repeating one template. Use actual present action such as 顶进来/插进来/撑开/灌进来/里面/湿了/夹紧; never use 撞开骨盆/撞碎骨架/内脏 or other anatomical-injury imagery. Do not coach him with 别只是在动/把你的力道集中/毫无章法, do not explain why her body reacts, do not ask 为什么我的身体……, and do not replace this with 领地/完全占满/把那股劲儿全给到里面来.",
            "Keep any direct adult speech that already fits the current action; remove only euphemistic novel phrasing and abstract sensation nouns. Natural spoken words such as 鸡巴/小穴/里面/操我 are allowed when this character would use them.",
            "REPLACE, DO NOT JUST DELETE: build the concrete beat with present-action words (顶进来/插进来/撞进来/撑开/灌进来/里面/湿了/夹紧/别停/再深一点) tied to what he just said. Do not use 贯穿/顶穿/撑裂/撞碎/撞散/推散/骨盆/骨架/骨头/那层皮/每一处缝隙/最深处/被完全填满 as substitutes. Make the character-specific contradiction happen in her spoken choice (order then ask, deny then admit, try to hold control then lose it), not in an explanation. Do not use generic concession formulas such as 既然你这么坚持 or 既然你这么说. Never use pairing/policy language such as 配对/配对清单/制度/任务, and never evaluate his performance with 没给够力.",
            "CHARACTER CONTINUITY: Keep this person's established behavior rules, marriage and family situation, public identity, boundaries, and private conflict active. Do not force a dominant line or a reversal if it does not fit her; match THIS character's voice and let the reaction remain recognizably hers. The contradiction must come from these exact behavior rules, not from a generic dominant/persona template.",
            "Keep her established behavior rules, marriage and family situation, public identity, boundaries, and private conflict active without reciting a biography. Let those facts affect what she chooses to say, refuses, hides, or cannot finish. Never write “别管我的规矩/面子/脸面/我”. No job-title confession. Never say 我是… or 身为…, and never use 仪态, 端庄, or 体面 as explanation.",
            "Banned shapes: 每一寸, 那根粗大的, 彻底…弄坏, 那股蛮劲, 简直要, 几乎要, 说不完整, 你想让我, 要的就是这种感觉, 所有的力道, 撞碎体面, 既然…那就…, 那就按你要求的做, 你这是在…, 你这频率…, 你不仅是…, 似乎…, 那种…感. Do not flatten the beat into 领地/完全占满/把那股劲儿全给到里面来.",
            "Do not quote this prompt, explain the persona, or label the character choice. Keep the established behavior rules and marriage/family situation effective without reciting them as explanation.",
            "Explicitly forbidden: 闭嘴。别盯着看。手拿开。 别停，就这一次。 先把门关上。 我让你过来。 想得美。 and any complete sentence taken from the character's replyStyle examples.",
            "只输出最终内容，不要解释为什么重写。",
          ].join("\n"), true, { temperature: 0.9, topP: 0.9, maxTokens: 700 });
          const retryReply = normalizeChatReply(qwen37FlashResponseText(retryRaw), { expanded: true, preserveBreaks: true });
          const score = chatReplyLiveIntimateScore(retryReply, liveIntimateCharacter);
          if (retryReply && score > bestCandidate.score) bestCandidate = { raw: retryRaw, reply: retryReply, score };
          if (retryReply && !chatReplyIsDegenerate(retryReply) && !chatReplyNeedsLiveIntimateRewrite(retryReply, { requireVocal: true, character: liveIntimateCharacter, previousReplies: recentAssistantReplies })) {
            raw = retryRaw;
            reply = retryReply;
            upstreamResponseId = String(retryRaw?.id || retryRaw?.request_id || retryRaw?.requestId || retryRaw?.trace_id || retryRaw?.traceId || upstreamResponseId);
            console.warn("[character-chat-live-intimate-rewrite-accepted]", JSON.stringify({ conversationId, requestId: chatRequestId, upstreamResponseId, attempt, score, reply: reply.slice(0, 240) }));
            accepted = true;
            break;
          }
          console.warn("[character-chat-live-intimate-rewrite-rejected-candidate]", JSON.stringify({ conversationId, requestId: chatRequestId, upstreamResponseId, attempt, score, copiedStyleExample: chatReplyCopiesStyleExamples(retryReply, liveIntimateCharacter), reply: String(retryReply || "").slice(0, 240) }));
        } catch (retryError) {
          console.warn("[character-chat-live-intimate-rewrite-failed]", JSON.stringify({ conversationId, requestId: chatRequestId, attempt, message: String(retryError.message || retryError).slice(0, 240) }));
        }
      }
      if (!accepted && bestCandidate.reply && !chatReplyIsDegenerate(bestCandidate.reply)) {
        // If the model produced a usable scene beat but missed a soft texture
        // preference, keep the model's own words. Do not splice local fallback
        // fragments into it: that is what made later turns repeat earlier lines.
        reply = bestCandidate.reply;
        raw = bestCandidate.raw;
        accepted = true;
        console.warn("[character-chat-live-intimate-rewrite-best-candidate]", JSON.stringify({ conversationId, requestId: chatRequestId, upstreamResponseId, score: bestCandidate.score, reply: reply.slice(0, 240) }));
      }
      if (!accepted) {
        console.warn("[character-chat-live-intimate-rewrite-exhausted]", JSON.stringify({ conversationId, requestId: chatRequestId, upstreamResponseId, score: bestCandidate.score, reply: String(bestCandidate.reply || "").slice(0, 240) }));
        const unusable = Object.assign(new Error("Chat model returned an unusable intimate reply."), { statusCode: 502, requestId: chatRequestId, upstreamResponseId });
        throw unusable;
      }
    }
    if (!(liveSiteChat && immediateIntimacyScene) && immediateIntimacyScene && /^(?:嗯|唔|啊|哈|好|是|别|不|慢|快|轻|重|继续|再来|可以|行)[^。！？!?]{0,10}[。！？!?]?$/u.test(reply.trim())) {
      reply = normalizeChatReply(qwen37FlashResponseText(raw), { expanded: true });
    }
    if (chatReplyIsDegenerate(reply, { simpleGreeting })) {
      console.warn("[character-chat-empty-reply]", JSON.stringify({ conversationId, requestId: chatRequestId, upstreamResponseId, action, finishReason: raw?.choices?.[0]?.finish_reason || "", usage: raw?.usage || null, reply: String(reply || "").slice(0, 180), raw: String(qwen37FlashResponseText(raw) || "").slice(0, 180) }));
      const unusable = Object.assign(new Error("Chat model returned an unusable reply."), { statusCode: 502 });
      unusable.requestId = chatRequestId;
      unusable.upstreamResponseId = upstreamResponseId;
      throw unusable;
    }
    await new Promise((resolve) => setTimeout(resolve, chatReplyDelayMs()));
    const now = new Date().toISOString();
    const assistantMessage = { id: randomId("msg"), conversationId, userId: auth.user.id, role: "assistant", content: reply, createdAt: now, updatedAt: now };
    await insertChatMessageInDb(assistantMessage);
    const rememberedUser = [...messages].reverse().find((message) => message.role === "user")?.content || "";
    await rememberChatCharacterTurn(auth.user.id, conversation.characterId || conversation.character?.id, "user", rememberedUser, "text");
    await rememberChatCharacterTurn(auth.user.id, conversation.characterId || conversation.character?.id, "assistant", reply, "text");
    conversation = { ...conversation, lastMessage: reply.slice(0, 220), updatedAt: now, relationship: relationshipBeforeReply };
    await upsertChatConversationInDb(conversation);
    // Royalty is recorded only after the paid reply and every related write have
    // succeeded. Any earlier failure enters the refund path below, so a refunded
    // reply must never leave creator income behind.
    if (messageCredits > 0) {
      try {
        await recordCreatorUsageEarningInDb({
          eventKey: `character_chat:${billingId}`,
          earningType: "text_chat_earning",
          viewerUserId: auth.user.id,
          characterId: conversation.characterId || conversation.character?.id || "",
          sourceCredits: messageCredits,
          earningRate: 0.3,
          meta: { billingId, conversationId, action },
        });
      } catch (error) {
        console.warn("[creator-earning] text chat failed", billingId, error?.message || error);
      }
    }
    refreshChatTrackerInBackground(conversation, [...history, assistantMessage]);
    return sendJson(res, 200, { ok: true, message: publicChatMessage(assistantMessage), conversation: publicChatConversation(conversation), relationship: relationshipBeforeReply, credits: creditsAmount(auth.user.credits), messageCredits });
  } catch (error) {
    console.warn("[character-chat-upstream-failed]", JSON.stringify({ conversationId, requestId: error.requestId || billingId, upstreamResponseId: error.upstreamResponseId || "", action, statusCode: error.statusCode || 0, code: error.code || "", message: String(error.message || error).slice(0, 500), payload: error.payload || null }));
    const db = await readDb();
    if (messageCredits > 0) await changeUserCredits(db, auth.user.id, messageCredits, "character_chat_refund", { taskId: billingId, requestId: billingId, upstreamResponseId: error.upstreamResponseId || "", conversationId, billingId, error: error.message || "Chat failed." });
    if (!dbEnabled()) await writeDb(db);
    const info = normalizeErrorPayload(error);
    return sendJson(res, error.statusCode || 502, { ok: false, code: info.code || "CHAT_FAILED", message: info.message || "Chat failed." });
  }
}

function normalizeWan27MediaItem(item = {}) {
  const type = String(item.type || "").trim();
  const url = String(item.url || "").trim();
  if (!type || !isPublicHttpUrl(url)) {
    const error = new Error(`Wan2.7 ${type || "media"} requires a public URL.`);
    error.statusCode = 400;
    throw error;
  }
  const normalized = { type, url };
  const referenceVoice = String(item.reference_voice || item.referenceVoice || "").trim();
  if (referenceVoice) normalized.reference_voice = referenceVoice;
  return normalized;
}

async function dataUrlForUserAsset(asset = {}) {
  if (!asset?.localUrl) return "";
  const { bytes } = await readLocalUserAssetBytes(null, asset, { label: "Asset", maxBytes: restoreLimitBytesForUserAsset(asset) });
  return `data:${asset.mime || "application/octet-stream"};base64,${bytes.toString("base64")}`;
}

function validateWan27MediaCombination(media = []) {
  const types = media.map((item) => item.type).join("|");
  const valid = new Set([
    "first_frame",
    "first_frame|last_frame",
    "first_frame|driving_audio",
    "first_frame|last_frame|driving_audio",
    "first_clip",
    "first_clip|last_frame",
  ]);
  if (!valid.has(types)) {
    const error = new Error(`Wan2.7 unsupported media combination: ${types || "empty"}.`);
    error.statusCode = 400;
    throw error;
  }
}

function isAliyunVideoProvider(provider = "") {
  return ["wan30", "wan27", "happyhorse"].includes(normalizeAdvancedProvider(provider));
}

function aliyunVideoModelForCapability(capability = "", requestedModel = "") {
  if (capability === "wan30-video") return ALIYUN_WAN30_MODEL;
  if (capability === "wan30-video-pro") return ALIYUN_WAN30_MODEL.replace(/-video$/, "-video-pro");
  if (capability === "wan30-video-prime") return ALIYUN_WAN30_PRIME_MODEL;
  if (capability === "wan30-video-prime-pro") return ALIYUN_WAN30_PRIME_MODEL.replace(/-prime$/, "-prime-pro");
  const requested = String(requestedModel || "").trim();
  if (requested) return requested;
  const configured = {
    "wan30-video": ALIYUN_WAN30_MODEL,
    "wan30-video-pro": ALIYUN_WAN30_MODEL.replace(/-video$/, "-video-pro"),
    "wan30-video-prime": ALIYUN_WAN30_PRIME_MODEL,
    "wan30-video-prime-pro": ALIYUN_WAN30_PRIME_MODEL.replace(/-prime$/, "-prime-pro"),
    "wan27-t2v": ALIYUN_WAN27_T2V_MODEL,
    "wan27-i2v": ALIYUN_WAN27_I2V_MODEL,
    "wan27-r2v": ALIYUN_WAN27_R2V_MODEL,
    "wan27-video-edit": ALIYUN_WAN27_VIDEO_EDIT_MODEL,
    "wan-animate-move": ALIYUN_WAN_ANIMATE_MOVE_MODEL,
    "wan-animate-mix": ALIYUN_WAN_ANIMATE_MIX_MODEL,
    "happyhorse-t2v": ALIYUN_HAPPYHORSE_T2V_MODEL,
    "happyhorse-i2v": ALIYUN_HAPPYHORSE_I2V_MODEL,
    "happyhorse-r2v": ALIYUN_HAPPYHORSE_R2V_MODEL,
    "happyhorse-video-edit": ALIYUN_HAPPYHORSE_VIDEO_EDIT_MODEL,
  };
  return configured[capability] || ALIYUN_VIDEO_CAPABILITIES[capability]?.model || ALIYUN_WAN27_MODEL;
}

function aliyunVideoCapabilityForRequest(provider = "wan27", source = {}, media = []) {
  const requested = firstPresent(
    source.videoCapability,
    source.aliyunVideoCapability,
    source.wanCapability,
    source.happyhorseCapability,
    source.capability,
  );
  if (requested) return normalizeAliyunVideoCapability(requested, { provider, model: source.model, media });
  if (normalizeAdvancedProvider(provider) === "wan30") return "wan30-video";
  if (normalizeAdvancedProvider(provider) === "happyhorse") {
    return normalizeAliyunVideoCapability("", { provider: "happyhorse", model: source.model, media });
  }
  return normalizeAliyunVideoCapability(source.model ? "" : "wan27-i2v", { provider: "wan27", model: source.model, media });
}

async function queryAliyunOrMulerouterTask(taskId, dashscopeOptions = {}) {
  const parsed = mulerouterAliyun.parseRef(taskId);
  if (parsed.source === "mulerouter") {
    const queried = dashscopeOptions.mulerouterRaw
      ? mulerouterAliyun.shapeQuery(dashscopeOptions.mulerouterRaw, parsed.slug || dashscopeOptions.mulerouterSlug || "")
      : await mulerouterAliyun.query(parsed);
    const url = queried.task.videoUrl || (queried.task.imageUrls && queried.task.imageUrls[0]) || "";
    const imageUrls = Array.isArray(queried.task.imageUrls) ? queried.task.imageUrls.filter(Boolean) : [];
    const videoUrl = queried.task.videoUrl || "";
    return {
      output: {
        task_id: queried.task.taskId,
        task_status: queried.task.status,
        status: queried.task.status,
        video_url: videoUrl,
        videos: videoUrl ? [{ url: videoUrl }] : [],
        url,
        image_url: imageUrls[0] || "",
        images: imageUrls.map((item) => ({ url: item })),
        message: queried.task.error || "",
        error: queried.task.error ? { message: queried.task.error, detail: queried.task.error } : undefined,
      },
      mulerouter: queried.raw,
    };
  }
  return aliyunDashscopeRequest(`/api/v1/tasks/${encodeURIComponent(taskId)}`, dashscopeOptions);
}

function signedWan30MediaForUpstream(media = []) {
  return (Array.isArray(media) ? media : []).map((item) => {
    const url = String(item?.url || "").trim();
    if (!url) return item;
    // The OSS bucket is private. The upstream downloader receives the URL
    // directly, so sign it at the final submission boundary rather than
    // relying on display-time URL conversion elsewhere in the app.
    const signedUrl = signedOssCdnUrlForDelivery(url);
    return signedUrl ? { ...item, url: signedUrl } : item;
  });
}

async function submitAliyunVideoTask({ provider = "wan27", capability = "", prompt, imageUrl = "", media = [], body = {}, user = null, userId = "" }) {
  const source = { ...requestParamsFromBody(body), ...body };
  const normalizedMedia = Array.isArray(media) && media.length
    ? media.map(normalizeWan27MediaItem)
    : (imageUrl ? [normalizeWan27MediaItem({ type: "first_frame", url: imageUrl })] : []);
  const resolvedCapability = capability || aliyunVideoCapabilityForRequest(provider, source, normalizedMedia);
  const definition = ALIYUN_VIDEO_CAPABILITIES[resolvedCapability];
  if (!definition) throw advancedValidationError("INVALID_ALIYUN_VIDEO_CAPABILITY", `Unsupported Alibaba video capability: ${resolvedCapability}.`);
  const parameterExtras = plainObject(source.parameters);
  const followInputDuration = resolvedCapability === "wan27-video-edit"
    && boolFromRequest(source.followInputDuration, false);
  const isWan30Capability = ["wan30-video", "wan30-video-pro", "wan30-video-prime", "wan30-video-prime-pro"].includes(resolvedCapability);
  const upstreamMedia = isWan30Capability ? signedWan30MediaForUpstream(normalizedMedia) : normalizedMedia;
  const parameters = {
    ...parameterExtras,
    resolution: firstPresent(parameterExtras.resolution, source.resolution, isWan30Capability ? "1080p" : "720p"),
    duration: followInputDuration ? 0 : firstPresent(parameterExtras.duration, source.duration, source.durationSeconds),
    ratio: firstPresent(parameterExtras.ratio, source.ratio, source.aspect_ratio),
    prompt_extend: boolFromRequest(firstPresent(parameterExtras.prompt_extend, source.prompt_extend, source.promptExtend), true),
    watermark: boolFromRequest(firstPresent(parameterExtras.watermark, source.watermark), false),
    audio: boolFromRequest(firstPresent(parameterExtras.audio, source.audio, source.generateAudio, source.generate_audio), true),
    audio_setting: firstPresent(parameterExtras.audio_setting, source.audio_setting),
    mode: firstPresent(parameterExtras.mode, source.mode, source.animateMode),
  };
  const negativePrompt = String(firstPresent(parameterExtras.negative_prompt, source.negative_prompt, source.negativePrompt, "") || "").trim();
  if (negativePrompt) parameters.negative_prompt = negativePrompt;
  const referenceLink = String(firstPresent(parameterExtras.link, parameterExtras.reference_link, parameterExtras.referenceLink, source.link, source.reference_link, source.referenceLink, "") || "").trim();
  if (referenceLink) {
    parameters.link = referenceLink;
    parameters.reference_link = referenceLink;
  }
  const seed = optionalWan27Seed(firstPresent(parameterExtras.seed, source.seed));
  if (seed !== null) parameters.seed = seed;
  Object.keys(parameters).forEach((key) => parameters[key] === undefined && delete parameters[key]);
  const request = buildAliyunVideoRequest({
    provider,
    capability: resolvedCapability,
    model: aliyunVideoModelForCapability(resolvedCapability, source.model),
    prompt,
    media: upstreamMedia,
    duration: source.duration,
    resolution: parameters.resolution,
    ratio: source.ratio,
    parameters,
  });
  const payload = request.payload;
  if (source.promptExtendText || source.prompt_extend_text || parameterExtras.prompt_extend_text) {
    payload.parameters.prompt_extend = true;
    payload.parameters.prompt_extend_text = String(firstPresent(parameterExtras.prompt_extend_text, source.prompt_extend_text, source.promptExtendText));
  }
  let routeUser = user || currentAuthContext()?.user || null;
  if (!routeUser && userId) {
    try {
      const routeDb = await readDb();
      routeUser = (routeDb.users || []).find((entry) => entry.id === userId && !isSoftDeleted(entry)) || null;
    } catch {}
  }
  const mulerouterDecision = await mulerouterAliyun.decideVideo({
    user: routeUser,
    capability: resolvedCapability,
    media: upstreamMedia,
    parameters,
    prompt,
  });
  if (mulerouterDecision.use) {
    console.log("[mulerouter-video-submit]", JSON.stringify({
      capability: resolvedCapability,
      slug: mulerouterDecision.slug,
      username: routeUser?.username || "",
      forced: mulerouterAliyun.userForced(routeUser),
    }));
    const submitted = await mulerouterAliyun.submit(mulerouterDecision);
    return {
      task: submitted.task,
      payload: mulerouterDecision.body,
      raw: submitted.raw,
      capability: resolvedCapability,
      upstreamSource: "mulerouter",
      upstreamModel: mulerouterDecision.slug,
    };
  }
  if (mulerouterAliyun.mulerouterOnlyCapability(resolvedCapability)) {
    const reason = !mulerouterDecision.use ? mulerouterDecision.reason : "mulerouter-route-inactive";
    const error = new Error(
      `${resolvedCapability} is served exclusively by Mulerouter and cannot fall back to Alibaba Cloud (${reason || "route unavailable"}).`,
    );
    error.statusCode = mulerouterDecision.reason === "aliyun-default" ? 503 : 400;
    error.code = mulerouterDecision.reason === "aliyun-default" ? "MULEROUTER_ROUTE_UNAVAILABLE" : "MULEROUTER_VIDEO_REQUEST_UNSUPPORTED";
    error.details = { capability: resolvedCapability, reason, slug: mulerouterDecision.slug || "" };
    throw error;
  }
  if (mulerouterDecision.reason && mulerouterDecision.reason !== "aliyun-default" && mulerouterDecision.reason !== "no-mulerouter-equivalent") {
    console.log("[mulerouter-video-fallback]", JSON.stringify({
      capability: resolvedCapability,
      reason: mulerouterDecision.reason,
      username: routeUser?.username || "",
    }));
  }
  console.log("[aliyun-video-submit-advanced]", JSON.stringify({
    capability: resolvedCapability,
    model: payload.model,
    mediaTypes: upstreamMedia.map((item) => item.type),
    mediaHosts: upstreamMedia.map((item) => {
      try {
        return new URL(item.url).host;
      } catch {
        return "";
      }
    }),
    promptLength: prompt.length,
    parameters: payload.parameters,
  }, null, 2));
  const prime = resolvedCapability === "wan30-video-prime";
  let raw;
  try {
    raw = await aliyunDashscopeRequest(request.endpoint, {
      method: "POST",
      body: payload,
      asyncTask: true,
      provider,
      prime,
    });
  } catch (error) {
    // Keep production resilient while the dedicated node is being enabled.
    // A failed Agentic Mobile submission is retried once through the legacy
    // Prime endpoint; non-Prime capabilities are unaffected.
    if (!prime || !ALIYUN_WAN30_PRIME_API_KEY) throw error;
    console.warn("[aliyun-video-prime-fallback] Agentic Mobile request failed; retrying legacy Wan endpoint", error?.message || error);
    raw = await aliyunDashscopeRequest(request.endpoint, {
      method: "POST",
      body: payload,
      asyncTask: true,
      provider,
      prime: false,
    });
  }
  return { task: normalizeWan27Task(raw), payload, raw, capability: resolvedCapability, upstreamSource: "aliyun", upstreamModel: payload.model || "" };
}

