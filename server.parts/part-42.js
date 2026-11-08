async function serveStatic(req, res, url) {
  const requestHost = requestHostname(req);
  const tenant = requestTenantDescriptor(req);
  const chatTenantRequest = tenant.toolId === "chat";
  const liveTenantRequest = tenant.toolId === "live";
  const standaloneLandingRequest = standaloneLandingHostname(requestHost);
  const liveStaticSurfaceRequest = liveTenantRequest || standaloneLandingRequest;
  let pathname = decodeURIComponent(url.pathname === "/"
    ? (isPaymentHostRequest(req) ? "/pay.html" : isCmsHostRequest(req) ? "/admin.html" : chatTenantRequest ? "/chat.html" : liveTenantRequest ? "/live.html" : defaultPageForHostname(requestHost))
    : url.pathname);
  if (pathname === "/game" || pathname === "/game/") pathname = "/game.html";
  if (!publicStaticPath(pathname)) return sendText(res, 404, "Not Found");
  if (shouldBlockLiveOwnedStatic({
    pathname,
    toolId: tenant.toolId,
    hostname: requestHost,
    isPaymentHost: isPaymentHostRequest(req),
    isCmsHost: isCmsHostRequest(req),
    isStandaloneLandingHost: standaloneLandingRequest,
  })) {
    return sendText(res, 404, "Not Found");
  }
  if (isPaymentHostRequest(req)) {
    const allowedPaymentPath = pathname === "/pay.html"
      || pathname === "/pay.css"
      || pathname === "/pay.js"
      || pathname.startsWith("/assets/brand/")
      || pathname === "/favicon.ico"
      || pathname === "/favicon.svg";
    if (!allowedPaymentPath) return sendText(res, 404, "Not Found");
  }
  if (chatTenantRequest) {
    const allowedChatPath = pathname === "/chat.html"
      || pathname === "/chat.css"
      || pathname === "/chat.js"
      || pathname === "/chat-live.js"
      || pathname === "/favicon.ico"
      || pathname === "/favicon.svg"
      || pathname.startsWith("/assets/brand/")
      || pathname.startsWith("/assets/ourdream/")
      || pathname.startsWith("/assets/chat-live/gifts/");
    if (!allowedChatPath) return sendText(res, 404, "Not Found");
  }
  if (liveTenantRequest) {
    const allowedLivePath = pathname === "/live.html"
      || pathname === "/live.css"
      || pathname === "/live.js"
      || pathname === "/chat-live.js"
      || pathname === "/qrcode.js"
      || pathname === "/site-landing.html"
      || pathname === "/site-landing.css"
      || pathname === "/site-landing.js"
      || pathname === "/favicon.ico"
      || pathname === "/favicon.svg"
      || pathname === "/downloads/vipeak-live.apk"
      || pathname.startsWith("/assets/brand/")
      || pathname.startsWith("/assets/chat-live/gifts/")
      || pathname.startsWith("/assets/chat-live/moans/")
      || pathname.startsWith("/assets/chat-live/welcome-newcomer");
    if (!allowedLivePath) return sendText(res, 404, "Not Found");
  }
  const lockedUndressImageMatch = pathname.match(/^\/assets\/generated\/images\/([^/]+)\.[a-z0-9]+$/i);
  if (lockedUndressImageMatch) {
    const lockedRecord = await getGenerationRecord(lockedUndressImageMatch[1]);
    if (lockedRecord?.resultLocked === true && String(lockedRecord.localImageUrl || "") === pathname) {
      return sendText(res, 403, "Unlock required");
    }
  }
  if (undressToolRequestAllowed(req)) {
    const allowedToolPath = pathname === "/platform.html"
      || pathname === "/platform.css"
      || pathname === "/tool-undress.css"
      || /^\/platform(?:\.[a-z0-9-]+)?\.js$/i.test(pathname)
      || pathname.startsWith("/vendor/")
      || pathname.startsWith("/assets/")
      || pathname === "/favicon.ico"
      || pathname === "/favicon.svg";
    if (!allowedToolPath) return sendText(res, 404, "Not Found");
  }
  if (await isProtectedUnlockAssetPath(pathname)) {
    return sendText(res, 403, "Unlock required");
  }
  const staticRoot = liveStaticSurfaceRequest ? LIVE_STATIC_ROOT : ROOT;
  const filePath = path.normalize(path.join(staticRoot, pathname));
  const relativePath = path.relative(staticRoot, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return sendText(res, 403, "Forbidden");
  }

  const shouldRedirectAssetToR2 =
    (req.method === "GET" || req.method === "HEAD") &&
    pathname.startsWith("/assets/") &&
    !pathname.startsWith("/assets/brand/") &&
    !pathname.startsWith("/assets/showcase/") &&
    !pathname.startsWith("/assets/generated/") &&
    !pathname.startsWith("/assets/admin/voice-preview/") &&
    !DISABLE_R2_STORAGE &&
    R2.publicDomain &&
    !OSS_STORAGE_ENABLED;
  if (shouldRedirectAssetToR2) {
    const target = `${String(R2.publicDomain || "").replace(/\/+$/, "")}${pathname}${url.search || ""}`;
    res.writeHead(302, {
      location: target,
      "cache-control": "public, max-age=300",
    });
    return res.end();
  }

  if (req.method === "GET" && path.normalize(filePath) === path.normalize(path.join(ROOT, "platform.html"))) {
    return await servePlatformHtmlWithGeo(req, res);
  }
  if (path.normalize(filePath) === path.normalize(path.join(ROOT, "admin.html"))) {
    return await sendAdminHtml(req, res, filePath);
  }

  try {
    const contentType = mimeTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
    const stat = await fs.stat(filePath);
    const range = req.headers.range;

    if (contentType.startsWith("video/") && sendInternalAsset(res, filePath, contentType, stat)) return;
    if (filePath.startsWith(path.normalize(GENERATED_POSTER_DIR)) && sendInternalAsset(res, filePath, contentType, stat)) return;
    if (range && (contentType.startsWith("video/") || contentType.startsWith("audio/"))) {
      const match = range.match(/bytes=(\d*)-(\d*)/);
      const start = match?.[1] ? Number(match[1]) : 0;
      const end = match?.[2] ? Number(match[2]) : stat.size - 1;
      const chunkStart = Math.max(0, start);
      const chunkEnd = Math.min(stat.size - 1, end);

      if (chunkStart > chunkEnd || Number.isNaN(chunkStart) || Number.isNaN(chunkEnd)) {
        res.writeHead(416, { "content-range": `bytes */${stat.size}` });
        return res.end();
      }

      res.writeHead(206, {
        "content-type": contentType,
        "content-length": chunkEnd - chunkStart + 1,
        "content-range": `bytes ${chunkStart}-${chunkEnd}/${stat.size}`,
        "accept-ranges": "bytes",
        "cache-control": "public, max-age=604800, immutable",
      });

      if (req.method === "HEAD") return res.end();
      return pipeFileStream(res, filePath, { start: chunkStart, end: chunkEnd });
    }

    const isHtml = contentType === "text/html";
    const isVersionedAsset = Boolean(url.searchParams.get("v"));
    // Browsers reject service worker scripts that use no-store. Keep this
    // revalidated on each update while allowing the browser to store it.
    const isServiceWorker = pathname === "/platform-sw.js";
    const frontendNames = ["/admin.html", "/admin.css", "/admin.js", "/live.html", "/live.css", "/live.js", "/chat.html", "/chat.css", "/chat.js", "/chat-live.js", "/site-landing.html", "/site-landing.css", "/site-landing.js"];
    const isFrontendAsset = frontendNames.includes(pathname)
      || PLATFORM_ASSET_FILES.some((fileName) => pathname === `/${fileName}`)
      || ((liveTenantRequest || chatTenantRequest) && [".html", ".js", ".css"].includes(path.extname(pathname).toLowerCase()));
    /*
     * HTML must always revalidate so a deploy becomes visible immediately.
     * Versioned JS/CSS is content-addressed by its query string and may be
     * cached aggressively by browsers and the CDN. Previously every frontend
     * asset was forced through the Node process on every refresh, even though
     * the page already referenced a new ?v= build.
     */
    const isFrontendNoStore = isFrontendAsset && !isVersionedAsset;
    const isNoStoreResponse = (isFrontendNoStore || isHtml) && !isServiceWorker;
    const isLongCacheAsset =
      isVersionedAsset ||
      contentType.startsWith("image/") ||
      contentType.startsWith("font/") ||
      filePath.startsWith(path.normalize(path.join(ROOT, "assets", "ourdream")));
    const extension = path.extname(filePath).toLowerCase();
    const extraHeaders = extension === ".apk"
      ? { "content-disposition": `attachment; filename="${path.basename(filePath).replace(/["\\]/g, "")}"`, "x-content-type-options": "nosniff" }
      : extension === ".mobileconfig"
        ? { "x-content-type-options": "nosniff" }
        : {};
    res.writeHead(200, {
      "content-type": contentType,
      "content-length": stat.size,
      "accept-ranges": contentType.startsWith("video/") || contentType.startsWith("audio/") ? "bytes" : "none",
      "cache-control": isNoStoreResponse
        ? "no-store, no-cache, must-revalidate, max-age=0"
        : isServiceWorker
          ? "no-cache, must-revalidate, max-age=0"
          : contentType.startsWith("video/") || isLongCacheAsset
          ? "public, max-age=31536000, immutable"
          : contentType.startsWith("text/")
            ? "no-cache"
            : "public, max-age=60",
      ...(isNoStoreResponse || isServiceWorker ? {
        pragma: "no-cache",
        expires: "0",
        "cdn-cache-control": "no-store",
        "cloudflare-cdn-cache-control": "no-store",
      } : {}),
      ...extraHeaders,
    });
    if (req.method === "HEAD") return res.end();
    return pipeFileStream(res, filePath);
  } catch (error) {
    if (error.code === "ENOENT") return sendText(res, 404, "Not Found");
    throw error;
  }
}

