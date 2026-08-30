(() => {
  const els = {
    summary: document.querySelector("#paySummary"),
    button: document.querySelector("#payButton"),
    status: document.querySelector("#payStatus"),
    returnLink: document.querySelector("#returnLink"),
  };
  const params = new URLSearchParams(window.location.search || "");
  const sessionId = String(params.get("sid") || "").trim();
  const stripeSessionId = String(params.get("stripe_sid") || "").trim();
  const isStripe = Boolean(stripeSessionId);
  const activeId = stripeSessionId || sessionId;
  let activeSession = null;

  function setStatus(message = "", tone = "") {
    if (!els.status) return;
    els.status.textContent = message;
    els.status.dataset.tone = tone || "";
  }

  function formatCredits(value) {
    const number = Number(value || 0);
    if (!Number.isFinite(number)) return "0";
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(number);
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: { "content-type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      const reference = String(payload.debugId || "").trim();
      const message = payload.message || payload.detail || `Request failed: ${response.status}`;
      throw new Error(reference ? `${message} payment reference: ${reference}` : message);
    }
    return payload;
  }

  function renderSession(session) {
    activeSession = session || null;
    const order = session?.order || {};
    const amount = order.payableAmountText || order.payableAmount || order.amount || "";
    const currency = order.currency || order.asset || "USD";
    const credits = order.creditAmount || order.packageCredits || 0;
    const status = String(order.status || session?.status || "pending").toLowerCase();
    const paid = status === "paid" || String(session?.status || "").toLowerCase() === "paid";
    const expired = String(session?.status || "").toLowerCase() === "expired";
    const failed = String(session?.status || "").toLowerCase() === "failed";

    if (els.summary) {
      els.summary.innerHTML = `
        <span>Payment amount</span>
        <strong>${amount ? `$${String(amount).replace(/^\$/, "")}` : "--"} ${currency}</strong>
        <small>${formatCredits(credits)} credits will be added after ${isStripe ? "Stripe" : "PayPal"} confirms the payment.</small>
      `;
    }
    if (els.returnLink && session?.returnUrl) els.returnLink.href = session.returnUrl;
    if (els.button) {
      els.button.disabled = paid || expired;
      els.button.textContent = paid ? "Payment completed" : expired ? "Session expired" : failed ? "Try PayPal again" : (isStripe ? "Continue to Stripe" : "Continue to PayPal");
      if (failed && isStripe) els.button.textContent = "Try Stripe again";
    }
    if (paid) setStatus("Payment completed. Credits have been added to your account.", "success");
    else if (expired) setStatus("This payment session has expired. Please create a new top-up order.", "error");
    else if (failed) {
      const reference = String(session?.debugId || "").trim();
      const message = session?.errorMessage || `${isStripe ? "Stripe" : "PayPal"} could not create this payment. Please try again.`;
      setStatus(reference ? `${message} Payment reference: ${reference}` : message, "error");
    }
    else if (params.get("status") === "cancelled") setStatus("Payment was cancelled. You can try again or return to the site.", "");
    else if (params.get("status") === "error") setStatus("PayPal did not complete this payment. Please try again.", "error");
    else setStatus("Review the amount, then continue to PayPal to complete payment.", "");
  }

  async function loadSession() {
    if (!activeId) {
      if (els.summary) els.summary.innerHTML = "<span>No payment session was found.</span>";
      if (els.button) els.button.disabled = true;
      setStatus("Please start payment from the top-up dialog.", "error");
      return;
    }
    try {
      const providerPath = isStripe ? "stripe" : "paypal";
      const payload = await requestJson(`/api/pay/${providerPath}/checkout-sessions/${encodeURIComponent(activeId)}`);
      renderSession(payload.session);
    } catch (error) {
      if (els.summary) els.summary.innerHTML = "<span>Payment session unavailable.</span>";
      if (els.button) els.button.disabled = true;
      setStatus(error.message || String(error), "error");
    }
  }

  async function startPayment() {
    if (!activeId || !els.button) return;
    els.button.disabled = true;
    setStatus(`Opening ${isStripe ? "Stripe" : "PayPal"} checkout...`, "");
    try {
      const providerPath = isStripe ? "stripe" : "paypal";
      const payload = await requestJson(`/api/pay/${providerPath}/checkout-sessions/${encodeURIComponent(activeId)}/start`, {
        method: "POST",
        body: {},
      });
      if (payload.session) renderSession(payload.session);
      const approvalUrl = String(payload.checkoutUrl || payload.approvalUrl || payload.session?.checkoutUrl || payload.session?.approvalUrl || "").trim();
      if (approvalUrl) {
        window.location.href = approvalUrl;
        return;
      }
      if (payload.session?.order?.status === "paid") {
        setStatus("Payment completed. Credits have been added to your account.", "success");
        return;
      }
      throw new Error(`${isStripe ? "Stripe" : "PayPal"} checkout link was not returned.`);
    } catch (error) {
      els.button.disabled = false;
      setStatus(error.message || String(error), "error");
    }
  }

  if (els.button) els.button.addEventListener("click", startPayment);
  loadSession();
})();
