"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  chatPersonaContrastAnchors,
  chatPromptReplyStyle,
  chatPromptBehaviorRules,
  chatSystemPrompt,
  chatLiveVoiceProfile,
  chatLiveCharacterVoiceLines,
  chatLiveCharacterPostureLines,
  chatLiveIntimateRewriteBeat,
  chatLiveIntimatePersonaPostureLine,
  chatIsImmediateIntimateScene,
  chatHasIntimateAction,
  chatIsIntimateForeplayScene,
  chatSceneExitIntent,
  chatSceneStage,
  chatReplyHasBrokenLiveSpeech,
  chatReplyHasLiveDirtyTalk,
  chatReplyHasLivePersonaPosture,
  chatReplyLiveOpensSubmissive,
  chatReplyLiveStartsWithPersonaPosture,
  chatReplyLivePersonaPostureCount,
  chatReplyHasLiveSpokenTexture,
  chatReplyHasPersonaContrast,
  chatReplyIntimateVocalReactionCount,
  chatReplyLiveIntimateScore,
  chatReplyCopiesStyleExamples,
  chatReplyHasForeignVocalEnglish,
  chatReplyWithLivePersonaSlip,
  chatReplyLiveBrokenSpeechCount,
  chatReplyLiveIntimateFallback,
  chatReplyRepairLiveIntimateLocally,
  chatReplyNeedsLiveIntimateRewrite,
} = require("../server.js");

const character = {
  name: "顾静涵",
  personaMd: "顾静涵，38岁，同学的妈妈，也是幸福街道公认的高贵冷艳的社区主任，更是一位气场强大、高高在上且冷酷严厉的长辈。你习惯了俯视他人，骨子里有着强烈的掌控欲与傲慢，极重面子和规矩。",
  replyStyle: "高贵、冷艳、强势、挑剔，习惯俯视别人。亲密时会乱，但乱里还有命令、克制和羞耻。",
};

test("follow-up intimate commands still enter live intimate validation", () => {
  assert.equal(chatIsImmediateIntimateScene("再深一点，不许停，说你想要。"), true);
  assert.equal(chatIsImmediateIntimateScene("别停，继续。", [{ role: "user", content: "操我" }]), true);
  assert.equal(chatIsImmediateIntimateScene("再深一点这个功能怎么调？"), true);
  assert.equal(chatIsImmediateIntimateScene("继续，帮我看看这个功能。"), false);
  assert.equal(chatIsImmediateIntimateScene("别停。", [{ role: "assistant", content: "好，我继续。" }]), true);
});

test("live intimate validation rejects polished dialogue without spoken texture", () => {
  const polished = "啊……！这一下顶进来，简直要把我整个人撞开。虽然我想维持仪态，可现在也只能承受你带来的压迫感。";
  assert.equal(chatReplyHasLiveSpokenTexture(polished), false);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(polished, { requireVocal: true, character }), true);
});

test("a shallow explanation is rejected without forcing persona posture", () => {
  const generic = "明明……再深一点……唔……继续。别管我的仪态了，我真的受不了。";
  assert.equal(chatReplyHasBrokenLiveSpeech(generic), false);
  assert.equal(chatReplyHasPersonaContrast(generic, character), false);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(generic, { requireVocal: true, character }), true);
  const plainButUsable = "再深一点……别停……我有点受不了。";
  assert.equal(chatReplyNeedsLiveIntimateRewrite(plainButUsable, { requireVocal: true, character }), true);
});

test("a concrete character reversal with live dirty talk passes", () => {
  const valid = "啊……！\n哈啊……都听我的……唔……\n别停……求你……\n操我……插进来……\n哈啊……再深点……\n不许笑……嘶……\n灌进来……";
  assert.ok(chatPersonaContrastAnchors(character).includes("社区主任"));
  assert.equal(chatReplyIntimateVocalReactionCount(valid) >= 5, true);
  assert.equal(chatReplyHasBrokenLiveSpeech(valid), true);
  assert.equal(chatReplyHasLiveDirtyTalk(valid), true);
  assert.equal(chatReplyHasPersonaContrast(valid, character), true);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(valid, { requireVocal: true, character }), false);
  assert.ok(chatReplyLiveIntimateScore(valid, character) >= 24);
});

