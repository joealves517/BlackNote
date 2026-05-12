fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    context: { client: { clientName: "WEB", clientVersion: "2.20210721.00.00" } },
    videoId: "vvZEBGrUQUI"
  })
}).then(r => r.json()).then(console.log).catch(console.error);
