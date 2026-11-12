import type { PreviewMiniPlayerObstacles } from "~/components/preview/previewMiniPlayerLayout";

export function resolveChatCenterSpanWidth(
  containerWidth: number,
  detailsCard: PreviewMiniPlayerObstacles["detailsCard"],
  centerBesideDetailsCard: boolean,
): number {
  return centerBesideDetailsCard && detailsCard ? detailsCard.left : containerWidth;
}
