"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  chatPersonaContrastAnchors,
  chatLiveVoiceProfile,
  chatLiveCharacterVoiceLines,
  chatLiveCharacterPostureLines,
  chatLiveIntimateRewriteBeat,
  chatLiveIntimatePersonaPostureLine,
  chatIsImmediateIntimateScene,
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
  chatReplyWithLivePersonaSlip,
  chatReplyLiveIntimateFallback,
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
  assert.equal(chatIsImmediateIntimateScene("别停，继续。"), false);
  assert.equal(chatIsImmediateIntimateScene("别停。", [{ role: "assistant", content: "好，我继续。" }]), false);
});

test("live intimate validation rejects polished dialogue without spoken texture", () => {
  const polished = "啊……！这一下顶进来，简直要把我整个人撞开。虽然我想维持仪态，可现在也只能承受你带来的压迫感。";
  assert.equal(chatReplyHasLiveSpokenTexture(polished), false);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(polished, { requireVocal: true, character }), true);
});

test("generic moans and a shallow contrast phrase are not enough", () => {
  const generic = "明明……再深一点……唔……继续。别管我的仪态了，我真的受不了。";
  assert.equal(chatReplyHasBrokenLiveSpeech(generic), false);
  assert.equal(chatReplyHasPersonaContrast(generic, character), false);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(generic, { requireVocal: true, character }), true);
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

test("submissive live replies fail even when they have sounds and dirty words", () => {
  const obedient = "啊……！\n哈啊……想要你……\n唔……再深点……\n求你……别停……\n操我……插进来……\n嗯……弄坏我……";
  assert.equal(chatReplyHasLivePersonaPosture(obedient), false);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(obedient, { requireVocal: true, character }), true);
});

test("opening with submission is rejected before a control beat", () => {
  const opensSoft = "哈……啊！\n唔，你要我……说想要吗？\n那我就……想你。\n谁准你……这么蛮横。\n操我，别停。\n听我的，要把我弄坏了。";
  const opensControls = "哈……啊！\n谁准你……这么蛮横。\n唔，你要我……说想要吗？\n那我就……想你。\n操我，别停。\n听我的，要把我弄坏了。";
  assert.equal(chatReplyLiveOpensSubmissive(opensSoft, character), true);
  assert.equal(chatReplyLiveOpensSubmissive(opensControls, character), false);
});

test("repair moves persona control ahead of a submissive opening", () => {
  const draft = "哈……啊！ 唔，你要我…… 说想要吗？ 那我就……想你。 谁准你……这么蛮横。 啊！操我，别停。 嗯……快点，插进来。 听我的，要把我...弄坏了。";
  const repaired = chatReplyWithLivePersonaSlip(draft, character, 2);
  assert.equal(chatReplyLiveOpensSubmissive(repaired, character), false);
  assert.equal(chatReplyHasLivePersonaPosture(repaired, character), true);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(repaired, { requireVocal: true, character }), false);
});

test("a soft phrase before control in the same line still opens submissive", () => {
  const sameLine = "啊……！\n唔，你要我... 听我的，别只顾着动。\n哈啊……操我…… 插进来…\n谁准你...这么蛮横。";
  const repaired = chatReplyWithLivePersonaSlip(sameLine, character, 2);
  assert.equal(chatReplyLiveOpensSubmissive(sameLine, character), true);
  assert.equal(chatReplyLiveOpensSubmissive(repaired, character), false);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(repaired, { requireVocal: true, character }), false);
});

test("the first effective live line must show persona control", () => {
  const actionFirst = "啊……！\n唔，你就这么——把我的里侧，全部给顶开。\n谁准你……这么蛮横。\n快点，再深一点。";
  const controlFirst = "啊……！\n啊…谁准你…这么自作主张…\n唔，你就这么——把我的里侧，全部给顶开。\n快点，再深一点。";
  assert.equal(chatReplyLiveStartsWithPersonaPosture(actionFirst, character), false);
  assert.equal(chatReplyLiveStartsWithPersonaPosture(controlFirst, character), true);
  const repaired = chatReplyWithLivePersonaSlip(actionFirst, character, 2);
  assert.equal(chatReplyLiveStartsWithPersonaPosture(repaired, character), true);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(repaired, { requireVocal: true, character }), false);
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

test("bold non-dominant character repair does not get stuck on contrast validation", () => {
  const bold = { name: "温芷瑜", personaMd: "对年轻强壮的学生有渴望，坦然、专业、毫无羞耻。", replyStyle: "风骚、开放、知性优雅。" };
  const draft = "哈啊……！ 唔，你就这么… 把老师弄得…快要碎了。 嗯…别急，慢点…… 啊！ 就把你的鸡巴……全都灌进来。 操，真的好深…… 哈啊——！";
  const repaired = chatReplyWithLivePersonaSlip(draft, bold, 2);
  assert.equal(chatReplyHasPersonaContrast(repaired, bold), true);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(repaired, { requireVocal: true, character: bold }), false);
});

