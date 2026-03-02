import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { AlertTriangle } from 'lucide-react';

const VideoPlayer = ({ url, camId }) => {
  const videoRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [streamEnded, setStreamEnded] = useState(false);

  useEffect(() => {
    let hls;
    setError(null);
    setLoading(true);
    setStreamEnded(false);

    if (videoRef.current) {
      const video = videoRef.current;

      if (Hls.isSupported()) {
        console.log(`[Cam ${camId}] Initializing HLS.js for URL:`, url);

        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          debug: false,
          // Minimal buffering for real-time feel
          maxBufferLength: 2,             // Only 2s buffer
          maxMaxBufferLength: 4,          // Max 4s buffer  
          maxBufferSize: 2 * 1000 * 1000, // 2MB buffer
          maxBufferHole: 0.1,             // Minimal gap tolerance
          liveSyncDurationCount: 1,       // Stay at absolute live edge (1 segment)
          liveMaxLatencyDurationCount: 3, // Max 3 segments behind
          backBufferLength: 0,            // No back buffer
          // Fast retries
          manifestLoadingTimeOut: 8000,
          manifestLoadingMaxRetry: 3,
          manifestLoadingRetryDelay: 500,
          levelLoadingTimeOut: 8000,
          levelLoadingMaxRetry: 3,
          levelLoadingRetryDelay: 500,
          fragLoadingTimeOut: 10000,
          fragLoadingMaxRetry: 3,
          fragLoadingRetryDelay: 500,
          // CORS settings
          xhrSetup: function (xhr, url) {
            xhr.withCredentials = false;
            xhr.timeout = 10000;
          },
          fetchSetup: function (context, initParams) {
            initParams.mode = 'cors';
            initParams.credentials = 'omit';
            return new Request(context.url, initParams);
          }
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
          console.error(`[Cam ${camId}] HLS.js error:`, data.type, data.details, data);

          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.error(`[Cam ${camId}] Network error - attempting recovery...`);
                setError('Network error - retrying...');
                setTimeout(() => hls.startLoad(), 1000);
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.error(`[Cam ${camId}] Media error - attempting recovery...`);
                setError('Media error - recovering...');
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
          setStreamEnded(false);
          video.play().catch(e => {
            console.error(`[Cam ${camId}] Auto-play blocked:`, e);
            setError('Click to play');
          });
        });

        // Dynamic playback rate adjustment to stay at live edge
        let catchupInterval = null;
        
        hls.on(Hls.Events.FRAG_LOADED, () => {
          if (video.buffered.length > 0 && !video.paused) {
            const bufferEnd = video.buffered.end(video.buffered.length - 1);
            const currentTime = video.currentTime;
            const latency = bufferEnd - currentTime;
            
            console.log(`[Cam ${camId}] Latency: ${latency.toFixed(2)}s`);
            
            // If we're more than 3 seconds behind, jump forward immediately
            if (latency > 3) {
              console.log(`[Cam ${camId}] Large gap detected - jumping to live edge`);
              video.currentTime = bufferEnd - 0.5;
            } 
            // If we're 1-3 seconds behind, speed up playback to catch up
            else if (latency > 1) {
              video.playbackRate = 1.1; // Play 10% faster to catch up
              console.log(`[Cam ${camId}] Catching up at 1.1x speed`);
            } 
            // If we're within 1 second of live, play at normal speed
            else {
              video.playbackRate = 1.0;
            }
          }
        });

        // Listen for stream end (VOD or live end)
        hls.on(Hls.Events.BUFFER_EOS, () => {
          console.log(`[Cam ${camId}] Stream ended (EOS)`);
          setStreamEnded(true);
        });

        const handleEnded = () => {
          console.log(`[Cam ${camId}] Video element ended`);
          setStreamEnded(true);
        };

        video.addEventListener('ended', handleEnded);

        hls.on(Hls.Events.MANIFEST_LOADING, () => {
          console.log(`[Cam ${camId}] Loading manifest...`);
        });

        hls.on(Hls.Events.LEVEL_LOADED, (event, data) => {
          console.log(`[Cam ${camId}] Level loaded:`, data.details);
        });

        hls.loadSource(url);
        hls.attachMedia(video);

      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // For Safari (native HLS support)
        console.log(`[Cam ${camId}] Using native HLS support`);
        video.src = url;
        video.crossOrigin = 'anonymous';

        video.addEventListener('loadedmetadata', () => {
          console.log(`[Cam ${camId}] Metadata loaded`);
          setLoading(false);
          setStreamEnded(false);
          video.play().catch(e => {
            console.error(`[Cam ${camId}] Auto-play blocked:`, e);
            setError('Click to play');
          });
        });

        const handleEnded = () => {
          console.log(`[Cam ${camId}] Video element ended (native)`);
          setStreamEnded(true);
        };

        video.addEventListener('ended', handleEnded);

        video.addEventListener('error', (e) => {
          console.error(`[Cam ${camId}] Video error:`, e);
          setError('Failed to load stream');
          setLoading(false);
        });
      } else {
        console.error(`[Cam ${camId}] HLS not supported in this browser`);
        setError('HLS not supported in this browser');
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
        {loading && !streamEnded && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: 'white',
            background: 'rgba(0,0,0,0.7)',
            padding: '10px 20px',
            borderRadius: '5px',
            zIndex: 10
          }}>
            Loading stream...
          </div>
        )}
        {streamEnded && (
          <div style={{
            position: 'absolute',
            top: '0',
            left: '0',
            right: '0',
            bottom: '0',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            background: 'rgba(0,0,0,0.85)',
            textAlign: 'center',
            zIndex: 20
          }}>
            <div style={{ fontSize: '1.2rem', marginBottom: '10px' }}>Stream has ended</div>
            <button
              onClick={() => {
                setStreamEnded(false);
                setLoading(true);
                if (videoRef.current) {
                  videoRef.current.load();
                }
              }}
              className="live-button"
              style={{ padding: '8px 16px', borderRadius: '20px' }}
            >
              Reload
            </button>
          </div>
        )}
        {error && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#ff4444',
            background: 'rgba(0,0,0,0.9)',
            padding: '15px 25px',
            borderRadius: '8px',
            textAlign: 'center',
            maxWidth: '80%'
          }}>
            <AlertTriangle size={24} style={{ marginBottom: '8px' }} />
            <div>{error}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoPlayer;