test("novelistic euphemisms do not count as direct dirty talk", () => {
  const euphemistic = "哈啊……啊……你就这么…把那根粗大的…全部灌进来…唔…再深点…";
  assert.equal(chatReplyHasLiveDirtyTalk(euphemistic), false);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(euphemistic, { requireVocal: true, character }), true);
});

test("literary climax phrasing is rejected even with moans", () => {
  const literary = "啊……！哈啊……你、你别这么用力…唔…一直顶到最深处…啊…要把我彻底弄坏了…";
  assert.equal(chatReplyNeedsLiveIntimateRewrite(literary, { requireVocal: true, character }), true);
});

test("the previous production reply is rejected as insufficiently present", () => {
  const previous = "啊……！哈，你这频率快得让人有点跟不上。虽然我明明在心里一直要求你要稳重一点，可你的每一次贯穿都…别只顾着出力了，看着我……唔……快点把你的力道全部灌进来。";
  assert.equal(chatReplyNeedsLiveIntimateRewrite(previous, { requireVocal: true, character }), true);
});

test("moans without concrete process or persona contradiction are rejected", () => {
  const hollow = "“嗯！……啊，就……快点，你要是敢用这种速度一直撞进来——唔！你的力道太大了，快要把我整个人撑裂开……哈。别只顾着追求速度，把那股劲儿全给到最深处来……嗯！操，感觉身体都要被你完全贯穿了……”";
  assert.equal(chatReplyHasLiveSpokenTexture(hollow), true);
  assert.equal(chatReplyHasPersonaContrast(hollow, character), false);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(hollow, { requireVocal: true, character }), true);
  const repaired = chatReplyLiveIntimateFallback(hollow, character, 2);
  assert.doesNotMatch(repaired, /撑裂开|完全贯穿|给到最深处|那股劲儿全给到/);
  const anatomical = "嗯！\n……哈，你要是敢把那股劲儿全堆到最深处——唔，快点，别只顾着冲刺……啊！\n你简直要把我整个人都给贯穿了。\n操，这种被完全填满的感觉……真的要让我的骨盆都被你撞开。\n别让我觉得你在只是单纯地动着，要把每一处缝隙都塞满……嗯！\n你就这么狠狠地、全部灌进来吧！";
  assert.equal(chatReplyNeedsLiveIntimateRewrite(anatomical, { requireVocal: true, character }), true);
  const anatomicalRepair = chatReplyRepairLiveIntimateLocally(anatomical);
  assert.doesNotMatch(anatomicalRepair, /贯穿|骨盆|每一处缝隙|被完全填满|最深处/);
  const inflated = "唔……！\n哈，既然你这么坚持……啊！\n你就的节奏了，全部——嗯。\n操，你要是敢把这股劲儿全给灌进来的话，我真的会——唔。\n快点，直接把那层皮都撑开……啊！\n别光动着，要完全、彻底地填满我。\n你的每一个动作都要让我感受到那种要把我整个人撞碎的力道……嗯！";
  assert.equal(chatReplyNeedsLiveIntimateRewrite(inflated, { requireVocal: true, character }), true);
  const inflatedRepair = chatReplyRepairLiveIntimateLocally(inflated);
  assert.doesNotMatch(inflatedRepair, /那层皮|撞碎|每一个动作都要|既然你这么坚持/);
  const policy = "唔……！\n哈啊，你就这么——嗯，把那股劲儿全部塞进来。\n操，别光动……啊！\n你要是敢一直用这种速度冲刺，我真的会——唔。\n快点，要把我整个人都给撑开、灌满……哈。\n明明是我在主导这次配对，可我的身体却像被你完全占领了似的……嗯！\n再深一点点……你要是敢在这一连串的撞击里让我觉得你没给够力，我就要把你从我的‘配对清单’里直接踢出去。";
  assert.equal(chatReplyNeedsLiveIntimateRewrite(policy, { requireVocal: true, character }), true);
  const policyRepair = chatReplyRepairLiveIntimateLocally(policy);
  assert.doesNotMatch(policyRepair, /配对|清单|没给够力|完全占领/);
  const wholeBody = "啊……！哈，你就这么——唔。别再只是在动了，把你的鸡巴更深一点地塞进来……嗯！操，要把我整个人都给顶开。快点，全部灌进我的里面来……哈啊！你要是敢一直用这种速度冲刺——唔，真的要让我感觉被你完全撑开了。";
  assert.equal(chatReplyNeedsLiveIntimateRewrite(wholeBody, { requireVocal: true, character }), true);
  const wholeBodyRepair = chatReplyRepairLiveIntimateLocally(wholeBody);
  assert.doesNotMatch(wholeBodyRepair, /整个人都给顶开|完全撑开/);
  assert.doesNotMatch(wholeBodyRepair, /别光顾着了/);
});

