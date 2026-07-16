// content.js — Runs on https://chatgpt.com/*
// Scrapes the currently open conversation (handling virtualized/long chats by
// auto-scrolling and accumulating messages as they render), converts each
// message's HTML to Markdown, prefixes user prompts with "+++", and copies
// the result to the clipboard.

(() => {
  if (window.__chatgptCopierInstalled) return; // avoid double-injection
  window.__chatgptCopierInstalled = true;

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------------------------------------------------------------------
  // HTML -> Markdown conversion
  // ---------------------------------------------------------------------

  function walk(node) {
    let out = "";
    for (const child of node.childNodes) out += nodeToMd(child);
    return out;
  }

  function textOf(node) {
    return walk(node);
  }

  function nodeToMd(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent.replace(/\u00a0/g, " ");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const tag = node.tagName.toLowerCase();

    switch (tag) {
      case "p":
        return walk(node).trim() + "\n\n";
      case "br":
        return "\n";
      case "strong":
      case "b": {
        const inner = walk(node);
        return inner.trim() ? "**" + inner.trim() + "**" : "";
      }
      case "em":
      case "i": {
        const inner = walk(node);
        return inner.trim() ? "*" + inner.trim() + "*" : "";
      }
      case "s":
      case "del": {
        const inner = walk(node);
        return inner.trim() ? "~~" + inner.trim() + "~~" : "";
      }
      case "code": {
        if (node.parentElement && node.parentElement.tagName.toLowerCase() === "pre") {
          return node.textContent; // handled by the <pre> case
        }
        return "`" + node.textContent + "`";
      }
      case "pre": {
        const codeEl = node.querySelector("code");
        let lang = "";
        if (codeEl) {
          const m = codeEl.className.match(/language-([\w-]+)/);
          if (m) lang = m[1];
        }
        const codeText = (codeEl ? codeEl.textContent : node.textContent).replace(/\n+$/, "");
        return "```" + lang + "\n" + codeText + "\n```\n\n";
      }
      case "a": {
        const href = node.getAttribute("href") || "";
        const label = walk(node).trim();
        return href ? `[${label}](${href})` : label;
      }
      case "img": {
        const alt = node.getAttribute("alt") || "";
        const src = node.getAttribute("src") || "";
        return `![${alt}](${src})`;
      }
      case "ul":
        return listToMd(node, false) + "\n\n";
      case "ol":
        return listToMd(node, true) + "\n\n";
      case "blockquote": {
        const inner = walk(node).trim();
        return (
          inner
            .split("\n")
            .map((l) => "> " + l)
            .join("\n") + "\n\n"
        );
      }
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6": {
        const level = Number(tag[1]);
        return "#".repeat(level) + " " + walk(node).trim() + "\n\n";
      }
      case "hr":
        return "\n---\n\n";
      case "table":
        return tableToMd(node) + "\n\n";
      case "thead":
      case "tbody":
      case "tfoot":
        return walk(node);
      case "script":
      case "style":
      case "button":
      case "svg":
        return ""; // skip UI chrome / icons / copy buttons etc.
      default:
        return walk(node);
    }
  }

  function listToMd(listEl, ordered, depth = 0) {
    let out = "";
    let idx = 1;
    const indent = "  ".repeat(depth);
    for (const li of Array.from(listEl.children)) {
      if (li.tagName.toLowerCase() !== "li") continue;
      const marker = ordered ? `${idx++}. ` : "- ";
      let liText = "";
      const nestedLists = [];
      for (const child of li.childNodes) {
        if (
          child.nodeType === Node.ELEMENT_NODE &&
          (child.tagName.toLowerCase() === "ul" || child.tagName.toLowerCase() === "ol")
        ) {
          nestedLists.push(child);
        } else {
          liText += nodeToMd(child);
        }
      }
      out += indent + marker + liText.trim() + "\n";
      for (const nested of nestedLists) {
        out += listToMd(nested, nested.tagName.toLowerCase() === "ol", depth + 1);
      }
    }
    return out.replace(/\n+$/, "\n");
  }

  function tableToMd(table) {
    const rows = Array.from(table.querySelectorAll("tr"));
    if (!rows.length) return "";
    const rowCells = (row) =>
      Array.from(row.children).map((c) => walk(c).trim().replace(/\n/g, " ") || " ");
    const header = rowCells(rows[0]);
    let out = "| " + header.join(" | ") + " |\n";
    out += "| " + header.map(() => "---").join(" | ") + " |\n";
    for (let i = 1; i < rows.length; i++) {
      out += "| " + rowCells(rows[i]).join(" | ") + " |\n";
    }
    return out.trim();
  }

  function htmlToMarkdown(root) {
    return walk(root)
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  // ---------------------------------------------------------------------
  // Finding the scrollable conversation container
  // ---------------------------------------------------------------------

  function findScrollContainer() {
    const anyMsg = document.querySelector("[data-message-id]");
    if (anyMsg) {
      let node = anyMsg.parentElement;
      while (node && node !== document.body) {
        const style = getComputedStyle(node);
        const scrollable =
          (style.overflowY === "auto" || style.overflowY === "scroll") &&
          node.scrollHeight > node.clientHeight + 4;
        if (scrollable) return node;
        node = node.parentElement;
      }
    }
    // Fallback: the tallest scrollable element on the page
    let best = null;
    let bestScore = 0;
    document.querySelectorAll("main, main *").forEach((el) => {
      const style = getComputedStyle(el);
      if (style.overflowY === "auto" || style.overflowY === "scroll") {
        const score = el.scrollHeight - el.clientHeight;
        if (score > bestScore) {
          bestScore = score;
          best = el;
        }
      }
    });
    return best || document.scrollingElement || document.documentElement;
  }

  // ---------------------------------------------------------------------
  // Capturing messages currently in the DOM
  // ---------------------------------------------------------------------

  function getMessageContentEl(msgEl) {
    return (
      msgEl.querySelector(".markdown") ||
      msgEl.querySelector('[class*="whitespace-pre-wrap"]') ||
      msgEl
    );
  }

  function getRole(msgEl) {
    return (
      msgEl.getAttribute("data-message-author-role") ||
      (msgEl.querySelector("[data-message-author-role]") &&
        msgEl.querySelector("[data-message-author-role]").getAttribute("data-message-author-role"))
    );
  }

  function captureVisible(messages) {
    // Anchor on each conversation-turn article, which carries a stable,
    // strictly increasing index (data-testid="conversation-turn-N"). We use
    // N as the sort key for the final transcript instead of "the order we
    // happened to see it while scrolling" — ChatGPT can render/settle
    // messages out of sequence while a long chat is still loading (e.g. the
    // tail can paint before earlier history finishes), so capture-time
    // order is not reliable, but each turn's own index always reflects its
    // true position in the conversation.
    const turnEls = document.querySelectorAll('[data-testid^="conversation-turn-"]');
    turnEls.forEach((turnEl) => {
      const turnKey = turnEl.getAttribute("data-testid") || "";
      const turnIdx = parseTurnIndex(turnKey);
      const roleEls = turnEl.querySelectorAll("[data-message-author-role]");
      roleEls.forEach((roleEl, i) => {
        const role = roleEl.getAttribute("data-message-author-role");
        if (role !== "user" && role !== "assistant") return;

        const id = roleEl.getAttribute("data-message-id") || `${turnKey}:${role}:${i}`;
        const contentEl = getMessageContentEl(roleEl);
        const md = htmlToMarkdown(contentEl);
        if (!md) return;

        const sortKey = turnIdx * 10 + i;
        if (!messages.has(id)) {
          messages.set(id, { role, md, sortKey });
        } else {
          const existing = messages.get(id);
          if (md.length > existing.md.length) existing.md = md;
          existing.sortKey = sortKey;
        }
      });
    });

    // Defensive fallback pass: catch any message elements that for some
    // reason aren't nested under a conversation-turn wrapper. Order them by
    // the nearest turn ancestor if one exists, otherwise by their position
    // among all [data-message-id] elements in the DOM.
    const allMsgEls = document.querySelectorAll("[data-message-id]");
    allMsgEls.forEach((msgEl, domIdx) => {
      const id = msgEl.getAttribute("data-message-id");
      if (messages.has(id)) return; // already captured above
      const role = getRole(msgEl);
      if (!role || (role !== "user" && role !== "assistant")) return;

      const contentEl = getMessageContentEl(msgEl);
      const md = htmlToMarkdown(contentEl);
      if (!md) return;

      const turnAncestor = msgEl.closest('[data-testid^="conversation-turn-"]');
      const sortKey = turnAncestor
        ? parseTurnIndex(turnAncestor.getAttribute("data-testid")) * 10
        : domIdx * 10;

      messages.set(id, { role, md, sortKey });
    });
  }

  function parseTurnIndex(testid) {
    const m = testid && testid.match(/conversation-turn-(\d+)/);
    return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
  }

  // ---------------------------------------------------------------------
  // Settings: customizable text placed before/after each prompt/reply.
  // Stored via chrome.storage.sync so they follow the user across devices.
  // ---------------------------------------------------------------------

  const DEFAULT_FORMAT = {
    beforeUser: "+++\n",
    afterUser: "",
    beforeAssistant: "",
    afterAssistant: "",
  };

  function getPromptFormat() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get({ promptFormat: DEFAULT_FORMAT }, (data) => {
          resolve({ ...DEFAULT_FORMAT, ...(data && data.promptFormat) });
        });
      } catch (e) {
        resolve(DEFAULT_FORMAT);
      }
    });
  }

  // ---------------------------------------------------------------------
  // Main capture routine: scroll from top to bottom, harvesting messages
  // as they render (ChatGPT virtualizes the list, so off-screen messages
  // get unmounted — we must record them the moment they appear). Final
  // order is resolved afterwards from each message's turn index, not from
  // when it was captured.
  // ---------------------------------------------------------------------

  async function captureConversation() {
    const container = findScrollContainer();
    const messages = new Map();

    // 1. Jump to the very top and let React render the earliest messages.
    container.scrollTop = 0;
    await wait(400);
    captureVisible(messages);

    // Some ChatGPT layouts keep loading earlier messages the higher you go
    // (infinite scroll upward too), so nudge to top a few times.
    for (let i = 0; i < 4; i++) {
      if (container.scrollTop <= 0) break;
      container.scrollTop = 0;
      await wait(350);
      captureVisible(messages);
    }

    // 2. Walk downward in viewport-sized steps, capturing along the way.
    let stableTicks = 0;
    let lastScrollTop = -1;
    const maxSteps = 4000; // generous safety cap for extremely long chats
    for (let step = 0; step < maxSteps; step++) {
      captureVisible(messages);

      const atBottom =
        container.scrollTop + container.clientHeight >= container.scrollHeight - 4;
      if (atBottom) {
        captureVisible(messages);
        break;
      }

      const delta = Math.max(200, Math.floor(container.clientHeight * 0.75));
      container.scrollTop += delta;
      await wait(220);

      if (container.scrollTop === lastScrollTop) {
        stableTicks++;
        if (stableTicks > 6) break; // no more movement possible; done
      } else {
        stableTicks = 0;
      }
      lastScrollTop = container.scrollTop;
    }

    // 3. Final settle + capture, in case the last batch was still rendering.
    await wait(300);
    captureVisible(messages);

    const ordered = Array.from(messages.values()).sort((a, b) => a.sortKey - b.sortKey);

    const fmt = await getPromptFormat();
    const parts = ordered.map((m) => {
      if (m.role === "user") {
        return (fmt.beforeUser || "") + m.md.trim() + (fmt.afterUser || "");
      }
      return (fmt.beforeAssistant || "") + m.md.trim() + (fmt.afterAssistant || "");
    });

    return { text: parts.join("\n\n"), count: ordered.length };
  }

  // ---------------------------------------------------------------------
  // Clipboard helper (with execCommand fallback)
  // ---------------------------------------------------------------------

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
      } catch (e2) {
        return false;
      }
    }
  }

  // ---------------------------------------------------------------------
  // Small on-page toast for feedback
  // ---------------------------------------------------------------------

  function showToast(message, isError) {
    const existing = document.getElementById("__chatgpt-copier-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "__chatgpt-copier-toast";
    toast.textContent = message;
    Object.assign(toast.style, {
      position: "fixed",
      bottom: "24px",
      right: "24px",
      zIndex: "2147483647",
      background: isError ? "#d93025" : "#10a37f",
      color: "#fff",
      padding: "10px 16px",
      borderRadius: "8px",
      fontFamily: "system-ui, sans-serif",
      fontSize: "14px",
      boxShadow: "0 2px 10px rgba(0,0,0,0.25)",
      transition: "opacity 0.3s ease",
      opacity: "1",
    });
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 350);
    }, 2600);
  }

  // ---------------------------------------------------------------------
  // Message handling
  // ---------------------------------------------------------------------

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "PING") {
      sendResponse({ ok: true });
      return;
    }

    if (msg && msg.type === "COPY_CONVERSATION") {
      (async () => {
        try {
          if (!document.querySelector("[data-message-id]")) {
            showToast("No open conversation found on this page.", true);
            sendResponse({ ok: false, error: "no-conversation" });
            return;
          }
          showToast("Capturing conversation…");
          const { text, count } = await captureConversation();
          if (!text) {
            showToast("Couldn't find any messages to copy.", true);
            sendResponse({ ok: false, error: "empty" });
            return;
          }
          const copied = await copyToClipboard(text);
          if (copied) {
            showToast(`Copied ${count} messages to clipboard ✓`);
            sendResponse({ ok: true, count });
          } else {
            showToast("Clipboard copy failed.", true);
            sendResponse({ ok: false, error: "clipboard-failed" });
          }
        } catch (err) {
          console.error("ChatGPT Conversation Copier error:", err);
          showToast("Something went wrong copying the conversation.", true);
          sendResponse({ ok: false, error: String(err) });
        }
      })();
      return true; // keep the message channel open for the async response
    }
  });
})();