function playfluxTemplateTabForGalleryMode(mode = "") {
  const normalized = String(mode || "").trim().toLowerCase();
  if (normalized === "playflux-video") return "video";
  if (normalized === "playflux-image") return "image";
  if (normalized === "playflux-anime") return "anime";
  return "";
}

// Tool-only sites (for example the 123Tops video tool) render the same playflux
// template gallery, so they need the templates for the gallery modes they expose.
// Returning an empty list here leaves their home gallery blank.
function playfluxTemplatesForTenant(templates = [], tenantOptions = {}) {
  if (!tenantOptions?.toolOnly) return templates;
  const modes = Array.isArray(tenantOptions.allowedGalleryModes) ? tenantOptions.allowedGalleryModes : [];
  if (!modes.length) return templates;
  const tabs = new Set(modes.map(playfluxTemplateTabForGalleryMode).filter(Boolean));
  if (!tabs.size) return [];
  return templates.filter((item) => tabs.has(String(item?.tab || "").trim().toLowerCase()));
}

async function handlePosterImage(req, res, url) {
  const target = String(url.searchParams.get("url") || "").trim();
  if (!isManagedChatLiveAssetUrl(target)) return sendText(res, 400, "Bad image");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(target, { redirect: "error", signal: controller.signal });
    if (!response.ok) return sendText(res, 502, "Image unavailable");
    const type = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!type.startsWith("image/")) return sendText(res, 415, "Not an image");
    const body = Buffer.from(await response.arrayBuffer());
    if (!body.length || body.length > 8 * 1024 * 1024) return sendText(res, 413, "Image too large");
    res.writeHead(200, {
      "Content-Type": type,
      "Content-Length": body.length,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    if (!res.headersSent) sendText(res, 502, "Image unavailable");
  } finally {
    clearTimeout(timer);
  }
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    applyPublicSecurityHeaders(req, res);
    if (sendHttpsRedirect(req, res, url)) return;
    if (sendCanonicalRedirect(req, res, url)) return;
    // Analytics must never sit in the request critical path. Record it in the
    // background so HTML, static assets, and API calls are not delayed by DB IO.
    if (!requestTenantOptions(req).toolOnly) {
      recordGeoVisitStats(req, url).catch((error) => {
        console.warn("GEO visit stats failed", error.message || error);
      });
    }

    if ((req.method === "GET" || req.method === "HEAD") && (url.pathname === "/favicon.ico" || url.pathname === "/favicon.svg")) {
      return await handleFavicon(req, res);
    }

    // Serve the heavy platform HTML before geo/analytics work. This keeps the
    // first document available even when stats or geo enrichment are slow.
    if (isMainlandChinaRequest(req) && !isMainlandAdminAllowedRequest(req, url)) {
      if (requestHasMainlandBypass(req, url)) {
        setMainlandBypassCookie(res);
        if (shouldCleanBypassUrl(req, url)) {
          return redirectWithoutBypassParam(res, url);
        }
      } else {
        return sendMainlandBlocked(req, res, url);
      }
    } else if (url.searchParams.has(MAINLAND_BYPASS_QUERY_PARAM) && requestHasMainlandBypass(req, url)) {
      setMainlandBypassCookie(res);
      if (shouldCleanBypassUrl(req, url)) {
        return redirectWithoutBypassParam(res, url);
      }
    }

    if (req.method === "GET" && url.pathname === "/api/poster-image") {
      return await handlePosterImage(req, res, url);
    }

    if (req.method === "GET" && url.pathname === "/api/health") {
      if (undressToolRequestAllowed(req)) return sendJson(res, 200, { ok: true });
      return sendJson(res, 200, { ok: true });
    }

    if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/robots.txt") {
      return await handleRobotsTxt(req, res);
    }

    if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/sitemap.xml") {
      return await handleSitemapXml(req, res);
    }

    if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/llms.txt") {
      return await handleLlmsTxt(req, res);
    }

    if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/llms-full.txt") {
      return await handleLlmsTxt(req, res, { full: true });
    }

    if ((req.method === "GET" || req.method === "HEAD") && ["/privacy", "/privacy/", "/terms", "/terms/"].includes(url.pathname)) {
      const type = url.pathname.startsWith("/terms") ? "terms" : "privacy";
      return sendHtml(res, 200, publicLegalPageHtml(type, req), { cacheControl: "public, max-age=300", head: req.method === "HEAD" });
    }

    if ((req.method === "GET" || req.method === "HEAD") && isIndexNowKeyPath(req, url.pathname)) {
      return await handleIndexNowKey(req, res);
    }

    const geoDirectoryMatch = url.pathname.match(/^\/(characters|tags|categories)\/?$/);
    if ((req.method === "GET" || req.method === "HEAD") && geoDirectoryMatch) {
      const snapshot = await geoSiteSnapshot(req);
      if (snapshot.toolOnly) return sendText(res, 404, "Not Found", { head: req.method === "HEAD" });
      return sendHtml(res, 200, renderGeoDirectoryHtml(snapshot, { kind: geoDirectoryMatch[1] }), {
        cacheControl: "public, max-age=300, stale-while-revalidate=600",
        head: req.method === "HEAD",
      });
    }

    if (undressToolRequestAllowed(req) && url.pathname.startsWith("/api/") && !undressToolApiPathAllowed(req.method, url.pathname)) {
      return sendJson(res, 404, { ok: false, message: "API not found." });
    }

    const tagGeoMatch = url.pathname.match(/^\/tags\/([^/]+)\/?$/);
    if ((req.method === "GET" || req.method === "HEAD") && tagGeoMatch) {
      return await handleGeoTagPage(req, res, tagGeoMatch[1]);
    }

    const categoryGeoMatch = url.pathname.match(/^\/categories\/([^/]+)\/?$/);
    if ((req.method === "GET" || req.method === "HEAD") && categoryGeoMatch) {
      return await handleGeoCategoryPage(req, res, categoryGeoMatch[1]);
    }

    const characterGeoMatch = url.pathname.match(/^\/characters\/([^/]+)\/?$/);
    if ((req.method === "GET" || req.method === "HEAD") && characterGeoMatch) {
      return await handleCharacterGeoPage(req, res, characterGeoMatch[1]);
    }

    if (req.method === "GET" && url.pathname === "/api/config/public") {
      const tenantOptions = requestTenantOptions(req);
      const isToolOnly = Boolean(tenantOptions.toolOnly);
      const includeHomeItems = !isToolOnly || tenantOptions.toolId === "chat";
      const auth = getBearerToken(req) ? await getAuth(req, { loadDb: false }) : { user: null };
      if (auth.quarantined) return sendJson(res, 403, { ok: false, code: "ACCOUNT_QUARANTINED", message: "This account is under security review. Please contact support." });
      const cacheKey = `${requestHostname(req)}:${isToolOnly ? "tool" : "main"}`;
      let publicView = !auth.user ? publicConfigCache.get(cacheKey)?.value : null;
      if (!publicView || publicConfigCache.get(cacheKey)?.expiresAt <= Date.now()) {
        let config = await readAppConfig({ includeHomeItems });
        if (!isToolOnly) {
          // ensureSceneEntriesPersisted and refreshCompletedHomeVideoItems(config) are
          // intentionally deferred to background/admin flows; neither should
          // block the public bootstrap request.
        }
        publicView = await attachBillingViewToPublicConfig(
          publicConfig(config, publicOriginFromRequest(req), auth?.user ? auth : null, tenantOptions),
          req,
          auth?.user ? auth : null,
        );
        if (!auth.user) publicConfigCache.set(cacheKey, { value: publicView, expiresAt: Date.now() + 30_000 });
      }
      const cacheControl = getBearerToken(req)
        ? "private, no-store"
        : "public, max-age=30, s-maxage=30, stale-while-revalidate=120";
      return sendJson(res, 200, { ok: true, config: publicView }, { cacheControl });
    }

    if (req.method === "GET" && url.pathname === "/api/cases") {
      const auth = getBearerToken(req) ? await getAuth(req, { loadDb: false }) : { user: null };
      if (auth.quarantined) return sendJson(res, 403, { ok: false, code: "ACCOUNT_QUARANTINED", message: "This account is under security review. Please contact support." });
      const user = auth.user || {};
      const unlocked = userHasCreatorMembership(user);
      const view = showcaseCasesView(await readShowcaseCases(), unlocked);
      return sendJson(res, 200, {
        ok: true,
        unlocked,
        membershipRequired: !unlocked,
        previewLimitPerCategory: SHOWCASE_CASES_PREVIEW_LIMIT,
        totals: view.totals,
        previewCount: view.previewCount,
        lockedCount: view.lockedCount,
        items: view.items,
        membership: publicCreatorMembership(user),
      });
    }

    if (req.method === "GET" && url.pathname === "/api/platform/playflux-templates") {
      const tenantOptions = requestTenantOptions(req);
      const cacheKey = requestHostname(req);
      const cached = publicPlayfluxTemplatesCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return sendJson(res, 200, { ok: true, templates: cached.value }, { cacheControl: "public, max-age=300, s-maxage=300, stale-while-revalidate=600" });
      }
      const config = await readAppConfig({ includeHomeItems: false });
      const templates = playfluxTemplatesForTenant(
        Array.isArray(config.playfluxTemplates) ? config.playfluxTemplates : [],
        tenantOptions,
      );
      publicPlayfluxTemplatesCache.set(cacheKey, { value: templates, expiresAt: Date.now() + 300_000 });
      return sendJson(res, 200, { ok: true, templates }, { cacheControl: "public, max-age=300, s-maxage=300, stale-while-revalidate=600" });
    }

    if (req.method === "GET" && url.pathname === "/api/public/characters") {
      return await handlePublicCharacters(req, res, url);
    }

    if (req.method === "GET" && url.pathname === "/api/ourdream/presets") {
      try {
        const forceRefresh = url.searchParams.get("refresh") === "1";
        const presets = await getOurDreamPresetLibrary({ force: forceRefresh });
        return sendJson(res, 200, { ok: true, presets }, {
          cacheControl: forceRefresh
            ? "private, no-store, max-age=0"
            : "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
        });
      } catch (error) {
        console.error("[ourdream-presets-unavailable]", error.message || error);
        return sendJson(res, 503, {
          ok: false,
          code: "OURDREAM_CATALOG_UNAVAILABLE",
          message: "角色预设目录暂时不可用。",
        });
      }
    }

    if (req.method === "GET" && url.pathname === "/api/chat/conversations") {
      return await handleListChatConversations(req, res);
    }
    if (req.method === "POST" && url.pathname === "/api/chat/conversations") {
      return await handleCreateChatConversation(req, res);
    }
    const chatConversationMatch = url.pathname.match(/^\/api\/chat\/conversations\/([^/]+)\/?$/);
    if (req.method === "GET" && chatConversationMatch) {
      return await handleGetChatConversation(req, res, decodeURIComponent(chatConversationMatch[1]));
    }
    if (req.method === "PATCH" && chatConversationMatch) {
      return await handleUpdateChatConversation(req, res, decodeURIComponent(chatConversationMatch[1]));
    }
    const chatGiftMatch = url.pathname.match(/^\/api\/chat\/conversations\/([^/]+)\/gift\/?$/);
    if (req.method === "POST" && chatGiftMatch) {
      return await handleChatGift(req, res, decodeURIComponent(chatGiftMatch[1]));
    }
    const chatImageMatch = url.pathname.match(/^\/api\/chat\/conversations\/([^/]+)\/images\/?$/);
    if (req.method === "POST" && chatImageMatch) {
      return await handleCreateChatImage(req, res, decodeURIComponent(chatImageMatch[1]));
    }
    const chatImageRefreshMatch = url.pathname.match(/^\/api\/chat\/conversations\/([^/]+)\/images\/([^/]+)\/refresh\/?$/);
    if (req.method === "POST" && chatImageRefreshMatch) {
      return await handleRefreshChatImage(req, res, decodeURIComponent(chatImageRefreshMatch[1]), decodeURIComponent(chatImageRefreshMatch[2]));
    }
    const chatBranchMatch = url.pathname.match(/^\/api\/chat\/conversations\/([^/]+)\/branch\/?$/);
    if (req.method === "POST" && chatBranchMatch) {
      return await handleBranchChatConversation(req, res, decodeURIComponent(chatBranchMatch[1]));
    }
    const chatSingleMessageMatch = url.pathname.match(/^\/api\/chat\/conversations\/([^/]+)\/messages\/([^/]+)\/?$/);
    if (req.method === "DELETE" && chatSingleMessageMatch) {
      return await handleDeleteChatMessage(req, res, decodeURIComponent(chatSingleMessageMatch[1]), decodeURIComponent(chatSingleMessageMatch[2]));
    }
    const chatMessageMatch = url.pathname.match(/^\/api\/chat\/conversations\/([^/]+)\/messages\/?$/);
    if (req.method === "GET" && chatMessageMatch) {
      return await handleGetChatConversationMessages(req, res, decodeURIComponent(chatMessageMatch[1]), url);
    }
    if (req.method === "POST" && chatMessageMatch) {
      return await handleSendChatMessage(req, res, decodeURIComponent(chatMessageMatch[1]));
    }

    /* Chat live (Vidu S2-Avatar realtime) — shared by the 123 platform chat tab
       and the standalone chat.5vips.com page. */
    if (req.method === "GET" && url.pathname === "/api/chat-live/creator/characters") {
      return await handleCreatorChatLiveCharacters(req, res);
    }
    if (req.method === "POST" && url.pathname === "/api/chat-live/creator/characters") {
      return await handleCreatorSaveChatLiveCharacter(req, res);
    }
    const creatorChatLiveCharacterMatch = url.pathname.match(/^\/api\/chat-live\/creator\/characters\/([^/]+)$/);
    if (req.method === "PUT" && creatorChatLiveCharacterMatch) {
      return await handleCreatorSaveChatLiveCharacter(req, res, decodeURIComponent(creatorChatLiveCharacterMatch[1]));
    }
    if (req.method === "GET" && url.pathname === "/api/chat-live/community/characters") {
      return await handleCommunityChatLiveCharacters(req, res);
    }
    if (req.method === "POST" && url.pathname === "/api/chat-live/community/characters") {
      return await handleCommunitySaveChatLiveCharacter(req, res);
    }
    if (req.method === "POST" && url.pathname === "/api/chat-live/community/characters/auto-profile") {
      return await handleCommunityAutoProfileChatLiveCharacter(req, res);
    }
    const communityChatLiveCharacterMatch = url.pathname.match(/^\/api\/chat-live\/community\/characters\/([^/]+)$/);
    if (req.method === "PUT" && communityChatLiveCharacterMatch) {
      return await handleCommunitySaveChatLiveCharacter(req, res, decodeURIComponent(communityChatLiveCharacterMatch[1]));
    }
    if (req.method === "DELETE" && communityChatLiveCharacterMatch) {
      return await handleCommunityDeleteChatLiveCharacter(req, res, decodeURIComponent(communityChatLiveCharacterMatch[1]));
    }
    const creatorChatLiveUndressMatch = url.pathname.match(/^\/api\/chat-live\/creator\/characters\/([^/]+)\/undress$/);
    if (req.method === "POST" && creatorChatLiveUndressMatch) {
      return await handleCreatorGenerateChatLiveUndress(req, res, decodeURIComponent(creatorChatLiveUndressMatch[1]));
    }
    if (req.method === "POST" && url.pathname === "/api/chat-live/creator/assets") {
      return await handleCreatorUploadChatLiveAsset(req, res);
    }
    if (req.method === "GET" && url.pathname === "/api/chat-live/creator/voices") {
      return await handleCreatorChatLiveVoices(req, res, url);
    }
    if (req.method === "POST" && url.pathname === "/api/chat-live/creator/voices/preview") {
      return await handleCreatorChatLiveVoicePreview(req, res);
    }

    if (req.method === "GET" && url.pathname === "/api/chat-live/characters") {
      return await handlePublicChatLiveCharacters(req, res);
    }
    const publicChatLiveCharacterMatch = url.pathname.match(/^\/api\/chat-live\/characters\/([^/]+)$/);
    if (req.method === "GET" && publicChatLiveCharacterMatch) {
      return await handlePublicChatLiveCharacter(req, res, decodeURIComponent(publicChatLiveCharacterMatch[1]));
    }
    if (req.method === "GET" && url.pathname === "/api/chat-live/rooms") {
      return await handlePublicChatLiveRooms(req, res);
    }
    if (req.method === "POST" && url.pathname === "/api/chat-live/rooms") {
      return await handleCreatePublicChatLiveRoom(req, res);
    }
    const chatLiveRoomJoinMatch = url.pathname.match(/^\/api\/chat-live\/rooms\/([^/]+)\/join\/?$/);
    if (req.method === "POST" && chatLiveRoomJoinMatch) {
      return await handleJoinChatLiveRoom(req, res, decodeURIComponent(chatLiveRoomJoinMatch[1]));
    }
    const chatLiveRoomMessageMatch = url.pathname.match(/^\/api\/chat-live\/rooms\/([^/]+)\/messages\/?$/);
    if ((req.method === "GET" || req.method === "POST") && chatLiveRoomMessageMatch) {
      const roomKey = decodeURIComponent(chatLiveRoomMessageMatch[1]);
      if (req.method === "GET") return await handleListChatLiveRoomMessages(req, res, roomKey);
      return await handleChatLiveRoomMessage(req, res, roomKey);
    }
    if (req.method === "GET" && url.pathname === "/api/embed/live/voices") {
      return handleEmbedLiveVoices(req, res, url);
    }

    if (req.method === "POST" && url.pathname === "/api/embed/live/tickets") {
      return handleEmbedLiveTicket(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/embed/live/bootstrap") {
      return handleEmbedLiveBootstrap(req, res);
    }

    if (req.method === "GET" && url.pathname === "/api/chat-live/contacts") {
      return await handleListChatLiveContacts(req, res);
    }
    if (req.method === "POST" && url.pathname === "/api/chat-live/sessions") {
      return await handleCreateChatLiveSession(req, res);
    }
    const chatLiveSessionEndMatch = url.pathname.match(/^\/api\/chat-live\/sessions\/([^/]+)\/end$/);
    if (req.method === "POST" && chatLiveSessionEndMatch) {
      return await handleEndChatLiveSession(req, res, decodeURIComponent(chatLiveSessionEndMatch[1]));
    }
    const chatLiveSessionIssueMatch = url.pathname.match(/^\/api\/chat-live\/sessions\/([^/]+)\/issues$/);
    if (req.method === "POST" && chatLiveSessionIssueMatch) {
      return await handleReportChatLiveSessionIssue(req, res, decodeURIComponent(chatLiveSessionIssueMatch[1]));
    }
    const chatLiveSessionReadyMatch = url.pathname.match(/^\/api\/chat-live\/sessions\/([^/]+)\/ready$/);
    if (req.method === "POST" && chatLiveSessionReadyMatch) {
      return await handleMarkChatLiveReady(req, res, decodeURIComponent(chatLiveSessionReadyMatch[1]));
    }
    const chatLiveSessionOperationMatch = url.pathname.match(/^\/api\/chat-live\/sessions\/([^/]+)\/operations$/);
    if (req.method === "POST" && chatLiveSessionOperationMatch) {
      return await handleReportChatLiveOperation(req, res, decodeURIComponent(chatLiveSessionOperationMatch[1]));
    }
    const chatLiveVoiceMatch = url.pathname.match(/^\/api\/chat-live\/sessions\/([^/]+)\/voice$/);
    if (req.method === "POST" && chatLiveVoiceMatch) {
      return await handleChatLiveVoice(req, res, decodeURIComponent(chatLiveVoiceMatch[1]));
    }
    const chatLiveStoryStateMatch = url.pathname.match(/^\/api\/chat-live\/sessions\/([^/]+)\/story-state$/);
    if (req.method === "POST" && chatLiveStoryStateMatch) {
      return await handleSaveChatLiveStoryState(req, res, decodeURIComponent(chatLiveStoryStateMatch[1]));
    }
    const chatLiveSayMatch = url.pathname.match(/^\/api\/chat-live\/sessions\/([^/]+)\/say$/);
    if (req.method === "POST" && chatLiveSayMatch) {
      return await handleChatLiveSay(req, res, decodeURIComponent(chatLiveSayMatch[1]));
    }
    const chatLiveGiftMatch = url.pathname.match(/^\/api\/chat-live\/sessions\/([^/]+)\/gift$/);
    if (req.method === "POST" && chatLiveGiftMatch) {
      return await handleChatLiveGift(req, res, decodeURIComponent(chatLiveGiftMatch[1]));
    }
    const chatLiveLookMatch = url.pathname.match(/^\/api\/chat-live\/sessions\/([^/]+)\/look$/);
    if (req.method === "POST" && chatLiveLookMatch) {
      return await handleChatLiveLook(req, res, decodeURIComponent(chatLiveLookMatch[1]));
    }
    const chatLiveSessionMatch = url.pathname.match(/^\/api\/chat-live\/sessions\/([^/]+)$/);
    if (req.method === "GET" && chatLiveSessionMatch) {
      return await handleGetChatLiveSession(req, res, decodeURIComponent(chatLiveSessionMatch[1]));
    }

    if (req.method === "POST" && url.pathname === "/api/video-tools/estimate") {
      return await handleVideoToolEstimate(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/video-tools/upload") {
      return await handleUploadVideoToolAsset(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/video-tools/generate") {
      return await handleVideoToolGenerate(req, res);
    }
    const undressToolExampleMatch = url.pathname.match(/^\/api\/undress-tool\/examples\/(image|image_video|video)\/(input|result)$/);
    if (["GET", "HEAD"].includes(req.method) && undressToolExampleMatch) {
      return await handleUndressToolExampleMedia(req, res, undressToolExampleMatch[1], undressToolExampleMatch[2]);
    }
    if (req.method === "POST" && url.pathname === "/api/undress-tool/estimate") {
      return await handleUndressToolEstimate(req, res);
    }
    if (req.method === "POST" && url.pathname === "/api/undress-tool/upload") {
      if (!undressToolRequestAllowed(req)) return sendJson(res, 404, { ok: false, message: "API not found." });
      return await handleUploadVideoToolAsset(req, res);
    }
    if (req.method === "POST" && url.pathname === "/api/undress-tool/generate") {
      return await handleUndressToolGenerate(req, res);
    }
    const unlockUndressToolMatch = url.pathname.match(/^\/api\/undress-tool\/tasks\/([^/]+)\/unlock$/);
    if (req.method === "POST" && unlockUndressToolMatch) {
      return await handleUnlockUndressToolResult(req, res, decodeURIComponent(unlockUndressToolMatch[1]));
    }

    if (req.method === "GET" && url.pathname === "/api/workflow/presets") {
      return await handleWorkflowPresets(req, res);
    }

    if (req.method === "GET" && url.pathname === "/api/workflow/canvases") {
      return await handleListWorkflowCanvases(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/workflow/canvases") {
      return await handleCreateWorkflowCanvas(req, res);
    }

    const workflowCanvasMatch = url.pathname.match(/^\/api\/workflow\/canvases\/([^/]+)\/?$/);
    if (req.method === "GET" && workflowCanvasMatch) {
      return await handleGetWorkflowCanvas(req, res, decodeURIComponent(workflowCanvasMatch[1]));
    }
    if (req.method === "PUT" && workflowCanvasMatch) {
      return await handleUpdateWorkflowCanvas(req, res, decodeURIComponent(workflowCanvasMatch[1]));
    }
    if (req.method === "DELETE" && workflowCanvasMatch) {
      return await handleDeleteWorkflowCanvas(req, res, decodeURIComponent(workflowCanvasMatch[1]));
    }

    if (req.method === "POST" && url.pathname === "/api/workflow/extract-frame") {
      return await handleWorkflowExtractFrame(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/workflow/compose") {
      return await handleWorkflowCompose(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/analytics/character-view") {
      return await handleTrackCharacterView(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/analytics/web-vitals") {
      return await handleWebVitals(req, res);
    }

    if (req.method === "GET" && url.pathname === "/api/game/feed") {
      return await handleGameFeed(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/v3/contents/generations/tasks") {
      if (!await requireExternalApiDocsAccess(req, res)) return;
      return await handleByteplusV3CreateTask(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/v3/images/generations") {
      if (!await requireExternalApiDocsAccess(req, res)) return;
      return await handleByteplusV3ImageGeneration(req, res);
    }

    const byteplusV3TaskMatch = url.pathname.match(/^\/api\/v3\/contents\/generations\/tasks\/([^/]+)\/?$/);
    if (req.method === "GET" && byteplusV3TaskMatch) {
      if (!await requireExternalApiDocsAccess(req, res)) return;
      return await handleByteplusV3GetTask(req, res, decodeURIComponent(byteplusV3TaskMatch[1]));
    }

    const volcengineTaskMatch = url.pathname.match(/^\/(?:v3\/)?contents\/generations\/tasks\/([^/]+)\/?$/);
    if (req.method === "POST" && /^\/(?:v3\/)?contents\/generations\/tasks\/?$/.test(url.pathname)) {
      if (!await requireExternalApiDocsAccess(req, res)) return;
      return await handleVolcengineCreateGenerationTask(req, res);
    }
    if (req.method === "GET" && volcengineTaskMatch) {
      if (!await requireExternalApiDocsAccess(req, res)) return;
      return await handleVolcengineGetGenerationTask(req, res, decodeURIComponent(volcengineTaskMatch[1]));
    }

    if (req.method === "GET" && url.pathname === "/api/models") {
      if (!apiAccessEnabledForRequest(req)) return sendApiAccessDisabled(res);
      return await handleModelsJson(req, res);
    }

    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/advanced/estimate") {
      return await handleAdvancedEstimate(req, res);
    }

    if (req.method === "GET" && url.pathname === "/docs/api.md") {
      if (!apiAccessEnabledForRequest(req)) return sendApiAccessDisabled(res);
      return await handleApiDocsMarkdown(req, res);
    }

    if (req.method === "GET" && url.pathname === "/docs/api.json") {
      if (!apiAccessEnabledForRequest(req)) return sendApiAccessDisabled(res);
      return await handleApiDocsJson(req, res);
    }

    if (req.method === "GET" && (url.pathname === "/docs/models.md" || url.pathname === "/models.md")) {
      if (!apiAccessEnabledForRequest(req)) return sendApiAccessDisabled(res);
      return await handleModelsMarkdown(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/auth/register") {
      return await handleRegister(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      return await handleLogin(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login-or-register") {
      return await handleLoginOrRegister(req, res);
    }
    if (req.method === "POST" && url.pathname === "/api/auth/logout") return await handleLogout(req, res);

    if (req.method === "POST" && url.pathname === "/api/auth/email/request") return await handleEmailLoginRequest(req, res);
    if (req.method === "POST" && url.pathname === "/api/auth/email/verify") return await handleEmailLoginVerify(req, res);
    if (req.method === "POST" && url.pathname === "/api/auth/password/reset/request") return await handlePasswordResetRequest(req, res);
    if (req.method === "POST" && url.pathname === "/api/auth/password/reset") return await handlePasswordReset(req, res);
    if (req.method === "POST" && url.pathname === "/api/account/email/request") return await handleAccountEmailRequest(req, res);
    if (req.method === "POST" && url.pathname === "/api/account/email/verify") return await handleAccountEmailVerify(req, res);
    if (req.method === "PATCH" && url.pathname === "/api/account/profile") return await handleAccountProfile(req, res);
    if (req.method === "POST" && url.pathname === "/api/account/profile/media") return await handleAccountProfileMedia(req, res);

    if (req.method === "POST" && url.pathname === "/api/google/login") {
      return await handleGoogleLogin(req, res);
    }

    if (req.method === "GET" && url.pathname === "/api/auth/me") {
      return await handleMe(req, res);
    }
    if (req.method === "GET" && url.pathname === "/api/companion/level") {
      return await handleGetCompanionLevel(req, res);
    }
    const relationshipMatch = url.pathname.match(/^\/api\/companion\/relationship\/([^/]+)\/?$/);
    if (req.method === "GET" && relationshipMatch) {
      return await handleGetCharacterRelationship(req, res, decodeURIComponent(relationshipMatch[1]));
    }
    if (req.method === "GET" && url.pathname === "/api/onboarding") {
      return await handleGetOnboarding(req, res, url);
    }
    const onboardingMatch = url.pathname.match(/^\/api\/onboarding\/([^/]+)\/(seen|complete)\/?$/);
    if (req.method === "POST" && onboardingMatch) {
      return await handleUpdateOnboarding(req, res, decodeURIComponent(onboardingMatch[1]), onboardingMatch[2]);
    }

    if (req.method === "POST" && url.pathname === "/api/telegram/webapp-auth") {
      return await handleTelegramWebAppAuth(req, res);
    }

    if (req.method === "GET" && url.pathname === "/api/telegram/login/options") {
      return await handleTelegramLoginOptions(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/telegram/login") {
      return await handleTelegramLogin(req, res);
    }

    if (req.method === "POST" && telegramBotWebhookPathMatches(url.pathname)) {
      return await handleTelegramBotWebhook(req, res);
    }

    if (req.method === "GET" && url.pathname === "/api/referral") {
      return await handleReferralSummary(req, res);
    }
    if (["PUT", "PATCH"].includes(req.method) && url.pathname === "/api/referral/wallet") return await handleUpdateReferralWallet(req, res);
    if (req.method === "GET" && url.pathname === "/api/referral/withdrawals") return await handleListReferralWithdrawals(req, res, url);
    if (req.method === "POST" && url.pathname === "/api/referral/withdrawals") return await handleCreateReferralWithdrawal(req, res);
    if (req.method === "POST" && url.pathname === "/api/membership/redeem") {
      return await handleRedeemMembershipActivationCode(req, res);
    }

    const telegramSupportWebhookMatch = url.pathname.match(/^\/api\/telegram\/support-webhook\/([^/]+)$/);
    if (req.method === "POST" && telegramSupportWebhookMatch) {
      return await handleTelegramSupportWebhook(req, res, decodeURIComponent(telegramSupportWebhookMatch[1]));
    }

    if (req.method === "POST" && url.pathname === "/api/support-messages") {
      return await handleCreateSupportMessage(req, res);
    }
    if (req.method === "GET" && url.pathname === "/api/support-messages") {
      return await handleListUserSupportMessages(req, res, url);
    }
    if (req.method === "GET" && url.pathname === "/api/live/notifications") {
      return await handleListLiveNotifications(req, res);
    }
    if (req.method === "POST" && url.pathname === "/api/live/notifications/read-all") {
      return await handleReadAllLiveNotifications(req, res);
    }
    const liveNotificationReadMatch = url.pathname.match(/^\/api\/live\/notifications\/([^/]+)\/read$/);
    if (req.method === "POST" && liveNotificationReadMatch) {
      return await handleReadLiveNotification(req, res, decodeURIComponent(liveNotificationReadMatch[1]));
    }
    if (req.method === "GET" && url.pathname === "/api/live/checkin/history") {
      return await handleListLiveCheckinHistory(req, res, url);
    }
    if (req.method === "GET" && url.pathname === "/api/live/checkin") {
      return await handleGetLiveCheckin(req, res);
    }
    if (req.method === "POST" && url.pathname === "/api/live/checkin") {
      return await handleCreateLiveCheckin(req, res);
    }
    const liveDailyTaskClaimMatch = url.pathname.match(/^\/api\/live\/checkin\/tasks\/([^/]+)$/);
    if (req.method === "POST" && liveDailyTaskClaimMatch) {
      return await handleClaimLiveDailyTask(req, res, decodeURIComponent(liveDailyTaskClaimMatch[1]));
    }
    if (req.method === "GET" && url.pathname === "/api/live/creator-income") {
      return await handleGetLiveCreatorIncome(req, res, url);
    }
    if (req.method === "GET" && url.pathname === "/api/live/creator-withdrawals") {
      return await handleListLiveCreatorWithdrawals(req, res, url);
    }
    if (req.method === "POST" && url.pathname === "/api/live/creator-withdrawals") {
      return await handleCreateLiveCreatorWithdrawal(req, res);
    }

    if (req.method === "GET" && url.pathname === "/api/access/subtokens") {
      if (!apiAccessEnabledForRequest(req)) return sendApiAccessDisabled(res);
      return await handleListApiSubtokens(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/access/subtokens") {
      if (!apiAccessEnabledForRequest(req)) return sendApiAccessDisabled(res);
      return await handleCreateApiSubtoken(req, res);
    }

    const accessSubtokenMatch = url.pathname.match(/^\/api\/access\/subtokens\/([^/]+)$/);
    if (req.method === "PATCH" && accessSubtokenMatch) {
      if (!apiAccessEnabledForRequest(req)) return sendApiAccessDisabled(res);
      return await handleUpdateApiSubtoken(req, res, decodeURIComponent(accessSubtokenMatch[1]));
    }
    if (req.method === "DELETE" && accessSubtokenMatch) {
      if (!apiAccessEnabledForRequest(req)) return sendApiAccessDisabled(res);
      return await handleRevokeApiSubtoken(req, res, decodeURIComponent(accessSubtokenMatch[1]));
    }

    if (req.method === "GET" && url.pathname === "/api/pay/paypal/config") return await handlePayPalConfig(req, res);
    if (req.method === "POST" && url.pathname === "/api/pay/airwallex/checkout-sessions") {
      return await createAirwallexCheckoutSession(req, res);
    }
    const airwallexCheckoutSessionMatch = url.pathname.match(/^\/api\/pay\/airwallex\/checkout-sessions\/([^/]+)$/);
    if (req.method === "GET" && airwallexCheckoutSessionMatch) {
      return await handleAirwallexCheckoutSessionDetails(req, res, decodeURIComponent(airwallexCheckoutSessionMatch[1]));
    }
    const airwallexCheckoutStartMatch = url.pathname.match(/^\/api\/pay\/airwallex\/checkout-sessions\/([^/]+)\/start$/);
    if (req.method === "POST" && airwallexCheckoutStartMatch) {
      if (!isPaymentHostRequest(req)) return sendJson(res, 409, { ok: false, code: "AIRWALLEX_CHECKOUT_REQUIRED", message: "Airwallex payments must be started from the secure checkout page." });
      return await handleStartAirwallexCheckoutSession(req, res, decodeURIComponent(airwallexCheckoutStartMatch[1]));
    }
    if (req.method === "POST" && (url.pathname === "/api/billing/airwallex/webhook" || url.pathname === "/api/pay/airwallex/webhook")) {
      return await handleAirwallexWebhook(req, res);
    }
    if (req.method === "POST" && url.pathname === "/api/webhooks/mulerouter") {
      return await handleMulerouterWebhook(req, res);
    }

    if (await handlePromotionPaymentRoutes(req, res, url)) return;
    if (req.method === "POST" && url.pathname === "/api/pay/stripe/checkout-sessions") {
      return await createStripeCheckoutSession(req, res);
    }

    const stripeCheckoutSessionMatch = url.pathname.match(/^\/api\/pay\/stripe\/checkout-sessions\/([^/]+)$/);
    if (req.method === "GET" && stripeCheckoutSessionMatch) {
      return await handleStripeCheckoutSessionDetails(req, res, decodeURIComponent(stripeCheckoutSessionMatch[1]));
    }

    const stripeCheckoutSessionStartMatch = url.pathname.match(/^\/api\/pay\/stripe\/checkout-sessions\/([^/]+)\/start$/);
    if (req.method === "POST" && stripeCheckoutSessionStartMatch) {
      if (!isPaymentHostRequest(req)) return sendJson(res, 409, { ok: false, code: "STRIPE_CHECKOUT_REQUIRED", message: "Stripe payments must be started from the secure checkout page.", checkoutBaseUrl: STRIPE_CHECKOUT_BASE_URL });
      return await handleStartStripeCheckoutSession(req, res, decodeURIComponent(stripeCheckoutSessionStartMatch[1]));
    }

    if (req.method === "POST" && url.pathname === "/api/pay/stripe/webhook") {
      return await handleStripeWebhook(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/pay/paypal/orders") {
      return sendPayPalCheckoutHostRequired(res);
    }

    if (req.method === "POST" && url.pathname === "/api/pay/paypal/checkout-sessions") {
      return await createPayPalCheckoutSession(req, res);
    }

    const paypalCheckoutSessionMatch = url.pathname.match(/^\/api\/pay\/paypal\/checkout-sessions\/([^/]+)$/);
    if (req.method === "GET" && paypalCheckoutSessionMatch) {
      return await handlePayPalCheckoutSessionDetails(req, res, decodeURIComponent(paypalCheckoutSessionMatch[1]));
    }

    const paypalCheckoutSessionStartMatch = url.pathname.match(/^\/api\/pay\/paypal\/checkout-sessions\/([^/]+)\/start$/);
    if (req.method === "POST" && paypalCheckoutSessionStartMatch) {
      if (!isPaymentHostRequest(req)) return sendPayPalCheckoutHostRequired(res);
      return await handleStartPayPalCheckoutSession(req, res, decodeURIComponent(paypalCheckoutSessionStartMatch[1]));
    }

    const paypalCaptureMatch = url.pathname.match(/^\/api\/pay\/paypal\/orders\/([^/]+)\/capture$/);
    if (req.method === "POST" && paypalCaptureMatch) {
      if (!isPaymentHostRequest(req)) return sendPayPalCheckoutHostRequired(res);
      return await handleCapturePayPalOrder(req, res, decodeURIComponent(paypalCaptureMatch[1]));
    }

    if (req.method === "GET" && url.pathname === "/paypal-return") {
      return await handlePayPalCheckoutReturn(req, res, url);
    }

    if (req.method === "GET" && url.pathname === "/paypal-cancel") {
      return await handlePayPalCheckoutCancel(req, res, url);
    }

    if (req.method === "POST" && url.pathname === "/api/pay/paypal/webhook") {
      return await handlePayPalWebhook(req, res);
    }

    if (req.method === "GET" && url.pathname === "/api/billing/summary") {
      return await handleBillingSummary(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/billing/subscription/orders") {
      return await handleCreateSubscriptionOrder(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/pay/orders") {
      return await handleCreatePaymentOrder(req, res);
    }

    const paymentConfirmMatch = url.pathname.match(/^\/api\/pay\/orders\/([^/]+)\/confirm$/);
    if (req.method === "POST" && paymentConfirmMatch) {
      return await handleConfirmPaymentOrder(req, res, decodeURIComponent(paymentConfirmMatch[1]));
    }

    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/pay/tronlink/callback") {
      return await handleTronLinkCallback(req, res, url);
    }

    if (req.method === "GET" && url.pathname === "/api/pay/orders") {
      return await handleListPaymentOrders(req, res);
    }

    if (req.method === "GET" && url.pathname === "/api/billing/topups") {
      return await handleListTopupRecords(req, res, url);
    }

    if (req.method === "GET" && url.pathname === "/api/billing/spending") {
      return await handleListSpendingRecords(req, res, url);
    }

    if (req.method === "POST" && url.pathname === "/api/wallet/spend") {
      return await handleSpendCredits(req, res);
    }

    if (req.method === "GET" && url.pathname === "/api/unlocks") {
      return await handleListUnlocks(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/unlock-video") {
      return await handleUnlockVideo(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/game/assets/from-character-media") {
      return await handleCreateGameAssetFromCharacterMedia(req, res);
    }

    const unlockStreamMatch = url.pathname.match(/^\/api\/unlock-video\/stream\/([^/]+)$/);
    if ((req.method === "GET" || req.method === "HEAD") && unlockStreamMatch) {
      return await handleStreamUnlockVideo(req, res, unlockStreamMatch[1]);
    }

    const publicGameVideoStreamMatch = url.pathname.match(/^\/api\/game\/video\/([^/]+)$/);
    if ((req.method === "GET" || req.method === "HEAD") && publicGameVideoStreamMatch) {
      return await handleStreamPublicGameVideo(req, res, publicGameVideoStreamMatch[1]);
    }

    if (req.method === "POST" && url.pathname === "/api/user-assets") {
      return await handleUploadUserAsset(req, res);
    }

    if (req.method === "POST" && (url.pathname === "/api/seedance/characters/upload" || url.pathname === "/api/vipeak2/characters/upload")) {
      return await handleUploadSeedanceCharacter(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/characters/generate") {
      return await handleGenerateUserCharacterImage(req, res);
    }

    const characterModifyMatch = url.pathname.match(/^\/api\/characters\/([^/]+)\/modify$/);
    if (req.method === "POST" && characterModifyMatch) {
      return await handleModifySystemCharacterImage(req, res, decodeURIComponent(characterModifyMatch[1]));
    }

    const addGenerationRecordAssetMatch = url.pathname.match(/^\/api\/generation-records\/([^/]+)\/add-asset$/);
    if (req.method === "POST" && addGenerationRecordAssetMatch) {
      return await handleAddGenerationRecordToAssets(req, res, decodeURIComponent(addGenerationRecordAssetMatch[1]));
    }

    if (req.method === "POST" && url.pathname === "/api/platform/generate") {
      return await handlePlatformGenerate(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/advanced/request-access") {
      return await handleAdvancedAccessRequest(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/advanced/prompt-optimize") {
      return await handleAdvancedPromptOptimize(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/advanced/generate") {
      return await handleAdvancedGenerate(req, res);
    }
    if (req.method === "POST" && url.pathname === "/api/admin/advanced/generate") {
      return await handleAdminAdvancedGenerate(req, res);
    }

    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/platform/estimates") {
      return await handlePlatformEstimates(req, res, url);
    }

    if (req.method === "GET" && url.pathname === "/api/user-assets") {
      return await handleListUserAssets(req, res, url);
    }

    if (req.method === "POST" && url.pathname === "/api/user-assets/resolve") {
      return await handleResolveUserAssets(req, res);
    }

    if (req.method === "POST" && (url.pathname === "/api/wan27/image-edit" || url.pathname === "/api/vipeak1/image-edit")) {
      if (publicAliyunModelBlockedForRequest(req, "wan27-image-edit")) return sendPublicAliyunModelUnavailable(res);
      return await handleWan27ImageEdit(req, res);
    }

    const userAssetModifyMatch = url.pathname.match(/^\/api\/user-assets\/([^/]+)\/modify$/);
    if (req.method === "POST" && userAssetModifyMatch) {
      return await handleModifyUserAssetImage(req, res, userAssetModifyMatch[1]);
    }

    const userAssetMatch = url.pathname.match(/^\/api\/user-assets\/([^/]+)$/);
    if (req.method === "DELETE" && userAssetMatch) {
      return await handleDeleteUserAsset(req, res, userAssetMatch[1]);
    }

    if (req.method === "POST" && url.pathname === "/api/character-image") {
      return await handleCreateCharacterImage(req, res);
    }

    const characterImageTaskMatch = url.pathname.match(/^\/api\/character-image\/([^/]+)$/);
    if (req.method === "GET" && characterImageTaskMatch) {
      return await handleGetCharacterImage(req, res, characterImageTaskMatch[1]);
    }

    if (req.method === "GET" && url.pathname === "/api/admin/config") {
      return await handleAdminGetConfig(req, res);
    }

    if (req.method === "PUT" && url.pathname === "/api/admin/config") {
      return await handleAdminSaveConfig(req, res);
    }
    if (req.method === "GET" && url.pathname === "/api/admin/aliyun-route") {
      const admin = await requireAdmin(req, res, { loadDb: false });
      if (!admin) return;
      return sendJson(res, 200, { ok: true, route: await mulerouterAliyun.publicStatus() });
    }
    if (req.method === "PUT" && url.pathname === "/api/admin/aliyun-route") {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      const body = await readJson(req);
      const enabled = body?.enabled === true || body?.route?.enabled === true;
      const saved = await mulerouterAliyun.writeRouteConfig(enabled);
      return sendJson(res, 200, { ok: true, route: { ...(await mulerouterAliyun.publicStatus()), ...saved, enabled: saved.enabled } });
    }

    if (req.method === "GET" && url.pathname === "/api/admin/undress-prompts") {
      return await handleAdminGetUndressPrompts(req, res);
    }

    if (req.method === "PUT" && url.pathname === "/api/admin/undress-prompts") {
      return await handleAdminSaveUndressPrompts(req, res);
    }

    if (req.method === "GET" && url.pathname === "/api/admin/pricing") {
      return await handleAdminGetPricing(req, res);
    }

    if (req.method === "PUT" && url.pathname === "/api/admin/pricing") {
      return await handleAdminSavePricing(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/admin/chat-live/assets") {
      return await handleAdminUploadChatLiveAsset(req, res);
    }
    if (req.method === "GET" && url.pathname === "/api/admin/chat-live/characters") {
      return await handleAdminChatLiveCharacters(req, res);
    }
    if (req.method === "GET" && url.pathname === "/api/admin/chat-live/gifts") return await handleAdminChatLiveGifts(req, res);
    if (req.method === "POST" && url.pathname === "/api/admin/chat-live/gifts") return await handleAdminSaveChatLiveGift(req, res);
    const adminChatLiveGiftMatch = url.pathname.match(/^\/api\/admin\/chat-live\/gifts\/([^/]+)$/);
    if (adminChatLiveGiftMatch && req.method === "PUT") return await handleAdminSaveChatLiveGift(req, res, decodeURIComponent(adminChatLiveGiftMatch[1]));
    if (adminChatLiveGiftMatch && req.method === "DELETE") return await handleAdminDeleteChatLiveGift(req, res, decodeURIComponent(adminChatLiveGiftMatch[1]));
    if (req.method === "POST" && url.pathname === "/api/admin/chat-live/voice-preview") {
      return await handleAdminChatLiveVoicePreview(req, res);
    }
    if (req.method === "POST" && url.pathname === "/api/admin/chat-live/characters") {
      return await handleAdminSaveChatLiveCharacter(req, res);
    }
    const adminChatLiveUndressMatch = url.pathname.match(/^\/api\/admin\/chat-live\/characters\/([^/]+)\/undress$/);
    if (req.method === "POST" && adminChatLiveUndressMatch) {
      return await handleAdminGenerateChatLiveUndress(req, res, decodeURIComponent(adminChatLiveUndressMatch[1]));
    }
    const adminChatLiveCharacterMatch = url.pathname.match(/^\/api\/admin\/chat-live\/characters\/([^/]+)$/);
    if (req.method === "PUT" && adminChatLiveCharacterMatch) {
      return await handleAdminSaveChatLiveCharacter(req, res, decodeURIComponent(adminChatLiveCharacterMatch[1]));
    }
    const adminChatLiveShelfMatch = url.pathname.match(/^\/api\/admin\/chat-live\/characters\/([^/]+)\/shelf$/);
    if (req.method === "POST" && adminChatLiveShelfMatch) {
      return await handleAdminShelfChatLiveCharacter(req, res, decodeURIComponent(adminChatLiveShelfMatch[1]));
    }
    if (req.method === "DELETE" && adminChatLiveCharacterMatch) {
      return await handleAdminDeleteChatLiveCharacter(req, res, decodeURIComponent(adminChatLiveCharacterMatch[1]));
    }
    if (req.method === "GET" && url.pathname === "/api/admin/chat-live/voices") {
      return await handleAdminChatLiveVoices(req, res, url);
    }
    if (req.method === "GET" && url.pathname === "/api/admin/chat-live/sessions") {
      return await handleAdminListChatLiveSessions(req, res, url);
    }
    if (req.method === "GET" && url.pathname === "/api/admin/chat-live/pricing") {
      return await handleAdminGetChatLivePricing(req, res);
    }
    if (req.method === "PUT" && url.pathname === "/api/admin/chat-live/pricing") {
      return await handleAdminSaveChatLivePricing(req, res);
    }
    if (req.method === "GET" && url.pathname === "/api/admin/chat-live/membership-plans") return await handleAdminGetChatLiveMembershipPlans(req, res);
    if (req.method === "PUT" && url.pathname === "/api/admin/chat-live/membership-plans") return await handleAdminSaveChatLiveMembershipPlans(req, res);
    if (req.method === "POST" && url.pathname === "/api/admin/chat-live/looks") {
      return await handleAdminSaveChatLiveLook(req, res);
    }
    const adminChatLiveLookMatch = url.pathname.match(/^\/api\/admin\/chat-live\/looks\/([^/]+)$/);
    if (adminChatLiveLookMatch && req.method === "PUT") {
      return await handleAdminSaveChatLiveLook(req, res, decodeURIComponent(adminChatLiveLookMatch[1]));
    }
    if (adminChatLiveLookMatch && req.method === "DELETE") {
      return await handleAdminDeleteChatLiveLook(req, res, decodeURIComponent(adminChatLiveLookMatch[1]));
    }

    if (req.method === "GET" && url.pathname === "/api/admin/overview") {
      return await handleAdminList(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/admin/home-image") {
      return await handleAdminUploadHomeImage(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/admin/platform-cover") {
      return await handleAdminUploadPlatformCover(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/admin/platform-template-media") {
      return await handleAdminIngestPlatformTemplateMedia(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/admin/advanced-case-media") {
      return await handleAdminIngestAdvancedCaseMedia(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/admin/home-video") {
      return await handleAdminCreateHomeVideo(req, res);
    }

    const homeVideoTaskMatch = url.pathname.match(/^\/api\/admin\/home-video\/([^/]+)$/);
    if (req.method === "GET" && homeVideoTaskMatch) {
      return await handleAdminGetHomeVideo(req, res, homeVideoTaskMatch[1]);
    }

    if (req.method === "POST" && url.pathname === "/api/admin/character-scene-video") {
      return await handleAdminCreateCharacterSceneVideo(req, res);
    }

    const adminSceneVideoTaskMatch = url.pathname.match(/^\/api\/admin\/character-scene-video\/([^/]+)$/);
    if (req.method === "GET" && adminSceneVideoTaskMatch) {
      return await handleAdminGetCharacterSceneVideo(req, res, adminSceneVideoTaskMatch[1]);
    }

    if (req.method === "GET" && url.pathname === "/api/admin/ifilm/status") {
      return await handleAdminIfilmStatus(req, res);
    }

    if (req.method === "GET" && url.pathname === "/api/admin/dashboard") {
      return await handleAdminDashboard(req, res);
    }

    if (req.method === "GET" && url.pathname === "/api/admin/risk-summary") {
      return await handleAdminRiskSummary(req, res, url);
    }

    if (req.method === "GET" && url.pathname === "/api/admin/geo-report") {
      return await handleAdminGeoReport(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/admin/geo/realtime-test") {
      return await handleAdminGeoRealtimeTest(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/admin/geo/indexnow") {
      return await handleAdminSubmitIndexNow(req, res);
    }

    if (req.method === "GET" && url.pathname === "/api/admin/users") {
      return await handleAdminListUsers(req, res, url);
    }

    if (req.method === "GET" && url.pathname === "/api/admin/membership-codes") {
      return await handleAdminListMembershipActivationCodes(req, res, url);
    }
    if (req.method === "POST" && url.pathname === "/api/admin/membership-codes") {
      return await handleAdminCreateMembershipActivationCodes(req, res);
    }
    const adminMembershipCodeMatch = url.pathname.match(/^\/api\/admin\/membership-codes\/([^/]+)$/);
    if (req.method === "PATCH" && adminMembershipCodeMatch) {
      return await handleAdminUpdateMembershipActivationCode(req, res, decodeURIComponent(adminMembershipCodeMatch[1]));
    }

    const adminUserMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (req.method === "PATCH" && adminUserMatch) {
      return await handleAdminUpdateUser(req, res, adminUserMatch[1]);
    }
    if (req.method === "DELETE" && adminUserMatch) {
      return await handleAdminDeleteUser(req, res, adminUserMatch[1]);
    }

    const adminUserPwMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/password$/);
    if (req.method === "POST" && adminUserPwMatch) {
      return await handleAdminResetPassword(req, res, adminUserPwMatch[1]);
    }

    if (req.method === "GET" && url.pathname === "/api/admin/my-characters") {
      return await handleAdminListMyCharacters(req, res, url);
    }

    const adminMyCharMatch = url.pathname.match(/^\/api\/admin\/my-characters\/([^/]+)$/);
    if (req.method === "DELETE" && adminMyCharMatch) {
      return await handleAdminDeleteMyCharacter(req, res, adminMyCharMatch[1]);
    }

    if (req.method === "GET" && url.pathname === "/api/admin/home-items") {
      return await handleAdminListHomeItems(req, res, url);
    }

    const adminHomeItemMatch = url.pathname.match(/^\/api\/admin\/home-items\/([^/]+)$/);
    if (req.method === "PATCH" && adminHomeItemMatch) {
      return await handleAdminUpdateHomeItem(req, res, adminHomeItemMatch[1]);
    }
    if (req.method === "DELETE" && adminHomeItemMatch) {
      return await handleAdminDeleteHomeItem(req, res, adminHomeItemMatch[1]);
    }

    const adminHomeActiveMatch = url.pathname.match(/^\/api\/admin\/home-items\/([^/]+)\/active$/);
    if (req.method === "POST" && adminHomeActiveMatch) {
      return await handleAdminSetHomeActive(req, res, adminHomeActiveMatch[1]);
    }

    const adminHomeRebuildMatch = url.pathname.match(/^\/api\/admin\/home-items\/([^/]+)\/rebuild-reference$/);
    if (req.method === "POST" && adminHomeRebuildMatch) {
      return await handleAdminRebuildHomeItemReference(req, res, adminHomeRebuildMatch[1]);
    }

    if (req.method === "GET" && url.pathname === "/api/admin/scenes") {
      return await handleAdminListScenes(req, res);
    }

    const adminSceneMatch = url.pathname.match(/^\/api\/admin\/scenes\/([^/]+)$/);
    if (req.method === "PATCH" && adminSceneMatch) {
      return await handleAdminUpdateScene(req, res, adminSceneMatch[1]);
    }

    const adminSceneEntryCollectionMatch = url.pathname.match(/^\/api\/admin\/scenes\/([^/]+)\/entries$/);
    if (req.method === "POST" && adminSceneEntryCollectionMatch) {
      return await handleAdminCreateSceneEntry(req, res, adminSceneEntryCollectionMatch[1]);
    }

    const adminSceneEntryMatch = url.pathname.match(/^\/api\/admin\/scenes\/([^/]+)\/entries\/([^/]+)$/);
    if (req.method === "PATCH" && adminSceneEntryMatch) {
      return await handleAdminUpdateSceneEntry(req, res, adminSceneEntryMatch[1], adminSceneEntryMatch[2]);
    }

    if (req.method === "GET" && url.pathname === "/api/admin/wallet-orders") {
      return await handleAdminListWalletOrders(req, res, url);
    }

    if (req.method === "GET" && url.pathname === "/api/admin/referral-withdrawals") return await handleAdminListReferralWithdrawals(req, res, url);
    const adminReferralWithdrawalMatch = url.pathname.match(/^\/api\/admin\/referral-withdrawals\/([^/]+)$/);
    if (req.method === "PATCH" && adminReferralWithdrawalMatch) return await handleAdminUpdateReferralWithdrawal(req, res, adminReferralWithdrawalMatch[1]);

    if (req.method === "GET" && url.pathname === "/api/admin/creator-data") return await handleAdminGetCreatorData(req, res, url);
    if (req.method === "GET" && url.pathname === "/api/admin/creator-withdrawals") return await handleAdminListCreatorWithdrawals(req, res, url);
    const adminCreatorWithdrawalMatch = url.pathname.match(/^\/api\/admin\/creator-withdrawals\/([^/]+)$/);
    if (req.method === "PATCH" && adminCreatorWithdrawalMatch) return await handleAdminUpdateCreatorWithdrawal(req, res, adminCreatorWithdrawalMatch[1]);

    if (req.method === "GET" && url.pathname === "/api/admin/recharge-ledger") {
      return await handleAdminListRechargeLedger(req, res, url);
    }

    if (req.method === "POST" && url.pathname === "/api/admin/wallet-orders/scan") {
      return await handleAdminScanWalletOrders(req, res);
    }

    const adminOrderMatch = url.pathname.match(/^\/api\/admin\/wallet-orders\/([^/]+)$/);
    if (req.method === "PATCH" && adminOrderMatch) {
      return await handleAdminUpdateWalletOrder(req, res, adminOrderMatch[1]);
    }

    if (req.method === "GET" && url.pathname === "/api/admin/user-assets") {
      return await handleAdminListUserAssets(req, res, url);
    }

    if (req.method === "GET" && url.pathname === "/api/admin/support-messages") {
      return await handleAdminListSupportMessages(req, res, url);
    }

    const adminSupportReplyMatch = url.pathname.match(/^\/api\/admin\/support-messages\/([^/]+)\/reply$/);
    if (req.method === "POST" && adminSupportReplyMatch) {
      return await handleAdminReplySupportMessage(req, res, decodeURIComponent(adminSupportReplyMatch[1]));
    }

    if (req.method === "GET" && url.pathname === "/api/admin/generation-records") {
      return await handleAdminListGenerationRecords(req, res, url);
    }
    const adminGenerationRecordReferenceMediaMatch = url.pathname.match(/^\/api\/admin\/generation-records\/([^/]+)\/references\/(\d+)\/media$/);
    if (["GET", "HEAD"].includes(req.method) && adminGenerationRecordReferenceMediaMatch) {
      return await handleAdminGenerationRecordReferenceMedia(req, res, adminGenerationRecordReferenceMediaMatch[1], adminGenerationRecordReferenceMediaMatch[2], url);
    }
    const adminGenerationRecordMediaMatch = url.pathname.match(/^\/api\/admin\/generation-records\/([^/]+)\/media$/);
    if (["GET", "HEAD"].includes(req.method) && adminGenerationRecordMediaMatch) {
      return await handleAdminGenerationRecordMedia(req, res, adminGenerationRecordMediaMatch[1]);
    }
    const adminGenerationRecordMatch = url.pathname.match(/^\/api\/admin\/generation-records\/([^/]+)$/);
    if (req.method === "GET" && adminGenerationRecordMatch) {
      return await handleAdminGetGenerationRecord(req, res, adminGenerationRecordMatch[1]);
    }
    const adminPromotePlatformMatch = url.pathname.match(/^\/api\/admin\/generation-records\/([^/]+)\/promote-platform$/);
    if (adminPromotePlatformMatch && req.method === "POST") {
      return await handleAdminPromoteRecordToPlatform(req, res, decodeURIComponent(adminPromotePlatformMatch[1]));
    }
    const adminAttachCharacterVideoMatch = url.pathname.match(/^\/api\/admin\/generation-records\/([^/]+)\/attach-character-video$/);
    if (adminAttachCharacterVideoMatch && req.method === "POST") {
      return await handleAdminAttachRecordToCharacterVideo(req, res, decodeURIComponent(adminAttachCharacterVideoMatch[1]));
    }

    if (req.method === "POST" && url.pathname === "/api/my/characters/draft") {
      return await handleSaveMyCharacterDraft(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/my/characters/generate-image") {
      return await handleGenerateMyCharacterImage(req, res);
    }

    const myCharacterStartMainMatch = url.pathname.match(/^\/api\/my\/characters\/([^/]+)\/start-main-video$/);
    if (req.method === "POST" && myCharacterStartMainMatch) {
      return await handleStartMyCharacterMainVideo(req, res, myCharacterStartMainMatch[1]);
    }

    if (req.method === "POST" && url.pathname === "/api/my/characters") {
      return await handleCreateMyCharacter(req, res);
    }

    if (req.method === "GET" && url.pathname === "/api/my/characters") {
      return await handleListMyCharacters(req, res);
    }

    const myCharacterMatch = url.pathname.match(/^\/api\/my\/characters\/([^/]+)$/);
    if (req.method === "GET" && myCharacterMatch) {
      return await handleGetMyCharacter(req, res, myCharacterMatch[1]);
    }
    if (req.method === "DELETE" && myCharacterMatch) {
      return await handleDeleteMyCharacter(req, res, myCharacterMatch[1]);
    }

    const myCharacterImageTaskMatch = url.pathname.match(/^\/api\/my\/characters\/([^/]+)\/image$/);
    if (req.method === "GET" && myCharacterImageTaskMatch) {
      return await handleRefreshMyCharacterImage(req, res, myCharacterImageTaskMatch[1]);
    }

    const myCharacterMainTaskMatch = url.pathname.match(/^\/api\/my\/characters\/([^/]+)\/main-video$/);
    if (req.method === "GET" && myCharacterMainTaskMatch) {
      return await handleQueryMyCharacterMainVideo(req, res, myCharacterMainTaskMatch[1]);
    }

    const myCharacterSceneCreateMatch = url.pathname.match(/^\/api\/my\/characters\/([^/]+)\/scene-video$/);
    if (req.method === "POST" && myCharacterSceneCreateMatch) {
      return await handleCreateMyCharacterSceneVideo(req, res, myCharacterSceneCreateMatch[1]);
    }

    const myCharacterSceneTaskMatch = url.pathname.match(/^\/api\/my\/scene-video\/([^/]+)$/);
    if (req.method === "GET" && myCharacterSceneTaskMatch) {
      return await handleQueryMyCharacterSceneVideo(req, res, myCharacterSceneTaskMatch[1]);
    }

    if (req.method === "GET" && url.pathname === "/api/character-assets") {
      const assets = await getKv("character_assets", {});
      return sendJson(res, 200, { ok: true, assets: assets && typeof assets === "object" ? assets : {} });
    }

    if (["GET", "POST"].includes(req.method) && url.pathname === "/" && byteplusAssetActionRequested(url)) {
      if (!apiAccessEnabledForRequest(req)) return sendApiAccessDisabled(res);
      return await handleByteplusAssetAction(req, res, url);
    }

    if (req.method === "GET" && url.pathname === "/api/generation-records") {
      return await handleListGenerationRecords(req, res, url);
    }

    const downloadUrlGenerationRecordMatch = url.pathname.match(/^\/api\/generation-records\/([^/]+)\/download-url$/);
    if (req.method === "GET" && downloadUrlGenerationRecordMatch) {
      return await handleGenerationRecordDownloadUrl(req, res, decodeURIComponent(downloadUrlGenerationRecordMatch[1]), url);
    }

    const downloadGenerationRecordMatch = url.pathname.match(/^\/api\/generation-records\/([^/]+)\/download$/);
    if ((req.method === "GET" || req.method === "HEAD") && downloadGenerationRecordMatch) {
      return await handleDownloadGenerationRecord(req, res, decodeURIComponent(downloadGenerationRecordMatch[1]), url);
    }

    const generationRecordMatch = url.pathname.match(/^\/api\/generation-records\/([^/]+)$/);
    if (req.method === "GET" && generationRecordMatch) {
      return await handleGetGenerationRecord(req, res, decodeURIComponent(generationRecordMatch[1]));
    }
    if (req.method === "DELETE" && generationRecordMatch) {
      return await handleDeleteGenerationRecord(req, res, decodeURIComponent(generationRecordMatch[1]));
    }
    const regenerateGenerationRecordMatch = url.pathname.match(/^\/api\/generation-records\/([^/]+)\/regenerate$/);
    if (req.method === "POST" && regenerateGenerationRecordMatch) {
      return await handleRegenerateGenerationRecord(req, res, decodeURIComponent(regenerateGenerationRecordMatch[1]));
    }

    if (req.method === "POST" && url.pathname === "/api/scene-video") {
      return await handleCreateSceneVideo(req, res);
    }

    const taskMatch = url.pathname.match(/^\/api\/scene-video\/([^/]+)$/);
    if (req.method === "GET" && taskMatch) {
      return await handleGetSceneVideo(req, res, taskMatch[1]);
    }

    if (url.pathname.startsWith("/api/")) {
      return sendJson(res, 404, { ok: false, message: "API not found." });
    }

    return await serveStatic(req, res, url);
  } catch (error) {
    const statusCode = error.statusCode || (error.code === "MISSING_ARK_API_KEY" ? 503 : 500);
    console.error("[api-error]", {
      method: req.method,
      path: url.pathname,
      code: error.code || "SERVER_ERROR",
      message: error.message,
      cause: error.cause?.code || error.cause?.message || "",
    });
    return sendJson(res, statusCode, {
      ok: false,
      code: error.code || "SERVER_ERROR",
      message: error.message || "Server error",
      detail: error.payload?.error?.message || error.payload?.message || error.cause?.message || "",
    });
  }
}