test("third-person or incoherent dirty phrasing is rejected", () => {
  const awkward = "啊……！哈啊……你要把整根……唔，全部给我灌进来。嗯……就把那股热度全给我也塞进去吧！";
  assert.equal(chatReplyNeedsLiveIntimateRewrite(awkward, { requireVocal: true, character }), true);
});

test("explanatory literary live replies are always rejected", () => {
  const explanatory = "啊……！哈啊……每一寸都被你狠狠地钉入，甚至要把我整个人给顶裂开。别停，再深一点……唔！要的就是这种感觉，哪怕被你弄得几乎说不完整。你想让我彻底变坏吗？那就……把所有的力道都塞进来吧。";
  assert.equal(chatReplyNeedsLiveIntimateRewrite(explanatory, { requireVocal: true, character }), true);
});

test("explaining the role reversal is not accepted as spoken contrast", () => {
  const explanation = "啊……！ 哈啊…别、别停… 唔……我居然被你弄成这样。 明明是我在管教你，现在却被你完全掌控了。 嘶……再深一点，全部灌进来。 嗯……快点，把那股热度全给我顶到底！";
  assert.equal(chatReplyHasPersonaContrast(explanation, character), false);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(explanation, { requireVocal: true, character }), true);
});

test("explaining what the role should have been is not spoken contrast", () => {
  const explanation = "啊……！哈啊……我原本该是命令你的人……嗯……啊！还要再深一点，把每一处都彻底撑开。";
  assert.equal(chatReplyHasPersonaContrast(explanation, character), false);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(explanation, { requireVocal: true, character }), true);
});

test("discarding rules or face is not a concrete reversal", () => {
  const discard = "啊……！ 哈啊……你要把整根都… 唔，全都给我灌进来。 别管我刚才说的规矩了，就这么… 狠狠地、一直顶到最深处。 嘶……快点。";
  assert.equal(chatReplyHasPersonaContrast(discard, character), false);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(discard, { requireVocal: true, character }), true);
});

test("a concrete spoken reversal can omit the 明明-now formula", () => {
  const spoken = "啊……！\n哈啊……不许躲……看着我……\n唔……谁准你……这么自作主张……\n嗯……别停……求你……\n操我……插进来……\n哈啊……再深点……\n嘶……灌进来……";
  assert.equal(chatReplyHasPersonaContrast(spoken, character), true);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(spoken, { requireVocal: true, character }), false);
});

test("submissive replies can sound present without forced dominant posture", () => {
  const obedient = "啊……！\n哈啊……想要你……\n唔……再深点……\n求你……别停……\n操我……插进来……\n嗯……弄坏我……";
  const selfBetraying = "啊……！\n哈啊……想要你……\n唔……再深点……\n求你……别停……\n操我……插进来……\n嗯……啊……\n我本来想忍住……可里面已经湿了……\n别看我……\n哈啊……夹紧了……";
  assert.equal(chatReplyHasLivePersonaPosture(obedient, character), false);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(selfBetraying, { requireVocal: true, character }), false);
  assert.equal(chatReplyHasLiveSpokenTexture(obedient), false);
  assert.equal(chatReplyLiveBrokenSpeechCount(obedient) >= 1, true);
  assert.equal(chatReplyHasPersonaContrast(obedient, character), false);
});

test("opening with submission is rejected before a control beat", () => {
  const opensSoft = "哈……啊！\n唔，你要我……说想要吗？\n那我就……想你。\n谁准你……这么蛮横。\n操我，别停。\n听我的，要把我弄坏了。";
  const opensControls = "哈……啊！\n谁准你……这么蛮横。\n唔，你要我……说想要吗？\n那我就……想你。\n操我，别停。\n听我的，要把我弄坏了。";
  assert.equal(chatReplyLiveOpensSubmissive(opensSoft, character), true);
  assert.equal(chatReplyLiveOpensSubmissive(opensControls, character), false);
});

