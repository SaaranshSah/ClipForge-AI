// V4 Thumbnail pipeline — compatible with existing architecture (Firebase Storage, same as clips/shorts)
// Thumbnails stored at users/{uid}/videos/{videoId}/shorts/{shortId}.jpg (9:16 vertical) or thumbnails/ subfolder

export function thumbnailPathForShort(uid: string, videoId: string, shortId: string): string {
  return `users/${uid}/videos/${videoId}/shorts/${shortId}.jpg`;
}

// Generate thumbnail metadata — in production would extract frame at highlight midpoint and overlay title
export function generateThumbnailMeta(opts: {
  shortId: string;
  title: string;
  highlightType: string;
  captionStyle: string;
  duration: number;
}): { thumbnailPath: string; frameTime: number; overlay: string } {
  // Pick frame at 30% into highlight where action is (not black)
  const frameTime = Math.max(0.5, opts.duration * 0.3);
  const overlay = `${opts.title.slice(0, 24)} • ${opts.highlightType.replace(/_/g, " ")} • ${opts.captionStyle}`;
  return {
    thumbnailPath: `users/{uid}/videos/{videoId}/shorts/${opts.shortId}.jpg` as any, // placeholder, real path set by server
    frameTime,
    overlay,
  };
}
