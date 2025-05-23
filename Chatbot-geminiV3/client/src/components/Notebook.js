// import React, { useEffect, useRef } from 'react';

// const Notebook = () => {
//   const iframeRef = useRef(null);

//   useEffect(() => {
//     const username = localStorage.getItem("username");
//     if (!username) {
//       console.error("Username not found in localStorage.");
//       return;
//     }

//     const sendUsername = () => {
//       iframeRef.current?.contentWindow?.postMessage(
//         { type: "SET_USERNAME", username },
//         "http://127.0.0.1:5000"
//       );
//     };

//     // Give time for iframe to load
//     const timer = setTimeout(sendUsername, 1000);
//     return () => clearTimeout(timer);
//   }, []);

//   return (
//     <div style={{
//       position: 'fixed',
//       top: 0,
//       left: 0,
//       width: '100vw',
//       height: '100vh',
//       margin: 0,
//       padding: 0,
//       zIndex: 1000,
//       background: '#1a1a1a'
//     }}>
//       <iframe
//         ref={iframeRef}
//         src="http://127.0.0.1:5000"
//         title="Notebook App"
//         sandbox="allow-scripts allow-same-origin"
//         style={{
//           width: '100vw',
//           height: '100vh',
//           border: 'none',
//           margin: 0,
//           padding: 0,
//           background: '#1a1a1a'
//         }}
//         allowFullScreen
//       />
//     </div>
//   );
// };

// export default Notebook;


import React, { useEffect, useRef } from 'react';

const Notebook = () => {
  const iframeRef = useRef(null);

  useEffect(() => {
    const username = localStorage.getItem('username');
    const sessionId = localStorage.getItem('sessionId');
    const sendMessageToIframe = () => {
      if (iframeRef.current) {
        iframeRef.current.contentWindow.postMessage(
          { type: 'SET_USER_AND_SESSION', username, sessionId },
          'http://localhost:5000' // target origin
        );
      }
    };

    // Wait for iframe to load
    const iframe = iframeRef.current;
    iframe?.addEventListener('load', sendMessageToIframe);

    return () => {
      iframe?.removeEventListener('load', sendMessageToIframe);
    };
  }, []);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      margin: 0,
      padding: 0,
      zIndex: 1000,
      background: '#1a1a1a'
    }}>
      <iframe
        ref={iframeRef}
        src="http://localhost:5000"
        title="Notebook App"
        sandbox="allow-scripts allow-same-origin"
        style={{
          width: '100vw',
          height: '100vh',
          border: 'none',
          margin: 0,
          padding: 0,
          background: '#1a1a1a'
        }}
        allowFullScreen
      />
    </div>
  );
};

export default Notebook;