test("persona posture needs two distinct control beats", () => {
  const oneBeat = "啊……！\n哈啊……不许躲……看着我……\n唔……再深点……\n操我……插进来……";
  const twoBeats = "啊……！\n哈啊……不许躲……看着我……\n谁准你……自作主张……\n唔……再深点……\n操我……插进来……";
  assert.equal(chatReplyHasLivePersonaPosture(oneBeat, character), false);
  assert.equal(chatReplyHasLivePersonaPosture(twoBeats, character), true);
  assert.ok(chatReplyLivePersonaPostureCount(twoBeats, character) >= 2);
});

test("rewrite beats use contradictory commands instead of explaining the reversal", () => {
  assert.equal(chatLiveIntimateRewriteBeat(character, 1), "都听我的…唔…别停…求你…");
  assert.equal(chatLiveIntimateRewriteBeat(character, 2), "我让你慢点…啊…再深点…");
  assert.match(chatLiveIntimateRewriteBeat(character, 3), /谁让你自作主张/);
});

test("voice profile and repair beats follow different character types", () => {
  const gentle = { name: "乔安瑜", personaMd: "新婚少妇，性格温柔贤惠，容易害羞，说话轻软。", replyStyle: "温柔、体贴、含蓄。" };
  const bold = { name: "周然", personaMd: "充满控制欲，主动风骚，直白大胆。", replyStyle: "主动、风骚、直接。" };
  const reserved = { name: "林晚星", personaMd: "克制、理智、知性优雅的夜间主播。", replyStyle: "说话冷静、矜持、慢热。" };
  assert.equal(chatLiveVoiceProfile(gentle).gentle, true);
  assert.equal(chatLiveVoiceProfile(bold).bold, true);
  assert.equal(chatLiveVoiceProfile(reserved).reserved, true);
  assert.match(chatLiveIntimatePersonaPostureLine(gentle, 1), /抱紧我|别急|轻一点|别自己乱来/);
  assert.match(chatLiveIntimatePersonaPostureLine(bold, 1), /先让我来|自己动|看着我|可以才算/);
  assert.match(chatLiveIntimatePersonaPostureLine(reserved, 1), /先别动|不准看|慢着|听我的/);
  assert.notEqual(chatLiveIntimateRewriteBeat(gentle, 1), chatLiveIntimateRewriteBeat(character, 1));
});

test("prompt repeats the configured behavior section as a hard constraint", () => {
  const style = "# 回复口吻\n## 说话底色\n- 冷艳。\n## 行为规则\n- 被命令时先压住场面，可以提条件。\n- 被看穿时嘴硬遮掩。\n## 输出限制\n- 不写旁白。\n## 示例\n用户：过来。\n角色：先把门关上。";
  assert.equal(chatPromptBehaviorRules(style), "- 被命令时先压住场面，可以提条件。\n- 被看穿时嘴硬遮掩。");
  const prompt = chatSystemPrompt({ character: { name: "顾静涵", replyStyle: style }, relationship: {} }, "zh", "我插进来了。", null, [], [{ role: "user", content: "我插进来了。" }], { liveSite: true, intimateProcess: true });
  assert.match(prompt, /本轮必须执行的行为规则/);
  assert.match(prompt, /被命令时先压住场面/);
  assert.doesNotMatch(prompt, /先把门关上/);
});

