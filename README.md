# ChatGPT Conversation Copier

**A Google Chrome extension for Windows and Mac that copies an entire ChatGPT conversation** to your clipboard as Markdown. Works well for very long chats. (chatgpt.com only)

## What problem is this solving?

Currently, ChatGPT does not provide a built-in option to download or copy an entire conversation. In addition, copying, saving, or printing a long conversation captures only part of it because ChatGPT uses virtualized rendering. With virtualized rendering, the browser keeps only the messages currently visible (plus a small buffer) in the page. As you scroll, older messages are loaded dynamically, while messages that move out of view may be removed from the page to reduce memory usage. As a result, it's not possible to copy an entire long conversation using the browser alone.


This extension automatically loads the complete conversation, preserving all user prompts and ChatGPT responses, and exports it as a Markdown file or copies it to the clipboard. It also provides a more private way to share conversations with others, instead of using ChatGPT's Share feature, which creates a publicly accessible link.


## How it works

1. You open a conversation on `chatgpt.com` and click the extension's toolbar icon.
2. The content script finds the scrollable chat container and automatically
   scrolls from the very top of the conversation to the bottom.
3. As each batch of messages renders, it's captured and converted from HTML
   into Markdown (headings, bold/italic, links, lists, tables, and fenced
   code blocks with language tags are all preserved).
4. Because ChatGPT unmounts messages that scroll out of view, messages are
   harvested continuously during the scroll, then de-duplicated and put back
   in the correct order.
5. The final Markdown is copied to your clipboard, with `+++` inserted before
   each user message. A small toast on the page confirms how many messages
   were copied, and the toolbar icon shows a ✓ (or ! on failure).

## Install (unpacked / Chrome)

1. Download/unzip this folder somewhere permanent (don't delete it after
   installing — Chrome loads the extension directly from these files).
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `chatgpt-copier` folder.
5. Pin the extension (puzzle-piece icon in the toolbar → pin) so it's easy to click.

## Usage

1. Go to `https://chatgpt.com/` and open the conversation you want to copy.
2. Click the extension icon.
3. Wait a moment while it scrolls through the whole conversation (long chats
   take longer since it has to let each part render). You'll see a
   "Capturing conversation…" toast, then a "Copied N messages ✓" toast.
4. Paste anywhere. You'll get clean Markdown.

## Customizing the prompt/reply markers

You can change what's placed before *and* after both user prompts and assistant replies:

1. Right-click the extension's toolbar icon and choose **Options** (or go to
   `chrome://extensions`, find the extension, click **Details**, then
   **Extension options**).
2. Fill in any of the four fields below.You can also use actual line breaks in the box for newlines. A live preview updates as you type.
   - "Before user prompt"
   - "After user prompt"
   - "Before assistant reply"
   - "After assistant reply"
3. Click **Save settings**. New copies will use the updated format
   immediately (no need to reload ChatGPT).

Example:
By default user prompts are prefixed with `+++`.
If you set `000` as "Before assistant reply" you see this format:

   ```
   +++
   This is the 1st prompt.

   000
   This is the 1st response.

   +++
   This is the 2nd prompt.

   000
   This is the 2nd response.
   ```


## Notes & limitations

- Works only on `https://chatgpt.com/*` — the icon will flash a red `!` on
  any other site.
- Messages are ordered by each conversation turn's own index (from
  `data-testid="conversation-turn-N"`), not by the order the scraper
  happened to see them while scrolling. This matters because ChatGPT can
  render/settle parts of a long chat out of sequence while it's still
  loading (e.g. the tail sometimes paints before earlier history finishes),
  so capture-time order isn't reliable — but each turn's own index always
  reflects where it really sits in the conversation.
- Scrolling speed is deliberately conservative (small delays between steps)
  so very long conversations have time to render; extremely long chats may
  take a few seconds to fully capture. Don't switch tabs while it's
  working — some sites pause background tab rendering.
- ChatGPT's internal DOM structure can change over time (it's not a public
  API). This extension looks for `[data-message-id]` /
  `[data-message-author-role]` attributes and `.markdown` content blocks,
  which have been stable for a while, but if OpenAI changes their markup
  the selectors in `content.js` (`findScrollContainer`, `getMessageContentEl`,
  `getRole`) may need small updates.
- System/tool messages (e.g. memory updates) are skipped — only `user` and
  `assistant` turns are included.
- Only the currently open branch of the conversation is captured (if you've
  edited/regenerated messages, ChatGPT only renders one branch at a time,
  and that's the one you'll get).

## Files

- `manifest.json` — Manifest V3 configuration.
- `background.js` — Handles the toolbar icon click and relays to the content script.
- `content.js` — Scrolls the page, scrapes messages, converts HTML→Markdown, applies your marker settings, copies to clipboard.
- `options.html` / `options.js` — Settings page for the before/after markers (right-click the icon → Options).
- `icons/` — Toolbar icons.
