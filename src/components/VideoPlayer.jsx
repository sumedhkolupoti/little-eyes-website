import React, { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { AlertTriangle } from "lucide-react";

const VideoPlayer = ({ url, camId }) => {
  const videoRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let hls;
    setError(null);
    setLoading(true);

    if (videoRef.current) {
      const video = videoRef.current;

      if (Hls.isSupported()) {
        console.log(`[Cam ${camId}] Initializing HLS.js for URL:`, url);

        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false, // Disabling LL-mode as it can cause jumps with AWS KVS 1s fragments
          debug: false,
          // Robust settings for AWS KVS / Live streams with short fragments
          liveSyncDurationCount: 6, // Start 6 segments from the live edge (more safety)
          liveMaxLatencyDurationCount: 12, // Allow more drift before seeking
          maxBufferLength: 30,             // Must be larger than (liveSyncDurationCount * 2s) to prevent stalling
          maxMaxBufferLength: 60,
          maxBufferSize: 60 * 1000 * 1000,
          // Nudge settings help skip over "stuck" or looping points
          nudgeOffset: 0.2,
          nudgeMaxRetry: 10,
          backStep: 0, // Prevent stepping back
          manifestLoadingRetryDelay: 500,
          manifestLoadingMaxRetry: 10,
          // CORS settings
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
          console.error(
            `[Cam ${camId}] HLS.js error:`,
            data.type,
            data.details,
            data,
          );

          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.error(
                  `[Cam ${camId}] Network error - attempting recovery...`,
                );
                setError("Network error - retrying...");
                setTimeout(() => hls.startLoad(), 1000);
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.error(
                  `[Cam ${camId}] Media error - attempting recovery...`,
                );
                setError("Media error - recovering...");
                hls.recoverMediaError();
                break;
              default:
                console.error(`[Cam ${camId}] Fatal error - cannot recover`);
                setError(`Stream error: ${data.details}`);
                setLoading(false);
                break;
            }
          }
        });

        hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
          console.log(`[Cam ${camId}] Manifest parsed:`, data);
          setLoading(false);
          setError(null);
          video.play().catch((e) => {
            console.error(`[Cam ${camId}] Auto-play blocked:`, e);
            setError("Click to play");
          });
        });

        hls.on(Hls.Events.MANIFEST_LOADING, () => {
          console.log(`[Cam ${camId}] Loading manifest...`);
        });

        hls.on(Hls.Events.LEVEL_LOADED, (event, data) => {
          console.log(`[Cam ${camId}] Level loaded:`, data.details);
        });

        hls.loadSource(url);
        hls.attachMedia(video);
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // For Safari (native HLS support)
        console.log(`[Cam ${camId}] Using native HLS support`);
        video.src = url;
        video.crossOrigin = "anonymous";

        video.addEventListener("loadedmetadata", () => {
          console.log(`[Cam ${camId}] Metadata loaded`);
          setLoading(false);
          video.play().catch((e) => {
            console.error(`[Cam ${camId}] Auto-play blocked:`, e);
            setError("Click to play");
          });
        });

        video.addEventListener("error", (e) => {
          console.error(`[Cam ${camId}] Video error:`, e);
          setError("Failed to load stream");
          setLoading(false);
        });
      } else {
        console.error(`[Cam ${camId}] HLS not supported in this browser`);
        setError("HLS not supported in this browser");
        setLoading(false);
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
          controls={false}
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
        {error && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              color: "#ff4444",
              background: "rgba(0,0,0,0.9)",
              padding: "15px 25px",
              borderRadius: "8px",
              textAlign: "center",
              maxWidth: "80%",
            }}
          >
            <AlertTriangle size={24} style={{ marginBottom: "8px" }} />
            <div>{error}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoPlayer;
