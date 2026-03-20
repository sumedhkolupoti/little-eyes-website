import React, { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

const VideoPlayer = ({ url, camId, isThumbnail = false }) => {
  const videoRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const hlsRef = useRef(null);

  useEffect(() => {
    let hls;
    setLoading(true);

    if (videoRef.current) {
      const video = videoRef.current;

      if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: !isThumbnail,
          debug: false,
          liveDurationInfinity: true,
          maxBufferLength: isThumbnail ? 3 : 60,
          manifestLoadingMaxRetry: 10,
        });

        hlsRef.current = hls;

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setLoading(false);
          video.play().catch((e) => {
            console.warn(`[Cam ${camId}] Auto-play blocked:`, e);
          });
        });

        if (isThumbnail) {
          const onTimeUpdate = () => {
            if (video.currentTime > 0) {
              video.pause();
              hls.stopLoad();
              video.removeEventListener("timeupdate", onTimeUpdate);
              console.log(`[Cam ${camId}] Thumbnail captured, stopping load.`);
            }
          };
          video.addEventListener("timeupdate", onTimeUpdate);
        }

        hls.loadSource(url);
        hls.attachMedia(video);
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = url;
        video.addEventListener("loadeddata", () => {
          setLoading(false);
          if (isThumbnail) {
            video.currentTime = 0.1; // Seek slightly to ensure a frame is rendered
            video.pause();
          } else {
            video.play().catch(e => console.warn(e));
          }
        });
      }
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, [url, camId, isThumbnail]);

  const goToLive = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      video.currentTime = video.duration || Infinity;
    }
  };

  if (isThumbnail) {
    return (
      <div className="video-wrapper thumbnail">
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
        {loading && <div className="loading-overlay">...</div>}
      </div>
    );
  }

  return (
    <div className="video-card">
      <div className="cam-header">
        <div className="cam-label">Camera {camId}</div>
        <button className="live-button" onClick={goToLive}>
          <span className="live-dot"></span>
          LIVE
        </button>
      </div>
      <div className="video-wrapper">
        <video
          ref={videoRef}
          controls={true}
          muted
          playsInline
          autoPlay
          crossOrigin="anonymous"
        />
        {loading && (
          <div className="loading-overlay">
            Loading stream...
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoPlayer;
