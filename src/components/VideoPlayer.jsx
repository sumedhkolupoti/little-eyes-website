import React, { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { AlertTriangle } from "lucide-react";

const VideoPlayer = ({ url, camId }) => {
  const videoRef = useRef(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let hls;
    setLoading(true);

    if (videoRef.current) {
      const video = videoRef.current;

      if (Hls.isSupported()) {
        console.log(`[Cam ${camId}] Initializing HLS.js for URL:`, url);

        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          debug: false,
          liveDurationInfinity: true,
          maxBufferLength: 60,
          maxMaxBufferLength: 120,
          maxBufferSize: 60 * 1000 * 1000,
          manifestLoadingRetryDelay: 500,
          manifestLoadingMaxRetry: 10,
          xhrSetup: function (xhr, url) {
            xhr.withCredentials = false;
          },
          fetchSetup: function (context, initParams) {
            initParams.mode = "cors";
            initParams.credentials = "omit";
            return new Request(context.url, initParams);
          },
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
          console.error(`[Cam ${camId}] HLS.js error:`, data.type, data.details, data);

          if (data.fatal) {
            setLoading(true); // Keep showing loading on fatal errors during recovery
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.error(`[Cam ${camId}] Network error - attempting recovery...`);
                setTimeout(() => hls.startLoad(), 1000);
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.error(`[Cam ${camId}] Media error - attempting recovery...`);
                hls.recoverMediaError();
                break;
              default:
                console.error(`[Cam ${camId}] Fatal error - cannot recover automatically`);
                break;
            }
          }
        });

        hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
          console.log(`[Cam ${camId}] Manifest parsed:`, data);
          setLoading(false);
          video.play().catch((e) => {
            console.error(`[Cam ${camId}] Auto-play blocked:`, e);
          });
        });

        hls.on(Hls.Events.MANIFEST_LOADING, () => {
          console.log(`[Cam ${camId}] Loading manifest...`);
          setLoading(true);
        });

        hls.on(Hls.Events.LEVEL_LOADED, (event, data) => {
          console.log(`[Cam ${camId}] Level loaded:`, data.details);
        });

        hls.loadSource(url);
        hls.attachMedia(video);
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        console.log(`[Cam ${camId}] Using native HLS support`);
        video.src = url;
        video.crossOrigin = "anonymous";

        video.addEventListener("loadedmetadata", () => {
          console.log(`[Cam ${camId}] Metadata loaded`);
          setLoading(false);
          video.play().catch((e) => {
            console.error(`[Cam ${camId}] Auto-play blocked:`, e);
          });
        });

        video.addEventListener("error", (e) => {
          console.error(`[Cam ${camId}] Video error:`, e);
          setLoading(true); // Show loading on error
        });
      } else {
        console.error(`[Cam ${camId}] HLS not supported in this browser`);
        setLoading(true);
      }
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [url, camId]);

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
          controls={true}
          muted
          playsInline
          autoPlay
          crossOrigin="anonymous"
        />
        {loading && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              color: "white",
              background: "rgba(0,0,0,0.7)",
              padding: "10px 20px",
              borderRadius: "5px",
            }}
          >
            Loading stream...
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoPlayer;
