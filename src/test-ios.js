fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    context: { 
      client: { 
        clientName: "IOS", 
        clientVersion: "19.28.1",
        osName: "iOS",
        osVersion: "17.5.1",
        hl: "en",
        gl: "US"
      } 
    },
    videoId: "vvZEBGrUQUI"
  })
}).then(r => r.json()).then(d => {
  console.log(d.playabilityStatus?.status);
  console.log(d.captions ? "Has captions" : "No captions");
}).catch(console.error);
