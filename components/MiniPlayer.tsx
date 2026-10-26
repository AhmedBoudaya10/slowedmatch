"use client";

import { useEffect, useRef, useState } from "react";
import type { Track, VideoCandidate } from "@/lib/types";
import { CloseIcon, HeartIcon, SkipIcon } from "./Icons";

/* ------------------------------------------------------------------ */
/* YouTube IFrame API (needed to auto-play the next video in-session)  */
/* ------------------------------------------------------------------ */

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<any> | null = null;

function youTubeApi(): Promise<any> {
  if (!ytApiPromise) {
    ytApiPromise = new Promise((resolve, reject) => {
      if (window.YT?.Player) {
        resolve(window.YT);
        return;
      }

      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve(window.YT);
      };

      if (!document.getElementById("yt-iframe-api")) {
        const script = document.createElement("script");
        script.id = "yt-iframe-api";
        script.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(script);
      }

      window.setTimeout(() => reject(new Error("YouTube player API timed out")), 10_000);
    });
  }
  return ytApiPromise;
}

/* ------------------------------------------------------------------ */

export default function MiniPlayer({
  track,
  video,
  saved,
  onClose,
  onNext,
  onFavorite,
  onExpand,
}: {
  track: Track;
  video: VideoCandidate;
  saved: boolean;
  onClose: () => void;
  onNext: () => void;
  onFavorite: () => void;
  onExpand: () => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const currentIdRef = useRef<string>(video.videoId);
  const nextRef = useRef(onNext);
  const [fallback, setFallback] = useState(false);

  nextRef.current = onNext;

  useEffect(() => {
    let cancelled = false;

    youTubeApi()
      .then((YT) => {
        if (cancelled || !hostRef.current) return;
        playerRef.current = new YT.Player(hostRef.current, {
          width: "100%",
          height: "100%",
          videoId: video.videoId,
          title: video.title,
          playerVars: {
            autoplay: 1,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
          },
          events: {
            onStateChange: (event: any) => {
              // 0 === YT.PlayerState.ENDED
              if (event.data === 0) nextRef.current();
            },
          },
        });
      })
      .catch(() => {
        if (!cancelled) setFallback(true);
      });

    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* player may already be gone */
      }
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap videos in the same player instance so autoplay is allowed to continue.
  useEffect(() => {
    if (video.videoId === currentIdRef.current) return;
    currentIdRef.current = video.videoId;
    playerRef.current?.loadVideoById?.(video.videoId);
  }, [video.videoId]);

  return (
    <div className="playerbar" role="region" aria-label="Now playing">
      <div className="playerbar-frame">
        <div ref={hostRef} aria-hidden={fallback || undefined} />
        {fallback && (
          <iframe
            src={`https://www.youtube.com/embed/${video.videoId}?autoplay=1&rel=0&modestbranding=1`}
            title={video.title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        )}
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

      <div className="playerbar-actions">
        <button
          type="button"
          className={`icon-btn heart${saved ? " on" : ""}`}
          onClick={onFavorite}
          aria-pressed={saved}
          aria-label={saved ? "Remove from favorites" : "Save to favorites"}
        >
          <HeartIcon size={15} filled={saved} />
        </button>
        <button type="button" className="icon-btn" onClick={onExpand} aria-label="Open on YouTube">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 4h6v6M20 4l-8.5 8.5" />
            <path d="M19 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4" />
          </svg>
        </button>
        <button type="button" className="icon-btn" onClick={onNext} aria-label="Play next track">
          <SkipIcon size={15} />
        </button>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close player">
          <CloseIcon size={16} />
        </button>
      </div>
    </div>
  );
}
