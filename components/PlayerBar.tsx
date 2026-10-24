"use client";

import type { Track, VideoCandidate } from "@/lib/types";
import { CloseIcon } from "./Icons";

export default function PlayerBar({
  track,
  video,
  onClose,
}: {
  track: Track;
  video: VideoCandidate;
  onClose: () => void;
}) {
  return (
    <div className="playerbar" role="region" aria-label="Now playing">
      <div className="playerbar-frame">
        <iframe
          key={video.videoId}
          src={`https://www.youtube.com/embed/${video.videoId}?autoplay=1&rel=0&modestbranding=1`}
          title={video.title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>

      <div className="playerbar-meta">
        <div className="playerbar-topline">
          <span className="eq" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="eyebrow">Now playing</span>
        </div>
        <strong>{track.title}</strong>
        <span className="playerbar-sub">{video.title}</span>
      </div>

      <button type="button" className="icon-btn" onClick={onClose} aria-label="Close player">
        <CloseIcon />
      </button>
    </div>
  );
}