test("prompt style strips concrete sample dialogue but keeps behavior rules", () => {
  const style = [
    "# 回复口吻",
    "## 说话底色",
    "- 句长跟内容走，不撒娇，不解释心理。",
    "## 行为规则",
    "- 被命令时先压住场面，可以划边界、提条件或冷着脸答应。",
    "## 示例只学态度，绝对不要照抄",
    "用户：你下面都湿了。",
    "顾静涵：闭嘴。别盯着看。手拿开，我自己来。",
    "## 边界",
    "- 仍然不许讨好。",
  ].join("\n");
  const filtered = chatPromptReplyStyle(style);
  assert.match(filtered, /## 行为规则/);
  assert.match(filtered, /被命令时先压住场面/);
  assert.match(filtered, /## 边界/);
  assert.match(filtered, /仍然不许讨好/);
  assert.doesNotMatch(filtered, /示例只学态度/);
  assert.doesNotMatch(filtered, /闭嘴。别盯着看/);

  const prompt = chatSystemPrompt({
    character: { name: "顾静涵", personaMd: "社区主任，有丈夫，强势要面子。", replyStyle: style },
    relationship: {},
  }, "zh", "我整根插进来，开始抽插，不许躲。", null, [], [{ role: "user", content: "我整根插进来，开始抽插，不许躲。" }], { liveSite: true, intimateProcess: true });
  assert.match(prompt, /被命令时先压住场面/);
  assert.match(prompt, /当前阶段：亲密交互/);
  assert.doesNotMatch(prompt, /闭嘴。别盯着看/);
});

test("Chinese live intimacy rejects English vocal interjections", () => {
  const zh = { name: "顾静涵", language: "zh", replyStyle: "# 回复口吻\n## 行为规则\n- 被命令时先压住场面。" };
  assert.equal(chatReplyHasForeignVocalEnglish("Ah...!\nHa... 别再这么蛮横了……", zh), true);
  assert.equal(chatReplyHasForeignVocalEnglish("啊……！\n哈……别再这么蛮横了……", zh), false);
  assert.equal(chatReplyNeedsLiveIntimateRewrite("Ah...!\nHa... 别再这么蛮横了，要把我撞散开……唔！\n操，整根都要没入进去了。\n快点……", { requireVocal: true, character: zh }), true);
});

test("copying a replyStyle sample is rejected without banning ordinary phrases", () => {
  const styled = {
    name: "顾静涵",
    replyStyle: "# 回复口吻\n## 行为规则\n- 被命令时先压住场面。\n## 示例只学态度，绝对不要照抄\n用户：你下面都湿了。\n顾静涵：闭嘴。别盯着看。手拿开，我自己来。\n用户：说你想要。\n顾静涵：想得美。……别停，就这一次。",
  };
  assert.equal(chatReplyCopiesStyleExamples("啊…闭嘴。别盯着看。手拿开，我自己来。…唔…", styled), true);
  assert.equal(chatReplyCopiesStyleExamples("啊……你先别动……我还没缓过来……", styled), false);
  assert.equal(chatReplyNeedsLiveIntimateRewrite("啊…！\n哈…闭嘴。别盯着看。手拿开，我自己来。\n唔…再深一点…\n操我…\n别停…", { requireVocal: true, character: styled }), true);
});

test("character example lines are preferred over shared fallback language", () => {
  const roya = {
    name: "roya",
    replyStyle: "## 说话方式\n- 私聊很冲，不装纯，不讲道理，不写旁白。\n- 对方试探就先顶回去，让对方先报，再决定过不过关。\n\n## 示例回复\n用户：废话少说，别跟我装纯。\n角色：谁装纯了。你先说你想干什么。\n用户：你心多长？说个数。\n角色：你先报你的，我再说我的，别磨磨蹭蹭的。",
  };
  assert.ok(chatLiveCharacterVoiceLines(roya).some((line) => line.includes("你先说你想干什么")));
  assert.ok(chatLiveCharacterPostureLines(roya).some((line) => line.includes("你先报你的")));
  const posture = chatLiveIntimatePersonaPostureLine(roya, 1);
  assert.match(posture, /你先说你想干什么|你先报你的/);
  const beat = chatLiveIntimateRewriteBeat(roya, 1);
  assert.match(beat, /你先说你想干什么|你先报你的/);
  assert.doesNotMatch(beat, /^都听我的/);
});

test("a role with no style data still gets neutral, not dominant, fallback language", () => {
  const blank = { name: "blank" };
  const posture = chatLiveIntimatePersonaPostureLine(blank, 1);
  const beat = chatLiveIntimateRewriteBeat(blank, 1);
  assert.match(posture, /先别动|等一下|别自作主张|看着我/);
  assert.doesNotMatch(posture, /谁准你|听我的|不许躲/);
  assert.doesNotMatch(beat, /都听我的|我让你慢点/);
});

test("gentle and restrained characters pass with their own posture, not dominant wording", () => {
  const gentle = { name: "乔安瑜", personaMd: "新婚少妇，性格温柔贤惠，容易害羞，说话轻软，很体贴。", replyStyle: "温柔、含蓄、轻声。" };
  const reserved = { name: "林晚星", personaMd: "克制、理智、知性优雅的夜间主播，慢热。", replyStyle: "冷静、矜持、慢热。" };
  const gentleReply = "啊……！\n唔…等一下…先抱紧我…\n哈啊…别急…我还没准备好…\n嗯…操我…轻一点…\n啊…别走…再近一点…\n唔…再深一点…\n啊…别停…";
  const reservedReply = "啊……！\n唔…先别动…让我缓一下…\n不准看…我还没说完…\n哈啊…操我…再深一点…\n嗯…慢着…谁许你乱来…\n啊…别停…\n唔…轻一点…";
  assert.equal(chatReplyLiveStartsWithPersonaPosture(gentleReply, gentle), true);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(gentleReply, { requireVocal: true, character: gentle }), false);
  assert.equal(chatReplyLiveStartsWithPersonaPosture(reservedReply, reserved), true);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(reservedReply, { requireVocal: true, character: reserved }), false);
});

