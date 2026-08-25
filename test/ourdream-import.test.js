"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  adultCandidateAllowed,
  buildExploreItem,
  staticCoverUrl,
  videoUrlsFor,
} = require("../scripts/import-ourdream-explore");

test("OurDream card cover is the first non-video display image", () => {
  const candidate = {
    displayImageUrls: [
      "https://vid.ourdream.ai/hover-preview",
      "https://img.ourdream.ai/thumb/card-cover",
      "https://img.ourdream.ai/thumb/second-image",
    ],
  };
  assert.equal(staticCoverUrl(candidate), "https://img.ourdream.ai/thumb/card-cover");
  assert.deepEqual(videoUrlsFor(candidate), ["https://vid.ourdream.ai/hover-preview"]);
});

test("Explore item keeps the card cover separate from imported videos", () => {
  const candidate = {
    sourceCharacterId: "12345678-abcd",
    sourceDisplayId: "sample-character",
    sourceProfileUrl: "https://ourdream.ai/c/sample-character",
    name: "Sample",
    title: "Sample title",
    description: "Sample description",
    age: 25,
    gender: "Female",
    tags: [],
  };
  const item = buildExploreItem(candidate, {
    coverUrl: "https://media.example/assets/cover.jpg",
    posterUrls: ["https://media.example/assets/poster-1.jpg", "https://media.example/assets/poster-2.jpg"],
    videoUrls: ["https://media.example/assets/video-1.mp4", "https://media.example/assets/video-2.mp4"],
  });
  assert.equal(item.posterUrl, "https://media.example/assets/cover.jpg");
  assert.equal(item.cdnImageUrl, "https://media.example/assets/cover.jpg");
  assert.equal(Object.values(item.homeSceneVideos)[0].cdnVideoUrl, "https://media.example/assets/video-1.mp4");
  assert.equal(Object.values(item.unlockVideos)[0].cdnVideoUrl, "https://media.example/assets/video-2.mp4");
  assert.equal(item.videoCount, 2);
});

test("OurDream import rejects minors and blocked minor tags", () => {
  assert.equal(adultCandidateAllowed({ age: 17, tags: [] }), false);
  assert.equal(adultCandidateAllowed({ age: 22, tags: ["loli"] }), false);
  assert.equal(adultCandidateAllowed({ age: 18, tags: ["Teen", "Female"] }), true);
});