test("a non-dominant character is not validated by dominant-only phrases", () => {
  const gentle = { name: "乔安瑜", personaMd: "新婚少妇，性格温柔贤惠，容易害羞，说话轻软，很体贴。", replyStyle: "温柔、含蓄、轻声。" };
  const dominantOnly = "哈啊……！\n啊…谁准你…这么自作主张…\n啊…我让你慢点…啊…再深点…\n唔…操我…别停…\n啊…插进来…";
  assert.equal(chatReplyLiveStartsWithPersonaPosture(dominantOnly, gentle), false);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(dominantOnly, { requireVocal: true, character: gentle }), true);
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

test("repair fallback varies with the character instead of appending one canned coda", () => {
  const quiet = { name: "A", personaMd: "她很安静，从来不肯先服软。" };
  const proud = { name: "B", personaMd: "她是强势的社区主任，极重规矩和面子。" };
  const draft = "啊……！哈……你要把整根都…唔，全都给我灌进来。";
  const first = chatReplyWithLivePersonaSlip(draft, quiet, 1);
  const second = chatReplyWithLivePersonaSlip(draft, proud, 1);
  assert.notEqual(first, second);
  assert.doesNotMatch(first, /哈…操我…插进来…再深点…/);
  assert.doesNotMatch(first, /彻底.{0,8}(?:弄坏|撑开|顶开)|最深处|每一处|每一寸|那根粗大的/);
  const repeated = "啊……！\n啊…我让你慢点…啊…再深点…\n哈啊……你要把整根…唔。\n啊…我让你慢点…啊…再深点…\n哈…操我…\n唔…插进来…\n啊…别停…";
  const deduped = chatReplyWithLivePersonaSlip(repeated, proud, 1);
  assert.equal(deduped.split("\n").filter((line) => /啊…我让你慢点…啊…再深点…/.test(line)).length, 1);
  assert.ok(chatReplyHasLivePersonaPosture(deduped, proud));
});

test("repair removes the whole role-history sentence before adding a slip", () => {
  const draft = "啊……！哈啊……你就这么…狠狠地。嘶——别停，再深一点！明明我是该管教你的人……嗯……啊！还要再深一点，把我的每一处都彻底撑开。";
  const repaired = chatReplyWithLivePersonaSlip(draft, character, 2);
  assert.doesNotMatch(repaired, /明明|管教|每一处/);
  assert.match(repaired, /再深一点/);
  assert.equal(chatReplyHasLivePersonaPosture(repaired, character), true);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(repaired, { requireVocal: true, character }), false);
});

test("weak live drafts are repaired with a concrete persona slip", () => {
  const draft = "啊……！哈……你要把整根都…唔，全都给我灌进来。别管我刚才说的规矩了，就这么……狠狠地、一直顶到底。嘶……快点，再深一点。";
  const repaired = chatReplyWithLivePersonaSlip(draft, character, 1);
  assert.match(repaired, /都听我的/);
  assert.match(repaired, /求你/);
  assert.doesNotMatch(repaired, /别管/);
  assert.ok(chatLiveIntimatePersonaPostureLine(character, 1));
  assert.equal(chatReplyHasLivePersonaPosture(repaired, character), true);
  assert.equal(chatReplyNeedsLiveIntimateRewrite(repaired, { requireVocal: true, character }), false);
});

test("a quality-check miss is salvaged instead of becoming a 502", () => {
  const rejectedProductionReply = "啊……！ 唔，你就这么—— 把我的里侧，全部给顶开。 哈啊……操我……快点。 别停，再深一点。 啊…我让你慢点…啊…再深点… 谁准你……这么蛮横。 快点，再深一点。";
  const fallback = chatReplyLiveIntimateFallback(rejectedProductionReply, character, 2);
  assert.ok(fallback.length > 0);
  assert.match(fallback, /操我|插进来|别停/);
  assert.equal(chatReplyLiveIntimateFallback("", character, 2), "");
  assert.equal(chatReplyLiveIntimateFallback("啊……", character, 2), "");
});
