import React, { useMemo } from 'react';
import VideoPlayer from './components/VideoPlayer';
import { HelpCircle } from 'lucide-react';

function App() {
  const queryParams = new URLSearchParams(window.location.search);

  // Parameters: 
  // url1, url2, url3, etc: individual HLS URLs
  // cams: number of cameras
  // client: client name
  const camsCount = parseInt(queryParams.get('cams')) || 1;

  const cams = useMemo(() => {
    const cameras = [];
    for (let i = 1; i <= camsCount; i++) {
      const url = queryParams.get(`url${i}`);
      if (url) {
        cameras.push({ id: i, url });
      }
    }
    return cameras;
  }, [camsCount]);

  const expiryTime = queryParams.get('expires');
  const [timeLeft, setTimeLeft] = React.useState('');

  React.useEffect(() => {
    if (!expiryTime) return;

    const calculateTimeLeft = () => {
      const difference = new Date(expiryTime) - new Date();
      if (difference <= 0) {
        setTimeLeft('Expired');
        return;
      }

      const hours = Math.floor((difference / (1000 * 60 * 60)));
      const minutes = Math.floor((difference / 1000 / 60) % 60);
      const seconds = Math.floor((difference / 1000) % 60);

      const parts = [];
      if (hours > 0) parts.push(String(hours).padStart(2, '0'));
      parts.push(String(minutes).padStart(2, '0'));
      parts.push(String(seconds).padStart(2, '0'));

      setTimeLeft(parts.join(':'));
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(timer);
  }, [expiryTime]);

  const gridClass = camsCount > 1 ? 'video-grid multi' : 'video-grid single';

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

  return (
    <div className="app-container">
      <header className="header">
        <div className="logo">
          <img src="/logo.png" alt="Aeye Logo" />
        </div>
        {timeLeft && (
          <div className={`expiry-timer ${timeLeft === 'Expired' ? 'expired' : ''}`}>
            {timeLeft === 'Expired' ? 'Link Expired' : `Expires in: ${timeLeft}`}
          </div>
        )}
      </header>

      <main className={gridClass}>
        {cams.map((cam) => (
          <VideoPlayer key={cam.id} url={cam.url} camId={cam.id} />
        ))}
      </main>

      <footer className="footer">
        powered by <a href="https://aeye.camera/" target="_blank" rel="noopener noreferrer">Aeye.Camera</a>
      </footer>
    </div>
  );
}

export default App;