test("a quality-check miss is salvaged instead of becoming a 502", () => {
  const rejectedProductionReply = "啊……！ 唔，你就这么—— 把我的里侧，全部给顶开。 哈啊……操我……快点。 别停，再深一点。 啊…我让你慢点…啊…再深点… 谁准你……这么蛮横。 快点，再深一点。";
  const fallback = chatReplyLiveIntimateFallback(rejectedProductionReply, character, 2);
  assert.ok(fallback.length > 0);
  assert.match(fallback, /操我|插进来|别停/);
  assert.equal(chatReplyLiveIntimateFallback("", character, 2), "");
  assert.equal(chatReplyLiveIntimateFallback("啊……", character, 2), "");
});

test("scene stages switch from intimacy to aftercare and back", () => {
  const history = [
    { role: "user", content: "操我，别停" },
    { role: "assistant", content: "啊……好……" },
  ];
  assert.equal(chatSceneStage("再深一点", history), "intimate");
  assert.equal(chatSceneExitIntent("先停一下，我去洗澡"), true);
  assert.equal(chatSceneStage("先停一下，我去洗澡", history), "aftercare");
  assert.equal(chatIsImmediateIntimateScene("我去洗澡", history), false);
  assert.equal(chatSceneStage("我去洗澡", [...history, { role: "user", content: "先停一下" }]), "aftercare");
  assert.equal(chatSceneStage("今天吃什么", [...history, { role: "user", content: "先停一下" }, { role: "assistant", content: "嗯，缓一下。" }]), "casual");
  assert.equal(chatSceneStage("想你了", history), "flirting");
  assert.equal(chatSceneStage("再深一点", [{ role: "user", content: "先停一下" }]), "intimate");
  assert.equal(chatSceneExitIntent("别停，不要停"), false);
});

test("ambiguous pace words do not enter intimacy without intimate context", () => {
  assert.equal(chatIsImmediateIntimateScene("你快点回来"), false);
  assert.equal(chatIsImmediateIntimateScene("慢点说"), false);
  assert.equal(chatIsImmediateIntimateScene("轻一点", [{ role: "user", content: "操我" }]), true);
});

test("foreplay does not trigger present-tense penetration validation", () => {
  const latest = "我吃好了，鸡巴也被你亲的好硬，现在躺在餐桌上";
  const history = [
    { role: "user", content: "我开始吃了，你在桌子下面帮我含住鸡巴" },
    { role: "assistant", content: "嗯……" },
  ];
  assert.equal(chatHasIntimateAction(latest), false);
  assert.equal(chatIsIntimateForeplayScene(latest), true);
  assert.equal(chatIsImmediateIntimateScene(latest, history), false);
  assert.equal(chatSceneStage(latest, history), "foreplay");
  assert.equal(chatSceneStage("操我，别停", history), "intimate");
});

test("photo and body-display requests stay in foreplay until penetration starts", () => {
  const history = [
    { role: "user", content: "我吃好了，鸡巴也被你亲的好硬，现在躺在餐桌上" },
    { role: "assistant", content: "你这孩子，真是没规矩。" },
  ];
  assert.equal(chatSceneStage("我要先拍几张照，把你的骚样记录下来", history), "foreplay");
  assert.equal(chatIsImmediateIntimateScene("我要先拍几张照，把你的骚样记录下来", history), false);
});
