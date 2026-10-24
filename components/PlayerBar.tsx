"use client";

import { useEffect, useRef, useState } from "react";
import type { Track, VideoCandidate } from "@/lib/types";
import { CloseIcon, SkipIcon } from "./Icons";

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

export default function PlayerBar({
  track,
  video,
  onClose,
  onNext,
}: {
  track: Track;
  video: VideoCandidate;
  onClose: () => void;
  onNext: () => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const currentIdRef = useRef<string>(video.videoId);
  const nextRef = useRef(onNext);
  const [fallback, setFallback] = useState(false);

  // Keep the latest "play next" handler without re-creating the player.
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
    if (playerRef.current?.loadVideoById) {
      playerRef.current.loadVideoById(video.videoId);
    }
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

      <button type="button" className="icon-btn" onClick={onNext} aria-label="Play next track">
        <SkipIcon />
      </button>
      <button type="button" className="icon-btn" onClick={onClose} aria-label="Close player">
        <CloseIcon />
      </button>
    </div>
  );
}
