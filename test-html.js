fetch("https://www.youtube.com/watch?v=vvZEBGrUQUI", {
  headers: { 
    "Accept-Language": "en-US,en;q=0.9",
    "Cookie": "CONSENT=YES+cb"
  }
}).then(r => r.text()).then(html => {
  const match = html.match(/"captionTracks"\s*:\s*(\[[\s\S]*?\])\s*,/);
  console.log("Caption tracks match?", !!match);
  if (match) console.log(match[1]);
}).catch(console.error);
