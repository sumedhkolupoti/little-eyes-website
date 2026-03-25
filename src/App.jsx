import React, { useMemo, useState } from 'react';
import VideoPlayer from './components/VideoPlayer';
import { HelpCircle, ChevronLeft, LayoutGrid } from 'lucide-react';

function App() {
  const queryParams = new URLSearchParams(window.location.search);

  // Parameters: 
  // url1, url2, url3, etc: individual HLS URLs
  // cams: number of cameras
  // client: client name
  const camsCount = parseInt(queryParams.get('cams')) || 1;

  const cams = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const count = parseInt(params.get('cams')) || 1;
    const cameras = [];
    for (let i = 1; i <= count; i++) {
      const url = params.get(`url${i}`);
      if (url) {
        cameras.push({ id: i, url });
      }
    }
    return cameras;
  }, []); // Only compute once on mount

  const [selectedCamId, setSelectedCamId] = useState(null);
  const expiryTime = queryParams.get('expires');
  const [timeLeft, setTimeLeft] = React.useState('');

  React.useEffect(() => {
    if (!expiryTime) return;

    const calculateTimeLeft = () => {
      // Robust UTC Parsing: Ensure any ISO-like string is treated as UTC
      let expiryStr = expiryTime;
      if (expiryStr.includes('T') && !expiryStr.endsWith('Z') && !expiryStr.includes('+')) {
        expiryStr += 'Z';
      }

      const expiryDate = new Date(expiryStr);
      const difference = expiryDate.getTime() - Date.now();

      if (difference <= 0) {
        setTimeLeft('Expired');
        return;
      }

      // Format as "2:30 pm"
      const formattedTime = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }).format(expiryDate).toLowerCase();

      setTimeLeft(formattedTime);
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(timer);
  }, [expiryTime]);

  if (cams.length === 0) {
    return (
      <div className="app-container">
        <div className="error-container">
          <HelpCircle size={64} className="error-icon" />
          <h1>Oops!</h1>
          <p>We couldn't find any cameras. Please check the link!</p>
        </div>
      </div>
    );
  }

  const selectedCam = cams.find(cam => cam.id === selectedCamId);

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-left">
          {selectedCamId && (
            <button className="back-button" onClick={() => setSelectedCamId(null)}>
              <ChevronLeft size={20} />
              <span>Back to Cameras</span>
            </button>
          )}
          <div className="logo">
            <img src="/logo.png" alt="Aeye Logo" />
          </div>
        </div>
        {timeLeft && (
          <div className={`expiry-timer ${timeLeft === 'Expired' ? 'expired' : ''}`}>
            {timeLeft === 'Expired' ? 'Link Expired' : `Link valid until ${timeLeft}`}
          </div>
        )}
      </header>

      <main className="main-content">
        {!selectedCamId ? (
          <div className="selector-view">
            <div className="selector-header">
              <h1>Select a Camera to Watch</h1>
              <p>Choose one of the {cams.length} available cameras</p>
            </div>
            <div className="video-grid multi">
              {cams.map((cam) => (
                <div
                  key={cam.id}
                  className="camera-card clickable"
                  onClick={() => setSelectedCamId(cam.id)}
                >
                  <VideoPlayer url={cam.url} camId={cam.id} isThumbnail={true} />
                  <div className="cam-footer">
                    <span className="cam-label">Camera {cam.id}</span>
                    <span className="view-badge">View Live</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="single-view">
            <VideoPlayer url={selectedCam.url} camId={selectedCam.id} />
          </div>
        )}
      </main>

      <footer className="footer">
        Powered by <a href="https://aeye.camera/" target="_blank" rel="noopener noreferrer">Aeye.Camera</a>
      </footer>
    </div>
  );
}

export default App;
