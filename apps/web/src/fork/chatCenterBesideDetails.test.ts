import { describe, expect, it } from "vite-plus/test";

import { resolveChatCanvasLayout } from "~/components/chat/chatCanvasLayout";

const chatAt = (width: number, centerBesideDetailsCard: boolean, withCard = true) =>
  resolveChatCanvasLayout({
    container: { width, height: 988 },
    maxChatWidth: 736,
    detailsCard: withCard ? { left: width - 292, right: width - 12, bottom: 339 } : null,
    preview: null,
    centerBesideDetailsCard,
  }).chat;

describe("center chat beside thread details", () => {
  it.each([1344, 2200])(
    "centers the chat between the canvas start and the open card at %spx",
    (width) => {
      const chat = chatAt(width, true);
      const cardLeft = width - 292;
      expect(chat.width).toBe(736);
      expect(chat.left).toBe(cardLeft - chat.left - chat.width);
      expect(chat.left).toBeLessThan(chatAt(width, false).left);
    },
  );

  it("keeps 48px before the chat and 32px before the card when the space is tight", () => {
    const chat = chatAt(900, true);
    expect(chat.left).toBe(48);
    expect(900 - 292 - chat.left - chat.width).toBe(32);
  });

  it("centers on the whole canvas when the card is closed", () => {
    expect(chatAt(1344, true, false)).toEqual(chatAt(1344, false, false));
  });
});
