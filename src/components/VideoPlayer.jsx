import React, { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { AlertTriangle } from 'lucide-react';

const VideoPlayer = ({ url, camId }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    let hls;
    if (videoRef.current) {
      const video = videoRef.current;

      if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
        });
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(e => console.error("Auto-play blocked:", e));
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // For Safari
        video.src = url;
        video.addEventListener('loadedmetadata', () => {
          video.play().catch(e => console.error("Auto-play blocked:", e));
        });
      }
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [url]);

  const goToLive = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      // Seek to a very large value to jump to the live edge
      // Most players/HLS.js will handle this by seeking to the most recent segment
      video.currentTime = video.duration || Infinity;
    }
  };

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
          controls={false}
          muted
          playsInline
          autoPlay
        />
      </div>
    </div>
  );
};

export default VideoPlayer;
